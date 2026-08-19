export const ORDERS_STORAGE_KEY = "freshcart-orders";
export const PENDING_CHECKOUT_KEY = "freshcart-pending-checkout";

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_MS = 5000;

export function readJsonStorage(key, fallback) {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function stageIndex(placedAt, now = Date.now()) {
  const elapsed = now - new Date(placedAt).getTime();
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_MS));
}

export function stageLabel(placedAt, now = Date.now()) {
  return ORDER_STAGES[stageIndex(placedAt, now)];
}

export function readPendingCheckout(sessionId) {
  const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
  if (!raw) {
    return null;
  }
  try {
    const pending = JSON.parse(raw);
    if (pending.sessionId !== sessionId) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
}

export function snapshotCartItems(cartItems) {
  return cartItems.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity
  }));
}

export function orderTotalFromItems(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function buildOrderRecord(session, pending, fallbackItems) {
  const items = pending?.items?.length
    ? pending.items
    : snapshotCartItems(fallbackItems);
  const total =
    session.amount_total != null
      ? session.amount_total / 100
      : orderTotalFromItems(items);

  return {
    sessionId: session.session_id,
    storeId: pending?.storeId || "freshcart",
    storeName: pending?.storeName || "FreshCart",
    items,
    total,
    placedAt: new Date().toISOString()
  };
}

export function appendOrderIfNew(order) {
  const existing = readJsonStorage(ORDERS_STORAGE_KEY, []);
  if (existing.some((entry) => entry.sessionId === order.sessionId)) {
    return existing;
  }
  const next = [order, ...existing];
  window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
