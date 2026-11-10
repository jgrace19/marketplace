export const ORDER_STAGES = [
  { id: "placed", label: "Placed", detail: "Order received — matching you with a shopper." },
  { id: "shopping", label: "Shopping", detail: "Your shopper is picking your items." },
  { id: "on_the_way", label: "On the way", detail: "Your order is out for delivery." },
  { id: "delivered", label: "Delivered", detail: "Delivered. Enjoy your groceries!" }
];
export const ORDER_STAGE_DURATION_MS = 15000;
const FINAL_STAGE_INDEX = ORDER_STAGES.length - 1;

export function stageIndexForOrder(order, now = Date.now()) {
  const placedAt = Date.parse(order?.placedAt || "");
  if (Number.isNaN(placedAt)) {
    return FINAL_STAGE_INDEX;
  }
  const elapsed = Math.max(0, now - placedAt);
  return Math.min(FINAL_STAGE_INDEX, Math.floor(elapsed / ORDER_STAGE_DURATION_MS));
}

export function isOrderInProgress(order, now = Date.now()) {
  return stageIndexForOrder(order, now) < FINAL_STAGE_INDEX;
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatPlacedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function countItems(order) {
  return (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function StatusPill({ stageIndex }) {
  const stage = ORDER_STAGES[stageIndex];
  const tone = stageIndex === FINAL_STAGE_INDEX ? "delivered" : "active";
  return <span className={`orderStatusPill ${tone}`}>{stage.label}</span>;
}

function OrderStepper({ stageIndex, compact = false }) {
  const stage = ORDER_STAGES[stageIndex];
  return (
    <div className={`orderStepper ${compact ? "orderStepperCompact" : ""}`} aria-label="Order progress">
      <ol className="orderStepperTrack">
        {ORDER_STAGES.map((step, index) => {
          const state = index < stageIndex ? "done" : index === stageIndex ? "current" : "upcoming";
          return (
            <li
              key={step.id}
              className={`orderStep ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="orderStepDot" aria-hidden="true">
                {state === "done" ? "✓" : index + 1}
              </span>
              <span className="orderStepLabel">{step.label}</span>
            </li>
          );
        })}
      </ol>
      {!compact ? <p className="orderStepDetail">{stage.detail}</p> : null}
    </div>
  );
}

function OrderDetail({ order, now, onBack }) {
  const stageIndex = stageIndexForOrder(order, now);
  const itemCount = countItems(order);
  const items = order.items || [];
  return (
    <>
      <button type="button" className="orderBackLink" onClick={onBack}>
        ← All orders
      </button>
      <header className="orderDetailHeader">
        <div>
          <h2>{order.storeName}</h2>
          <p className="orderMeta">
            {formatPlacedAt(order.placedAt)} · {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
          <p className="orderMeta orderIdLine">Order {order.id}</p>
        </div>
        <StatusPill stageIndex={stageIndex} />
      </header>

      <OrderStepper stageIndex={stageIndex} />

      <h3 className="orderItemsHeading">Items</h3>
      {items.length === 0 ? (
        <p className="orderMeta">Line items were not captured for this order.</p>
      ) : (
        <ul className="orderItems">
          {items.map((item) => (
            <li key={item.id} className="orderItem">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="orderItemThumb" />
              ) : (
                <div className="orderItemThumb orderItemThumbPlaceholder" />
              )}
              <div className="orderItemBody">
                <span className="orderItemName">{item.name}</span>
                <span className="orderMeta">
                  {item.quantity} × {currency(item.price)}
                </span>
              </div>
              <strong className="orderItemLine">{currency((item.price || 0) * (item.quantity || 0))}</strong>
            </li>
          ))}
        </ul>
      )}
      <div className="orderTotalRow">
        <span>Total</span>
        <strong>{currency(order.total)}</strong>
      </div>
    </>
  );
}

export default function OrdersPage({
  orders,
  now,
  selectedOrderId,
  onSelectOrder,
  onBrowseStores
}) {
  const selectedOrder = selectedOrderId
    ? orders.find((order) => order.id === selectedOrderId)
    : null;

  return (
    <section className="ordersPage">
      {selectedOrder ? (
        <OrderDetail order={selectedOrder} now={now} onBack={() => onSelectOrder(null)} />
      ) : (
        <>
          <h2>Orders</h2>
          <p>Track in-progress deliveries and revisit past orders.</p>
          {orders.length === 0 ? (
            <div className="ordersEmpty">
              <p>No orders yet. Complete a checkout and it will show up here.</p>
              <button type="button" className="checkoutBtn ordersEmptyBtn" onClick={onBrowseStores}>
                Browse stores
              </button>
            </div>
          ) : (
            <ul className="ordersList">
              {orders.map((order) => {
                const stageIndex = stageIndexForOrder(order, now);
                const itemCount = countItems(order);
                return (
                  <li key={order.id}>
                    <button
                      type="button"
                      className="orderCard"
                      onClick={() => onSelectOrder(order.id)}
                      aria-label={`Open order from ${order.storeName}`}
                    >
                      <div className="orderCardTop">
                        <div className="orderCardMeta">
                          <h3>{order.storeName}</h3>
                          <p className="orderMeta">
                            {formatPlacedAt(order.placedAt)} · {itemCount} item
                            {itemCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <div className="orderCardSide">
                          <strong>{currency(order.total)}</strong>
                          <StatusPill stageIndex={stageIndex} />
                        </div>
                      </div>
                      {stageIndex < FINAL_STAGE_INDEX ? (
                        <OrderStepper stageIndex={stageIndex} compact />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
