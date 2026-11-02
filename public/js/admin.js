/*
  پنل مدیریت: همه‌ی اطلاعات از سرور خوانده و همه‌ی تغییرات به سرور فرستاده می‌شوند.
*/

const STATUS_LABEL = {
  awaiting_receipt: "منتظر ارسال رسید",
  receipt_submitted: "در انتظار تأیید",
  confirmed: "تأیید شده",
  rejected: "رد شده"
};
const REVIEW_LABEL = { pending: "در انتظار", approved: "تأیید شده", rejected: "رد شده" };

const TABS = [
  ["orders", "سفارش‌ها"],
  ["users", "کاربران"],
  ["products", "محصولات"],
  ["categories", "دسته‌بندی‌ها"],
  ["reviews", "نظرات"],
  ["slides", "اسلایدرها"],
  ["chat", "چت آنلاین"],
  ["storage", "فضای ذخیره‌سازی"],
  ["settings", "تنظیمات فروشگاه"]
];

let tab = "orders";
let openOrder = null;
let editProductId = null;
let editSlideId = null;
let openConv = null;
let reviewFilter = "pending";

const root = document.getElementById("admin-root");

// ---------- ابزارهای کمکی ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function money(v) {
  return Number(v).toLocaleString("fa-IR") + " تومان";
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleString("fa-IR") : "—";
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function confirmText(o) {
  return `سلام ${o.customer.name} عزیز، سفارش شما با کد ${o.id} به مبلغ ${money(o.total)} تأیید شد. از خرید شما از ${SHOP.name || "فروشگاه"} سپاسگزاریم.`;
}

// درخواست به API با توکن ادمین؛ اگر توکن منقضی شده باشد به صفحه‌ی ورود می‌رود
async function adminApi(path, opts = {}) {
  try {
    return await api("/admin" + path, { ...opts, admin: true });
  } catch (e) {
    if (e.status === 401) {
      clearToken(true);
      login();
    }
    throw e;
  }
}

// ---------- ورود و قاب اصلی ----------

function login() {
  root.innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" data-form="login">
        <h2>ورود به پنل مدیریت</h2>
        <div class="form-row">
          <label for="user">نام کاربری</label>
          <input id="user" name="user" required>
        </div>
        <div class="form-row">
          <label for="pass">رمز عبور</label>
          <input id="pass" name="pass" type="password" required>
        </div>
        <p class="error-text" id="login-error" hidden></p>
        <button class="btn btn-primary" style="width:100%">ورود</button>
      </form>
    </div>`;
}

function shell() {
  root.innerHTML = `
    <div class="admin-wrap">
      <aside class="admin-side">
        <div class="admin-brand">saeed tools</div>
        <nav class="admin-nav">${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join("")}</nav>
        <a href="index.html" class="tab">بازگشت به سایت</a>
        <button class="btn" data-action="logout">خروج</button>
      </aside>
      <main class="admin-main" id="admin-main"></main>
    </div>`;
  return render();
}

// داده‌های لازم برای تب فعلی را از سرور می‌خواند
async function loadTabData() {
  const d = {};
  switch (tab) {
    case "orders":
      d.orders = await adminApi("/orders");
      break;
    case "users":
      d.users = await adminApi("/users");
      break;
    case "products":
      d.products = await adminApi("/products");
      d.categories = await adminApi("/categories");
      break;
    case "categories":
      d.categories = await adminApi("/categories");
      break;
    case "reviews":
      d.reviews = await adminApi(`/reviews?status=${reviewFilter}`);
      d.products = await adminApi("/products");
      break;
    case "slides":
      d.slides = await adminApi("/slides");
      d.products = await adminApi("/products");
      d.categories = await adminApi("/categories");
      break;
    case "chat":
      d.convs = await adminApi("/chat");
      d.msgs = openConv ? await adminApi(`/chat/${encodeURIComponent(openConv)}`) : [];
      break;
    case "storage":
      d.storage = await adminApi("/storage");
      break;
    case "settings":
      d.settings = await adminApi("/settings");
      break;
  }
  return d;
}

async function render() {
  const main = document.getElementById("admin-main");
  if (!main) return;
  document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  let d;
  try {
    d = await loadTabData();
  } catch (e) {
    main.innerHTML = `<p class="error-text">${esc(e.message)}</p>`;
    return;
  }
  const views = {
    orders: viewOrders,
    users: viewUsers,
    products: viewProducts,
    categories: viewCategories,
    reviews: viewReviews,
    slides: viewSlides,
    chat: viewChat,
    storage: viewStorage,
    settings: viewSettings
  };
  main.innerHTML = views[tab](d);
}

// ---------- سفارش‌ها ----------

function receiptHtml(o) {
  if (!o.receipt) return `<p class="hint">رسیدی ارسال نشده است.</p>`;
  const url = fileUrl(o.receipt);
  const isImage = (o.receiptType || "").startsWith("image/");
  return `
    ${isImage ? `<img class="receipt" src="${url}" alt="رسید">` : ""}
    <p>
      <a href="${url}" target="_blank" rel="noopener">مشاهده‌ی کامل رسید</a>
      <button class="btn btn-sm btn-danger" data-action="receipt-delete" data-id="${esc(o.id)}">حذف رسید از حافظه</button>
    </p>`;
}

function orderDetail(o) {
  const items = o.items.map((i) => `<li>${esc(i.name)} × ${i.qty} — ${money(i.price * i.qty)}</li>`).join("");
  const actions =
    o.status === "confirmed" || o.status === "rejected"
      ? ""
      : `<div class="actions">
           <button class="btn btn-primary" data-action="order-confirm" data-id="${esc(o.id)}">تأیید سفارش</button>
           <button class="btn btn-danger" data-action="order-reject" data-id="${esc(o.id)}">رد سفارش</button>
         </div>`;
  const msg =
    o.status === "confirmed"
      ? `<div class="msg-box">
           <p>پیام آماده برای ارسال به مشتری:</p>
           <textarea readonly rows="3">${esc(confirmText(o))}</textarea>
           <div class="actions">
             <button class="btn" data-action="copy" data-text="${esc(confirmText(o))}">کپی پیام</button>
             <a class="btn" href="tel:${esc(o.customer.phone)}">تماس با مشتری</a>
           </div>
         </div>`
      : "";
  return `
    <div class="order-detail">
      <p><strong>آدرس:</strong> ${esc(o.customer.address) || "—"}</p>
      <ul>${items}</ul>
      <p><strong>جمع کل:</strong> ${money(o.total)}</p>
      ${receiptHtml(o)}
      ${actions}
      ${msg}
    </div>`;
}

function viewOrders(d) {
  if (!d.orders.length) return `<h2>سفارش‌ها</h2><p class="empty">هنوز سفارشی ثبت نشده است.</p>`;
  const list = d.orders
    .map(
      (o) => `
      <div class="card order-card">
        <div class="order-head" data-action="order-open" data-id="${esc(o.id)}">
          <div>
            <strong>${esc(o.id)}</strong> — ${esc(o.customer.name)} —
            <span dir="ltr">${esc(o.customer.phone)}</span>
          </div>
          <div>${money(o.total)} <span class="status s-${o.status}">${STATUS_LABEL[o.status]}</span></div>
        </div>
        ${openOrder === o.id ? orderDetail(o) : ""}
      </div>`
    )
    .join("");
  return `<h2>سفارش‌ها</h2>${list}`;
}

// ---------- کاربران ----------

function viewUsers(d) {
  if (!d.users.length) return `<h2>کاربران</h2><p class="empty">هنوز کاربری ثبت‌نام نکرده است.</p>`;
  const rows = d.users
    .map(
      (u) => `
      <tr>
        <td>${esc(u.name)}</td>
        <td dir="ltr">${esc(u.phone)}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>${fmtDate(u.lastLogin)}</td>
        <td>${u.orderCount}</td>
        <td>${u.reviewCount}</td>
        <td><button class="btn btn-sm btn-danger" data-action="user-delete" data-id="${esc(u.id)}">حذف</button></td>
      </tr>`
    )
    .join("");
  return `
    <h2>کاربران</h2>
    <p class="hint">تعداد کل: ${d.users.length}. رمز عبور کاربران به صورت رمزگذاری‌شده ذخیره می‌شود و قابل مشاهده نیست.</p>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>نام</th><th>موبایل</th><th>ثبت‌نام</th><th>آخرین ورود</th><th>سفارش</th><th>نظر</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ---------- محصولات ----------

function productForm(p, categories) {
  const catOptions = categories
    .map((c) => `<option value="${esc(c.id)}" ${p && p.category === c.id ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
  return `
    <div class="card">
      <h3>${p ? "ویرایش محصول" : "افزودن محصول جدید"}</h3>
      <form data-form="product" data-id="${p ? p.id : ""}">
        <div class="grid2">
          <div class="form-row"><label>نام محصول</label><input name="name" required value="${esc(p ? p.name : "")}"></div>
          <div class="form-row"><label>دسته‌بندی</label><select name="category">${catOptions}</select></div>
          <div class="form-row"><label>قیمت (تومان)</label><input type="number" name="price" min="0" required value="${p ? p.price : ""}"></div>
          <div class="form-row"><label>تصویر (حداکثر ۴ مگابایت)</label><input type="file" name="image" accept="image/*"></div>
        </div>
        <div class="form-row"><label>توضیحات</label><textarea name="description" rows="3">${esc(p ? p.description : "")}</textarea></div>
        <label class="check"><input type="checkbox" name="inStock" ${!p || p.inStock ? "checked" : ""}> موجود در انبار</label>
        <div class="actions">
          <button class="btn btn-primary">${p ? "ذخیره تغییرات" : "افزودن محصول"}</button>
          ${p ? `<button type="button" class="btn" data-action="product-cancel">انصراف</button>` : ""}
        </div>
      </form>
    </div>`;
}

function viewProducts(d) {
  const editing = editProductId ? d.products.find((p) => p.id === editProductId) : null;
  const rows = d.products
    .map((x) => {
      const cat = d.categories.find((c) => c.id === x.category);
      const img = fileUrl(x.image);
      return `
        <tr>
          <td>${img ? `<img class="thumb" src="${img}" alt="">` : "—"}</td>
          <td>${esc(x.name)}</td>
          <td>${esc(cat ? cat.name : "—")}</td>
          <td>${money(x.price)}</td>
          <td>${x.inStock ? "✅" : "❌"}</td>
          <td class="row-actions">
            <button class="btn btn-sm" data-action="product-edit" data-id="${x.id}">ویرایش</button>
            <button class="btn btn-sm btn-danger" data-action="product-delete" data-id="${x.id}">حذف</button>
          </td>
        </tr>`;
    })
    .join("");
  return `
    <h2>محصولات</h2>
    ${productForm(editing, d.categories)}
    <div class="card table-wrap">
      <table>
        <thead><tr><th>عکس</th><th>نام</th><th>دسته</th><th>قیمت</th><th>موجود</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">محصولی ثبت نشده است.</td></tr>`}</tbody>
      </table>
    </div>`;
}

// ---------- دسته‌بندی‌ها ----------

function viewCategories(d) {
  const rows = d.categories
    .map(
      (c) => `
      <div class="cat-row">
        <form data-form="cat-rename" data-id="${esc(c.id)}">
          <input name="name" value="${esc(c.name)}" required>
          <button class="btn btn-sm">ذخیره نام</button>
        </form>
        <button class="btn btn-sm btn-danger" data-action="cat-delete" data-id="${esc(c.id)}">حذف</button>
      </div>`
    )
    .join("");
  return `
    <h2>دسته‌بندی‌ها</h2>
    <div class="card">${rows || `<p class="empty">دسته‌بندی‌ای وجود ندارد.</p>`}</div>
    <div class="card">
      <h3>افزودن دسته‌بندی</h3>
      <form data-form="cat-add" class="inline-form">
        <input name="name" placeholder="نام دسته‌بندی" required>
        <button class="btn btn-primary">افزودن</button>
      </form>
    </div>`;
}

// ---------- نظرات ----------

function viewReviews(d) {
  const filters = [["pending", "در انتظار"], ["approved", "تأیید شده"], ["rejected", "رد شده"], ["all", "همه"]];
  const chips = filters
    .map(([k, l]) => `<button class="filter-chip ${reviewFilter === k ? "active" : ""}" data-action="rev-filter" data-id="${k}">${l}</button>`)
    .join("");

  const cards = d.reviews.length
    ? d.reviews
        .map((r) => {
          const p = d.products.find((x) => x.id === r.productId);
          return `
            <div class="card review-admin">
              <div class="review-top">
                <strong>${esc(p ? p.name : "محصول حذف‌شده")}</strong>
                <span class="status s-${r.status}">${REVIEW_LABEL[r.status]}</span>
              </div>
              <p>${esc(r.userName)} — <span class="stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span> — ${fmtDate(r.date)}</p>
              <p class="review-text">${esc(r.comment)}</p>
              <div class="actions">
                ${r.status !== "approved" ? `<button class="btn btn-sm btn-primary" data-action="rev-set" data-id="${r.id}" data-status="approved">تأیید</button>` : ""}
                ${r.status !== "rejected" ? `<button class="btn btn-sm" data-action="rev-set" data-id="${r.id}" data-status="rejected">رد</button>` : ""}
                <button class="btn btn-sm btn-danger" data-action="rev-delete" data-id="${r.id}">حذف</button>
              </div>
            </div>`;
        })
        .join("")
    : `<p class="empty">موردی در این بخش نیست.</p>`;

  return `<h2>نظرات محصولات</h2><div class="filters">${chips}</div>${cards}`;
}

// ---------- اسلایدرها ----------

function slideTargetValue(s) {
  if (!s.link) return "none";
  return s.link.type === "product" ? `p:${s.link.value}` : `c:${s.link.value}`;
}

function slideForm(s, d) {
  const current = s ? slideTargetValue(s) : "none";
  const productOpts = d.products
    .map((p) => `<option value="p:${p.id}" ${current === `p:${p.id}` ? "selected" : ""}>${esc(p.name)}</option>`)
    .join("");
  const catOpts = d.categories
    .map((c) => `<option value="c:${esc(c.id)}" ${current === `c:${c.id}` ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
  return `
    <div class="card">
      <h3>${s ? "ویرایش اسلاید" : "افزودن اسلاید جدید"}</h3>
      <form data-form="slide" data-id="${s ? s.id : ""}">
        <div class="grid2">
          <div class="form-row"><label>عنوان</label><input name="title" required value="${esc(s ? s.title : "")}"></div>
          <div class="form-row"><label>زیرعنوان</label><input name="subtitle" value="${esc(s ? s.subtitle || "" : "")}"></div>
          <div class="form-row"><label>تصویر پس‌زمینه (حداکثر ۴ مگابایت)</label><input type="file" name="image" accept="image/*"></div>
          <div class="form-row">
            <label>وقتی کاربر روی اسلاید می‌زند به کجا برود؟</label>
            <select name="target">
              <option value="none" ${current === "none" ? "selected" : ""}>هیچ‌جا (بدون دکمه)</option>
              <optgroup label="صفحه‌ی محصول">${productOpts}</optgroup>
              <optgroup label="صفحه‌ی دسته‌بندی">${catOpts}</optgroup>
            </select>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary">${s ? "ذخیره" : "افزودن اسلاید"}</button>
          ${s ? `<button type="button" class="btn" data-action="slide-cancel">انصراف</button>` : ""}
        </div>
      </form>
    </div>`;
}

function viewSlides(d) {
  const editing = editSlideId ? d.slides.find((s) => s.id === editSlideId) : null;
  const rows = d.slides
    .map((s, i) => {
      const url = fileUrl(s.image) || "images/tools-bg.jpg";
      let target = "بدون لینک";
      if (s.link && s.link.type === "product") {
        const p = d.products.find((x) => x.id === s.link.value);
        target = `محصول: ${esc(p ? p.name : "—")}`;
      } else if (s.link) {
        const c = d.categories.find((x) => x.id === s.link.value);
        target = `دسته: ${esc(c ? c.name : "—")}`;
      }
      return `
        <div class="card slide-admin">
          <img class="slide-thumb" src="${url}" alt="">
          <div class="slide-info">
            <strong>${esc(s.title)}</strong>
            <p class="hint">${esc(s.subtitle || "")}</p>
            <p class="hint">مقصد: ${target}</p>
          </div>
          <div class="row-actions">
            <button class="btn btn-sm" data-action="slide-move" data-id="${s.id}" data-dir="-1" ${i === 0 ? "disabled" : ""}>بالا</button>
            <button class="btn btn-sm" data-action="slide-move" data-id="${s.id}" data-dir="1" ${i === d.slides.length - 1 ? "disabled" : ""}>پایین</button>
            <button class="btn btn-sm" data-action="slide-edit" data-id="${s.id}">ویرایش</button>
            <button class="btn btn-sm btn-danger" data-action="slide-delete" data-id="${s.id}">حذف</button>
          </div>
        </div>`;
    })
    .join("");
  return `
    <h2>اسلایدرهای صفحه‌ی اصلی</h2>
    <p class="hint">ترتیب نمایش همین‌جاست. برای تغییر ترتیب از دکمه‌های بالا و پایین استفاده کنید.</p>
    ${rows || `<p class="empty">اسلایدی وجود ندارد.</p>`}
    ${slideForm(editing, d)}`;
}

// ---------- چت ----------

function viewChat(d) {
  if (!d.convs.length) return `<h2>چت آنلاین</h2><p class="empty">هنوز پیامی دریافت نشده است.</p>`;

  const list = d.convs
    .map(
      (c) => `
        <button class="conv ${openConv === c.conv ? "active" : ""}" data-action="chat-open" data-id="${esc(c.conv)}">
          <strong>${esc(c.userName)}</strong>
          <span dir="ltr" class="hint">${esc(c.userPhone)}</span>
          <small>${esc(c.lastText).slice(0, 45)}</small>
        </button>`
    )
    .join("");

  let detail = `<p class="hint">یک گفتگو را از سمت راست انتخاب کنید.</p>`;
  if (openConv) {
    const msgs = d.msgs
      .map((m) => `<div class="msg msg-${m.from === "customer" ? "customer" : m.from === "admin" ? "admin" : "bot"}"><span>${esc(m.text)}</span></div>`)
      .join("");
    detail = `
      <div class="chat-thread">${msgs}</div>
      <form data-form="chat-reply" class="inline-form">
        <input name="text" placeholder="پاسخ به مشتری..." required>
        <button class="btn btn-primary">ارسال پاسخ</button>
      </form>`;
  }

  return `
    <h2>چت آنلاین</h2>
    <div class="chat-layout">
      <div class="conv-list">${list}</div>
      <div class="card">${detail}</div>
    </div>`;
}

// ---------- فضای ذخیره‌سازی ----------

function viewStorage(d) {
  const s = d.storage;
  const rows = s.files
    .map((f) => {
      return `
        <tr>
          <td dir="ltr">${esc(f.path)}</td>
          <td>${esc(f.kind)}</td>
          <td>${fmtSize(f.size)}</td>
          <td>${f.inUse ? "در استفاده" : "بلااستفاده"}</td>
        </tr>`;
    })
    .join("");

  return `
    <h2>فضای ذخیره‌سازی فایل‌ها</h2>
    <div class="card">
      <p>تعداد فایل‌ها: <strong>${s.files.length}</strong> — حجم کل: <strong>${fmtSize(s.totalSize)}</strong></p>
      <p>فایل‌های بلااستفاده: <strong>${s.unusedCount}</strong></p>
      <div class="actions">
        <button class="btn btn-danger" data-action="storage-clean" ${s.unusedCount ? "" : "disabled"}>حذف فایل‌های بلااستفاده</button>
      </div>
      <p class="hint">رسیدهای سفارش را می‌توانید از بخش «سفارش‌ها» تک‌تک حذف کنید.</p>
    </div>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>مسیر فایل</th><th>نوع</th><th>حجم</th><th>وضعیت</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="empty">فایلی ذخیره نشده است.</td></tr>`}</tbody>
      </table>
    </div>`;
}

// ---------- تنظیمات ----------

function viewSettings(d) {
  const st = d.settings;
  const hours = (st.hours || []).map((h) => `${h.label} | ${h.time}`).join("\n");
  const bank = st.bank || {};
  const notes = (st.paymentNotes || []).join("\n");
  return `
    <h2>تنظیمات فروشگاه</h2>
    <div class="card">
      <form data-form="settings">
        <div class="grid2">
          <div class="form-row"><label>نام فروشگاه</label><input name="name" value="${esc(st.name)}"></div>
          <div class="form-row"><label>زیرعنوان</label><input name="subtitle" value="${esc(st.subtitle)}"></div>
          <div class="form-row"><label>شماره تلفن</label><input name="phone" dir="ltr" value="${esc(st.phone)}"></div>
          <div class="form-row"><label>عکس مغازه (حداکثر ۴ مگابایت، جداگانه ذخیره می‌شود)</label><input type="file" name="photo" accept="image/*"></div>
        </div>
        <div class="form-row"><label>آدرس</label><input name="address" value="${esc(st.address)}"></div>
        <div class="form-row">
          <label>ساعت کاری (هر خط به شکل «عنوان | ساعت»)</label>
          <textarea name="hours" rows="3">${esc(hours)}</textarea>
        </div>

        <h3>اطلاعات کارت به کارت</h3>
        <div class="grid2">
          <div class="form-row"><label>نام بانک</label><input name="bankName" value="${esc(bank.bankName)}"></div>
          <div class="form-row"><label>شماره کارت</label><input name="cardNumber" dir="ltr" value="${esc(bank.cardNumber)}"></div>
          <div class="form-row"><label>نام صاحب کارت</label><input name="holder" value="${esc(bank.holder)}"></div>
        </div>
        <div class="form-row">
          <label>نکات پرداخت برای مشتری (هر خط یک نکته)</label>
          <textarea name="paymentNotes" rows="7">${esc(notes)}</textarea>
        </div>
        <div class="actions"><button class="btn btn-primary">ذخیره تنظیمات</button></div>
      </form>
    </div>`;
}

// ---------- رویدادهای کلیک ----------

root.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action],[data-tab]");
  if (!t) return;

  try {
    if (t.dataset.tab) {
      tab = t.dataset.tab;
      openOrder = null;
      editProductId = null;
      editSlideId = null;
      openConv = null;
      return render();
    }

    const id = t.dataset.id;
    switch (t.dataset.action) {
      case "logout":
        clearToken(true);
        return login();

      case "order-open":
        openOrder = openOrder === id ? null : id;
        return render();

      case "order-confirm":
        await adminApi(`/orders/${encodeURIComponent(id)}/confirm`, { method: "POST" });
        openOrder = id;
        return render();

      case "order-reject":
        if (!confirm("این سفارش رد شود؟")) return;
        await adminApi(`/orders/${encodeURIComponent(id)}/reject`, { method: "POST" });
        return render();

      case "receipt-delete":
        if (!confirm("فیش این سفارش از حافظه حذف شود؟")) return;
        await adminApi(`/orders/${encodeURIComponent(id)}/receipt`, { method: "DELETE" });
        return render();

      case "copy":
        return navigator.clipboard.writeText(t.dataset.text).then(
          () => alert("پیام کپی شد."),
          () => alert("کپی انجام نشد.")
        );

      case "user-delete":
        if (!confirm("این کاربر حذف شود؟ (سفارش‌ها و نظرات او باقی می‌مانند)")) return;
        await adminApi(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
        return render();

      case "product-edit":
        editProductId = Number(id);
        tab = "products";
        return render();

      case "product-cancel":
        editProductId = null;
        return render();

      case "product-delete":
        if (!confirm("این محصول حذف شود؟")) return;
        await adminApi(`/products/${id}`, { method: "DELETE" });
        editProductId = null;
        return render();

      case "cat-delete":
        if (!confirm("این دسته‌بندی حذف شود؟")) return;
        await adminApi(`/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
        return render();

      case "rev-filter":
        reviewFilter = id;
        return render();

      case "rev-set":
        await adminApi(`/reviews/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: t.dataset.status } });
        return render();

      case "rev-delete":
        if (!confirm("این نظر حذف شود؟")) return;
        await adminApi(`/reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
        return render();

      case "slide-edit":
        editSlideId = id;
        return render();

      case "slide-cancel":
        editSlideId = null;
        return render();

      case "slide-move": {
        const slides = (await adminApi("/slides")).map((s) => s.id);
        const i = slides.indexOf(id);
        const j = i + Number(t.dataset.dir);
        if (i > -1 && j >= 0 && j < slides.length) {
          [slides[i], slides[j]] = [slides[j], slides[i]];
          await adminApi("/slides-order", { method: "PUT", body: { ids: slides } });
        }
        return render();
      }

      case "slide-delete":
        if (!confirm("این اسلاید حذف شود؟")) return;
        await adminApi(`/slides/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (editSlideId === id) editSlideId = null;
        return render();

      case "chat-open":
        openConv = id;
        return render();

      case "storage-clean":
        if (!confirm("همه‌ی فایل‌های بلااستفاده حذف شوند؟")) return;
        await adminApi("/storage/cleanup", { method: "POST" });
        alert("فایل‌های بلااستفاده حذف شدند.");
        return render();
    }
  } catch (err) {
    alert(err.message);
  }
});

// ---------- ارسال فرم‌ها ----------

root.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const fd = new FormData(f);

  try {
    switch (f.dataset.form) {
      case "login": {
        const err = document.getElementById("login-error");
        try {
          const r = await api("/admin/login", {
            method: "POST",
            body: { username: fd.get("user"), password: fd.get("pass") },
            auth: false
          });
          setToken(r.token, true);
          return shell();
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          return;
        }
      }

      case "product": {
        const form = new FormData();
        form.append("name", String(fd.get("name") || "").trim());
        form.append("category", String(fd.get("category") || ""));
        form.append("price", String(fd.get("price") || ""));
        form.append("description", String(fd.get("description") || ""));
        form.append("inStock", f.elements.inStock.checked ? "true" : "false");
        const image = fd.get("image");
        if (image && image.size > 0) form.append("image", image);

        const id = f.dataset.id;
        if (id) await adminApi(`/products/${id}`, { method: "PATCH", form });
        else await adminApi("/products", { method: "POST", form });
        editProductId = null;
        return render();
      }

      case "cat-add": {
        const name = String(fd.get("name") || "").trim();
        if (!name) return;
        await adminApi("/categories", { method: "POST", body: { name } });
        return render();
      }

      case "cat-rename": {
        const name = String(fd.get("name") || "").trim();
        if (!name) return;
        await adminApi(`/categories/${encodeURIComponent(f.dataset.id)}`, { method: "PATCH", body: { name } });
        return render();
      }

      case "slide": {
        const form = new FormData();
        form.append("title", String(fd.get("title") || "").trim());
        form.append("subtitle", String(fd.get("subtitle") || ""));
        form.append("target", String(fd.get("target") || "none"));
        const image = fd.get("image");
        if (image && image.size > 0) form.append("image", image);

        const id = f.dataset.id;
        if (id) await adminApi(`/slides/${encodeURIComponent(id)}`, { method: "PATCH", form });
        else await adminApi("/slides", { method: "POST", form });
        editSlideId = null;
        return render();
      }

      case "settings": {
        const photo = fd.get("photo");
        if (photo && photo.size > 0) {
          const up = new FormData();
          up.append("photo", photo);
          await adminApi("/settings/photo", { method: "POST", form: up });
        }
        const hours = String(fd.get("hours") || "")
          .split("\n")
          .map((line) => {
            const [label, time] = line.split("|");
            return { label: (label || "").trim(), time: (time || "").trim() };
          })
          .filter((h) => h.label && h.time);
        const paymentNotes = String(fd.get("paymentNotes") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        await adminApi("/settings", {
          method: "PATCH",
          body: {
            name: fd.get("name"),
            subtitle: fd.get("subtitle"),
            phone: fd.get("phone"),
            address: fd.get("address"),
            hours,
            bank: {
              bankName: fd.get("bankName"),
              cardNumber: fd.get("cardNumber"),
              holder: fd.get("holder")
            },
            paymentNotes
          }
        });
        alert("تنظیمات ذخیره شد.");
        return render();
      }

      case "chat-reply": {
        const text = String(fd.get("text") || "").trim();
        if (!text || !openConv) return;
        await adminApi(`/chat/${encodeURIComponent(openConv)}`, { method: "POST", body: { text } });
        return render();
      }
    }
  } catch (err) {
    alert(err.message);
  }
});

// ---------- شروع ----------

document.addEventListener("DOMContentLoaded", async () => {
  await initDb();
  if (getToken(true)) shell();
  else login();
});
