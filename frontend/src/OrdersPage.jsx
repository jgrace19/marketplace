import { useEffect, useState } from "react";

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_DURATION_MS = 5000;

export function currentStageIndex(placedAt, now = Date.now()) {
  const elapsed = Math.max(0, now - (placedAt || 0));
  return Math.min(Math.floor(elapsed / STAGE_DURATION_MS), ORDER_STAGES.length - 1);
}

export function currentStageLabel(placedAt, now = Date.now()) {
  return ORDER_STAGES[currentStageIndex(placedAt, now)];
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatOrderDate(placedAt) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(placedAt));
}

export default function OrdersPage({ orders, onBack, backLabel = "Back to stores" }) {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const hasInProgress = orders.some(
    (order) => currentStageIndex(order.placedAt, now) < ORDER_STAGES.length - 1
  );

  useEffect(() => {
    if (!hasInProgress) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasInProgress]);

  const selected = orders.find((order) => order.sessionId === selectedSessionId) || null;

  if (selected) {
    const stageIndex = currentStageIndex(selected.placedAt, now);
    return (
      <section className="ordersPage">
        <button type="button" className="ordersBackBtn" onClick={() => setSelectedSessionId(null)}>
          ← All orders
        </button>
        <h2>{selected.storeName}</h2>
        <p className="ordersMeta">
          {formatOrderDate(selected.placedAt)} · {currency(selected.total)}
        </p>

        <ol className="orderStepper" aria-label="Order status">
          {ORDER_STAGES.map((stage, index) => {
            let stepClass = "orderStep";
            if (index < stageIndex) {
              stepClass += " done";
            } else if (index === stageIndex) {
              stepClass += " current";
            }
            return (
              <li key={stage} className={stepClass}>
                <span className="orderStepDot" aria-hidden="true" />
                <span className="orderStepLabel">{stage}</span>
              </li>
            );
          })}
        </ol>

        <h3 className="orderItemsHeading">Items</h3>
        {selected.items.length === 0 ? (
          <p className="ordersEmpty">No line items were saved for this order.</p>
        ) : (
          <ul className="orderItems">
            {selected.items.map((item) => (
              <li key={item.id} className="orderItem">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="orderItemThumb" />
                ) : (
                  <div className="orderItemThumbPlaceholder" />
                )}
                <div className="orderItemBody">
                  <span className="orderItemName">{item.name}</span>
                  <span className="orderItemQty">Qty {item.quantity}</span>
                </div>
                <strong>{currency((item.price || 0) * item.quantity)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Orders</h2>
      <p>Track deliveries and review past checkouts.</p>
      {orders.length === 0 ? (
        <p className="ordersEmpty">No orders yet. Complete a checkout to see them here.</p>
      ) : (
        <ul className="ordersList">
          {orders.map((order) => {
            const stage = currentStageLabel(order.placedAt, now);
            const delivered = stage === "Delivered";
            return (
              <li key={order.sessionId}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => setSelectedSessionId(order.sessionId)}
                >
                  <div className="orderCardMain">
                    <h3>{order.storeName}</h3>
                    <p className="orderCardDate">{formatOrderDate(order.placedAt)}</p>
                  </div>
                  <div className="orderCardSide">
                    <strong>{currency(order.total)}</strong>
                    <span className={`orderStatus ${delivered ? "delivered" : "active"}`}>
                      {stage}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="secondaryBtn ordersPageBack" onClick={onBack}>
        {backLabel}
      </button>
    </section>
  );
}
