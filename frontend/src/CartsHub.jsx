function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function formatExpiry(iso) {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default function CartsHub({
  zip,
  carts,
  savedCartsEnabled = false,
  savedCarts = [],
  savedCartsLoading = false,
  savedCartsNotice = "",
  savedCartBusyId = "",
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
            {savedCartsNotice ? <p className="savedCartsNotice">{savedCartsNotice}</p> : null}
            {savedCartsLoading ? <p className="status">Loading saved carts...</p> : null}
            {!savedCartsLoading && savedCarts.length === 0 ? (
              <p className="cartsHubEmpty">Nothing saved yet.</p>
            ) : null}
            {!savedCartsLoading && savedCarts.length > 0 ? (
              <ul className="cartsHubList">
                {savedCarts.map((cart) => {
                  const busy = savedCartBusyId === cart.id;
                  const expiry = formatExpiry(cart.expiresAt);
                  return (
                    <li key={cart.id} className="cartsHubCard">
                      <div className="cartsHubCardTop">
                        {cart.logoUrl ? (
                          <img src={cart.logoUrl} alt="" className="cartsHubLogo" />
                        ) : (
                          <div className="cartsHubLogoPlaceholder" />
                        )}
                        <div className="cartsHubCardMeta">
                          <h3>{cart.storeName}</h3>
                          <p className="cartsHubPersonal">Saved cart</p>
                          <p className="cartsHubCount">
                            {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}
                            {cart.subtotal > 0 ? ` · ${currency(cart.subtotal)}` : ""}
                          </p>
                          {expiry ? <p className="savedCartsExpiry">Expires {expiry}</p> : null}
                        </div>
                      </div>
                      <div className="savedCartsActions">
                        <button
                          type="button"
                          className="checkoutBtn"
                          onClick={() => onRestoreSavedCart(cart.id)}
                          disabled={busy}
                        >
                          {busy ? "Working..." : "Restore"}
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn"
                          onClick={() => onDeleteSavedCart(cart.id)}
                          disabled={busy}
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
