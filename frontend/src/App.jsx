import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const PROFILE_STORAGE_KEY = "freshcart-profile";
const PROFILE_AVATAR_KEY = "freshcart-profile-avatar";
const ZIP_STORAGE_KEY = "freshcart-zip";
const STORE_STORAGE_KEY = "freshcart-store-id";
const DEFAULT_ZIP = "10002";
const ZIP_OPTIONS = [
  { value: "10002", label: "10002 — FreshCart City" },
  { value: "94107", label: "94107 — Bayview" },
  { value: "60614", label: "60614 — Lincoln Park" }
];
const STORE_FILTERS = [
  { id: "all", label: "All" },
  { id: "fastest", label: "Fastest" },
  { id: "offers", label: "Offers" },
  { id: "pickup", label: "Pickup" },
  { id: "ebt", label: "EBT" }
];
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

function storeMatchesFilter(store, filterId) {
  if (filterId === "all") {
    return true;
  }
  if (filterId === "pickup") {
    return Boolean(store.supports_pickup) || (store.tags || []).includes("pickup");
  }
  if (filterId === "ebt") {
    return Boolean(store.supports_ebt) || (store.tags || []).includes("ebt");
  }
  return (store.tags || []).includes(filterId);
}

export default function App() {
  const [activePage, setActivePage] = useState("stores");
  const [selectedZip, setSelectedZip] = useState(DEFAULT_ZIP);
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeFilter, setStoreFilter] = useState("all");
  const [selectedStore, setSelectedStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [productCatalog, setProductCatalog] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cart, setCart] = useState({});
  const [cartStoreId, setCartStoreId] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsNotice, setDealsNotice] = useState("");
  const [checkoutState, setCheckoutState] = useState({
    type: "idle",
    message: ""
  });
  const [profile, setProfile] = useState(createEmptyProfile());
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileAvatar, setProfileAvatar] = useState(CARTOON_AVATARS[0]);
  const storesRequestIdRef = useRef(0);
  const productsRequestIdRef = useRef(0);

  async function loadStores(zip = selectedZip) {
    const requestId = ++storesRequestIdRef.current;
    setStoresLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (zip) {
        params.set("zip", zip);
      }
      const response = await fetch(`${API_BASE}/api/stores?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Unable to fetch stores.");
      }
      const data = await response.json();
      if (requestId !== storesRequestIdRef.current) {
        return { stale: true };
      }
      const items = data.items || [];
      const resolvedZip = data.zip || zip;
      setStores(items);
      if (resolvedZip) {
        setSelectedZip(resolvedZip);
        window.localStorage.setItem(ZIP_STORAGE_KEY, resolvedZip);
      }
      return { items, zip: resolvedZip };
    } catch (err) {
      if (requestId !== storesRequestIdRef.current) {
        return { stale: true };
      }
      setError(err.message || "Unexpected error.");
      return null;
    } finally {
      if (requestId === storesRequestIdRef.current) {
        setStoresLoading(false);
      }
    }
  }

  async function loadProducts(search = "", storeId = selectedStore?.id) {
    if (!storeId) {
      return;
    }
    const requestId = ++productsRequestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("store_id", storeId);
      if (search.trim()) {
        params.set("query", search.trim());
      }
      const response = await fetch(`${API_BASE}/api/products?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Unable to fetch products.");
      }
      const data = await response.json();
      if (requestId !== productsRequestIdRef.current) {
        return;
      }
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
      if (requestId !== productsRequestIdRef.current) {
        return;
      }
      setError(err.message || "Unexpected error.");
    } finally {
      if (requestId === productsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const storedZip = window.localStorage.getItem(ZIP_STORAGE_KEY) || DEFAULT_ZIP;
    const storedStoreId = window.localStorage.getItem(STORE_STORAGE_KEY);
    setSelectedZip(storedZip);

    async function hydrate() {
      const result = await loadStores(storedZip);
      if (!result || result.stale) {
        return;
      }
      if (storedStoreId) {
        const match = result.items.find((store) => store.id === storedStoreId);
        if (match) {
          setSelectedStore(match);
          setActivePage("shop");
        }
      }
    }

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStore?.id && activePage === "shop") {
      setProducts([]);
      loadProducts("", selectedStore.id);
    }
    // Intentionally only re-fetch when store or page changes; search uses explicit calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.id, activePage]);

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

  const filteredStores = useMemo(
    () => stores.filter((store) => storeMatchesFilter(store, storeFilter)),
    [stores, storeFilter]
  );

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

  const cartStoreName = useMemo(() => {
    if (!cartStoreId) {
      return "";
    }
    if (selectedStore?.id === cartStoreId) {
      return selectedStore.name;
    }
    const match = stores.find((store) => store.id === cartStoreId);
    return match?.name || cartStoreId;
  }, [cartStoreId, selectedStore, stores]);

  async function loadTodaysDeals() {
    if (!selectedStore?.id) {
      return;
    }
    setDealsLoading(true);
    setDealsNotice("");
    setError("");
    try {
      const params = new URLSearchParams({ store_id: selectedStore.id });
      const response = await fetch(`${API_BASE}/api/recommendations?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Today's Deals is unavailable right now. Please try again.");
      }
      const data = await response.json();
      setDealsNotice(
        `Today's average deal price is ${currency(data.average_deal_price)} across ${
          (data.items || []).length
        } items at ${selectedStore.name}.`
      );
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setDealsLoading(false);
    }
  }

  function selectStore(store) {
    setError("");
    setSelectedStore(store);
    window.localStorage.setItem(STORE_STORAGE_KEY, store.id);
    setQuery("");
    setDealsNotice("");
    setProducts([]);
    setActivePage("shop");
  }

  function changeStore() {
    setError("");
    setActivePage("stores");
  }

  async function handleZipChange(zip) {
    const previousZip = selectedZip;
    setSelectedZip(zip);
    const result = await loadStores(zip);
    if (result?.stale) {
      return;
    }
    if (!result) {
      // Fetch failed — roll back zip and reload the previous area's store list.
      setSelectedZip(previousZip);
      await loadStores(previousZip);
      return;
    }
    const prevId = selectedStore?.id;
    if (!prevId) {
      return;
    }
    const match = result.items.find((store) => store.id === prevId);
    if (match) {
      // Refresh ETA/distance for the new zip while keeping the same retailer.
      setSelectedStore(match);
      window.localStorage.setItem(STORE_STORAGE_KEY, match.id);
      return;
    }
    setSelectedStore(null);
    window.localStorage.removeItem(STORE_STORAGE_KEY);
    setCart({});
    setCartStoreId("");
    setProducts([]);
    setActivePage("stores");
  }

  function addToCart(product) {
    const productId = typeof product === "string" ? product : product.id;
    const catalogProduct = typeof product === "string" ? productCatalog[product] : product;
    if (!catalogProduct) {
      return;
    }

    const nextStoreId = catalogProduct.store_id || selectedStore?.id || "";
    const cartHasItems = Object.keys(cart).length > 0;

    if (cartHasItems && cartStoreId && nextStoreId && nextStoreId !== cartStoreId) {
      const nextName = selectedStore?.id === nextStoreId ? selectedStore.name : nextStoreId;
      const confirmed = window.confirm(
        `Your cart has items from ${cartStoreName || "another store"}. Start a new cart with items from ${nextName}?`
      );
      if (!confirmed) {
        return;
      }
      setCart({ [productId]: 1 });
      setCartStoreId(nextStoreId);
      return;
    }

    if (!cartStoreId && nextStoreId) {
      setCartStoreId(nextStoreId);
    }
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

  useEffect(() => {
    if (Object.keys(cart).length === 0 && cartStoreId) {
      setCartStoreId("");
    }
  }, [cart, cartStoreId]);

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
          })),
          store_id: cartStoreId || selectedStore?.id || "",
          store_name: cartStoreName || selectedStore?.name || ""
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Checkout failed.");
      }
      if (!data.checkout_url) {
        throw new Error("Missing Stripe checkout URL.");
      }
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
            setCart({});
            setCartStoreId("");
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

  const zipLabel = ZIP_OPTIONS.find((option) => option.value === selectedZip)?.label || selectedZip;

  return (
    <div className="page">
      <header className="topNav">
        <div className="brand">FreshCart</div>
        <div className="rightNav">
          <button className="navLink" onClick={() => { setError(""); setActivePage("stores"); }}>
            Stores
          </button>
          <button
            className="navLink"
            onClick={() => {
              setError("");
              setActivePage(selectedStore ? "shop" : "stores");
            }}
          >
            Shop
          </button>
          <button className="navLink" onClick={() => { setError(""); setActivePage("profile"); }}>
            Profile
          </button>
          <div className="cartBadge">Cart {cartCount}</div>
        </div>
      </header>

      {checkoutState.message ? (
        <p className={`status checkoutNotice ${checkoutState.type}`}>{checkoutState.message}</p>
      ) : null}

      {activePage === "stores" ? (
        <>
          <section className="hero">
            <h1>Choose a store near you</h1>
            <p>Pick a retailer, then shop that store&apos;s catalog — just like Instacart.</p>
          </section>

          <header className="storesHeader">
            <div>
              <h2>Stores near {zipLabel.split(" — ")[1] || "your area"}</h2>
              <p className="storesSubhead">Demo service area — zip changes store lists and ETAs.</p>
            </div>
            <label className="zipPicker">
              Zip code
              <select
                value={selectedZip}
                onChange={(event) => handleZipChange(event.target.value)}
              >
                {ZIP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </header>

          <section className="chips">
            {STORE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`chip ${storeFilter === filter.id ? "chipActive" : ""}`}
                onClick={() => setStoreFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </section>

          {storesLoading && <p className="status">Loading stores...</p>}
          {error && <p className="error">{error}</p>}

          <section className="storesGrid">
            {filteredStores.map((store) => (
              <button
                key={store.id}
                type="button"
                className="storeCard"
                onClick={() => selectStore(store)}
              >
                <img src={store.logo_url} alt="" className="storeLogo" />
                <div className="storeCardBody">
                  <h3>{store.name}</h3>
                  <p className="storeMeta">
                    {store.eta_label}
                    {typeof store.distance_mi === "number" ? ` · ${store.distance_mi} mi` : ""}
                  </p>
                  <div className="storeTags">
                    {(store.tags || []).map((tag) => (
                      <span key={tag} className="storeTag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </section>
          {!storesLoading && filteredStores.length === 0 ? (
            <p className="status">No stores match this filter for {selectedZip}.</p>
          ) : null}
        </>
      ) : null}

      {activePage === "shop" && selectedStore ? (
        <>
          <section className="hero">
            <h1>Groceries from {selectedStore.name}</h1>
            <p>
              {selectedStore.eta_label}
              {typeof selectedStore.distance_mi === "number"
                ? ` · ${selectedStore.distance_mi} mi away`
                : ""}
            </p>
            <div className="heroActions">
              <button className="dealsBtn" onClick={loadTodaysDeals} disabled={dealsLoading}>
                {dealsLoading ? "Loading deals..." : "Today's Deals"}
              </button>
              <button className="changeStoreBtn" onClick={changeStore}>
                Change store
              </button>
            </div>
            {dealsNotice ? <p className="status">{dealsNotice}</p> : null}
          </section>

          <header className="header">
            <h2>Find groceries at {selectedStore.name}</h2>
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
                    <button className="addBtn" onClick={() => addToCart(product)}>
                      Add
                    </button>
                  </div>
                  <small className="source">{product.store_id}</small>
                </article>
              ))}
            </section>

            <aside className="cart">
              <h2>Cart</h2>
              {cartStoreName ? <p className="cartStoreLabel">{cartStoreName}</p> : null}
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
                        <button onClick={() => addToCart(item)}>+</button>
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
      ) : null}

      {activePage === "shop" && !selectedStore ? (
        <section className="hero">
          <h1>Pick a store to start shopping</h1>
          <p>Choose a nearby retailer first.</p>
          <button className="dealsBtn" onClick={() => setActivePage("stores")}>
            Browse stores
          </button>
        </section>
      ) : null}

      {activePage === "profile" ? (
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
                onClick={() => setActivePage(selectedStore ? "shop" : "stores")}
              >
                {selectedStore ? "Back to shop" : "Back to stores"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

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
