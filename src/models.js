// تبدیل ردیف‌های دیتابیس به ساختاری که فرانت انتظار دارد + دسترسی به تنظیمات
const db = require("./db");

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : null;
}

function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

// اطلاعات عمومی فروشگاه (بدون شماره کارت و نکات پرداخت)
function publicShop() {
  const s = getSetting("shop") || {};
  return { name: s.name, subtitle: s.subtitle, address: s.address, phone: s.phone, hours: s.hours || [], photo: s.photo || null };
}

// اطلاعات پرداخت که فقط بعد از ثبت سفارش به مشتری نشان داده می‌شود
function paymentInfo() {
  const s = getSetting("shop") || {};
  return { bank: s.bank || {}, notes: s.paymentNotes || [] };
}

const userJson = (u) => ({ id: u.id, name: u.name, phone: u.phone, createdAt: u.created_at, lastLogin: u.last_login });

const categoryJson = (c) => ({ id: c.id, name: c.name });

const productJson = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category_id || "",
  price: p.price,
  inStock: !!p.in_stock,
  image: p.image || null,
  description: p.description || ""
});

const slideJson = (s) => ({
  id: s.id,
  title: s.title,
  subtitle: s.subtitle || "",
  image: s.image || null,
  link: s.link_type
    ? { type: s.link_type, value: s.link_type === "product" ? Number(s.link_value) : s.link_value }
    : null
});

const reviewJson = (r) => ({
  id: r.id,
  productId: r.product_id,
  userId: r.user_id,
  userName: r.user_name,
  rating: r.rating,
  comment: r.comment,
  status: r.status,
  date: r.created_at
});

function orderJson(o) {
  const items = db
    .prepare("SELECT product_id, product_name, price, qty FROM order_items WHERE order_id = ?")
    .all(o.id)
    .map((i) => ({ id: i.product_id, name: i.product_name, price: i.price, qty: i.qty }));
  return {
    id: o.id,
    userId: o.user_id,
    date: o.created_at,
    customer: { name: o.customer_name, phone: o.customer_phone, address: o.customer_address },
    items,
    total: o.total,
    status: o.status,
    receipt: o.receipt || null,
    receiptType: o.receipt_mime || null,
    receiptDate: o.receipt_at || null,
    confirmedAt: o.confirmed_at || null
  };
}

const chatJson = (m) => ({ conv: m.conv, from: m.sender, text: m.text, time: Date.parse(m.created_at) });

module.exports = {
  getSetting,
  setSetting,
  publicShop,
  paymentInfo,
  userJson,
  categoryJson,
  productJson,
  slideJson,
  reviewJson,
  orderJson,
  chatJson
};
