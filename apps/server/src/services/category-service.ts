import type Database from "better-sqlite3";
import type {
  CategoryCreateReq,
  CategoryMoveReq,
  CategoryNodeVO,
  CategoryTreeVO,
  CategoryUpdateReq,
  MaterialCategoryBindReq,
} from "@synapse/shared";
import { genId } from "../utils/id";
import { nowIso } from "../utils/time";

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  path_cache: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export class CategoryService {
  constructor(private readonly conn: Database.Database) {}

  ensureDefaults(): void {
    const count = this.conn.prepare("SELECT COUNT(1) AS c FROM categories").get() as { c: number };
    if (count.c > 0) {
      return;
    }

    const now = nowIso();
    const defaults = ["AI", "Agent", "产品设计"];
    for (let i = 0; i < defaults.length; i += 1) {
      const id = genId("cat");
      const name = defaults[i];
      this.conn
        .prepare(
          `INSERT INTO categories(id, parent_id, name, path_cache, sort_order, created_at, updated_at)
           VALUES(?, NULL, ?, ?, ?, ?, ?)`,
        )
        .run(id, name, name, i, now, now);
    }
  }

  create(req: CategoryCreateReq): string {
    const id = genId("cat");
    const now = nowIso();
    const parentPath = req.parentId ? this.getPathById(req.parentId) : "";
    const path = parentPath ? `${parentPath}/${req.name}` : req.name;
    this.conn
      .prepare(
        `INSERT INTO categories(id, parent_id, name, path_cache, sort_order, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, req.parentId ?? null, req.name, path, req.sortOrder ?? 0, now, now);
    return id;
  }

  update(id: string, req: CategoryUpdateReq): boolean {
    const current = this.conn.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow | undefined;
    if (!current) {
      return false;
    }
    const name = req.name ?? current.name;
    const sortOrder = req.sortOrder ?? current.sort_order;
    const parentPath = current.parent_id ? this.getPathById(current.parent_id) : "";
    const path = parentPath ? `${parentPath}/${name}` : name;

    this.conn
      .prepare(
        `UPDATE categories SET name=?, sort_order=?, path_cache=?, updated_at=? WHERE id=?`,
      )
      .run(name, sortOrder, path, nowIso(), id);

    this.refreshChildrenPaths(id, path);
    return true;
  }

  move(id: string, req: CategoryMoveReq): boolean {
    const current = this.conn.prepare("SELECT * FROM categories WHERE id = ?").get(id) as CategoryRow | undefined;
    if (!current) {
      return false;
    }
    if (req.newParentId === id) {
      throw new Error("CATEGORY_MOVE_INVALID_SELF");
    }
    if (req.newParentId) {
      const newParent = this.conn
        .prepare("SELECT id, path_cache FROM categories WHERE id = ?")
        .get(req.newParentId) as { id: string; path_cache: string } | undefined;
      if (!newParent) {
        throw new Error("CATEGORY_NOT_FOUND");
      }
      if (
        newParent.path_cache === current.path_cache ||
        newParent.path_cache.startsWith(`${current.path_cache}/`)
      ) {
        throw new Error("CATEGORY_MOVE_INVALID_PARENT");
      }
    }
    const parentPath = req.newParentId ? this.getPathById(req.newParentId) : "";
    const path = parentPath ? `${parentPath}/${current.name}` : current.name;
    this.conn
      .prepare(
        `UPDATE categories
         SET parent_id=?, sort_order=?, path_cache=?, updated_at=?
         WHERE id=?`,
      )
      .run(req.newParentId, req.newSortOrder ?? current.sort_order, path, nowIso(), id);

    this.refreshChildrenPaths(id, path);
    return true;
  }

  remove(id: string): boolean {
    const existed = this.conn.prepare("SELECT id FROM categories WHERE id = ?").get(id) as { id: string } | undefined;
    if (!existed) {
      return false;
    }
    const childCount = this.conn
      .prepare("SELECT COUNT(1) AS c FROM categories WHERE parent_id = ?")
      .get(id) as { c: number };
    if (childCount.c > 0) {
      throw new Error("CATEGORY_DELETE_HAS_CHILDREN");
    }

    const tx = this.conn.transaction(() => {
      this.conn.prepare("DELETE FROM material_category_links WHERE category_id = ?").run(id);
      this.conn.prepare("DELETE FROM categories WHERE id = ?").run(id);
    });
    tx();
    return true;
  }

  bindMaterial(materialId: string, req: MaterialCategoryBindReq): void {
    const now = nowIso();
    const source = req.source ?? "manual";
    const uniqueCategoryIds = Array.from(new Set((req.categoryIds ?? []).filter(Boolean)));
    const material = this.conn
      .prepare("SELECT id FROM materials WHERE id = ?")
      .get(materialId) as { id: string } | undefined;
    if (!material) {
      throw new Error("MATERIAL_NOT_FOUND");
    }
    if (uniqueCategoryIds.length > 0) {
      const placeholders = uniqueCategoryIds.map(() => "?").join(",");
      const rows = this.conn
        .prepare(`SELECT id FROM categories WHERE id IN (${placeholders})`)
        .all(...uniqueCategoryIds) as Array<{ id: string }>;
      if (rows.length !== uniqueCategoryIds.length) {
        throw new Error("CATEGORY_NOT_FOUND");
      }
    }
    const tx = this.conn.transaction(() => {
      this.conn.prepare("DELETE FROM material_category_links WHERE material_id = ? AND source = ?").run(materialId, source);
      for (const categoryId of uniqueCategoryIds) {
        this.conn
          .prepare(
            `INSERT OR REPLACE INTO material_category_links(material_id, category_id, source, confidence, created_at)
             VALUES(?, ?, ?, ?, ?)`,
          )
          .run(materialId, categoryId, source, source === "ai_suggested" ? 0.75 : null, now);
      }
    });
    tx();
  }

  getTree(): CategoryTreeVO {
    const rows = this.conn
      .prepare("SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC")
      .all() as CategoryRow[];

    const map = new Map<string, CategoryNodeVO>();
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        name: row.name,
        parentId: row.parent_id,
        path: row.path_cache,
        sortOrder: row.sort_order,
        children: [],
      });
    }

    const roots: CategoryNodeVO[] = [];
    for (const node of map.values()) {
      if (!node.parentId) {
        roots.push(node);
      } else {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }

    return { nodes: roots };
  }

  getCategoryPathsByMaterial(materialId: string): string[] {
    const rows = this.conn
      .prepare(
        `SELECT DISTINCT c.path_cache FROM material_category_links l
         INNER JOIN categories c ON c.id = l.category_id
         WHERE l.material_id = ?`,
      )
      .all(materialId) as Array<{ path_cache: string }>;
    return rows.map((x) => x.path_cache);
  }

  private getPathById(id: string): string {
    const row = this.conn
      .prepare("SELECT path_cache FROM categories WHERE id = ?")
      .get(id) as { path_cache: string } | undefined;
    if (!row) {
      throw new Error("CATEGORY_NOT_FOUND");
    }
    return row.path_cache;
  }

  private refreshChildrenPaths(parentId: string, parentPath: string): void {
    const children = this.conn
      .prepare("SELECT id, name FROM categories WHERE parent_id = ?")
      .all(parentId) as Array<{ id: string; name: string }>;

    for (const child of children) {
      const childPath = `${parentPath}/${child.name}`;
      this.conn
        .prepare("UPDATE categories SET path_cache=?, updated_at=? WHERE id=?")
        .run(childPath, nowIso(), child.id);
      this.refreshChildrenPaths(child.id, childPath);
    }
  }
}
