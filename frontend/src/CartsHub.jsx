function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatExpiry(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CartsHub({
  zip,
  carts,
  savedCartsEnabled,
  savedCarts = [],
  savedCartsLoading,
  savedCartsError,
  savedCartsNotice,
  pendingSavedCartId,
  onClose,
  onContinueShopping,
  onDeleteCart,
  onBrowseStores,
  onRestoreSavedCart,
  onDeleteSavedCart
}) {
  return (
    <div className="cartOverlay" role="dialog" aria-modal="true" aria-label="Carts">
      <button type="button" className="cartOverlayBackdrop" onClick={onClose} aria-label="Close" />
      <div className="cartsHubPanel">
        <header className="cartsHubHeader">
          <div>
            <h2>Carts</h2>
            <p className="cartsHubSubhead">Shopping in {zip}</p>
          </div>
          <button type="button" className="cartPanelClose" onClick={onClose} aria-label="Close carts">
            ×
          </button>
        </header>

        {carts.length === 0 ? (
          <div className="cartsHubEmpty">
            <p>No active carts</p>
            <button type="button" className="checkoutBtn" onClick={onBrowseStores}>
              Browse stores
            </button>
          </div>
        ) : (
          <ul className="cartsHubList">
            {carts.map((cart) => (
              <li key={cart.storeId} className="cartsHubCard">
                <div className="cartsHubCardTop">
                  {cart.logoUrl ? (
                    <img src={cart.logoUrl} alt="" className="cartsHubLogo" />
                  ) : (
                    <div className="cartsHubLogoPlaceholder" />
                  )}
                  <div className="cartsHubCardMeta">
                    <h3>{cart.storeName}</h3>
                    <p className="cartsHubPersonal">Personal Cart</p>
                    {cart.etaLabel ? <p className="cartsHubEta">{cart.etaLabel}</p> : null}
                    <p className="cartsHubCount">
                      {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}
                      {cart.subtotal > 0 ? ` · ${currency(cart.subtotal)}` : ""}
                    </p>
                  </div>
                  <div className="cartsHubMenu">
                    <button
                      type="button"
                      className="cartsHubDelete"
                      onClick={() => onDeleteCart(cart.storeId)}
                      aria-label={`Delete ${cart.storeName} cart`}
                    >
                      Delete cart
                    </button>
                  </div>
                </div>
                {cart.thumbnails.length > 0 ? (
                  <div className="cartsHubThumbs">
                    {cart.thumbnails.map((src, index) => (
                      <img key={`${cart.storeId}-${index}`} src={src} alt="" />
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="checkoutBtn"
                  onClick={() => onContinueShopping(cart.storeId)}
                >
                  Continue shopping
                </button>
              </li>
            ))}
          </ul>
        )}

        {savedCartsEnabled ? (
          <section className="savedCartsSection" aria-label="Saved for later">
            <h3>Saved for later</h3>
            {savedCartsNotice ? (
              <p className="status checkoutNotice warning">{savedCartsNotice}</p>
            ) : null}
            {savedCartsError ? <p className="error">{savedCartsError}</p> : null}
            {savedCartsLoading ? <p className="status">Loading saved carts...</p> : null}
            {!savedCartsLoading && !savedCartsError && savedCarts.length === 0 ? (
              <p className="savedCartsEmpty">Nothing saved yet.</p>
            ) : null}
            {savedCarts.length > 0 ? (
              <ul className="cartsHubList">
                {savedCarts.map((cart) => {
                  const expiry = formatExpiry(cart.expiresAt);
                  const pending = pendingSavedCartId === cart.id;
                  return (
                    <li key={cart.id} className="cartsHubCard">
                      <div className="cartsHubCardTop">
                        <div className="cartsHubCardMeta">
                          <h3>{cart.storeName}</h3>
                          <p className="cartsHubPersonal">{cart.name || "Saved cart"}</p>
                          <p className="cartsHubCount">
                            {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}
                            {cart.subtotal > 0 ? ` · ${currency(cart.subtotal)}` : ""}
                            {expiry ? ` · Expires ${expiry}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="savedCartActions">
                        <button
                          type="button"
                          className="checkoutBtn"
                          onClick={() => onRestoreSavedCart(cart.id)}
                          disabled={pending}
                        >
                          {pending ? "Restoring..." : "Restore"}
                        </button>
                        <button
                          type="button"
                          className="cartsHubDelete"
                          onClick={() => onDeleteSavedCart(cart.id)}
                          disabled={pending}
                          aria-label={`Delete saved ${cart.storeName} cart`}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
