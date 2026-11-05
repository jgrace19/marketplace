export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_MS = 20_000;

export function stageForOrder(order, now) {
  const placedAt = order?.placedAt ?? 0;
  if (now < placedAt) {
    return ORDER_STAGES[0];
  }
  const index = Math.min(
    ORDER_STAGES.length - 1,
    Math.floor((now - placedAt) / STAGE_MS)
  );
  return ORDER_STAGES[index];
}

export function stageIndexForOrder(order, now) {
  return ORDER_STAGES.indexOf(stageForOrder(order, now));
}

export function isInProgress(order, now) {
  return stageForOrder(order, now) !== ORDER_STAGES[ORDER_STAGES.length - 1];
}

export function addOrder(orders, order, now) {
  if (!order?.id) {
    return orders;
  }
  if (orders[order.id]) {
    return orders;
  }
  return {
    ...orders,
    [order.id]: {
      ...order,
      placedAt: now
    }
  };
}

export function sortedOrders(orders) {
  return Object.values(orders || {})
    .filter(
      (entry) =>
        entry &&
        entry.id &&
        typeof entry.placedAt === "number" &&
        Array.isArray(entry.items)
    )
    .sort((a, b) => b.placedAt - a.placedAt);
}
