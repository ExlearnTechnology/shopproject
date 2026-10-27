let products = [];

const services = [
  { name: "Catalog", key: "catalog", description: "Product discovery and collection details.", icon: "✳" },
  { name: "Customers", key: "customers", description: "Customer profiles and account preferences.", icon: "♡" },
  { name: "Orders", key: "orders", description: "Order creation and delivery updates.", icon: "↗" },
  { name: "Notifications", key: "notifications", description: "Helpful updates when it matters.", icon: "✉" },
];

const cart = new Map();
const cartIdKey = "goodgoods-cart-id";
let cartId = localStorage.getItem(cartIdKey);
if (!cartId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cartId)) {
  cartId = crypto.randomUUID();
  localStorage.setItem(cartIdKey, cartId);
}
let cartSaving = false;
let activeCategory = "All";
let searchTerm = "";
let toastTimeout;

const productGrid = document.querySelector("#product-grid");
const categoryList = document.querySelector("#categories");
const cartDialog = document.querySelector("#cart-dialog");
const toast = document.querySelector("#toast");

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
}

function renderCategories() {
  const categories = ["All", ...new Set(products.map((product) => product.category))];
  categoryList.innerHTML = categories.map((category) => `
    <button class="category-button${category === activeCategory ? " active" : ""}" type="button" data-category="${category}">
      ${category}
    </button>
  `).join("");
}

function renderProducts() {
  if (products.length === 0) {
    productGrid.innerHTML = '<p class="empty-products">Loading products from the catalog…</p>';
    return;
  }
  const visibleProducts = products.filter((product) => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const matchesSearch = `${product.name} ${product.category}`.toLowerCase().includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  if (visibleProducts.length === 0) {
    productGrid.innerHTML = '<p class="empty-products">Nothing found just yet. Try another search.</p>';
    return;
  }

  productGrid.innerHTML = visibleProducts.map((product) => `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${product.image}" alt="${product.alt}" loading="lazy" />
        <span class="product-tag">${product.tag}</span>
        <button class="quick-add" type="button" data-add="${product.id}" aria-label="Add ${product.name} to bag">+</button>
      </div>
      <div class="product-info">
        <div><h3 class="product-name">${product.name}</h3><p class="product-category">${product.category}</p></div>
        <p class="product-price">${formatPrice(product.price)}</p>
      </div>
    </article>
  `).join("");
}

function renderCart() {
  const itemCount = [...cart.values()].reduce((total, quantity) => total + quantity, 0);
  const total = [...cart.entries()].reduce((sum, [id, quantity]) => {
    const product = products.find((item) => item.id === id);
    return sum + product.price * quantity;
  }, 0);

  document.querySelector("#cart-count").textContent = String(itemCount);
  document.querySelector("#cart-total").textContent = formatPrice(total);
  document.querySelector("#checkout-button").disabled = itemCount === 0 || cartSaving;

  const items = [...cart.entries()];
  if (items.length === 0) {
    document.querySelector("#cart-items").innerHTML = '<p class="cart-empty">Your bag is ready for something good.</p>';
    return;
  }

  document.querySelector("#cart-items").innerHTML = items.map(([id, quantity]) => {
    const product = products.find((item) => item.id === id);
    return `
      <article class="cart-row">
        <img src="${product.image}" alt="" />
        <div>
          <h3>${product.name}</h3>
          <p>${formatPrice(product.price)}</p>
          <div class="quantity-control">
            <button type="button" data-quantity="${id}" data-change="-1" aria-label="Remove one ${product.name}">−</button>
            <span>${quantity}</span>
            <button type="button" data-quantity="${id}" data-change="1" aria-label="Add one ${product.name}">+</button>
          </div>
        </div>
        <strong class="cart-line-price">${formatPrice(product.price * quantity)}</strong>
      </article>
    `;
  }).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function addToCart(id) {
  if (cartSaving || !products.some((product) => product.id === id)) return;
  document.querySelector("#order-success").hidden = true;
  const nextCart = new Map(cart);
  nextCart.set(id, (nextCart.get(id) ?? 0) + 1);
  void saveCart(nextCart).then((saved) => {
    if (!saved) return;
    const product = products.find((item) => item.id === id);
    if (product) showToast(`${product.name} saved to your bag`);
  });
}

async function saveCart(nextCart) {
  if (cartSaving) return false;
  cartSaving = true;
  renderCart();
  try {
    const response = await fetch(`/api/orders/carts/${cartId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [...nextCart.entries()].map(([productId, quantity]) => ({ productId, quantity })),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not save your bag");
    cart.clear();
    for (const item of result.items) cart.set(item.productId, item.quantity);
    renderCart();
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not save your bag");
    return false;
  } finally {
    cartSaving = false;
    renderCart();
  }
}

async function loadCart() {
  const response = await fetch(`/api/orders/carts/${cartId}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not load your saved bag");
  cart.clear();
  for (const item of result.items) cart.set(item.productId, item.quantity);
  renderCart();
}

function resetCartId() {
  cartId = crypto.randomUUID();
  localStorage.setItem(cartIdKey, cartId);
}

async function loadProducts() {
  try {
    const response = await fetch("/api/catalog/products", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Catalog service is unavailable");
    if (!Array.isArray(result.products)) throw new Error("Catalog returned an invalid product list");
    products = result.products;
    renderCategories();
    renderProducts();
    await loadCart();
  } catch (error) {
    productGrid.innerHTML = '<p class="empty-products">We couldn’t load products or your saved bag. Check the services and refresh.</p>';
    showToast(error instanceof Error ? error.message : "Could not load shop data");
  }
}

async function placeOrder() {
  const nameInput = document.querySelector("#checkout-name");
  const emailInput = document.querySelector("#checkout-email");
  if (!nameInput.reportValidity() || !emailInput.reportValidity()) return;

  const checkoutButton = document.querySelector("#checkout-button");
  checkoutButton.disabled = true;
  checkoutButton.textContent = "Placing your order…";
  try {
    const customerResponse = await fetch("/api/customers/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nameInput.value.trim(), email: emailInput.value.trim() }),
    });
    const customerResult = await customerResponse.json();
    if (!customerResponse.ok) throw new Error(customerResult.error ?? "Could not save your customer details");

    const orderResponse = await fetch("/api/orders/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: customerResult.customer.id,
        cartId,
      }),
    });
    const orderResult = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(orderResult.error ?? "Could not place your order");

    showOrderSuccess(orderResult.order, customerResult.customer);
    cart.clear();
    localStorage.removeItem(cartIdKey);
    resetCartId();
    renderCart();
    showToast(`Order #${orderResult.order.id} placed${orderResult.order.notificationStatus === "pending" ? " — confirmation notification pending" : " — confirmation recorded"}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not place your order");
  } finally {
    checkoutButton.innerHTML = 'Place order <span aria-hidden="true">↗</span>';
    checkoutButton.disabled = cart.size === 0;
  }
}

function showOrderSuccess(order, customer) {
  const success = document.querySelector("#order-success");
  const details = document.querySelector("#order-success-details");
  const items = document.querySelector("#order-success-items");
  details.textContent = `Order #${order.id} · ${customer.name} · ${customer.email} · ${formatPrice(order.total)}`;
  items.replaceChildren();
  for (const product of order.items) {
    const item = document.createElement("li");
    item.textContent = `${product.name} × ${product.quantity} — ${formatPrice(product.unitPrice * product.quantity)}`;
    items.append(item);
  }
  const confirmation = document.createElement("li");
  confirmation.textContent = order.notificationStatus === "pending"
    ? "Order confirmation is pending."
    : "Order confirmation recorded.";
  items.append(confirmation);
  success.hidden = false;
}

async function loadCustomerActivity() {
  const email = document.querySelector("#checkout-email").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.querySelector("#checkout-email").reportValidity();
    return;
  }
  const activity = document.querySelector("#customer-activity");
  activity.textContent = "Loading your orders and notifications…";
  try {
    const encodedEmail = encodeURIComponent(email);
    const [ordersResponse, notificationsResponse] = await Promise.all([
      fetch(`/api/orders/orders?email=${encodedEmail}`),
      fetch(`/api/notifications/notifications?email=${encodedEmail}`),
    ]);
    const [ordersResult, notificationsResult] = await Promise.all([
      ordersResponse.json(),
      notificationsResponse.json(),
    ]);
    if (!ordersResponse.ok) throw new Error(ordersResult.error ?? "Could not load orders");
    if (!notificationsResponse.ok) throw new Error(notificationsResult.error ?? "Could not load notifications");
    if (ordersResult.orders.length === 0 && notificationsResult.notifications.length === 0) {
      activity.textContent = "No orders or notifications found for this email yet.";
      return;
    }
    activity.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = "Your recent activity";
    const list = document.createElement("ul");
    for (const order of ordersResult.orders) {
      const item = document.createElement("li");
      const itemDetails = Array.isArray(order.items)
        ? order.items.map((product) => `${product.name} × ${product.quantity}`).join(", ")
        : "";
      item.textContent = `Order #${order.id} · ${formatPrice(order.total)} · ${order.status}${itemDetails ? ` · ${itemDetails}` : ""}`;
      list.append(item);
    }
    for (const notification of notificationsResult.notifications) {
      const item = document.createElement("li");
      item.textContent = notification.message;
      list.append(item);
    }
    activity.append(heading, list);
  } catch (error) {
    activity.textContent = error instanceof Error ? error.message : "Could not load your activity";
  }
}

function renderServices() {
  document.querySelector("#service-grid").innerHTML = services.map((service) => `
    <article class="service-card" data-service="${service.key}">
      <div class="service-top">
        <span class="service-icon" aria-hidden="true">${service.icon}</span>
        <span class="service-state"><span class="service-dot"></span><span class="state-label">Checking</span></span>
      </div>
      <h3>${service.name} service</h3>
      <p>${service.description}</p>
      <div class="service-actions">
        <a href="/api/${service.key}/" target="_blank" rel="noreferrer">Open service ↗</a>
        <span class="service-latency">Waiting…</span>
      </div>
    </article>
  `).join("");
}

async function checkServices() {
  const refreshButton = document.querySelector("#refresh-services");
  refreshButton.disabled = true;
  document.querySelector("#overall-status").textContent = "Checking services…";

  const results = await Promise.all(services.map(async (service) => {
    const card = document.querySelector(`[data-service="${service.key}"]`);
    const stateLabel = card.querySelector(".state-label");
    const dot = card.querySelector(".service-dot");
    const latencyLabel = card.querySelector(".service-latency");
    const startedAt = performance.now();

    try {
      const response = await fetch(`/api/${service.key}/health/ready`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error(`Health check returned ${response.status}`);
      const result = await response.json();
      if (result.status !== "ready") throw new Error("Service is not ready");
      const elapsed = Math.round(performance.now() - startedAt);
      stateLabel.textContent = "Online";
      dot.className = "service-dot online";
      latencyLabel.textContent = `${elapsed} ms`;
      return true;
    } catch {
      stateLabel.textContent = "Offline";
      dot.className = "service-dot offline";
      latencyLabel.textContent = "Unavailable";
      return false;
    }
  }));

  const onlineCount = results.filter(Boolean).length;
  const overallStatus = document.querySelector("#overall-status");
  const overallIndicator = document.querySelector("#overall-indicator");
  overallIndicator.className = `status-pulse ${onlineCount === services.length ? "online" : onlineCount === 0 ? "offline" : ""}`;
  overallStatus.textContent = onlineCount === services.length
    ? "All services operational"
    : `${onlineCount} of ${services.length} services online`;
  refreshButton.disabled = false;
}

categoryList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  activeCategory = button.dataset.category;
  renderCategories();
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

document.querySelector("#product-search").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderProducts();
});

document.querySelector("#cart-toggle").addEventListener("click", () => cartDialog.showModal());
document.querySelector("#cart-close").addEventListener("click", () => cartDialog.close());
cartDialog.addEventListener("click", (event) => {
  if (event.target === cartDialog) cartDialog.close();
  const button = event.target.closest("[data-quantity]");
  if (!button) return;
  if (cartSaving) return;
  const id = button.dataset.quantity;
  const nextCart = new Map(cart);
  const quantity = (nextCart.get(id) ?? 0) + Number(button.dataset.change);
  if (quantity <= 0) nextCart.delete(id);
  else nextCart.set(id, quantity);
  void saveCart(nextCart);
});

document.querySelector("#checkout-button").addEventListener("click", () => {
  void placeOrder();
});
document.querySelector("#activity-button").addEventListener("click", loadCustomerActivity);
document.querySelector("#refresh-services").addEventListener("click", checkServices);

renderCategories();
renderProducts();
renderCart();
renderServices();
void loadProducts();
checkServices();
setInterval(checkServices, 30000);
