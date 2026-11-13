const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:8000";
const SHOPPER_STORAGE_KEY = "freshcart-shopper-id";
const SNAPSHOT_STORAGE_KEY = "freshcart-saved-cart-snapshots";

export const MAX_LINE_QTY = 99;
export const savedCartsEnabled = import.meta.env?.VITE_SAVED_CARTS_ENABLED === "true";

export function getShopperId() {
  const existing = window.localStorage.getItem(SHOPPER_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  window.localStorage.setItem(SHOPPER_STORAGE_KEY, id);
  return id;
}

function readSnapshots() {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Active-cart snapshots are pruned once Save for later clears the cart.
export function rememberSavedCartSnapshot(savedCartId, items) {
  if (!savedCartId) {
    return;
  }
  const snapshots = readSnapshots();
  snapshots[savedCartId] = (items || []).map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    image_url: item.image_url || "",
    store_id: item.store_id || "",
    description: item.description || ""
  }));
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
}

export function takeSavedCartSnapshot(savedCartId) {
  const snapshots = readSnapshots();
  const items = snapshots[savedCartId] || [];
  delete snapshots[savedCartId];
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  return items;
}

function errorDetail(data, status) {
  if (typeof data?.detail === "string" && data.detail) {
    return data.detail;
  }
  return `Saved carts request failed (${status}).`;
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "X-Shopper-Id": getShopperId(),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body
  });
  if (response.status === 204) {
    return null;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(data, response.status));
  }
  return data;
}

export function savedCartRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.saved_carts)) {
    return payload.saved_carts;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
}

export function normalizeSavedCart(raw) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return {
    id: raw?.id || "",
    storeId: raw?.store_id || "",
    name: raw?.name || "",
    itemCount: Number.isFinite(raw?.item_count) ? raw.item_count : items.length,
    subtotal: Number(raw?.subtotal) || 0,
    expiresAt: raw?.expires_at || "",
    items
  };
}

export async function listSavedCarts() {
  const payload = await request("/api/saved-carts");
  return savedCartRows(payload)
    .map(normalizeSavedCart)
    .filter((cart) => cart.id);
}

export async function createSavedCart({ storeId, items, name }) {
  const payload = {
    store_id: storeId,
    items: (items || []).map((item) => ({
      product_id: item.id,
      quantity: item.quantity
    }))
  };
  if (name) {
    payload.name = name;
  }
  const created = await request("/api/saved-carts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const saved = normalizeSavedCart(created);
  if (saved.id) {
    rememberSavedCartSnapshot(saved.id, items);
  }
  return saved;
}

export async function restoreSavedCart(savedCartId) {
  return request(`/api/saved-carts/${encodeURIComponent(savedCartId)}/restore`, {
    method: "POST"
  });
}

export async function deleteSavedCart(savedCartId) {
  await request(`/api/saved-carts/${encodeURIComponent(savedCartId)}`, {
    method: "DELETE"
  });
  takeSavedCartSnapshot(savedCartId);
}

export function mergeRestoredQuantities(existingCart, items) {
  const next = { ...(existingCart || {}) };
  let capped = false;
  for (const item of items || []) {
    const productId = item?.product_id || item?.id;
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }
    const current = Number(next[productId]) || 0;
    const sum = current + quantity;
    if (sum > MAX_LINE_QTY) {
      next[productId] = MAX_LINE_QTY;
      capped = true;
    } else {
      next[productId] = sum;
    }
  }
  return { cart: next, capped };
}

export function catalogEntriesFromRestore(items, snapshotItems, storeId) {
  const snapshots = {};
  for (const item of snapshotItems || []) {
    if (item?.id) {
      snapshots[item.id] = item;
    }
  }
  const entries = {};
  for (const item of items || []) {
    const productId = item?.product_id || item?.id;
    if (!productId) {
      continue;
    }
    const snapshot = snapshots[productId] || {};
    const price = Number(item?.unit_price ?? item?.price ?? snapshot.price ?? 0);
    entries[productId] = {
      id: productId,
      name: item?.name || snapshot.name || productId,
      price: Number.isFinite(price) ? price : 0,
      image_url: item?.image_url || snapshot.image_url || "",
      store_id: item?.store_id || snapshot.store_id || storeId || "",
      description: item?.description || snapshot.description || ""
    };
  }
  return entries;
}

export function skippedItemsNotice(skipped) {
  const rows = Array.isArray(skipped) ? skipped : [];
  if (rows.length === 0) {
    return "";
  }
  const labels = rows
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      return entry?.name || entry?.product_id || entry?.id || "";
    })
    .filter(Boolean);
  if (labels.length > 0) {
    return `Couldn't restore ${labels.join(", ")}.`;
  }
  const noun = rows.length === 1 ? "item" : "items";
  return `${rows.length} ${noun} couldn't be restored.`;
}
