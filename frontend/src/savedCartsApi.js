const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:8000";
const SHOPPER_ID_KEY = "freshcart-shopper-id";
export const MAX_LINE_QTY = 99;

export const SAVED_CARTS_ENABLED =
  String(import.meta.env?.VITE_SAVED_CARTS_ENABLED || "").toLowerCase() === "true";

export function getShopperId() {
  let shopperId = window.localStorage.getItem(SHOPPER_ID_KEY);
  if (!shopperId) {
    shopperId = crypto.randomUUID();
    window.localStorage.setItem(SHOPPER_ID_KEY, shopperId);
  }
  return shopperId;
}

export function mergeRestoredItems(existingCart, items) {
  const next = { ...(existingCart || {}) };
  for (const item of items || []) {
    const productId = item.product_id || item.id;
    const quantity = Number(item.quantity) || 0;
    if (!productId || quantity <= 0) {
      continue;
    }
    next[productId] = Math.min(MAX_LINE_QTY, (next[productId] || 0) + quantity);
  }
  return next;
}

export function skippedItemsNotice(skipped) {
  if (!skipped?.length) {
    return "";
  }
  const labels = skipped
    .map((item) => item.name || item.product_id || item.id)
    .filter(Boolean);
  const count = skipped.length;
  const noun = count === 1 ? "item" : "items";
  if (labels.length) {
    return `${count} ${noun} could not be restored: ${labels.join(", ")}.`;
  }
  return `${count} ${noun} could not be restored.`;
}

export function normalizeSavedCartList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.saved_carts)) {
    return payload.saved_carts;
  }
  return [];
}

function errorMessage(data, status) {
  const detail = data?.detail;
  if (status === 404 && (detail === "Not Found" || !detail)) {
    return "Saved carts are unavailable until the saved-cart API is enabled.";
  }
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const joined = detail
      .map((entry) => entry?.msg || entry?.detail || "")
      .filter(Boolean)
      .join(" ");
    if (joined) {
      return joined;
    }
  }
  return `Saved cart request failed (${status}).`;
}

async function request(path, options = {}) {
  const headers = {
    "X-Shopper-Id": getShopperId(),
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) {
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(errorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function listSavedCarts() {
  try {
    return await request("/api/saved-carts");
  } catch (err) {
    // Route missing until FE-6 is deployed — treat as an empty list.
    if (err.status === 404) {
      return { items: [] };
    }
    throw err;
  }
}

export function saveCart({ storeId, items, name }) {
  const body = {
    store_id: storeId,
    items: (items || []).map((item) => ({
      product_id: item.product_id || item.id,
      quantity: item.quantity
    }))
  };
  if (name) {
    body.name = name;
  }
  return request("/api/saved-carts", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function restoreSavedCart(savedCartId) {
  return request(`/api/saved-carts/${encodeURIComponent(savedCartId)}/restore`, {
    method: "POST"
  });
}

export function deleteSavedCart(savedCartId) {
  return request(`/api/saved-carts/${encodeURIComponent(savedCartId)}`, {
    method: "DELETE"
  });
}
