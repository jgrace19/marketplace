import { useEffect, useState } from "react";
import {
  ORDER_STAGES,
  stageIndex,
  stageLabel
} from "./orders";

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatOrderDate(iso) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function OrderStepper({ placedAt }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentIndex = stageIndex(placedAt, now);

  return (
    <ol className="orderStepper" aria-label="Order status">
      {ORDER_STAGES.map((label, index) => {
        const state =
          index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        return (
          <li key={label} className={`orderStep ${state}`}>
            <span className="orderStepMarker" aria-hidden="true">
              {index < currentIndex ? "✓" : index + 1}
            </span>
            <span className="orderStepLabel">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function Orders({ orders }) {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedOrder = orders.find((order) => order.sessionId === selectedSessionId);

  if (selectedOrder) {
    const status = stageLabel(selectedOrder.placedAt, now);
    return (
      <section className="ordersPage">
        <button type="button" className="secondaryBtn orderBackBtn" onClick={() => setSelectedSessionId(null)}>
          Back to orders
        </button>
        <h2>Order details</h2>
        <p className="orderMeta">
          {selectedOrder.storeName} · {formatOrderDate(selectedOrder.placedAt)} · {currency(selectedOrder.total)}
        </p>
        <p className="orderStatusLine">
          Status: <strong>{status}</strong>
        </p>
        <OrderStepper placedAt={selectedOrder.placedAt} />
        <h3 className="orderItemsHeading">Items</h3>
        <ul className="orderItemsList">
          {selectedOrder.items.map((item) => (
            <li key={item.id} className="orderItemRow">
              <span>
                {item.name} × {item.quantity}
              </span>
              <span>{currency(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Your orders</h2>
      <p>Past grocery orders and live delivery status.</p>
      {orders.length === 0 ? (
        <p className="ordersEmpty">No orders yet. Complete checkout to see your first order here.</p>
      ) : (
        <ul className="ordersList">
          {orders.map((order) => {
            const status = stageLabel(order.placedAt, now);
            return (
              <li key={order.sessionId}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => setSelectedSessionId(order.sessionId)}
                >
                  <div className="orderCardMain">
                    <strong>{order.storeName}</strong>
                    <span>{formatOrderDate(order.placedAt)}</span>
                  </div>
                  <div className="orderCardMeta">
                    <span className="orderStatusPill">{status}</span>
                    <span>{currency(order.total)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
