import { useEffect, useState } from "react";

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_DURATION_MS = 5000;

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export function orderStageIndex(order, now = Date.now()) {
  const placedAt = Date.parse(order?.placedAt);
  if (Number.isNaN(placedAt)) {
    return 0;
  }
  const elapsed = Math.max(0, now - placedAt);
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_DURATION_MS));
}

export function orderStageLabel(order, now = Date.now()) {
  return ORDER_STAGES[orderStageIndex(order, now)];
}

function formatOrderDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function StatusStepper({ stageIndex }) {
  return (
    <ol className="orderStepper" aria-label="Order status">
      {ORDER_STAGES.map((label, index) => {
        const state =
          index < stageIndex ? "complete" : index === stageIndex ? "current" : "upcoming";
        return (
          <li key={label} className={`orderStepperStep orderStepperStep-${state}`}>
            <span className="orderStepperDot" aria-hidden="true" />
            <span className="orderStepperLabel">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Orders({ orders, onBack }) {
  const [selectedId, setSelectedId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const hasInProgress = orders.some(
    (order) => orderStageIndex(order, now) < ORDER_STAGES.length - 1
  );

  useEffect(() => {
    if (!hasInProgress) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasInProgress]);

  const selected = orders.find((order) => order.sessionId === selectedId) || null;

  if (selected) {
    const stageIndex = orderStageIndex(selected, now);
    const stageLabel = ORDER_STAGES[stageIndex];
    return (
      <section className="ordersPage">
        <button type="button" className="ordersBackLink" onClick={() => setSelectedId(null)}>
          ← All orders
        </button>
        <header className="ordersDetailHeader">
          <div>
            <h2>{selected.storeName || "Order"}</h2>
            <p>
              {formatOrderDate(selected.placedAt)} · {currency(selected.total)}
            </p>
          </div>
          <span
            className={`orderStatusBadge${stageLabel === "Delivered" ? " orderStatusBadge-delivered" : ""}`}
          >
            {stageLabel}
          </span>
        </header>
        <StatusStepper stageIndex={stageIndex} />
        <h3 className="ordersItemsHeading">Items</h3>
        {(selected.items || []).length === 0 ? (
          <p className="ordersEmpty">No line items were saved for this order.</p>
        ) : (
          <ul className="ordersItemList">
            {selected.items.map((item) => (
              <li key={item.id} className="ordersItem">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="ordersItemThumb" />
                ) : (
                  <div className="ordersItemThumbPlaceholder" />
                )}
                <div className="ordersItemBody">
                  <span className="ordersItemName">{item.name}</span>
                  <span className="ordersItemMeta">
                    Qty {item.quantity} · {currency(item.price)} each
                  </span>
                </div>
                <strong>{currency((item.price || 0) * (item.quantity || 0))}</strong>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="secondaryBtn" onClick={onBack}>
          Back to stores
        </button>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Orders</h2>
      <p>Track deliveries and revisit past grocery orders.</p>
      {orders.length === 0 ? (
        <p className="ordersEmpty">No orders yet. Checkout to see them here.</p>
      ) : (
        <ul className="ordersList">
          {orders.map((order) => {
            const stageLabel = orderStageLabel(order, now);
            return (
              <li key={order.sessionId}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => setSelectedId(order.sessionId)}
                >
                  <div className="orderCardBody">
                    <h3>{order.storeName || "Order"}</h3>
                    <p>
                      {formatOrderDate(order.placedAt)} · {currency(order.total)}
                    </p>
                  </div>
                  <span
                    className={`orderStatusBadge${
                      stageLabel === "Delivered" ? " orderStatusBadge-delivered" : ""
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
      <div className="profileActions">
        <button type="button" className="secondaryBtn" onClick={onBack}>
          Back to stores
        </button>
      </div>
    </section>
  );
}
