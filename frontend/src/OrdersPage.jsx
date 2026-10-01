import { useEffect, useState } from "react";

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const ORDER_STAGE_MS = 8000;

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export function getOrderStageIndex(createdAt, now = Date.now()) {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) {
    return 0;
  }
  const elapsed = Math.max(0, now - createdMs);
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / ORDER_STAGE_MS));
}

export function getOrderStatusLabel(createdAt, now = Date.now()) {
  return ORDER_STAGES[getOrderStageIndex(createdAt, now)];
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

function OrderStepper({ createdAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (getOrderStageIndex(createdAt) >= ORDER_STAGES.length - 1) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (getOrderStageIndex(createdAt, nextNow) >= ORDER_STAGES.length - 1) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [createdAt]);

  const activeIndex = getOrderStageIndex(createdAt, now);

  return (
    <ol className="orderStepper" aria-label="Order status">
      {ORDER_STAGES.map((label, index) => {
        let stepState = "pending";
        if (index < activeIndex) {
          stepState = "done";
        } else if (index === activeIndex) {
          stepState = "active";
        }
        return (
          <li key={label} className={`orderStep ${stepState}`}>
            <span className="orderStepDot" aria-hidden="true" />
            <span className="orderStepLabel">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrdersPage({ orders, onBack }) {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const hasInProgress = orders.some(
      (order) => getOrderStageIndex(order.created_at) < ORDER_STAGES.length - 1
    );
    if (!hasInProgress) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [orders]);

  const selectedOrder = orders.find((order) => order.session_id === selectedSessionId) || null;
  const sortedOrders = [...orders].sort(
    (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)
  );

  if (selectedOrder) {
    return (
      <section className="ordersPage orderDetail">
        <button type="button" className="secondaryBtn" onClick={() => setSelectedSessionId(null)}>
          Back to orders
        </button>
        <h2>{selectedOrder.store_name || "Order"}</h2>
        <p className="ordersMeta">
          {formatOrderDate(selectedOrder.created_at)} · {currency(selectedOrder.total)}
        </p>
        <p className="ordersStatusLine">
          Status: <strong>{getOrderStatusLabel(selectedOrder.created_at)}</strong>
        </p>
        <OrderStepper createdAt={selectedOrder.created_at} />
        <h3 className="orderItemsHeading">Items</h3>
        {selectedOrder.items?.length ? (
          <ul className="orderItemsList">
            {selectedOrder.items.map((item) => (
              <li key={item.id} className="orderItemRow">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="orderItemThumb" />
                ) : (
                  <div className="orderItemThumbPlaceholder" aria-hidden="true" />
                )}
                <div className="orderItemInfo">
                  <strong>{item.name}</strong>
                  <span>
                    Qty {item.quantity} · {currency(item.price)} each
                  </span>
                </div>
                <span className="orderItemLineTotal">
                  {currency((item.price || 0) * (item.quantity || 0))}
                </span>
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
      <h2>Orders</h2>
      <p>Track live delivery status and revisit past grocery orders.</p>
      {sortedOrders.length === 0 ? (
        <p className="ordersEmpty">No orders yet. Complete a checkout to see history here.</p>
      ) : (
        <ul className="orderCardList">
          {sortedOrders.map((order) => (
            <li key={order.session_id}>
              <button
                type="button"
                className="orderCard"
                onClick={() => setSelectedSessionId(order.session_id)}
              >
                <div className="orderCardTop">
                  <strong>{order.store_name || "Store"}</strong>
                  <span className="orderCardStatus">{getOrderStatusLabel(order.created_at)}</span>
                </div>
                <div className="orderCardMeta">
                  <span>{formatOrderDate(order.created_at)}</span>
                  <span>{currency(order.total)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="profileActions">
        <button type="button" className="secondaryBtn" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
