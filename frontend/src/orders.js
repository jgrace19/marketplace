export const ORDERS_STORAGE_KEY = "freshcart-orders";
export const CHECKOUT_DRAFTS_KEY = "freshcart-checkout-drafts";
export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const ORDER_STAGE_MS = 8000;

export function snapshotOrderItems(items) {
  return (items || [])
    .map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      image_url: item.image_url || ""
    }))
    .filter((item) => item.id && item.quantity > 0);
}

export function parseOrders(stored) {
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored.filter((order) => order && typeof order.sessionId === "string" && order.sessionId);
}

export function orderStageIndex(order, nowMs) {
  const placed = Date.parse(order?.placedAt);
  if (!Number.isFinite(placed)) {
    return 0;
  }
  const elapsed = Math.max(0, nowMs - placed);
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / ORDER_STAGE_MS));
}

export function orderStageLabel(order, nowMs) {
  return ORDER_STAGES[orderStageIndex(order, nowMs)];
}

export function buildOrderRecord(session, draft, placedAt = new Date().toISOString()) {
  const items = snapshotOrderItems(draft?.items);
  const lineTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total =
    typeof session?.amount_total === "number" ? session.amount_total / 100 : lineTotal;
  return {
    sessionId: session.session_id,
    storeId: session.store_id || draft?.storeId || "",
    storeName: session.store_name || draft?.storeName || "Store",
    items,
    total,
    currency: String(session.currency || "usd").toUpperCase(),
    placedAt
  };
}

export function upsertOrder(orders, order) {
  if (!order?.sessionId) {
    return orders;
  }
  if (orders.some((existing) => existing.sessionId === order.sessionId)) {
    return orders;
  }
  return [order, ...orders];
}
