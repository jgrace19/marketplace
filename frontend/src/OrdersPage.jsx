const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
const STAGE_DURATION_MS = 8000;

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export function getOrderStageIndex(createdAt, now = Date.now()) {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) {
    return 0;
  }
  const elapsed = Math.max(0, now - createdMs);
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_DURATION_MS));
}

export function getOrderStage(createdAt, now = Date.now()) {
  return ORDER_STAGES[getOrderStageIndex(createdAt, now)];
}

export function isOrderInProgress(createdAt, now = Date.now()) {
  return getOrderStageIndex(createdAt, now) < ORDER_STAGES.length - 1;
}

function formatOrderDate(iso) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(iso));
  } catch {
    return iso || "";
  }
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
        const isComplete = stageIndex >= ORDER_STAGES.length - 1;
        const resolvedState = isComplete && index <= stageIndex ? "done" : state;
        return (
          <li key={stage} className={`orderStep orderStep-${resolvedState}`}>
            <span className="orderStepDot" aria-hidden="true" />
            <span className="orderStepLabel">{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrdersPage({
  orders,
  selectedOrderId,
  now,
  onSelectOrder,
  onBackToList,
  onBackHome
}) {
  const selectedOrder = orders.find((order) => order.sessionId === selectedOrderId) || null;

  if (selectedOrder) {
    const stageIndex = getOrderStageIndex(selectedOrder.createdAt, now);
    const stage = ORDER_STAGES[stageIndex];
    return (
      <section className="ordersPage">
        <button type="button" className="ordersBackLink" onClick={onBackToList}>
          ← All orders
        </button>
        <header className="ordersHeader">
          <div>
            <h2>{selectedOrder.storeName}</h2>
            <p>
              {formatOrderDate(selectedOrder.createdAt)} · {currency(selectedOrder.total)}
            </p>
          </div>
          <span className={`orderStatusBadge ${stageIndex === ORDER_STAGES.length - 1 ? "delivered" : "active"}`}>
            {stage}
          </span>
        </header>

        <OrderStepper stageIndex={stageIndex} />

        <h3 className="ordersDetailHeading">Items</h3>
        {selectedOrder.items.length === 0 ? (
          <p className="status">No line items were saved for this order.</p>
        ) : (
          <ul className="orderItemsList">
            {selectedOrder.items.map((item) => (
              <li key={item.id} className="orderItemRow">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="orderItemThumb" />
                ) : (
                  <div className="orderItemThumbPlaceholder" />
                )}
                <div className="orderItemBody">
                  <span className="orderItemName">{item.name}</span>
                  <span className="orderItemMeta">
                    Qty {item.quantity} · {currency(item.price)} each
                  </span>
                </div>
                <strong>{currency((item.price || 0) * (item.quantity || 0))}</strong>
              </li>
            ))}
          </ul>
        )}

        <div className="ordersActions">
          <button type="button" className="secondaryBtn" onClick={onBackHome}>
            Back to stores
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <header className="ordersHeader">
        <div>
          <h2>Orders</h2>
          <p>Track deliveries and review past grocery orders.</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="ordersEmpty">
          <p className="status">No orders yet. Complete a checkout to see them here.</p>
          <button type="button" className="checkoutBtn" onClick={onBackHome}>
            Browse stores
          </button>
        </div>
      ) : (
        <ul className="ordersList">
          {orders.map((order) => {
            const stageIndex = getOrderStageIndex(order.createdAt, now);
            const stage = ORDER_STAGES[stageIndex];
            return (
              <li key={order.sessionId}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => onSelectOrder(order.sessionId)}
                >
                  <div className="orderCardTop">
                    <div>
                      <h3>{order.storeName}</h3>
                      <p className="orderCardMeta">{formatOrderDate(order.createdAt)}</p>
                    </div>
                    <div className="orderCardRight">
                      <strong>{currency(order.total)}</strong>
                      <span
                        className={`orderStatusBadge ${
                          stageIndex === ORDER_STAGES.length - 1 ? "delivered" : "active"
                        }`}
                      >
                        {stage}
                      </span>
                    </div>
                  </div>
                  {stageIndex < ORDER_STAGES.length - 1 ? (
                    <OrderStepper stageIndex={stageIndex} />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export { ORDER_STAGES, STAGE_DURATION_MS };
