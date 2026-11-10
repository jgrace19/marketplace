import { useEffect, useMemo, useState } from "react";

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_DURATION_MS = 15000;

export function orderStageIndex(order, now) {
  const elapsed = Math.max(0, now - (order.createdAt || 0));
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_DURATION_MS));
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function OrderStepper({ stageIndex }) {
  return (
    <ol className="orderStepper" aria-label="Order progress">
      {ORDER_STAGES.map((stage, index) => {
        const state =
          index < stageIndex ? "done" : index === stageIndex ? "current" : "upcoming";
        return (
          <li
            key={stage}
            className={`orderStep orderStep-${state}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="orderStepDot">{index < stageIndex ? "✓" : index + 1}</span>
            <span className="orderStepLabel">{stage}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Orders({ orders, selectedOrderId, onSelectOrder, onBrowseStores }) {
  const [now, setNow] = useState(() => Date.now());

  const sortedOrders = useMemo(
    () => Object.values(orders || {}).sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  const hasInProgress = sortedOrders.some(
    (order) => orderStageIndex(order, now) < ORDER_STAGES.length - 1
  );

  useEffect(() => {
    setNow(Date.now());
    if (!hasInProgress) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasInProgress]);

  const selectedOrder = selectedOrderId ? orders[selectedOrderId] : null;

  if (selectedOrder) {
    const stageIndex = orderStageIndex(selectedOrder, now);
    const itemCount = selectedOrder.items.reduce((sum, item) => sum + item.quantity, 0);
    return (
      <section className="ordersPage">
        <button type="button" className="orderBackBtn" onClick={() => onSelectOrder(null)}>
          ← All orders
        </button>
        <div className="orderDetailHeader">
          <div>
            <h2>{selectedOrder.storeName}</h2>
            <p className="orderMeta">
              Placed {formatDate(selectedOrder.createdAt)} · {itemCount}{" "}
              {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
          <span className={`orderStatus orderStatus-${stageIndex}`}>
            {ORDER_STAGES[stageIndex]}
          </span>
        </div>
        <OrderStepper stageIndex={stageIndex} />
        <ul className="orderItems">
          {selectedOrder.items.map((item) => (
            <li key={item.id} className="orderItem">
              {item.image_url ? <img src={item.image_url} alt="" /> : null}
              <div className="orderItemBody">
                <strong>{item.name}</strong>
                <span>
                  {currency(item.price)} × {item.quantity}
                </span>
              </div>
              <strong>{currency(item.price * item.quantity)}</strong>
            </li>
          ))}
        </ul>
        <div className="orderTotalRow">
          <span>Total</span>
          <strong>{currency(selectedOrder.total)}</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Your orders</h2>
      <p className="orderMeta">Track in-progress orders and review past ones.</p>
      {sortedOrders.length === 0 ? (
        <div className="ordersEmpty">
          <p>No orders yet. Orders appear here after a successful checkout.</p>
          <button type="button" className="dealsBtn" onClick={onBrowseStores}>
            Browse stores
          </button>
        </div>
      ) : (
        <ul className="orderList">
          {sortedOrders.map((order) => {
            const stageIndex = orderStageIndex(order, now);
            return (
              <li key={order.id}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => onSelectOrder(order.id)}
                >
                  <div className="orderCardTop">
                    <div>
                      <h3>{order.storeName}</h3>
                      <p className="orderMeta">{formatDate(order.createdAt)}</p>
                    </div>
                    <div className="orderCardRight">
                      <strong>{currency(order.total)}</strong>
                      <span className={`orderStatus orderStatus-${stageIndex}`}>
                        {ORDER_STAGES[stageIndex]}
                      </span>
                    </div>
                  </div>
                  <OrderStepper stageIndex={stageIndex} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
