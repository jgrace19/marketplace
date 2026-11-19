import { useState } from "react";

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
  promo,
  checkoutTotal,
  otherCarts,
  checkoutLoading,
  onClose,
  onIncrease,
  onDecrease,
  onApplyPromo,
  onRemovePromo,
  onCheckout,
  onSwitchCart
}) {
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoApplying, setPromoApplying] = useState(false);

  const fulfillment = supportsPickup
    ? `Delivery or pickup · ${etaLabel || "ASAP"}`
    : `Delivery · ${etaLabel || "ASAP"}`;

  async function handleApplyPromo(event) {
    event.preventDefault();
    if (promoApplying) {
      return;
    }
    setPromoError("");
    setPromoApplying(true);
    try {
      const result = await onApplyPromo(promoInput);
      if (!result.ok) {
        setPromoError(result.message || "Unable to apply promo code.");
        return;
      }
      setPromoInput("");
    } finally {
      setPromoApplying(false);
    }
  }

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
            <form className="cartPromoForm" onSubmit={handleApplyPromo}>
              <label className="cartPromoLabel" htmlFor="cart-promo-code">
                Promo code
              </label>
              <div className="cartPromoRow">
                <input
                  id="cart-promo-code"
                  type="text"
                  className="cartPromoInput"
                  value={promoInput}
                  onChange={(event) => {
                    setPromoInput(event.target.value);
                    if (promoError) {
                      setPromoError("");
                    }
                  }}
                  placeholder="Enter code"
                  autoComplete="off"
                  disabled={promoApplying}
                />
                <button type="submit" className="cartPromoApplyBtn" disabled={promoApplying || !promoInput.trim()}>
                  {promoApplying ? "Applying..." : "Apply"}
                </button>
              </div>
              {promoError ? (
                <p className="cartPromoError" role="alert">
                  {promoError}
                </p>
              ) : null}
            </form>
          ) : null}

          <div className="cartTotal">Subtotal: {currency(subtotal)}</div>
          {promo ? (
            <div className="cartPromoApplied">
              <span>
                Promo ({promo.code}): -{currency(promo.discount)}
              </span>
              <button type="button" className="cartPromoRemoveBtn" onClick={onRemovePromo}>
                Remove
              </button>
            </div>
          ) : null}
          {promo ? <div className="cartGrandTotal">Total: {currency(checkoutTotal)}</div> : null}

          <button
            type="button"
            className="checkoutBtn"
            onClick={onCheckout}
            disabled={checkoutLoading || items.length === 0}
          >
            {checkoutLoading ? "Starting checkout..." : `Go to checkout ${currency(checkoutTotal)}`}
          </button>
        </footer>
      </aside>
    </div>
  );
}