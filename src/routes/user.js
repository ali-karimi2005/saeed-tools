// مسیرهای کاربر وارد شده: حساب، سفارش و فیش، نظر، چت
const bcrypt = require("bcryptjs");
const express = require("express");
const db = require("../db");
const { requireRole } = require("../auth");
const { uploadReceipt, registerUpload, removeUpload } = require("../uploads");
const { HttpError, wrap, randomId, now, normalizePhone, isPhone, cleanText } = require("../utils");
const { userJson, orderJson, reviewJson, chatJson, paymentInfo } = require("../models");

const router = express.Router();
// فقط برای مسیرهای کاربر وارد شده (نه همه‌ی /api)
router.use(["/me", "/orders", "/chat", "/products"], requireRole("user"));

// کاربر فعلی از روی توکن
function currentUser(req) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth.sub);
  if (!user) throw new HttpError(401, "حساب کاربری پیدا نشد.");
  return user;
}

function ownOrder(req) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").get(req.params.id, req.auth.sub);
  if (!order) throw new HttpError(404, "سفارش پیدا نشد.");
  return order;
}

router.get("/me", (req, res) => res.json(userJson(currentUser(req))));

// ویرایش نام یا تغییر رمز (تغییر رمز نیاز به رمز فعلی دارد)
router.patch(
  "/me",
  wrap(async (req, res) => {
    const user = currentUser(req);
    const name = cleanText(req.body.name, 100) || user.name;
    let hash = user.password_hash;
    if (req.body.newPassword) {
      const newPass = String(req.body.newPassword);
      if (newPass.length < 6) throw new HttpError(400, "رمز جدید باید حداقل ۶ کاراکتر باشد.");
      const okOld = await bcrypt.compare(String(req.body.oldPassword || ""), user.password_hash);
      if (!okOld) throw new HttpError(400, "رمز فعلی اشتباه است.");
      hash = await bcrypt.hash(newPass, 10);
    }
    db.prepare("UPDATE users SET name = ?, password_hash = ? WHERE id = ?").run(name, hash, user.id);
    res.json(userJson(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)));
  })
);

// ثبت سفارش: قیمت‌ها از دیتابیس خوانده می‌شوند (هیچ‌وقت از فرانت قبول نمی‌شوند)
router.post("/orders", (req, res) => {
  const user = currentUser(req);
  const c = req.body.customer || {};
  const name = cleanText(c.name, 100);
  const phone = normalizePhone(c.phone);
  const address = cleanText(c.address, 500);
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  if (!name) throw new HttpError(400, "نام را وارد کنید.");
  if (!isPhone(phone)) throw new HttpError(400, "شماره موبایل معتبر نیست.");
  if (!items.length || items.length > 50) throw new HttpError(400, "سبد خرید خالی یا نامعتبر است.");

  const lines = items.map((i) => {
    const p = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(i.id));
    if (!p) throw new HttpError(400, "یکی از محصولات نامعتبر است.");
    if (!p.in_stock) throw new HttpError(400, `«${p.name}» ناموجود است.`);
    const qty = Math.floor(Number(i.qty));
    if (!(qty >= 1 && qty <= 20)) throw new HttpError(400, "تعداد هر محصول باید بین ۱ تا ۲۰ باشد.");
    return { p, qty };
  });
  const total = lines.reduce((sum, l) => sum + l.p.price * l.qty, 0);
  const id = "SO-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

  db.transaction(() => {
    db.prepare(
      "INSERT INTO orders (id, user_id, customer_name, customer_phone, customer_address, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_receipt', ?)"
    ).run(id, user.id, name, phone, address, total, now());
    const insert = db.prepare("INSERT INTO order_items (order_id, product_id, product_name, price, qty) VALUES (?, ?, ?, ?, ?)");
    lines.forEach((l) => insert.run(id, l.p.id, l.p.name, l.p.price, l.qty));
  })();

  res.status(201).json({
    order: orderJson(db.prepare("SELECT * FROM orders WHERE id = ?").get(id)),
    payment: paymentInfo()
  });
});

router.get("/orders", (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(req.auth.sub);
  res.json(rows.map(orderJson));
});

router.get("/orders/:id", (req, res) => {
  res.json(orderJson(ownOrder(req)));
});

// آپلود فیش واریزی (فقط برای سفارش‌های خود کاربر)
router.post("/orders/:id/receipt", uploadReceipt.single("receipt"), (req, res) => {
  const order = ownOrder(req);
  if (!req.file) throw new HttpError(400, "فایل رسید را انتخاب کنید.");
  if (order.status === "confirmed" || order.status === "rejected") {
    throw new HttpError(400, "این سفارش دیگر قابل تغییر نیست.");
  }
  const url = registerUpload(req.file, "receipt");
  removeUpload(order.receipt);
  db.prepare("UPDATE orders SET receipt = ?, receipt_mime = ?, receipt_at = ?, status = 'receipt_submitted' WHERE id = ?").run(
    url,
    req.file.mimetype,
    now(),
    order.id
  );
  res.json(orderJson(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)));
});

router.get("/me/reviews", (req, res) => {
  const rows = db.prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC").all(req.auth.sub);
  res.json(rows.map(reviewJson));
});

// ثبت نظر: امتیاز ۱ تا ۵، یک نظر برای هر کاربر در هر محصول، با وضعیت در انتظار تأیید
router.post("/products/:id/reviews", (req, res) => {
  const user = currentUser(req);
  const productId = Number(req.params.id);
  const rating = Math.floor(Number(req.body.rating));
  const comment = cleanText(req.body.comment, 1000);

  if (!db.prepare("SELECT 1 FROM products WHERE id = ?").get(productId)) throw new HttpError(404, "محصول پیدا نشد.");
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, "امتیاز باید بین ۱ تا ۵ باشد.");
  if (comment.length < 3) throw new HttpError(400, "متن نظر را کامل کنید.");
  if (db.prepare("SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?").get(productId, user.id)) {
    throw new HttpError(409, "شما قبلاً برای این محصول نظر ثبت کرده‌اید.");
  }

  const id = randomId("r");
  db.prepare(
    "INSERT INTO reviews (id, product_id, user_id, user_name, rating, comment, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)"
  ).run(id, productId, user.id, user.name, rating, comment, now());
  res.status(201).json(reviewJson(db.prepare("SELECT * FROM reviews WHERE id = ?").get(id)));
});

// پیام‌های چت کاربر
router.get("/chat", (req, res) => {
  const rows = db.prepare("SELECT * FROM chat_messages WHERE conv = ? ORDER BY id").all(req.auth.sub);
  res.json(rows.map(chatJson));
});

router.post("/chat", (req, res) => {
  const user = currentUser(req);
  const text = cleanText(req.body.text, 1000);
  if (!text) throw new HttpError(400, "متن پیام خالی است.");

  const isFirst = !db.prepare("SELECT 1 FROM chat_messages WHERE conv = ? LIMIT 1").get(user.id);
  const insert = db.prepare("INSERT INTO chat_messages (conv, sender, text, created_at) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    insert.run(user.id, "customer", text, now());
    if (isFirst) insert.run(user.id, "bot", "پیام شما ثبت شد. کارشناسان ما به زودی پاسخ می‌دهند.", now());
  })();

  const rows = db.prepare("SELECT * FROM chat_messages WHERE conv = ? ORDER BY id").all(user.id);
  res.status(201).json(rows.map(chatJson));
});

module.exports = router;
