// ابزارهای کمکی: خطای HTTP، شناسه‌ساز، اعتبارسنجی و امن‌سازی ورودی
const crypto = require("crypto");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// برای اجرای handlerهای async در Express 4
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const randomId = (prefix) => `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;

const now = () => new Date().toISOString();

// تبدیل اعداد فارسی به انگلیسی و حذف فاصله و خط تیره
function normalizePhone(value) {
  return String(value || "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[\s-]/g, "");
}

function isPhone(value) {
  return /^09\d{9}$/.test(value);
}

// متن تمیز با حداکثر طول
function cleanText(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function toBool(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true || value === 1) return true;
  return !["false", "0", "off", "no", ""].includes(String(value).toLowerCase());
}

module.exports = { HttpError, wrap, randomId, now, normalizePhone, isPhone, cleanText, toBool };
