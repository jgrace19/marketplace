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
  discount,
  total,
  promoInput,
  appliedPromo,
  promoError,
  promoLoading,
  otherCarts,
  checkoutLoading,
  onClose,
  onIncrease,
  onDecrease,
  onPromoInputChange,
  onApplyPromo,
  onCheckout,
  onSwitchCart
}) {
  const fulfillment = supportsPickup
    ? `Delivery or pickup · ${etaLabel || "ASAP"}`
    : `Delivery · ${etaLabel || "ASAP"}`;

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
          <form
            className="promoForm"
            onSubmit={(event) => {
              event.preventDefault();
              onApplyPromo();
            }}
          >
            <label htmlFor="promo-code">Promo code</label>
            <div className="promoControls">
              <input
                id="promo-code"
                value={promoInput}
                onChange={(event) => onPromoInputChange(event.target.value)}
                placeholder="Enter code"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={promoLoading || items.length === 0}
              >
                {promoLoading ? "Applying..." : "Apply"}
              </button>
            </div>
            {promoError ? (
              <p className="promoError" role="alert">
                {promoError}
              </p>
            ) : null}
            {appliedPromo ? (
              <p className="promoSuccess" role="status">
                {appliedPromo.code} applied · {appliedPromo.description}
              </p>
            ) : null}
          </form>
          <div className="cartSummary">
            <div>
              <span>Subtotal</span>
              <span>{currency(subtotal)}</span>
            </div>
            {discount > 0 ? (
              <div className="cartDiscount">
                <span>Discount</span>
                <span>−{currency(discount)}</span>
              </div>
            ) : null}
            <div className="cartTotal">
              <span>Total</span>
              <span>{currency(total)}</span>
            </div>
          </div>
          <button
            type="button"
            className="checkoutBtn"
            onClick={onCheckout}
            disabled={checkoutLoading || items.length === 0}
          >
            {checkoutLoading ? "Starting checkout..." : `Go to checkout ${currency(total)}`}
          </button>
        </footer>
      </aside>
    </div>
  );
}
