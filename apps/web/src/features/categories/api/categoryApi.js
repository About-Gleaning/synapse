import { requestJson } from "../../../shared/api/httpClient";
export async function getCategoryTree() {
    return requestJson("/api/categories/tree", { method: "GET" });
}
export async function createCategory(req) {
    return requestJson("/api/categories", {
        method: "POST",
        body: JSON.stringify(req),
    });
}
export async function updateCategory(id, req) {
    return requestJson(`/api/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(req),
    });
}
export async function moveCategory(id, req) {
    return requestJson(`/api/categories/${id}/move`, {
        method: "POST",
        body: JSON.stringify(req),
    });
}
export async function deleteCategory(id) {
    return requestJson(`/api/categories/${id}`, {
        method: "DELETE",
    });
}
export async function bindMaterialCategories(materialId, req) {
    return requestJson(`/api/materials/${materialId}/categories:bind`, {
        method: "POST",
        body: JSON.stringify(req),
    });
}
export async function listMaterialsForBinding() {
    const data = await requestJson("/api/materials?page=1&pageSize=100", {
        method: "GET",
    });
    return data.items;
}
export async function getMaterialDetail(materialId) {
    return requestJson(`/api/materials/${materialId}`, {
        method: "GET",
    });
}
