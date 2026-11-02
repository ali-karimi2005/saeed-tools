// مسیرهای عمومی: بدون نیاز به ورود (فروشگاه، دسته‌ها، محصولات، اسلایدها، نظرات تأیید‌شده، ثبت‌نام و ورود)
const bcrypt = require("bcryptjs");
const express = require("express");
const db = require("../db");
const { signToken } = require("../auth");
const { HttpError, wrap, randomId, now, normalizePhone, isPhone, cleanText } = require("../utils");
const { publicShop, userJson, categoryJson, productJson, slideJson, reviewJson } = require("../models");

const router = express.Router();

router.get("/health", (req, res) => res.json({ ok: true }));

router.get("/shop", (req, res) => res.json(publicShop()));

router.get("/categories", (req, res) => {
  const rows = db.prepare("SELECT * FROM categories ORDER BY position, name").all();
  res.json(rows.map(categoryJson));
});

router.get("/products", (req, res) => {
  const cat = req.query.category;
  const rows = cat
    ? db.prepare("SELECT * FROM products WHERE category_id = ? ORDER BY id").all(cat)
    : db.prepare("SELECT * FROM products ORDER BY id").all();
  res.json(rows.map(productJson));
});

router.get("/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id));
  if (!p) throw new HttpError(404, "محصول پیدا نشد.");
  const stats = db
    .prepare("SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg FROM reviews WHERE product_id = ? AND status = 'approved'")
    .get(p.id);
  res.json({ ...productJson(p), rating: Number(stats.avg.toFixed(1)), reviewCount: stats.count });
});

// فقط نظرات تأیید‌شده
router.get("/products/:id/reviews", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY created_at DESC")
    .all(Number(req.params.id));
  res.json(rows.map(reviewJson));
});

router.get("/slides", (req, res) => {
  const rows = db.prepare("SELECT * FROM slides ORDER BY position, id").all();
  res.json(rows.map(slideJson));
});

// ثبت‌نام کاربر جدید
router.post(
  "/auth/register",
  wrap(async (req, res) => {
    const name = cleanText(req.body.name, 100);
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");
    if (!name) throw new HttpError(400, "نام و نام خانوادگی را وارد کنید.");
    if (!isPhone(phone)) throw new HttpError(400, "شماره موبایل معتبر نیست (مثلاً 09xxxxxxxxx).");
    if (password.length < 6) throw new HttpError(400, "رمز عبور باید حداقل ۶ کاراکتر باشد.");
    if (db.prepare("SELECT 1 FROM users WHERE phone = ?").get(phone)) {
      throw new HttpError(409, "با این شماره قبلاً ثبت‌نام شده‌اید.");
    }

    const id = randomId("u");
    const created = now();
    const hash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (id, name, phone, password_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      name,
      phone,
      hash,
      created,
      created
    );
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    res.status(201).json({ token: signToken({ sub: id }, "user"), user: userJson(user) });
  })
);

// ورود کاربر
router.post(
  "/auth/login",
  wrap(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const password = String(req.body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) throw new HttpError(401, "شماره موبایل یا رمز عبور اشتباه است.");

    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(now(), user.id);
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    res.json({ token: signToken({ sub: user.id }, "user"), user: userJson(fresh) });
  })
);

module.exports = router;
