import type {
  CategoryCreateReq,
  CategoryMoveReq,
  CategoryTreeVO,
  CategoryUpdateReq,
  MaterialCategoryBindReq,
  MaterialDetailVO,
  MaterialListVO,
} from "@synapse/shared";
import { requestJson } from "../../../shared/api/httpClient";

export async function getCategoryTree(): Promise<CategoryTreeVO> {
  return requestJson<CategoryTreeVO>("/api/categories/tree", { method: "GET" });
}

export async function createCategory(req: CategoryCreateReq): Promise<{ id: string }> {
  return requestJson<{ id: string }>("/api/categories", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function updateCategory(id: string, req: CategoryUpdateReq): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`/api/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(req),
  });
}

export async function moveCategory(id: string, req: CategoryMoveReq): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`/api/categories/${id}/move`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function deleteCategory(id: string): Promise<{ id: string }> {
  return requestJson<{ id: string }>(`/api/categories/${id}`, {
    method: "DELETE",
  });
}

export async function bindMaterialCategories(
  materialId: string,
  req: MaterialCategoryBindReq,
): Promise<{ materialId: string }> {
  return requestJson<{ materialId: string }>(`/api/materials/${materialId}/categories:bind`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function listMaterialsForBinding(): Promise<MaterialListVO["items"]> {
  const data = await requestJson<MaterialListVO>("/api/materials?page=1&pageSize=100", {
    method: "GET",
  });
  return data.items;
}

export async function getMaterialDetail(materialId: string): Promise<MaterialDetailVO> {
  return requestJson<MaterialDetailVO>(`/api/materials/${materialId}`, {
    method: "GET",
  });
}
