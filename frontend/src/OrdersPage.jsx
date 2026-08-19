function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_DURATION_MS = 10000;

export function orderStageIndex(placedAt, now = Date.now()) {
  const elapsed = Math.max(0, now - Number(placedAt || 0));
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_DURATION_MS));
}

export function orderStageLabel(placedAt, now = Date.now()) {
  return ORDER_STAGES[orderStageIndex(placedAt, now)];
}

function formatOrderDate(placedAt) {
  const date = new Date(placedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleString();
}

function OrderStepper({ stageIndex }) {
  return (
    <ol className="orderStepper" aria-label="Order status">
      {ORDER_STAGES.map((stage, index) => {
        let state = "upcoming";
        if (index < stageIndex) {
          state = "done";
        } else if (index === stageIndex) {
          state = "current";
        }
        return (
          <li
            key={stage}
            className={`orderStepperStep orderStepperStep--${state}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="orderStepperDot" aria-hidden="true" />
            <span className="orderStepperLabel">{stage}</span>
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
  onBackHome
}) {
  const selected = orders.find((order) => order.sessionId === selectedOrderId);

  if (selected) {
    const stageIndex = orderStageIndex(selected.placedAt, nowMs);
    const stageLabel = ORDER_STAGES[stageIndex];
    return (
      <section className="ordersPage">
        <button type="button" className="ordersBackLink" onClick={onBackToList}>
          ← All orders
        </button>
        <header className="ordersHeader">
          <div>
            <h2>{selected.storeName || "Order"}</h2>
            <p className="ordersSubhead">
              {formatOrderDate(selected.placedAt)} · {currency(selected.total)}
            </p>
          </div>
          <span className={`orderStatusBadge orderStatusBadge--${stageIndex === ORDER_STAGES.length - 1 ? "done" : "live"}`}>
            {stageLabel}
          </span>
        </header>

        <OrderStepper stageIndex={stageIndex} />

        <h3 className="ordersSectionTitle">Items</h3>
        {selected.items?.length ? (
          <ul className="orderItemList">
            {selected.items.map((item) => (
              <li key={item.id} className="orderItem">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="orderItemThumb" />
                ) : (
                  <div className="orderItemThumbPlaceholder" />
                )}
                <div className="orderItemBody">
                  <span className="orderItemName">{item.name}</span>
                  <span className="orderItemMeta">
                    {item.quantity} × {currency(item.price)}
                  </span>
                </div>
                <strong>{currency(item.price * item.quantity)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ordersEmpty">No line items were saved for this order.</p>
        )}
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <header className="ordersHeader">
        <div>
          <h2>Orders</h2>
          <p className="ordersSubhead">Track deliveries and revisit past checkouts.</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <p className="ordersEmpty">No orders yet. Checkout from a store cart to see them here.</p>
      ) : (
        <ul className="ordersList">
          {orders.map((order) => {
            const stageIndex = orderStageIndex(order.placedAt, nowMs);
            const stageLabel = ORDER_STAGES[stageIndex];
            return (
              <li key={order.sessionId}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => onSelectOrder(order.sessionId)}
                >
                  <div className="orderCardBody">
                    <h3>{order.storeName || "Order"}</h3>
                    <p className="orderCardMeta">{formatOrderDate(order.placedAt)}</p>
                    <p className="orderCardMeta">{currency(order.total)}</p>
                  </div>
                  <span
                    className={`orderStatusBadge orderStatusBadge--${
                      stageIndex === ORDER_STAGES.length - 1 ? "done" : "live"
                    }`}
                  >
                    {stageLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="secondaryBtn ordersHomeBtn" onClick={onBackHome}>
        Back to stores
      </button>
    </section>
  );
}
