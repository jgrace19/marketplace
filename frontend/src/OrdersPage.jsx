import { useEffect, useMemo, useState } from "react";
import {
  ORDER_STAGES,
  isInProgress,
  sortedOrders,
  stageForOrder,
  stageIndexForOrder
} from "./orders.js";

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatOrderDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

export default function OrdersPage({ orders, onBrowseStores }) {
  const [selectedId, setSelectedId] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const orderList = useMemo(() => sortedOrders(orders), [orders]);
  const selectedOrder = selectedId ? orders[selectedId] : null;

  const needsTick = useMemo(
    () => orderList.some((order) => isInProgress(order, now)),
    [orderList, now]
  );

  useEffect(() => {
    if (!needsTick) {
      return undefined;
    }
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [needsTick]);

  if (orderList.length === 0) {
    return (
      <section className="ordersPage">
        <h2>Orders</h2>
        <p>No orders yet. Complete checkout to see your order history here.</p>
        <button type="button" className="checkoutBtn" onClick={onBrowseStores}>
          Browse stores
        </button>
      </section>
    );
  }

  if (selectedOrder) {
    const stage = stageForOrder(selectedOrder, now);
    const stageIndex = stageIndexForOrder(selectedOrder, now);
    const lineTotal = (item) => (item.price || 0) * (item.quantity || 0);

    return (
      <section className="ordersPage">
        <button type="button" className="secondaryBtn orderBackBtn" onClick={() => setSelectedId(null)}>
          Back to orders
        </button>
        <h2>{selectedOrder.storeName || "Order"}</h2>
        <p className="orderMeta">
          {formatOrderDate(selectedOrder.placedAt)} · {currency(selectedOrder.total)}
        </p>
        <ol className="orderStepper" aria-label="Order status">
          {ORDER_STAGES.map((label, index) => {
            let stepClass = "orderStep";
            if (index < stageIndex) {
              stepClass += " done";
            } else if (index === stageIndex) {
              stepClass += " current";
            }
            return (
              <li key={label} className={stepClass}>
                <span className="orderStepDot" aria-hidden="true" />
                <span className="orderStepLabel">{label}</span>
              </li>
            );
          })}
        </ol>
        <p className="orderStatusPill">{stage}</p>
        <ul className="orderItems">
          {selectedOrder.items.map((item) => (
            <li key={item.id} className="orderItemRow">
              <span className="orderItemName">
                {item.name} × {item.quantity}
              </span>
              <span className="orderItemTotal">{currency(lineTotal(item))}</span>
            </li>
          ))}
        </ul>
        <p className="orderGrandTotal">
          Total <strong>{currency(selectedOrder.total)}</strong>
        </p>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Orders</h2>
      <p>Past orders and live delivery status.</p>
      <ul className="orderList">
        {orderList.map((order) => {
          const stage = stageForOrder(order, now);
          return (
            <li key={order.id}>
              <button type="button" className="orderRow" onClick={() => setSelectedId(order.id)}>
                <span className="orderRowMain">
                  <strong>{order.storeName || "Store"}</strong>
                  <span className="orderRowDate">{formatOrderDate(order.placedAt)}</span>
                </span>
                <span className="orderRowAside">
                  <span className="orderStatusPill">{stage}</span>
                  <span className="orderRowTotal">{currency(order.total)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
