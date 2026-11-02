/*
  وضعیت سمت فرانت: داده‌های عمومی (از سرور خوانده می‌شوند) و کاربر وارد شده.
  همه‌ی تغییرات روی سرور ذخیره می‌شوند.
*/
let CURRENT_USER = null;

function replaceContents(list, items) {
  list.length = 0;
  list.push(...items);
}

// آدرس قابل نمایش برای عکس‌ها (آپلودهای سرور یا مسیر فایل‌های فرانت)
function fileUrl(value) {
  if (!value) return "";
  return value.startsWith("/uploads/") ? FILES_BASE + value : value;
}

async function loadPublicData() {
  const [shop, cats, prods, slides] = await Promise.all([
    api("/shop", { auth: false }),
    api("/categories", { auth: false }),
    api("/products", { auth: false }),
    api("/slides", { auth: false })
  ]);
  Object.assign(SHOP, shop);
  replaceContents(CATEGORIES, cats);
  replaceContents(PRODUCTS, prods);
  replaceContents(SLIDES, slides);
}

function showConnError() {
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:99999;background:#D93025;color:#fff;padding:.7rem;text-align:center;font-family:Tahoma,sans-serif";
  bar.textContent = "اتصال به سرور برقرار نیست. لطفاً مطمئن شوید بک‌اند روی localhost:3000 اجرا شده است.";
  document.body.appendChild(bar);
}

async function initDb() {
  try {
    await loadPublicData();
  } catch (e) {
    showConnError();
    return;
  }
  if (getToken()) {
    try {
      CURRENT_USER = await api("/me");
    } catch (e) {
      logoutUser();
    }
  }
}

function currentUser() {
  return CURRENT_USER;
}

async function registerUser({ name, phone, password }) {
  const r = await api("/auth/register", { method: "POST", body: { name, phone, password }, auth: false });
  setToken(r.token);
  CURRENT_USER = r.user;
  return r.user;
}

async function loginUser(phone, password) {
  const r = await api("/auth/login", { method: "POST", body: { phone, password }, auth: false });
  setToken(r.token);
  CURRENT_USER = r.user;
  return r.user;
}

function logoutUser() {
  clearToken();
  CURRENT_USER = null;
}
