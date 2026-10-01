function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

export default function CartDrawer({
  zip,
  storeName,
  etaLabel,
  supportsPickup,
  items,
  subtotal,
  otherCarts,
  checkoutLoading,
  deliverySlots,
  selectedSlot,
  slotsLoading,
  onSelectSlot,
  onClose,
  onIncrease,
  onDecrease,
  onCheckout,
  onSwitchCart
}) {
  const fulfillment = supportsPickup
    ? `Delivery or pickup · ${etaLabel || "ASAP"}`
    : `Delivery · ${etaLabel || "ASAP"}`;
  const needsSlot = items.length > 0 && !selectedSlot;

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
          {items.length > 0 ? (
            <div className="slotPicker">
              <p className="slotPickerLabel">Delivery window</p>
              {slotsLoading ? <p className="slotHint">Loading delivery windows...</p> : null}
              <div className="chips slotChips">
                {deliverySlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={`chip ${selectedSlot === slot.label ? "chipActive" : ""}`}
                    onClick={() => onSelectSlot(slot.label)}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
              {needsSlot ? (
                <p className="slotHint">Choose a delivery window to continue</p>
              ) : null}
            </div>
          ) : null}
          <div className="cartTotal">Subtotal: {currency(subtotal)}</div>
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
