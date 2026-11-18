import { ORDER_STAGES } from "./orders";

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatOrderDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default function OrdersPage({
  orders,
  now,
  selectedOrderId,
  stageIndexFor,
  onSelect,
  onBack,
  onLeave
}) {
  const selected = orders.find((order) => order.sessionId === selectedOrderId) || null;

  return (
    <section className="ordersPage">
      {selected ? (
        <OrderDetail order={selected} stageIndex={stageIndexFor(selected, now)} onBack={onBack} />
      ) : (
        <>
          <h2>Orders</h2>
          <p>Track grocery orders after checkout. Status moves forward on its own.</p>
          {orders.length === 0 ? (
            <div className="ordersEmpty">
              <p>No orders yet. Add items to a store cart and check out to see them here.</p>
              <button type="button" className="checkoutBtn" onClick={onLeave}>
                Browse stores
              </button>
            </div>
          ) : (
            <div className="orderList">
              {orders.map((order) => {
                const stageIndex = stageIndexFor(order, now);
                const stage = ORDER_STAGES[stageIndex] || ORDER_STAGES[0];
                return (
                  <button
                    key={order.sessionId}
                    type="button"
                    className="orderCard"
                    onClick={() => onSelect(order.sessionId)}
                  >
                    <span className="orderCardStore">{order.storeName}</span>
                    <span className={`orderStatus${stage === "Delivered" ? " delivered" : ""}`}>
                      {stage}
                    </span>
                    <span className="orderCardMeta">{formatOrderDate(order.placedAt)}</span>
                    <strong className="orderCardTotal">{currency(order.total)}</strong>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OrderDetail({ order, stageIndex, onBack }) {
  return (
    <>
      <button type="button" className="orderBack" onClick={onBack}>
        ← All orders
      </button>
      <h2>{order.storeName}</h2>
      <p className="orderDetailMeta">
        {formatOrderDate(order.placedAt)}
        <span aria-hidden="true"> · </span>
        {currency(order.total)}
      </p>
      <ol className="orderStepper" aria-label="Order status">
        {ORDER_STAGES.map((label, index) => {
          const state = index < stageIndex ? "complete" : index === stageIndex ? "current" : "upcoming";
          return (
            <li
              key={label}
              className={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="orderStepDot" aria-hidden="true" />
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      <h3>Items</h3>
      <div className="orderLines">
        {(order.items || []).length === 0 ? (
          <p>Line items for this order were not saved.</p>
        ) : (
          order.items.map((item) => (
            <div className="orderLine" key={`${order.sessionId}-${item.id}`}>
              <div>
                <strong>{item.name}</strong>
                <span className="orderLineQty">
                  Qty {item.quantity} · {currency(item.price)}
                </span>
              </div>
              <strong>{currency((item.price || 0) * (item.quantity || 0))}</strong>
            </div>
          ))
        )}
      </div>
    </>
  );
}
