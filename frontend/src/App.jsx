import { useEffect, useMemo, useRef, useState } from "react";
import CartDrawer from "./CartDrawer";
import CartsHub from "./CartsHub";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const PROFILE_STORAGE_KEY = "freshcart-profile";
const PROFILE_AVATAR_KEY = "freshcart-profile-avatar";
const ZIP_STORAGE_KEY = "freshcart-zip";
const STORE_STORAGE_KEY = "freshcart-store-id";
const CARTS_STORAGE_KEY = "freshcart-carts";
const CART_CATALOG_STORAGE_KEY = "freshcart-cart-catalog";
const CHECKOUT_STORE_KEY = "freshcart-checkout-store";
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

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function snapshotProduct(product) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    image_url: product.image_url,
    store_id: product.store_id,
    description: product.description || ""
  };
}

function countItems(cartMap) {
  return Object.values(cartMap || {}).reduce((sum, qty) => sum + (qty || 0), 0);
}

function buildCartItems(cartMap, cartCatalog, productCatalog) {
  return Object.entries(cartMap || {})
    .map(([productId, quantity]) => {
      const product = cartCatalog[productId] || productCatalog[productId];
      if (!product) {
        return null;
      }
      return { ...product, quantity };
    })
    .filter(Boolean);
}

function pruneCartCatalog(carts, catalog) {
  const keptIds = new Set();
  for (const cart of Object.values(carts)) {
    for (const productId of Object.keys(cart || {})) {
      keptIds.add(productId);
    }
  }
  const next = {};
  for (const [productId, product] of Object.entries(catalog)) {
    if (keptIds.has(productId)) {
      next[productId] = product;
    }
  }
  const catalogKeys = Object.keys(catalog);
  const nextKeys = Object.keys(next);
  if (
    catalogKeys.length === nextKeys.length &&
    nextKeys.every((key) => catalog[key] === next[key])
  ) {
    return catalog;
  }
  return next;
}

export default function App() {
  const [activePage, setActivePage] = useState("stores");
  const [selectedZip, setSelectedZip] = useState(DEFAULT_ZIP);
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeFilter, setStoreFilter] = useState("all");
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [productCatalog, setProductCatalog] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [carts, setCarts] = useState(() => readJsonStorage(CARTS_STORAGE_KEY, {}));
  const [cartCatalog, setCartCatalog] = useState(() =>
    readJsonStorage(CART_CATALOG_STORAGE_KEY, {})
  );
  const [cartPanel, setCartPanel] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsNotice, setDealsNotice] = useState("");
  const [priceCheckUrl, setPriceCheckUrl] = useState("");
  const [priceCheckLoading, setPriceCheckLoading] = useState(false);
  const [priceCheckNotice, setPriceCheckNotice] = useState("");
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
  const selectedZipRef = useRef(selectedZip);
  const storesZipRef = useRef("");
  const pendingContinueRef = useRef(null);
  selectedZipRef.current = selectedZip;

  useEffect(() => {
    window.localStorage.setItem(CARTS_STORAGE_KEY, JSON.stringify(carts));
  }, [carts]);

  useEffect(() => {
    setCartCatalog((catalog) => pruneCartCatalog(carts, catalog));
  }, [carts]);

  useEffect(() => {
    window.localStorage.setItem(CART_CATALOG_STORAGE_KEY, JSON.stringify(cartCatalog));
  }, [cartCatalog]);

  useEffect(() => {
    function parseStoredObject(raw) {
      if (!raw) {
        return {};
      }
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function onStorage(event) {
      if (event.storageArea !== window.localStorage) {
        return;
      }
      if (event.key === ZIP_STORAGE_KEY) {
        const nextZip = event.newValue || DEFAULT_ZIP;
        selectedZipRef.current = nextZip;
        setSelectedZip(nextZip);
        loadStores(nextZip).then((result) => {
          if (!result || result.stale) {
            return;
          }
          pruneCartsToStores(result.items);
          const selectedId = window.localStorage.getItem(STORE_STORAGE_KEY);
          if (selectedId) {
            const match = result.items.find((store) => store.id === selectedId);
            if (match) {
              setSelectedStore(match);
              return;
            }
          }
          setSelectedStore(null);
          window.localStorage.removeItem(STORE_STORAGE_KEY);
          setActivePage("stores");
          pendingContinueRef.current = null;
          setCartPanel(null);
        });
        return;
      }
      if (event.key === CARTS_STORAGE_KEY) {
        const remoteZip = window.localStorage.getItem(ZIP_STORAGE_KEY) || DEFAULT_ZIP;
        // Ignore cart snapshots from a tab that already moved to another zip.
        if (remoteZip !== selectedZipRef.current) {
          return;
        }
        setCarts(parseStoredObject(event.newValue));
        return;
      }
      if (event.key === CART_CATALOG_STORAGE_KEY) {
        // Merge so a slimmer remote catalog can't wipe line metadata before carts sync.
        const remote = parseStoredObject(event.newValue);
        setCartCatalog((prev) => ({ ...prev, ...remote }));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      storesZipRef.current = resolvedZip || "";
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
      pruneCartsToStores(result.items);
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
    const pending = pendingContinueRef.current;
    if (!pending?.storeId) {
      return;
    }
    if (storesLoading || storesZipRef.current !== selectedZip) {
      return;
    }
    if (stores.length === 0) {
      pendingContinueRef.current = null;
      return;
    }
    const match = stores.find((store) => store.id === pending.storeId);
    if (!match) {
      pendingContinueRef.current = null;
      return;
    }
    pendingContinueRef.current = null;
    setError("");
    setSelectedStore(match);
    window.localStorage.setItem(STORE_STORAGE_KEY, match.id);
    setQuery("");
    setDealsNotice("");
    setProducts([]);
    setActivePage("shop");
    setCartPanel(pending.panel === "drawer" ? "drawer" : null);
  }, [stores, storesLoading, selectedZip]);

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

  const filteredStores = useMemo(() => {
    const needle = storeQuery.trim().toLowerCase();
    return stores.filter((store) => {
      if (!storeMatchesFilter(store, storeFilter)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = `${store.name} ${(store.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [stores, storeFilter, storeQuery]);

  const activeStoreId = selectedStore?.id || "";
  const activeCart = carts[activeStoreId] || {};

  const cartItems = useMemo(
    () => buildCartItems(activeCart, cartCatalog, productCatalog),
    [activeCart, cartCatalog, productCatalog]
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item?.price || 0) * item.quantity, 0),
    [cartItems]
  );

  const cartCount = useMemo(
    () => Object.values(carts).reduce((sum, cart) => sum + countItems(cart), 0),
    [carts]
  );

  const hubCarts = useMemo(() => {
    return Object.entries(carts)
      .filter(([, cart]) => countItems(cart) > 0)
      .map(([storeId, cart]) => {
        const store = stores.find((entry) => entry.id === storeId);
        const items = buildCartItems(cart, cartCatalog, productCatalog);
        return {
          storeId,
          storeName: store?.name || storeId,
          logoUrl: store?.logo_url || "",
          etaLabel: store?.eta_label || "",
          itemCount: countItems(cart),
          subtotal: items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0),
          thumbnails: items
            .map((item) => item.image_url)
            .filter(Boolean)
            .slice(0, 4)
        };
      });
  }, [carts, stores, cartCatalog, productCatalog]);

  const otherOpenCarts = useMemo(() => {
    return hubCarts.filter((cart) => cart.storeId !== activeStoreId);
  }, [hubCarts, activeStoreId]);

  function pruneCartsToStores(storeList) {
    const availableIds = new Set(storeList.map((store) => store.id));
    setCarts((prev) => {
      const next = {};
      for (const [storeId, cart] of Object.entries(prev)) {
        if (availableIds.has(storeId) && countItems(cart) > 0) {
          next[storeId] = cart;
        }
      }
      return next;
    });
  }

  function clearStoreCart(storeId) {
    if (!storeId) {
      return;
    }
    setCarts((prev) => {
      const next = { ...prev };
      delete next[storeId];
      return next;
    });
  }

  function addToCart(product) {
    const productId = typeof product === "string" ? product : product.id;
    const catalogProduct =
      typeof product === "string"
        ? cartCatalog[product] || productCatalog[product]
        : product;
    if (!catalogProduct) {
      return;
    }

    const storeId = catalogProduct.store_id || selectedStore?.id || "";
    if (!storeId) {
      return;
    }

    const snapshot = snapshotProduct(catalogProduct);
    setCartCatalog((prev) => ({ ...prev, [productId]: snapshot }));
    setProductCatalog((prev) => ({ ...prev, [productId]: { ...prev[productId], ...snapshot } }));
    setCarts((prev) => {
      const storeCart = { ...(prev[storeId] || {}) };
      storeCart[productId] = (storeCart[productId] || 0) + 1;
      return { ...prev, [storeId]: storeCart };
    });
  }

  function decreaseItem(productId, storeId = activeStoreId) {
    if (!storeId || !productId) {
      return;
    }
    setCarts((prev) => {
      const storeCart = { ...(prev[storeId] || {}) };
      const currentQty = storeCart[productId] || 0;
      if (currentQty <= 1) {
        delete storeCart[productId];
      } else {
        storeCart[productId] = currentQty - 1;
      }
      const next = { ...prev };
      if (Object.keys(storeCart).length === 0) {
        delete next[storeId];
      } else {
        next[storeId] = storeCart;
      }
      return next;
    });
  }

  function quantityForProduct(product) {
    const storeId = product.store_id || selectedStore?.id || "";
    if (!storeId) {
      return 0;
    }
    return carts[storeId]?.[product.id] || 0;
  }

  function cartCountForStore(storeId) {
    return countItems(carts[storeId]);
  }

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

  async function checkExternalPrice() {
    if (!priceCheckUrl.trim()) {
      return;
    }
    setPriceCheckLoading(true);
    setPriceCheckNotice("");
    setError("");
    try {
      const response = await fetch(
        `${API_BASE}/api/price-check?url=${encodeURIComponent(priceCheckUrl.trim())}`
      );
      if (!response.ok) {
        throw new Error("Price check is unavailable right now. Please try again.");
      }
      const data = await response.json();
      setPriceCheckNotice(
        `Fetched ${data.url} (HTTP ${data.status_code}, ${data.content_length} bytes).`
      );
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setPriceCheckLoading(false);
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

  async function handleZipChange(zip) {
    const previousZip = selectedZip;
    pendingContinueRef.current = null;
    setSelectedZip(zip);
    const result = await loadStores(zip);
    if (result?.stale) {
      return;
    }
    if (!result) {
      setSelectedZip(previousZip);
      await loadStores(previousZip);
      return;
    }
    pruneCartsToStores(result.items);
    const prevId = selectedStore?.id;
    if (!prevId) {
      return;
    }
    const match = result.items.find((store) => store.id === prevId);
    if (match) {
      setSelectedStore(match);
      window.localStorage.setItem(STORE_STORAGE_KEY, match.id);
      return;
    }
    setSelectedStore(null);
    window.localStorage.removeItem(STORE_STORAGE_KEY);
    setProducts([]);
    setActivePage("stores");
    closeCartPanel();
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
    if (cartItems.length === 0 || !activeStoreId) {
      return;
    }

    setCheckoutLoading(true);
    setError("");
    setCheckoutState({
      type: "info",
      message: "Redirecting to Stripe Checkout..."
    });
    try {
      window.sessionStorage.setItem(CHECKOUT_STORE_KEY, activeStoreId);
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
          store_id: activeStoreId,
          store_name: selectedStore?.name || activeStoreId
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
      window.sessionStorage.removeItem(CHECKOUT_STORE_KEY);
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
        window.sessionStorage.removeItem(CHECKOUT_STORE_KEY);
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
            const checkedOutStoreId =
              session.store_id || window.sessionStorage.getItem(CHECKOUT_STORE_KEY) || "";
            if (checkedOutStoreId) {
              clearStoreCart(checkedOutStoreId);
            }
            window.sessionStorage.removeItem(CHECKOUT_STORE_KEY);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function closeCartPanel() {
    pendingContinueRef.current = null;
    setCartPanel(null);
  }

  function openCartPanel() {
    if (activePage === "shop" && selectedStore) {
      setCartPanel("drawer");
      return;
    }
    setCartPanel("hub");
  }

  function continueShoppingFromHub(storeId) {
    const store = stores.find((entry) => entry.id === storeId);
    const storesReady = !storesLoading && storesZipRef.current === selectedZip;
    if (store && storesReady) {
      pendingContinueRef.current = null;
      selectStore(store);
      closeCartPanel();
      return;
    }
    if (!storesReady) {
      pendingContinueRef.current = { storeId, panel: null };
      return;
    }
    pendingContinueRef.current = null;
    setError("");
    setActivePage("stores");
    closeCartPanel();
  }

  function switchDrawerCart(storeId) {
    const store = stores.find((entry) => entry.id === storeId);
    const storesReady = !storesLoading && storesZipRef.current === selectedZip;
    if (store && storesReady) {
      pendingContinueRef.current = null;
      selectStore(store);
      setCartPanel("drawer");
      return;
    }
    if (!storesReady) {
      pendingContinueRef.current = { storeId, panel: "drawer" };
      return;
    }
    pendingContinueRef.current = null;
    setError("");
    setActivePage("stores");
    setCartPanel("hub");
  }

  const zipLabel = ZIP_OPTIONS.find((option) => option.value === selectedZip)?.label || selectedZip;
  const zipDisplay = selectedZip;

  return (
    <div className="page">
      <header className="topNav">
        <button
          type="button"
          className="brand"
          onClick={() => {
            setError("");
            setActivePage("stores");
            closeCartPanel();
          }}
        >
          FreshCart
        </button>
        <div className="rightNav">
          <button
            className="navLink"
            onClick={() => {
              setError("");
              setActivePage("profile");
              closeCartPanel();
            }}
          >
            Profile
          </button>
          <button type="button" className="cartBadge" onClick={openCartPanel}>
            Cart {cartCount}
          </button>
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

          <section className="searchBar storesSearchBar">
            <input
              type="text"
              value={storeQuery}
              placeholder="Search stores..."
              onChange={(event) => setStoreQuery(event.target.value)}
              aria-label="Search stores"
            />
          </section>

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
            {filteredStores.map((store) => {
              const inCart = cartCountForStore(store.id);
              return (
                <button
                  key={store.id}
                  type="button"
                  className="storeCard"
                  onClick={() => selectStore(store)}
                >
                  <img src={store.logo_url} alt="" className="storeLogo" />
                  <div className="storeCardBody">
                    <div className="storeCardTitleRow">
                      <h3>{store.name}</h3>
                      {inCart > 0 ? <span className="storeInCartBadge">{inCart} in cart</span> : null}
                    </div>
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
              );
            })}
          </section>
          {!storesLoading && filteredStores.length === 0 ? (
            <p className="status">
              No stores match{storeQuery.trim() ? " your search" : " this filter"} for {selectedZip}.
            </p>
          ) : null}
        </>
      ) : null}

      {activePage === "shop" && selectedStore ? (
        <>
          <section className="hero">
            <h1>Groceries from {selectedStore.name}</h1>
            <p>
              {selectedStore.supports_pickup ? "Delivery or Pickup" : "Delivery"}
              {" · "}
              {selectedStore.eta_label}
              {typeof selectedStore.distance_mi === "number"
                ? ` · ${selectedStore.distance_mi} mi away`
                : ""}
            </p>
            <div className="heroActions">
              <button className="dealsBtn" onClick={loadTodaysDeals} disabled={dealsLoading}>
                {dealsLoading ? "Loading deals..." : "Today's Deals"}
              </button>
            </div>
            {dealsNotice ? <p className="status">{dealsNotice}</p> : null}
            <div className="priceCheck">
              <input
                type="url"
                className="priceCheckInput"
                placeholder="Paste a product URL to compare price"
                value={priceCheckUrl}
                onChange={(e) => setPriceCheckUrl(e.target.value)}
              />
              <button
                className="dealsBtn"
                onClick={checkExternalPrice}
                disabled={priceCheckLoading}
              >
                {priceCheckLoading ? "Checking..." : "Compare price"}
              </button>
            </div>
            {priceCheckNotice ? <p className="status">{priceCheckNotice}</p> : null}
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

          <main className="content contentFull">
            <section className="productsGrid">
              {products.map((product) => {
                const qty = quantityForProduct(product);
                return (
                  <article className="card" key={product.id}>
                    <img src={product.image_url} alt={product.name} />
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <div className="row">
                      <strong>{currency(product.price)}</strong>
                      {qty > 0 ? (
                        <div className="qtyControls productQtyControls">
                          <button
                            type="button"
                            onClick={() => decreaseItem(product.id, product.store_id)}
                            aria-label={qty <= 1 ? `Remove ${product.name}` : `Decrease ${product.name}`}
                          >
                            {qty <= 1 ? "×" : "−"}
                          </button>
                          <span>{qty}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            aria-label={`Increase ${product.name}`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button className="addBtn" onClick={() => addToCart(product)}>
                          Add
                        </button>
                      )}
                    </div>
                    <small className="source">{product.store_id}</small>
                  </article>
                );
              })}
            </section>
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

      {cartPanel === "hub" ? (
        <CartsHub
          zip={zipDisplay}
          carts={hubCarts}
          onClose={closeCartPanel}
          onContinueShopping={continueShoppingFromHub}
          onDeleteCart={clearStoreCart}
          onBrowseStores={() => {
            closeCartPanel();
            setActivePage("stores");
          }}
        />
      ) : null}

      {cartPanel === "drawer" && selectedStore ? (
        <CartDrawer
          zip={zipDisplay}
          storeName={selectedStore.name}
          etaLabel={selectedStore.eta_label}
          supportsPickup={Boolean(selectedStore.supports_pickup)}
          items={cartItems}
          subtotal={cartTotal}
          otherCarts={otherOpenCarts}
          checkoutLoading={checkoutLoading}
          onClose={closeCartPanel}
          onIncrease={addToCart}
          onDecrease={(productId) => decreaseItem(productId, selectedStore.id)}
          onCheckout={startCheckout}
          onSwitchCart={switchDrawerCart}
        />
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
