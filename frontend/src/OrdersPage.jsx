export const ORDER_STAGES = [
  { id: "placed", label: "Placed" },
  { id: "shopping", label: "Shopping" },
  { id: "on_the_way", label: "On the way" },
  { id: "delivered", label: "Delivered" }
];

export const STAGE_MS = 20_000;
const DELIVERED_INDEX = ORDER_STAGES.length - 1;

export function orderStageIndex(order, nowMs) {
  const placedAt = order.placedAt || 0;
  const advancedMs = order.advancedMs || 0;
  const elapsed = nowMs - placedAt + advancedMs;
  const index = Math.floor(elapsed / STAGE_MS);
  return Math.min(DELIVERED_INDEX, Math.max(0, index));
}

export function orderStageLabel(order, nowMs) {
  return ORDER_STAGES[orderStageIndex(order, nowMs)].label;
}

export function isOrderDelivered(order, nowMs) {
  return orderStageIndex(order, nowMs) >= DELIVERED_INDEX;
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatPlacedAt(placedAt) {
  if (!placedAt) {
    return "";
  }
  return new Date(placedAt).toLocaleString();
}

function OrderStepper({ order, nowMs, compact = false }) {
  const activeIndex = orderStageIndex(order, nowMs);
  return (
    <ol className={`orderStepper ${compact ? "orderStepperCompact" : ""}`}>
      {ORDER_STAGES.map((stage, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={stage.id}
            className={`orderStep ${done ? "orderStepDone" : ""} ${active ? "orderStepActive" : ""}`}
          >
            <span className="orderStepDot" aria-hidden="true" />
            <span className="orderStepLabel">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrdersPage({
  orders,
  nowMs,
  selectedOrderId,
  onSelectOrder,
  onBackToList,
  onAdvanceOrder,
  onBrowseStores
}) {
  const sortedOrders = [...orders].sort((a, b) => (b.placedAt || 0) - (a.placedAt || 0));
  const selected = selectedOrderId
    ? sortedOrders.find((order) => order.sessionId === selectedOrderId)
    : null;

  if (selected) {
    const stageLabel = orderStageLabel(selected, nowMs);
    const delivered = isOrderDelivered(selected, nowMs);
    return (
      <section className="ordersPage">
        <button type="button" className="secondaryBtn ordersBackBtn" onClick={onBackToList}>
          ← All orders
        </button>
        <header className="ordersDetailHeader">
          <h2>{selected.storeName || selected.storeId}</h2>
          <p className="ordersMeta">{formatPlacedAt(selected.placedAt)}</p>
          <span className={`orderStatusPill ${delivered ? "orderStatusPillDone" : ""}`}>
            {stageLabel}
          </span>
        </header>
        <OrderStepper order={selected} nowMs={nowMs} />
        {!delivered ? (
          <button
            type="button"
            className="dealsBtn ordersAdvanceBtn"
            onClick={() => onAdvanceOrder(selected.sessionId)}
          >
            Advance status
          </button>
        ) : null}
        <ul className="orderLineItems">
          {(selected.items || []).map((item) => (
            <li key={item.id} className="orderLineItem">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="cartDrawerThumb" />
              ) : (
                <div className="cartDrawerThumbPlaceholder" />
              )}
              <div className="orderLineItemBody">
                <span className="cartDrawerItemName">{item.name}</span>
                <span className="orderLineQty">Qty {item.quantity}</span>
                <strong>{currency((item.price || 0) * (item.quantity || 0))}</strong>
              </div>
            </li>
          ))}
        </ul>
        <div className="cartTotal ordersDetailTotal">Total: {currency(selected.total)}</div>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Your orders</h2>
      <p className="ordersIntro">Track delivery status and view past purchases.</p>
      {sortedOrders.length === 0 ? (
        <div className="ordersEmpty">
          <p>No orders yet. Complete a checkout to see your first order here.</p>
          <button type="button" className="dealsBtn" onClick={onBrowseStores}>
            Browse stores
          </button>
        </div>
      ) : (
        <ul className="ordersList">
          {sortedOrders.map((order) => {
            const stageLabel = orderStageLabel(order, nowMs);
            const delivered = isOrderDelivered(order, nowMs);
            return (
              <li key={order.sessionId}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => onSelectOrder(order.sessionId)}
                >
                  <div className="orderCardTop">
                    <div>
                      <h3>{order.storeName || order.storeId}</h3>
                      <p className="ordersMeta">{formatPlacedAt(order.placedAt)}</p>
                    </div>
                    <div className="orderCardRight">
                      <span className={`orderStatusPill ${delivered ? "orderStatusPillDone" : ""}`}>
                        {stageLabel}
                      </span>
                      <strong>{currency(order.total)}</strong>
                    </div>
                  </div>
                  {!delivered ? <OrderStepper order={order} nowMs={nowMs} compact /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
