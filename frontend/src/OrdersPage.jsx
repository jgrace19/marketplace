import { useEffect, useMemo, useState } from "react";

export const ORDER_STAGES = ["Placed", "Shopping", "On the way", "Delivered"];
export const STAGE_MS = 8000;

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export function stageIndexForOrder(order, nowMs = Date.now()) {
  const created = Date.parse(order?.created_at || "");
  if (Number.isNaN(created)) {
    return 0;
  }
  const elapsed = Math.max(0, nowMs - created);
  return Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_MS));
}

export function stageLabelForOrder(order, nowMs = Date.now()) {
  return ORDER_STAGES[stageIndexForOrder(order, nowMs)];
}

function formatOrderDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function OrderStepper({ stageIndex }) {
  return (
    <ol className="orderStepper" aria-label="Order status">
      {ORDER_STAGES.map((label, index) => {
        let state = "pending";
        if (index < stageIndex) {
          state = "done";
        } else if (index === stageIndex) {
          state = "active";
        }
        return (
          <li key={label} className={`orderStep ${state}`}>
            <span className="orderStepDot" aria-hidden="true" />
            <span className="orderStepLabel">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrdersPage({ orders }) {
  const [selectedId, setSelectedId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)
      ),
    [orders]
  );

  const selectedOrder =
    sortedOrders.find((order) => order.session_id === selectedId) || null;

  if (selectedOrder) {
    const stageIndex = stageIndexForOrder(selectedOrder, nowMs);
    return (
      <section className="ordersPage">
        <button
          type="button"
          className="ordersBackBtn"
          onClick={() => setSelectedId(null)}
        >
          ← Back to orders
        </button>
        <header className="orderDetailHeader">
          <h2>{selectedOrder.store_name || "FreshCart"}</h2>
          <p>
            {formatOrderDate(selectedOrder.created_at)} ·{" "}
            {currency(selectedOrder.total)}
          </p>
        </header>
        <OrderStepper stageIndex={stageIndex} />
        <p className="orderStatusLine">
          Status: <strong>{ORDER_STAGES[stageIndex]}</strong>
        </p>
        <h3 className="orderItemsHeading">Items</h3>
        <ul className="orderItemsList">
          {(selectedOrder.items || []).map((item) => (
            <li className="orderItemRow" key={`${selectedOrder.session_id}-${item.id}`}>
              {item.image_url ? (
                <img src={item.image_url} alt="" className="orderItemThumb" />
              ) : (
                <div className="orderItemThumb placeholder" aria-hidden="true" />
              )}
              <div className="orderItemMeta">
                <span className="orderItemName">{item.name}</span>
                <span className="orderItemQty">Qty {item.quantity}</span>
              </div>
              <strong>{currency((item.price || 0) * (item.quantity || 0))}</strong>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="ordersPage">
      <h2>Orders</h2>
      <p>Track deliveries and revisit past grocery orders.</p>
      {sortedOrders.length === 0 ? (
        <p className="ordersEmpty">No orders yet. Checkout to place your first one.</p>
      ) : (
        <ul className="orderCardList">
          {sortedOrders.map((order) => {
            const stage = stageLabelForOrder(order, nowMs);
            return (
              <li key={order.session_id}>
                <button
                  type="button"
                  className="orderCard"
                  onClick={() => setSelectedId(order.session_id)}
                >
                  <div className="orderCardTop">
                    <strong>{order.store_name || "FreshCart"}</strong>
                    <span className="orderCardStatus">{stage}</span>
                  </div>
                  <div className="orderCardMeta">
                    <span>{formatOrderDate(order.created_at)}</span>
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
