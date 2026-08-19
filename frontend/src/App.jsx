import { useEffect, useMemo, useState } from "react";
import Orders from "./Orders";
import {
  ORDERS_STORAGE_KEY,
  PENDING_CHECKOUT_KEY,
  appendOrderIfNew,
  buildOrderRecord,
  clearPendingCheckout,
  readJsonStorage,
  readPendingCheckout,
  snapshotCartItems
} from "./orders";

const API_BASE = "http://127.0.0.1:8000";
const PROFILE_STORAGE_KEY = "freshcart-profile";
const PROFILE_AVATAR_KEY = "freshcart-profile-avatar";
const QUICK_FILTERS = [
  { label: "Produce", query: "apple banana avocado spinach strawberry" },
  { label: "Dairy", query: "milk yogurt eggs" },
  { label: "Bakery", query: "bread sourdough" },
  { label: "Protein", query: "chicken eggs" }
];
const CARTOON_AVATARS = ["🐼", "🦊", "🐸", "🐻", "🐯", "🐨", "🐵", "🐰"];

function createEmptyProfile() {
  return {
    fullName: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    deliveryInstructions: ""
  };
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value || 0);
}

function initialsFromName(name) {
  const chunks = name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);
  if (chunks.length === 0) {
    return "";
  }
  return chunks.map((part) => part[0].toUpperCase()).join("");
}

export default function App() {
  const [activePage, setActivePage] = useState("shop");
  const [products, setProducts] = useState([]);
  const [productCatalog, setProductCatalog] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutState, setCheckoutState] = useState({
    type: "idle",
    message: ""
  });
  const [profile, setProfile] = useState(createEmptyProfile());
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileAvatar, setProfileAvatar] = useState(CARTOON_AVATARS[0]);
  const [orders, setOrders] = useState(() => readJsonStorage(ORDERS_STORAGE_KEY, []));

  async function loadProducts(search = "") {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("query", search.trim());
      }
      const response = await fetch(`${API_BASE}/api/products?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Unable to fetch products.");
      }
      const data = await response.json();
      const incoming = data.items || [];
      setProducts(incoming);
      setProductCatalog((prev) => {
        const next = { ...prev };
        for (const product of incoming) {
          next[product.id] = product;
        }
        return next;
      });
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    const randomAvatar = CARTOON_AVATARS[Math.floor(Math.random() * CARTOON_AVATARS.length)];
    const storedAvatar = window.localStorage.getItem(PROFILE_AVATAR_KEY);
    const avatar = storedAvatar || randomAvatar;
    setProfileAvatar(avatar);
    if (!storedAvatar) {
      window.localStorage.setItem(PROFILE_AVATAR_KEY, avatar);
    }

    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setProfile({ ...createEmptyProfile(), ...parsed });
      setProfileSaved(true);
    } catch {
      setProfileSaved(false);
    }
  }, []);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([productId, quantity]) => {
        const product = productCatalog[productId];
        if (!product) {
          return null;
        }
        return { ...product, quantity };
      })
      .filter(Boolean);
  }, [cart, productCatalog]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item?.price || 0) * item.quantity, 0),
    [cartItems]
  );

  function addToCart(productId) {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  }

  function decreaseItem(productId) {
    setCart((prev) => {
      const next = { ...prev };
      const currentQty = next[productId] || 0;
      if (currentQty <= 1) {
        delete next[productId];
      } else {
        next[productId] = currentQty - 1;
      }
      return next;
    });
  }

  async function verifyCheckout(sessionId) {
    const response = await fetch(
      `${API_BASE}/api/checkout/session-status?session_id=${encodeURIComponent(sessionId)}`
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "Unable to verify checkout status.");
    }
    return data;
  }

  async function startCheckout() {
    if (cartItems.length === 0) {
      return;
    }

    setCheckoutLoading(true);
    setError("");
    setCheckoutState({
      type: "info",
      message: "Redirecting to Stripe Checkout..."
    });
    try {
      const response = await fetch(`${API_BASE}/api/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image_url: item.image_url
          }))
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Checkout failed.");
      }
      if (!data.checkout_url) {
        throw new Error("Missing Stripe checkout URL.");
      }
      window.sessionStorage.setItem(
        PENDING_CHECKOUT_KEY,
        JSON.stringify({
          sessionId: data.session_id,
          storeId: "freshcart",
          storeName: "FreshCart",
          items: snapshotCartItems(cartItems)
        })
      );
      window.location.assign(data.checkout_url);
    } catch (err) {
      setError(err.message || "Unable to start checkout.");
      setCheckoutState({
        type: "error",
        message: "Checkout could not be started. Please try again."
      });
    } finally {
      setCheckoutLoading(false);
    }
  }

  useEffect(() => {
    async function hydrateCheckoutResult() {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("checkout");
      const sessionId = params.get("session_id");

      if (!status) {
        return;
      }

      if (status === "cancel") {
        setCheckoutState({
          type: "warning",
          message: "Checkout canceled. Your cart is still saved."
        });
      }

      if (status === "success" && sessionId) {
        setCheckoutState({
          type: "info",
          message: "Confirming your payment with Stripe..."
        });
        try {
          const session = await verifyCheckout(sessionId);
          if (session.payment_status === "paid") {
            setCheckoutState({
              type: "success",
              message: "Payment confirmed. Your grocery order is placed."
            });
            const order = buildOrderRecord(session, readPendingCheckout(session.session_id), cartItems);
            setOrders(appendOrderIfNew(order));
            clearPendingCheckout();
            setCart({});
          } else {
            setCheckoutState({
              type: "warning",
              message: `Checkout returned, but payment status is ${session.payment_status}.`
            });
          }
        } catch (err) {
          setCheckoutState({
            type: "error",
            message: err.message || "Could not verify payment status."
          });
        }
      }

      if (status === "success" && !sessionId) {
        setCheckoutState({
          type: "warning",
          message: "Checkout returned without a session id, so payment could not be verified."
        });
      }

      window.history.replaceState({}, "", window.location.pathname);
    }

    hydrateCheckoutResult();
  }, []);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );
  const hasConfiguredProfile = useMemo(
    () => profileSaved && Boolean(profile.fullName.trim()),
    [profileSaved, profile.fullName]
  );
  const profileBadgeText = hasConfiguredProfile
    ? initialsFromName(profile.fullName) || profileAvatar
    : profileAvatar;

  function updateProfileField(field, value) {
    setProfile((prev) => ({ ...prev, [field]: value }));
    setProfileNotice("");
  }

  function saveProfile(event) {
    event.preventDefault();
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    window.localStorage.setItem(PROFILE_AVATAR_KEY, profileAvatar);
    setProfileSaved(true);
    setProfileNotice("Profile saved.");
  }

  return (
    <div className="page">
      <header className="topNav">
        <div className="brand">FreshCart</div>
        <div className="rightNav">
          <button className="navLink" onClick={() => setActivePage("shop")}>
            Shop
          </button>
          <button className="navLink" onClick={() => setActivePage("profile")}>
            Profile
          </button>
          <button className="navLink" onClick={() => setActivePage("orders")}>
            Orders
          </button>
          <div className="cartBadge">Cart {cartCount}</div>
        </div>
      </header>

      {activePage === "shop" ? (
        <>
          <section className="hero">
            <h1>Groceries delivered in as fast as 1 hour</h1>
            <p>Shop fresh produce, dairy, bakery, and pantry essentials.</p>
          </section>

          <header className="header">
            <h2>Find groceries</h2>
          </header>

          <section className="searchBar">
            <input
              type="text"
              value={query}
              placeholder="Search products..."
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  loadProducts(query);
                }
              }}
            />
            <button onClick={() => loadProducts(query)}>Search</button>
          </section>
          <section className="chips">
            {QUICK_FILTERS.map((filter) => (
              <button
                key={filter.label}
                className="chip"
                onClick={() => {
                  setQuery(filter.query);
                  loadProducts(filter.query);
                }}
              >
                {filter.label}
              </button>
            ))}
          </section>

          {loading && <p className="status">Loading products...</p>}
          {checkoutState.message ? (
            <p className={`status checkoutNotice ${checkoutState.type}`}>{checkoutState.message}</p>
          ) : null}
          {error && <p className="error">{error}</p>}

          <main className="content">
            <section className="productsGrid">
              {products.map((product) => (
                <article className="card" key={product.id}>
                  <img src={product.image_url} alt={product.name} />
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="row">
                    <strong>{currency(product.price)}</strong>
                    <button className="addBtn" onClick={() => addToCart(product.id)}>
                      Add
                    </button>
                  </div>
                  <small className="source">source: {product.source}</small>
                </article>
              ))}
            </section>

            <aside className="cart">
              <h2>Cart</h2>
              {cartItems.length === 0 ? (
                <p>No items yet.</p>
              ) : (
                <>
                  {cartItems.map((item) => (
                    <div className="cartItem" key={item.id}>
                      <span>{item.name}</span>
                      <div className="qtyControls">
                        <button onClick={() => decreaseItem(item.id)}>-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => addToCart(item.id)}>+</button>
                      </div>
                    </div>
                  ))}
                  <div className="cartTotal">Total: {currency(cartTotal)}</div>
                  <button
                    className="checkoutBtn"
                    onClick={startCheckout}
                    disabled={checkoutLoading || cartItems.length === 0}
                  >
                    {checkoutLoading ? "Starting checkout..." : "Checkout"}
                  </button>
                </>
              )}
            </aside>
          </main>
        </>
      ) : activePage === "orders" ? (
        <Orders orders={orders} />
      ) : (
        <section className="profilePage">
          <h2>Edit Profile</h2>
          <p>Save your details for faster checkout and delivery updates.</p>
          <form className="profileForm" onSubmit={saveProfile}>
            <label>
              Full name
              <input
                value={profile.fullName}
                onChange={(event) => updateProfileField("fullName", event.target.value)}
                placeholder="Taylor Shopper"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={profile.email}
                onChange={(event) => updateProfileField("email", event.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <label>
              Phone number
              <input
                value={profile.phone}
                onChange={(event) => updateProfileField("phone", event.target.value)}
                placeholder="(555) 555-5555"
              />
            </label>
            <label>
              Address line 1
              <input
                value={profile.addressLine1}
                onChange={(event) => updateProfileField("addressLine1", event.target.value)}
                placeholder="123 Market St"
              />
            </label>
            <label>
              Address line 2
              <input
                value={profile.addressLine2}
                onChange={(event) => updateProfileField("addressLine2", event.target.value)}
                placeholder="Apartment, suite, etc."
              />
            </label>
            <div className="profileGridRow">
              <label>
                City
                <input
                  value={profile.city}
                  onChange={(event) => updateProfileField("city", event.target.value)}
                  placeholder="San Francisco"
                />
              </label>
              <label>
                State
                <input
                  value={profile.state}
                  onChange={(event) => updateProfileField("state", event.target.value)}
                  placeholder="CA"
                />
              </label>
            </div>
            <div className="profileGridRow">
              <label>
                Postal code
                <input
                  value={profile.postalCode}
                  onChange={(event) => updateProfileField("postalCode", event.target.value)}
                  placeholder="94105"
                />
              </label>
              <label>
                Country
                <input
                  value={profile.country}
                  onChange={(event) => updateProfileField("country", event.target.value)}
                  placeholder="United States"
                />
              </label>
            </div>
            <label>
              Delivery instructions
              <textarea
                value={profile.deliveryInstructions}
                onChange={(event) => updateProfileField("deliveryInstructions", event.target.value)}
                placeholder="Leave at front door. Ring bell once."
              />
            </label>
            {profileNotice ? <p className="profileNotice">{profileNotice}</p> : null}
            <div className="profileActions">
              <button type="submit" className="checkoutBtn">
                Save profile
              </button>
              <button
                type="button"
                className="secondaryBtn"
                onClick={() => setActivePage("shop")}
              >
                Back to shop
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        className="profileFab"
        onClick={() => setActivePage("profile")}
        title="Edit profile"
        aria-label="Edit profile"
      >
        {profileBadgeText}
      </button>
    </div>
  );
}
