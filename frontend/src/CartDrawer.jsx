function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export function buildDeliverySlots(etaLabel = "", distanceMi = 0) {
  const match = String(etaLabel || "").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  const hour = match ? Number.parseInt(match[1], 10) : 7;
  const minute = match && match[2] ? Number.parseInt(match[2], 10) : 0;
  const dist = Number(distanceMi || 0);

  let span = 2;
  if (dist < 1.0) {
    span = 1;
  } else if (dist >= 3.0) {
    span = 3;
  }

  let start = hour;
  if (minute === 0) {
    start = hour - 1;
  } else if (minute < 30) {
    start = hour;
  } else if (dist < 1.0 || dist >= 3.0 || minute === 45) {
    start = hour - 1;
  }

  start = Math.max(1, Math.min(9, start));
  const slots = [`Today ${start}–${start + span}pm`];

  if (span <= 2 && start + span * 2 <= 11) {
    slots.push(`Today ${start + span}–${start + span * 2}pm`);
  }

  slots.push("Tomorrow 9–11am");
  if (dist < 1.0) {
    slots.push("Tomorrow 11am–1pm");
  } else if (dist < 3.0) {
    slots.push("Tomorrow 1–3pm");
  } else {
    slots.push("Tomorrow 2–5pm");
  }

  return slots;
}

export default function CartDrawer({
  zip,
  storeName,
  etaLabel,
  distanceMi,
  supportsPickup,
  items,
  subtotal,
  otherCarts,
  slots,
  selectedSlot,
  checkoutLoading,
  onClose,
  onIncrease,
  onDecrease,
  onSelectSlot,
  onCheckout,
  onSwitchCart
}) {
  const fulfillment = supportsPickup
    ? `Delivery or pickup · ${etaLabel || "ASAP"}`
    : `Delivery · ${etaLabel || "ASAP"}`;
  const availableSlots =
    Array.isArray(slots) && slots.length > 0
      ? slots
      : buildDeliverySlots(etaLabel, distanceMi);

  return (
    <div className="cartOverlay" role="dialog" aria-modal="true" aria-label={`${storeName} cart`}>
      <button type="button" className="cartOverlayBackdrop" onClick={onClose} aria-label="Close" />
      <aside className="cartDrawerPanel">
        <header className="cartDrawerHeader">
          <div>
            <h2>{storeName ? `${storeName} Cart` : "Cart"}</h2>
            <p className="cartsHubSubhead">Shopping in {zip}</p>
            <p className="cartDrawerFulfillment">{fulfillment}</p>
          </div>
          <button type="button" className="cartPanelClose" onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </header>

        {otherCarts.length > 0 ? (
          <div className="cartSwitcher">
            {otherCarts.map((cart) => (
              <button
                key={cart.storeId}
                type="button"
                className="cartSwitcherChip"
                onClick={() => onSwitchCart(cart.storeId)}
              >
                {cart.storeName} +{cart.itemCount}
              </button>
            ))}
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="cartDrawerEmpty">No items yet.</p>
        ) : (
          <ul className="cartDrawerItems">
            {items.map((item) => (
              <li key={item.id} className="cartDrawerItem">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="cartDrawerThumb" />
                ) : (
                  <div className="cartDrawerThumbPlaceholder" />
                )}
                <div className="cartDrawerItemBody">
                  <span className="cartDrawerItemName">{item.name}</span>
                  <strong>{currency(item.price)}</strong>
                  <div className="qtyControls">
                    <button
                      type="button"
                      onClick={() => onDecrease(item.id)}
                      aria-label={item.quantity <= 1 ? `Remove ${item.name}` : `Decrease ${item.name}`}
                    >
                      {item.quantity <= 1 ? "×" : "−"}
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => onIncrease(item)} aria-label={`Increase ${item.name}`}>
                      +
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="cartDrawerFooter">
          <div className="cartDrawerSlots" role="group" aria-label="Delivery time slots">
            <p className="cartDrawerSlotsLabel">Delivery window</p>
            <div className="chips cartDrawerSlotChips">
              {availableSlots.map((slot) => {
                const isSelected = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`chip ${isSelected ? "chipActive" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectSlot(slot)}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="cartTotal">Subtotal: {currency(subtotal)}</div>
          {!selectedSlot ? (
            <p className="cartDrawerSlotHint">Select a delivery window to continue to checkout.</p>
          ) : null}
          <button
            type="button"
            className="checkoutBtn"
            onClick={onCheckout}
            disabled={checkoutLoading || items.length === 0 || !selectedSlot}
          >
            {checkoutLoading ? "Starting checkout..." : `Go to checkout ${currency(subtotal)}`}
          </button>
        </footer>
      </aside>
    </div>
  );
}
