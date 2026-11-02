/*
  منطق صفحات کاربر. همه‌ی داده‌ها از سرور خوانده و به سرور فرستاده می‌شوند.
*/

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ORDER_STATUS = {
  awaiting_receipt: "منتظر ارسال رسید",
  receipt_submitted: "در انتظار تأیید",
  confirmed: "تأیید شده",
  rejected: "رد شده"
};
const REVIEW_STATUS = { pending: "در انتظار تأیید", approved: "تأیید شده", rejected: "رد شده" };
const CART_KEY = "saeed-tools-cart";
const PENDING_KEY = "st-pending-order";
const RECEIPT_MAX_MB = 6;

// ---------- ابزارهای کمکی ----------

function faNum(value) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[d]);
}

function formatPrice(value) {
  return Number(value).toLocaleString("fa-IR") + " تومان";
}

function findProduct(id) {
  return PRODUCTS.find((p) => p.id === Number(id));
}

function productName(id) {
  const p = findProduct(id);
  return p ? p.name : "محصول حذف‌شده";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function stars(n) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function safeNext(raw) {
  const v = raw || "dashboard.html";
  return /^[a-z-]+\.html(\?[\w=&%.-]*)?$/i.test(v) ? v : "dashboard.html";
}

// ---------- سبد خرید (فقط در مرورگر) ----------

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(productId, qty = 1) {
  const cart = getCart();
  const item = cart.find((i) => i.id === Number(productId));
  if (item) item.qty += qty;
  else cart.push({ id: Number(productId), qty });
  saveCart(cart);
}

function updateQty(productId, qty) {
  saveCart(
    getCart()
      .map((i) => (i.id === Number(productId) ? { ...i, qty } : i))
      .filter((i) => i.qty > 0)
  );
}

function removeFromCart(productId) {
  saveCart(getCart().filter((i) => i.id !== Number(productId)));
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

function cartTotal() {
  return getCart().reduce((sum, i) => {
    const p = findProduct(i.id);
    return p ? sum + p.price * i.qty : sum;
  }, 0);
}

function updateCartBadge() {
  const badge = document.querySelector("[data-cart-count]");
  if (badge) badge.textContent = faNum(cartCount());
}

// ---------- هدر و فوتر ----------

function renderHeader(activePage) {
  const header = document.getElementById("site-header");
  if (!header) return;
  const user = currentUser();
  const links = [
    { key: "home", href: "index.html", label: "خانه" },
    { key: "products", href: "products.html", label: "محصولات" },
    { key: "contact", href: "contact.html", label: "تماس با ما" }
  ];
  const nav = links
    .map((l) => `<a href="${l.href}" class="${l.key === activePage ? "active" : ""}">${l.label}</a>`)
    .join("");
  const account = user
    ? `<a href="dashboard.html" class="account-link ${activePage === "dashboard" ? "active" : ""}">حساب من</a>
       <button class="account-link logout" id="logout-btn">خروج</button>`
    : `<a href="auth.html" class="account-link">ورود / ثبت نام</a>`;

  header.innerHTML = `
    <div class="container header-inner">
      <a href="index.html" class="brand">
        <span class="brand-mark">ST</span>
        <span class="brand-text">${escapeHtml(SHOP.name || "saeed tools")}</span>
      </a>
      <nav class="main-nav">${nav}</nav>
      <div class="header-actions">
        <a href="cart.html" class="cart-link">
          سبد خرید
          <span class="cart-badge" data-cart-count>۰</span>
        </a>
        ${account}
        <a href="admin.html" class="admin-link">ورود پنل</a>
      </div>
    </div>`;

  const logout = document.getElementById("logout-btn");
  if (logout) {
    logout.onclick = () => {
      logoutUser();
      location.href = "index.html";
    };
  }
}

function renderFooter() {
  const footer = document.getElementById("site-footer");
  if (!footer) return;
  footer.innerHTML = `
    <div class="container footer-inner">
      <div>
        <strong>${escapeHtml(SHOP.name || "")}</strong>
        <p>${escapeHtml(SHOP.subtitle || "")}</p>
      </div>
      <div>
        <p>${escapeHtml(SHOP.address || "")}</p>
        <p>تلفن: <span dir="ltr">${escapeHtml(SHOP.phone || "")}</span></p>
      </div>
    </div>
    <div class="footer-bottom">© ${new Date().toLocaleDateString("fa-IR", { year: "numeric" })} ${escapeHtml(SHOP.name || "")}</div>`;
}

// ---------- اسلایدر ----------

function slideHref(s) {
  if (!s.link) return "";
  if (s.link.type === "product") return `product.html?id=${s.link.value}`;
  if (s.link.type === "category") return `products.html?cat=${s.link.value}`;
  return "";
}

function initSlider() {
  const box = document.getElementById("hero-slider");
  if (!box || !SLIDES.length) return;

  box.innerHTML = `
    <div class="slides">
      ${SLIDES.map((s, idx) => {
        // اگر عکسی آپلود نشده باشد، عکس پیش‌فرض فرانت نمایش داده می‌شود
        const url = fileUrl(s.image) || "images/tools-bg.jpg";
        const href = slideHref(s);
        return `
          <article class="slide ${idx === 0 ? "active" : ""}"
            style="background-image: linear-gradient(rgba(28,28,28,.55), rgba(28,28,28,.78)), url('${url}');">
            <div class="slide-inner">
              <h1>${escapeHtml(s.title)}</h1>
              ${s.subtitle ? `<p>${escapeHtml(s.subtitle)}</p>` : ""}
              ${href ? `<a href="${href}" class="btn btn-primary">مشاهده</a>` : ""}
            </div>
          </article>`;
      }).join("")}
    </div>
    ${
      SLIDES.length > 1
        ? `<button class="slide-nav next" aria-label="اسلاید بعدی">‹</button>
           <button class="slide-nav prev" aria-label="اسلاید قبلی">›</button>
           <div class="dots">${SLIDES.map((_, idx) => `<span class="dot ${idx === 0 ? "active" : ""}" data-i="${idx}"></span>`).join("")}</div>`
        : ""
    }`;

  const slides = [...box.querySelectorAll(".slide")];
  const dots = [...box.querySelectorAll(".dot")];
  let index = 0;
  let timer = null;

  const go = (n) => {
    slides[index].classList.remove("active");
    if (dots[index]) dots[index].classList.remove("active");
    index = (n + slides.length) % slides.length;
    slides[index].classList.add("active");
    if (dots[index]) dots[index].classList.add("active");
  };
  const restart = () => {
    clearInterval(timer);
    if (slides.length > 1) timer = setInterval(() => go(index + 1), 5000);
  };

  const next = box.querySelector(".next");
  const prev = box.querySelector(".prev");
  if (next) next.addEventListener("click", () => { go(index + 1); restart(); });
  if (prev) prev.addEventListener("click", () => { go(index - 1); restart(); });
  dots.forEach((d) => d.addEventListener("click", () => { go(Number(d.dataset.i)); restart(); }));
  restart();
}

// ---------- محصولات ----------

function renderProductCard(p) {
  const img = fileUrl(p.image);
  const stock = p.inStock ? "" : `<span class="badge-out">ناموجود</span>`;
  return `
    <a href="product.html?id=${p.id}" class="product-card">
      <div class="product-image">
        ${img ? `<img src="${img}" alt="${escapeHtml(p.name)}">` : `<span class="placeholder">${escapeHtml(p.name.charAt(0))}</span>`}
        ${stock}
      </div>
      <div class="product-body">
        <h3>${escapeHtml(p.name)}</h3>
        <p class="price">${formatPrice(p.price)}</p>
      </div>
    </a>`;
}

function initHome() {
  initSlider();
  const cats = document.getElementById("home-categories");
  if (cats) {
    cats.innerHTML = CATEGORIES.map(
      (c) => `<a href="products.html?cat=${c.id}" class="category-card">${escapeHtml(c.name)}</a>`
    ).join("");
  }
  const featured = document.getElementById("featured-products");
  if (featured) featured.innerHTML = PRODUCTS.slice(0, 4).map(renderProductCard).join("");
}

function initProducts() {
  const currentCat = new URLSearchParams(location.search).get("cat");
  const filters = document.getElementById("category-filters");
  const grid = document.getElementById("products-grid");
  const title = document.getElementById("products-title");

  const all = [{ id: "all", name: "همه" }, ...CATEGORIES];
  filters.innerHTML = all
    .map((c) => {
      const isActive = (c.id === "all" && !currentCat) || c.id === currentCat;
      const href = c.id === "all" ? "products.html" : `products.html?cat=${c.id}`;
      return `<a href="${href}" class="filter-chip ${isActive ? "active" : ""}">${escapeHtml(c.name)}</a>`;
    })
    .join("");

  const list = currentCat ? PRODUCTS.filter((p) => p.category === currentCat) : PRODUCTS;
  const catName = CATEGORIES.find((c) => c.id === currentCat);
  title.textContent = catName ? catName.name : "همه محصولات";
  grid.innerHTML = list.length
    ? list.map(renderProductCard).join("")
    : `<p class="empty">محصولی در این دسته‌بندی وجود ندارد.</p>`;
}

function initProduct() {
  const id = new URLSearchParams(location.search).get("id");
  const p = findProduct(id);
  const box = document.getElementById("product-detail");

  if (!p) {
    box.innerHTML = `<p class="empty">محصول پیدا نشد. <a href="products.html">بازگشت به محصولات</a></p>`;
    document.getElementById("reviews-section").hidden = true;
    return;
  }

  const cat = CATEGORIES.find((c) => c.id === p.category);
  const img = fileUrl(p.image);
  document.title = `${p.name} | ${SHOP.name || ""}`;
  box.innerHTML = `
    <div class="detail-image">
      ${img ? `<img src="${img}" alt="${escapeHtml(p.name)}">` : `<span class="placeholder big">${escapeHtml(p.name.charAt(0))}</span>`}
    </div>
    <div class="detail-info">
      <p class="crumb"><a href="products.html?cat=${p.category}">${escapeHtml(cat ? cat.name : "")}</a></p>
      <h1>${escapeHtml(p.name)}</h1>
      <p class="price big">${formatPrice(p.price)}</p>
      <p class="desc">${escapeHtml(p.description)}</p>
      <p class="stock ${p.inStock ? "in" : "out"}">${p.inStock ? "موجود در انبار" : "ناموجود"}</p>
      ${
        p.inStock
          ? `<div class="qty-row">
               <label for="qty">تعداد:</label>
               <input type="number" id="qty" min="1" max="20" value="1">
             </div>
             <button class="btn btn-primary" id="add-btn">افزودن به سبد خرید</button>
             <p class="added-msg" id="added-msg" hidden>به سبد خرید اضافه شد ✓</p>`
          : `<button class="btn" disabled>ناموجود</button>`
      }
    </div>`;

  const addBtn = document.getElementById("add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const qty = Math.max(1, parseInt(document.getElementById("qty").value, 10) || 1);
      addToCart(p.id, qty);
      document.getElementById("added-msg").hidden = false;
    });
  }

  renderReviews(p);
}

// ---------- نظرات محصول ----------

async function renderReviews(p) {
  const box = document.getElementById("reviews");
  if (!box) return;
  const user = currentUser();
  const here = encodeURIComponent(`product.html?id=${p.id}`);

  let approved;
  let mine = null;
  try {
    approved = await api(`/products/${p.id}/reviews`, { auth: false });
    if (user) {
      const mineList = await api("/me/reviews");
      mine = mineList.find((r) => r.productId === p.id) || null;
    }
  } catch (e) {
    box.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
    return;
  }

  const avg = approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0;
  const list = approved.length
    ? approved
        .map(
          (r) => `
          <div class="review">
            <div class="review-head">
              <strong>${escapeHtml(r.userName)}</strong>
              <span class="stars">${stars(r.rating)}</span>
            </div>
            <p>${escapeHtml(r.comment)}</p>
            <small>${faNum(new Date(r.date).toLocaleDateString("fa-IR"))}</small>
          </div>`
        )
        .join("")
    : `<p class="empty">هنوز نظری برای این محصول ثبت نشده است.</p>`;

  let form;
  if (!user) {
    form = `<p class="hint">برای ثبت نظر، ابتدا <a href="auth.html?next=${here}">وارد حساب کاربری</a> شوید.</p>`;
  } else if (mine) {
    form = `<p class="hint">نظر شما برای این محصول ثبت شده و وضعیت آن: <strong>${REVIEW_STATUS[mine.status]}</strong></p>`;
  } else {
    form = `
      <form id="review-form" class="review-form">
        <label>امتیاز شما</label>
        <div class="star-input">
          ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="s${n}" name="rating" value="${n}"><label for="s${n}">★</label>`).join("")}
        </div>
        <textarea name="comment" rows="3" required placeholder="نظر خود را بنویسید..."></textarea>
        <button class="btn btn-primary">ثبت نظر</button>
        <p class="hint">نظر شما پس از تأیید مدیر نمایش داده می‌شود.</p>
        <p class="error" id="review-error" hidden></p>
      </form>`;
  }

  box.innerHTML = `
    <h2>نظرات کاربران</h2>
    <p class="rating-summary">
      ${approved.length ? `<span class="stars big">${stars(Math.round(avg))}</span> ${faNum(avg.toFixed(1))} از ۵ (${faNum(approved.length)} نظر)` : "هنوز امتیازی ثبت نشده است."}
    </p>
    ${list}
    <div class="review-box">${form}</div>`;

  const reviewForm = document.getElementById("review-form");
  if (reviewForm) {
    reviewForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(reviewForm);
      const err = document.getElementById("review-error");
      try {
        await api(`/products/${p.id}/reviews`, {
          method: "POST",
          body: { rating: Number(f.get("rating")), comment: String(f.get("comment") || "") }
        });
        renderReviews(p);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });
  }
}

// ---------- سبد خرید ----------

function initCart() {
  const box = document.getElementById("cart-box");
  const cart = getCart().filter((i) => findProduct(i.id));

  if (!cart.length) {
    box.innerHTML = `
      <p class="empty">سبد خرید شما خالی است.</p>
      <div class="center"><a href="products.html" class="btn btn-primary">مشاهده محصولات</a></div>`;
    return;
  }

  const rows = cart
    .map((i) => {
      const p = findProduct(i.id);
      return `
        <div class="cart-row">
          <div class="cart-name">
            <a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a>
            <p class="price">${formatPrice(p.price)}</p>
          </div>
          <div class="qty-control">
            <button data-act="dec" data-id="${p.id}">−</button>
            <span>${faNum(i.qty)}</span>
            <button data-act="inc" data-id="${p.id}">+</button>
          </div>
          <div class="cart-line">${formatPrice(p.price * i.qty)}</div>
          <button class="remove-btn" data-act="remove" data-id="${p.id}">حذف</button>
        </div>`;
    })
    .join("");

  box.innerHTML = `
    <div class="cart-list">${rows}</div>
    <div class="cart-summary">
      <p>جمع کل: <strong>${formatPrice(cartTotal())}</strong></p>
      <a href="checkout.html" class="btn btn-primary">ادامه و ثبت سفارش</a>
    </div>`;

  box.onclick = (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.dataset.id;
    const current = getCart().find((i) => i.id === Number(id));
    if (btn.dataset.act === "inc") updateQty(id, current.qty + 1);
    if (btn.dataset.act === "dec") updateQty(id, current.qty - 1);
    if (btn.dataset.act === "remove") removeFromCart(id);
    initCart();
  };
}

// ---------- ثبت سفارش و کارت به کارت ----------

function needLoginBox(message, next) {
  return `
    <div class="need-login">
      <p>${message}</p>
      <div class="actions center">
        <a class="btn btn-primary" href="auth.html?next=${encodeURIComponent(next)}">ورود</a>
        <a class="btn" href="auth.html?next=${encodeURIComponent(next)}">ثبت‌نام</a>
      </div>
    </div>`;
}

function initCheckout() {
  const box = document.getElementById("checkout-box");
  const user = currentUser();

  if (!user) {
    box.innerHTML = `<h1>ثبت سفارش</h1>${needLoginBox("برای ثبت سفارش ابتدا باید وارد حساب کاربری خود شوید.", "checkout.html")}`;
    return;
  }

  // اگر سفارشی منتظر فیش است، همان مرحله را نشان بده
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
  if (pending && pending.order && pending.order.status === "awaiting_receipt") {
    return renderPaymentStep(box, pending.order, pending.payment);
  }

  const cart = getCart().filter((i) => findProduct(i.id));
  if (!cart.length) {
    box.innerHTML = `<p class="empty">سبد خرید شما خالی است. <a href="products.html">خرید از فروشگاه</a></p>`;
    return;
  }
  renderOrderForm(box, cart, user);
}

function renderOrderForm(box, cart, user) {
  const items = cart
    .map((i) => `<li>${escapeHtml(findProduct(i.id).name)} × ${faNum(i.qty)}</li>`)
    .join("");

  box.innerHTML = `
    <h1>ثبت سفارش</h1>
    <ul class="order-items">${items}</ul>
    <p class="checkout-total">جمع سفارش: <strong>${formatPrice(cartTotal())}</strong></p>
    <div class="error" id="form-error" hidden></div>
    <form id="checkout-form" novalidate>
      <div class="form-row">
        <label for="name">نام و نام خانوادگی</label>
        <input type="text" id="name" name="name" value="${escapeHtml(user.name)}" required>
      </div>
      <div class="form-row">
        <label for="phone">شماره موبایل</label>
        <input type="tel" id="phone" name="phone" dir="ltr" value="${escapeHtml(user.phone)}" required>
      </div>
      <div class="form-row">
        <label for="address">آدرس (اختیاری)</label>
        <textarea id="address" name="address" rows="3"></textarea>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">ادامه و پرداخت کارت به کارت</button>
    </form>`;

  document.getElementById("checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = document.getElementById("form-error");
    try {
      const result = await api("/orders", {
        method: "POST",
        body: {
          customer: {
            name: String(f.get("name") || ""),
            phone: String(f.get("phone") || ""),
            address: String(f.get("address") || "")
          },
          items: cart.map((i) => ({ id: i.id, qty: i.qty }))
        }
      });
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(result));
      saveCart([]);
      renderPaymentStep(box, result.order, result.payment);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

function renderPaymentStep(box, order, payment) {
  const bank = payment.bank || {};
  const notes = (payment.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");
  box.innerHTML = `
    <h1>پرداخت کارت به کارت</h1>
    <p class="order-code">کد سفارش شما: <strong>${escapeHtml(order.id)}</strong></p>
    <div class="pay-box">
      <p>مبلغ قابل پرداخت: <strong>${formatPrice(order.total)}</strong></p>
      <p>بانک: ${escapeHtml(bank.bankName || "")}</p>
      <p>شماره کارت: <span class="card-num" dir="ltr">${escapeHtml(bank.cardNumber || "")}</span></p>
      <p>به نام: ${escapeHtml(bank.holder || "")}</p>
    </div>
    <div class="notes-box">
      <h3>نکات مهم پرداخت</h3>
      <ul class="notes">${notes}</ul>
    </div>
    <div class="error" id="form-error" hidden></div>
    <form id="receipt-form">
      <div class="form-row">
        <label for="receipt">تصویر یا فایل فیش واریزی (حداکثر ${faNum(RECEIPT_MAX_MB)} مگابایت)</label>
        <input type="file" id="receipt" name="receipt" accept="image/*,application/pdf" required>
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%">ارسال رسید</button>
    </form>`;

  document.getElementById("receipt-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("form-error");
    const file = document.getElementById("receipt").files[0];
    if (!file) {
      err.textContent = "فایل رسید را انتخاب کنید.";
      err.hidden = false;
      return;
    }
    if (file.size > RECEIPT_MAX_MB * 1024 * 1024) {
      err.textContent = `حجم فایل بیشتر از ${faNum(RECEIPT_MAX_MB)} مگابایت است.`;
      err.hidden = false;
      return;
    }
    try {
      await uploadReceipt(order.id, file);
      sessionStorage.removeItem(PENDING_KEY);
      renderReceiptDone(box, order);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// آپلود فیش برای یک سفارش (در صفحه‌ی پرداخت و داشبورد)
function uploadReceipt(orderId, file) {
  return api(`/orders/${encodeURIComponent(orderId)}/receipt`, { method: "POST", form: formOf({ receipt: file }) });
}

function renderReceiptDone(box, order) {
  box.innerHTML = `
    <div class="success-box">
      <div class="big-icon">✅</div>
      <h2>رسید شما دریافت شد</h2>
      <p>کد سفارش: <strong>${escapeHtml(order.id)}</strong></p>
      <p>بعد از بررسی و تأیید پرداخت، از طریق شماره‌ی موبایل شما به شما اطلاع داده می‌شود.</p>
      <p style="margin-top:1rem"><a href="dashboard.html" class="btn">پیگیری در حساب کاربری</a></p>
    </div>`;
}

// ---------- ورود و ثبت‌نام ----------

function initAuth() {
  const box = document.getElementById("auth-box");
  const next = safeNext(new URLSearchParams(location.search).get("next"));
  if (currentUser()) {
    location.href = next;
    return;
  }

  let mode = "login";
  box.innerHTML = `
    <div class="auth-tabs">
      <button type="button" class="active" data-mode="login">ورود</button>
      <button type="button" data-mode="register">ثبت‌نام</button>
    </div>
    <form id="auth-form">
      <div class="form-row" id="name-row" hidden>
        <label for="a-name">نام و نام خانوادگی</label>
        <input id="a-name" name="name">
      </div>
      <div class="form-row">
        <label for="a-phone">شماره موبایل</label>
        <input id="a-phone" name="phone" dir="ltr" placeholder="09xxxxxxxxx" required>
      </div>
      <div class="form-row">
        <label for="a-pass">رمز عبور</label>
        <input id="a-pass" name="password" type="password" required>
      </div>
      <div class="error" id="auth-error" hidden></div>
      <button class="btn btn-primary" id="auth-submit" style="width:100%">ورود</button>
    </form>`;

  const err = document.getElementById("auth-error");
  box.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.onclick = () => {
      mode = btn.dataset.mode;
      box.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("name-row").hidden = mode === "login";
      document.getElementById("auth-submit").textContent = mode === "login" ? "ورود" : "ثبت‌نام";
      err.hidden = true;
    };
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      if (mode === "login") {
        await loginUser(f.get("phone"), f.get("password"));
      } else {
        await registerUser({ name: f.get("name"), phone: f.get("phone"), password: f.get("password") });
      }
      location.href = next;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}

// ---------- داشبورد کاربر ----------

function orderCardHtml(o) {
  const items = o.items.map((i) => `<li>${escapeHtml(i.name)} × ${faNum(i.qty)}</li>`).join("");
  const upload =
    o.status === "awaiting_receipt" || (o.status === "receipt_submitted" && !o.receipt)
      ? `<form class="receipt-form" data-form="receipt" data-id="${escapeHtml(o.id)}">
           <label>آپلود فیش واریزی (حداکثر ${faNum(RECEIPT_MAX_MB)} مگابایت)</label>
           <input type="file" name="receipt" accept="image/*,application/pdf" required>
           <button class="btn btn-primary">ارسال رسید</button>
           <p class="error" hidden></p>
         </form>`
      : "";
  const note =
    o.status === "confirmed"
      ? `<p class="ok">پرداخت شما تأیید شده است. سپاس از خرید شما.</p>`
      : o.status === "rejected"
      ? `<p class="error-text">این سفارش رد شده است. برای پیگیری از چت پشتیبانی استفاده کنید.</p>`
      : o.receipt
      ? `<p class="hint">فیش شما دریافت شده و در انتظار بررسی است.</p>`
      : "";

  return `
    <div class="order-row">
      <div class="order-summary" data-act="toggle">
        <strong>${escapeHtml(o.id)}</strong>
        <span class="status s-${o.status}">${ORDER_STATUS[o.status]}</span>
        <span>${formatPrice(o.total)}</span>
      </div>
      <div class="order-body" hidden>
        <ul>${items}</ul>
        ${note}
        ${upload}
      </div>
    </div>`;
}

async function initDashboard() {
  const box = document.getElementById("dash-box");
  const user = currentUser();
  if (!user) {
    box.innerHTML = needLoginBox("برای مشاهده‌ی حساب کاربری ابتدا وارد شوید.", "dashboard.html");
    return;
  }

  let orders;
  let reviews;
  try {
    [orders, reviews] = await Promise.all([api("/orders"), api("/me/reviews")]);
  } catch (e) {
    box.innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`;
    return;
  }
  const waiting = orders.filter((o) => o.status === "awaiting_receipt").length;

  box.innerHTML = `
    <div class="dash-head">
      <h1>سلام ${escapeHtml(user.name)}</h1>
      <p>به حساب کاربری خود خوش آمدید.</p>
    </div>
    <div class="dash-stats">
      <div class="stat"><span>${faNum(orders.length)}</span>سفارش</div>
      <div class="stat"><span>${faNum(waiting)}</span>منتظر پرداخت</div>
      <div class="stat"><span>${faNum(reviews.length)}</span>نظر</div>
    </div>

    <section class="card">
      <h2>سفارش‌های من</h2>
      ${orders.length ? orders.map(orderCardHtml).join("") : `<p class="empty">هنوز سفارشی ثبت نکرده‌اید. <a href="products.html">مشاهده‌ی محصولات</a></p>`}
    </section>

    <section class="card">
      <h2>نظرات من</h2>
      ${
        reviews.length
          ? reviews
              .map(
                (r) => `
                <div class="review-row">
                  <span>${escapeHtml(productName(r.productId))}</span>
                  <span class="stars">${stars(r.rating)}</span>
                  <span class="status s-${r.status}">${REVIEW_STATUS[r.status]}</span>
                </div>`
              )
              .join("")
          : `<p class="empty">هنوز نظری ثبت نکرده‌اید.</p>`
      }
    </section>

    <section class="card">
      <h2>اطلاعات حساب</h2>
      <form id="profile-form" data-form="profile">
        <div class="form-row"><label>نام و نام خانوادگی</label><input name="name" value="${escapeHtml(user.name)}" required></div>
        <div class="form-row"><label>شماره موبایل</label><input dir="ltr" value="${escapeHtml(user.phone)}" disabled></div>
        <div class="form-row"><label>رمز فعلی (فقط برای تغییر رمز)</label><input type="password" name="oldPassword"></div>
        <div class="form-row"><label>رمز جدید (حداقل ۶ کاراکتر)</label><input type="password" name="newPassword"></div>
        <p class="error" hidden></p>
        <p class="ok" id="profile-ok" hidden>اطلاعات ذخیره شد.</p>
        <button class="btn btn-primary">ذخیره تغییرات</button>
      </form>
    </section>

    <section class="card">
      <h2>پشتیبانی</h2>
      <p>سؤالات خود را از طریق چت آنلاین (دکمه‌ی 💬 پایین صفحه) برای ما بفرستید.</p>
      <button class="btn" id="open-chat">باز کردن چت</button>
    </section>`;

  box.onclick = (e) => {
    const toggle = e.target.closest("[data-act='toggle']");
    if (toggle) {
      const body = toggle.nextElementSibling;
      body.hidden = !body.hidden;
    }
    if (e.target.id === "open-chat") document.getElementById("chat-fab").click();
  };

  box.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const errBox = form.querySelector(".error");
    try {
      if (form.dataset.form === "receipt") {
        const file = form.receipt.files[0];
        if (!file) throw new Error("فایل رسید را انتخاب کنید.");
        if (file.size > RECEIPT_MAX_MB * 1024 * 1024) throw new Error(`حجم فایل بیشتر از ${faNum(RECEIPT_MAX_MB)} مگابایت است.`);
        await uploadReceipt(form.dataset.id, file);
        return initDashboard();
      }
      if (form.dataset.form === "profile") {
        const f = new FormData(form);
        const updated = await api("/me", {
          method: "PATCH",
          body: {
            name: String(f.get("name") || ""),
            oldPassword: String(f.get("oldPassword") || ""),
            newPassword: String(f.get("newPassword") || "")
          }
        });
        Object.assign(user, updated);
        document.getElementById("profile-ok").hidden = false;
        if (errBox) errBox.hidden = true;
      }
    } catch (ex) {
      if (errBox) {
        errBox.textContent = ex.message;
        errBox.hidden = false;
      }
    }
  };
}

// ---------- تماس با ما ----------

function initContact() {
  const box = document.getElementById("contact-info");
  if (!box) return;
  const hours = (SHOP.hours || [])
    .map((h) => `<li><span>${escapeHtml(h.label)}:</span> ${escapeHtml(h.time)}</li>`)
    .join("");
  box.innerHTML = `
    <div class="contact-card"><h3>آدرس</h3><p>${escapeHtml(SHOP.address || "")}</p></div>
    <div class="contact-card"><h3>تلفن</h3><p><a href="tel:${escapeHtml(SHOP.phone || "")}" dir="ltr">${escapeHtml(SHOP.phone || "")}</a></p></div>
    <div class="contact-card"><h3>ساعت کاری</h3><ul class="hours">${hours}</ul></div>`;

  const photo = document.getElementById("shop-photo");
  const url = fileUrl(SHOP.photo);
  if (photo) {
    photo.innerHTML = url
      ? `<img src="${url}" alt="${escapeHtml(SHOP.name || "")}">`
      : `<span class="placeholder big">عکس مغازه</span>`;
  }
}

// ---------- چت آنلاین (فقط کاربر وارد شده) ----------

function drawChat(msgs) {
  const list = document.getElementById("chat-msgs");
  const user = currentUser();
  if (!list) return;
  list.innerHTML = msgs.length
    ? msgs.map((m) => `<div class="msg msg-${m.from}"><span>${escapeHtml(m.text)}</span></div>`).join("")
    : `<div class="msg msg-bot"><span>سلام ${escapeHtml(user ? user.name : "")}! 👋 سؤال خود را بپرسید تا کارشناسان ما پاسخ دهند.</span></div>`;
  list.scrollTop = list.scrollHeight;
}

async function renderChat() {
  const list = document.getElementById("chat-msgs");
  const form = document.getElementById("chat-form");
  if (!list) return;
  const user = currentUser();
  form.hidden = !user;

  if (!user) {
    list.innerHTML = `<div class="msg msg-bot"><span>برای گفتگو با پشتیبانی ابتدا <a href="auth.html">وارد حساب کاربری</a> شوید.</span></div>`;
    return;
  }
  try {
    drawChat(await api("/chat"));
  } catch (e) {
    list.innerHTML = `<div class="msg msg-bot"><span>${escapeHtml(e.message)}</span></div>`;
  }
}

function initChat() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <button class="chat-fab" id="chat-fab" aria-label="پشتیبانی آنلاین">💬</button>
    <div class="chat-panel" id="chat-panel" hidden>
      <div class="chat-head">
        <span>پشتیبانی آنلاین</span>
        <button id="chat-close" aria-label="بستن">×</button>
      </div>
      <div class="chat-msgs" id="chat-msgs"></div>
      <form class="chat-form" id="chat-form">
        <input id="chat-input" placeholder="پیام خود را بنویسید..." autocomplete="off">
        <button class="btn btn-primary" type="submit">ارسال</button>
      </form>
    </div>`;
  document.body.appendChild(wrap);

  const panel = document.getElementById("chat-panel");
  let timer = null;

  const setOpen = (open) => {
    panel.hidden = !open;
    clearInterval(timer);
    if (open) {
      renderChat();
      timer = setInterval(renderChat, 3000);
    }
  };

  document.getElementById("chat-fab").onclick = () => setOpen(panel.hidden);
  document.getElementById("chat-close").onclick = () => setOpen(false);

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text || !currentUser()) return;
    try {
      const msgs = await api("/chat", { method: "POST", body: { text } });
      input.value = "";
      drawChat(msgs);
    } catch (ex) {
      alert(ex.message);
    }
  });
}

// ---------- لودینگ انیمیشنی (یک بار در هر نشست) ----------

function showLoader() {
  if (sessionStorage.getItem("st-loaded")) return;
  sessionStorage.setItem("st-loaded", "1");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = document.createElement("div");
  el.className = "loader";
  el.innerHTML = `
    <div class="loader-logo">
      <span class="piece p1"></span>
      <span class="piece p2"></span>
      <span class="piece p3"></span>
      <span class="piece p4"></span>
    </div>
    <p class="loader-text">saeed tools</p>`;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 700);
  }, reduce ? 0 : 2600);
}

// ---------- راه‌اندازی ----------

document.addEventListener("DOMContentLoaded", async () => {
  await initDb();
  const page = document.body.dataset.page;

  renderHeader(page);
  renderFooter();
  updateCartBadge();
  initChat();
  showLoader();

  switch (page) {
    case "home": initHome(); break;
    case "products": initProducts(); break;
    case "product": initProduct(); break;
    case "cart": initCart(); break;
    case "checkout": initCheckout(); break;
    case "contact": initContact(); break;
    case "dashboard": initDashboard(); break;
    case "auth": initAuth(); break;
  }
});
