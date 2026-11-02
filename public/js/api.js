/*
  ارتباط با بک‌اند: همه‌ی درخواست‌ها از این فایل رد می‌شوند.
  توکن کاربر در localStorage و توکن ادمین در sessionStorage نگه داشته می‌شود.
*/
const TOKEN_KEY = "st-user-token";
const ADMIN_TOKEN_KEY = "st-admin-token";

function getToken(admin = false) {
  return admin ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : localStorage.getItem(TOKEN_KEY);
}

function setToken(token, admin = false) {
  if (admin) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(admin = false) {
  if (admin) sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  else localStorage.removeItem(TOKEN_KEY);
}

// درخواست به API؛ در صورت خطا، Error با پیام فارسی سرور برمی‌گرداند
async function api(path, opts = {}) {
  const { method = "GET", body, form, admin = false, auth = true } = opts;
  const headers = {};
  const token = auth ? getToken(admin) : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form; // مرورگر خودش Content-Type مناسب را می‌گذارد
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: payload });
  } catch (e) {
    throw new Error("اتصال به سرور برقرار نشد. آیا بک‌اند روشن است؟");
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || "خطای ناشناخته از سرور");
    err.status = res.status;
    throw err;
  }
  return data;
}

// ساخت FormData از یک شیء؛ مقادیر خالی و فایل‌های خالی نادیده گرفته می‌شوند
function formOf(obj) {
  const fd = new FormData();
  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (value instanceof Blob) {
      if (value.size > 0) fd.append(key, value);
    } else {
      fd.append(key, String(value));
    }
  });
  return fd;
}
