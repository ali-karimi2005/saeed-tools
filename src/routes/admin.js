// مسیرهای پنل ادمین (زیر /api/admin). به جز ورود، همه‌ی مسیرها نیاز به توکن ادمین دارند.
const bcrypt = require("bcryptjs");
const express = require("express");
const db = require("../db");
const { signToken, requireRole } = require("../auth");
const { uploadImage, registerUpload, removeUpload } = require("../uploads");
const { HttpError, wrap, randomId, now, toBool, cleanText } = require("../utils");
const {
  getSetting,
  setSetting,
  userJson,
  categoryJson,
  productJson,
  slideJson,
  reviewJson,
  orderJson,
  chatJson
} = require("../models");

const router = express.Router();

// ---------- ورود ادمین ----------
router.post(
  "/login",
  wrap(async (req, res) => {
    const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(String(req.body.username || ""));
    const ok = admin && (await bcrypt.compare(String(req.body.password || ""), admin.password_hash));
    if (!ok) throw new HttpError(401, "نام کاربری یا رمز عبور اشتباه است.");
    res.json({ token: signToken({ sub: admin.id }, "admin") });
  })
);

// از این به بعد همه‌ی مسیرهای /api/admin نیاز به توکن ادمین دارند
router.use(requireRole("admin"));

// ---------- سفارش‌ها ----------
router.get("/orders", (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  res.json(rows.map(orderJson));
});

router.post("/orders/:id/confirm", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) throw new HttpError(404, "سفارش پیدا نشد.");
  db.prepare("UPDATE orders SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(now(), order.id);
  res.json(orderJson(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)));
});

router.post("/orders/:id/reject", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) throw new HttpError(404, "سفارش پیدا نشد.");
  db.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?").run(order.id);
  res.json(orderJson(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)));
});

// حذف فیش از حافظه؛ سفارش باقی می‌ماند
router.delete("/orders/:id/receipt", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) throw new HttpError(404, "سفارش پیدا نشد.");
  removeUpload(order.receipt);
  const status = order.status === "receipt_submitted" ? "awaiting_receipt" : order.status;
  db.prepare("UPDATE orders SET receipt = NULL, receipt_mime = NULL, receipt_at = NULL, status = ? WHERE id = ?").run(
    status,
    order.id
  );
  res.json(orderJson(db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)));
});

// ---------- کاربران ----------
router.get("/users", (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
  res.json(
    rows.map((u) => ({
      ...userJson(u),
      orderCount: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id = ?").get(u.id).c,
      reviewCount: db.prepare("SELECT COUNT(*) AS c FROM reviews WHERE user_id = ?").get(u.id).c
    }))
  );
});

// حذف کاربر؛ سفارش‌ها و نظرات او باقی می‌مانند (شناسه‌ی کاربر خالی می‌شود)
router.delete("/users/:id", (req, res) => {
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  if (!info.changes) throw new HttpError(404, "کاربر پیدا نشد.");
  res.json({ ok: true });
});

// ---------- محصولات ----------
function productFields(body, existing) {
  const name = cleanText(body.name, 200) || (existing && existing.name);
  const price = body.price !== undefined ? Math.floor(Number(body.price)) : existing && existing.price;
  const category = body.category !== undefined ? String(body.category) : existing && existing.category_id;
  if (!name) throw new HttpError(400, "نام محصول را وارد کنید.");
  if (!(price >= 0)) throw new HttpError(400, "قیمت معتبر وارد کنید.");
  if (category && !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(category)) {
    throw new HttpError(400, "دسته‌بندی نامعتبر است.");
  }
  return {
    name,
    price,
    category_id: category || null,
    in_stock: toBool(body.inStock, existing ? !!existing.in_stock : true) ? 1 : 0,
    description: body.description !== undefined ? cleanText(body.description, 2000) : existing ? existing.description : ""
  };
}

router.get("/products", (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id").all().map(productJson));
});

router.post("/products", uploadImage.single("image"), (req, res) => {
  const f = productFields(req.body, null);
  const image = req.file ? registerUpload(req.file, "product") : null;
  const info = db
    .prepare("INSERT INTO products (name, category_id, price, in_stock, description, image) VALUES (?, ?, ?, ?, ?, ?)")
    .run(f.name, f.category_id, f.price, f.in_stock, f.description, image);
  res.status(201).json(productJson(db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid)));
});

router.patch("/products/:id", uploadImage.single("image"), (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id));
  if (!existing) throw new HttpError(404, "محصول پیدا نشد.");
  const f = productFields(req.body, existing);
  let image = existing.image;
  if (req.file) {
    image = registerUpload(req.file, "product");
    removeUpload(existing.image);
  }
  db.prepare("UPDATE products SET name = ?, category_id = ?, price = ?, in_stock = ?, description = ?, image = ? WHERE id = ?").run(
    f.name,
    f.category_id,
    f.price,
    f.in_stock,
    f.description,
    image,
    existing.id
  );
  res.json(productJson(db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id)));
});

router.delete("/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id));
  if (!p) throw new HttpError(404, "محصول پیدا نشد.");
  removeUpload(p.image);
  db.prepare("DELETE FROM products WHERE id = ?").run(p.id);
  res.json({ ok: true });
});

// ---------- دسته‌بندی‌ها ----------
router.get("/categories", (req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY position, name").all().map(categoryJson));
});

router.post("/categories", (req, res) => {
  const name = cleanText(req.body.name, 100);
  if (!name) throw new HttpError(400, "نام دسته‌بندی را وارد کنید.");
  const id = "cat-" + Date.now().toString(36);
  const pos = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories").get().p;
  db.prepare("INSERT INTO categories (id, name, position) VALUES (?, ?, ?)").run(id, name, pos);
  res.status(201).json({ id, name });
});

router.patch("/categories/:id", (req, res) => {
  const name = cleanText(req.body.name, 100);
  if (!name) throw new HttpError(400, "نام دسته‌بندی را وارد کنید.");
  const info = db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, req.params.id);
  if (!info.changes) throw new HttpError(404, "دسته‌بندی پیدا نشد.");
  res.json({ id: req.params.id, name });
});

router.delete("/categories/:id", (req, res) => {
  if (db.prepare("SELECT 1 FROM products WHERE category_id = ? LIMIT 1").get(req.params.id)) {
    throw new HttpError(409, "ابتدا محصولات این دسته‌بندی را جابه‌جا یا حذف کنید.");
  }
  const info = db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
  if (!info.changes) throw new HttpError(404, "دسته‌بندی پیدا نشد.");
  res.json({ ok: true });
});

// ---------- اسلایدرها ----------
// مقصد اسلاید: {type:"product", value:id} یا {type:"category", value:catId} یا null
function slideFields(body, existing) {
  const title = cleanText(body.title, 200) || (existing && existing.title);
  if (!title) throw new HttpError(400, "عنوان اسلاید را وارد کنید.");
  let linkType = null;
  let linkValue = null;
  let target = "none";
  if (body.target !== undefined) target = String(body.target);
  else if (existing && existing.link_type) target = (existing.link_type === "product" ? "p:" : "c:") + existing.link_value;
  if (target.startsWith("p:")) {
    linkType = "product";
    linkValue = String(Number(target.slice(2)));
    if (!db.prepare("SELECT 1 FROM products WHERE id = ?").get(Number(linkValue))) throw new HttpError(400, "محصول مقصد نامعتبر است.");
  } else if (target.startsWith("c:")) {
    linkType = "category";
    linkValue = target.slice(2);
    if (!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(linkValue)) throw new HttpError(400, "دسته‌بندی مقصد نامعتبر است.");
  }
  return {
    title,
    subtitle: body.subtitle !== undefined ? cleanText(body.subtitle, 300) : existing ? existing.subtitle : "",
    link_type: linkType,
    link_value: linkValue
  };
}

router.get("/slides", (req, res) => {
  res.json(db.prepare("SELECT * FROM slides ORDER BY position, id").all().map(slideJson));
});

router.post("/slides", uploadImage.single("image"), (req, res) => {
  const f = slideFields(req.body, null);
  const pos = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM slides").get().p;
  const id = randomId("s");
  const image = req.file ? registerUpload(req.file, "slide") : null;
  db.prepare(
    "INSERT INTO slides (id, title, subtitle, image, link_type, link_value, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, f.title, f.subtitle, image, f.link_type, f.link_value, pos);
  res.status(201).json(slideJson(db.prepare("SELECT * FROM slides WHERE id = ?").get(id)));
});

router.patch("/slides/:id", uploadImage.single("image"), (req, res) => {
  const existing = db.prepare("SELECT * FROM slides WHERE id = ?").get(req.params.id);
  if (!existing) throw new HttpError(404, "اسلاید پیدا نشد.");
  const f = slideFields(req.body, existing);
  let image = existing.image;
  if (req.file) {
    image = registerUpload(req.file, "slide");
    removeUpload(existing.image);
  }
  db.prepare("UPDATE slides SET title = ?, subtitle = ?, image = ?, link_type = ?, link_value = ? WHERE id = ?").run(
    f.title,
    f.subtitle,
    image,
    f.link_type,
    f.link_value,
    existing.id
  );
  res.json(slideJson(db.prepare("SELECT * FROM slides WHERE id = ?").get(existing.id)));
});

router.delete("/slides/:id", (req, res) => {
  const s = db.prepare("SELECT * FROM slides WHERE id = ?").get(req.params.id);
  if (!s) throw new HttpError(404, "اسلاید پیدا نشد.");
  removeUpload(s.image);
  db.prepare("DELETE FROM slides WHERE id = ?").run(s.id);
  res.json({ ok: true });
});

// ترتیب جدید اسلایدها: { ids: [...] }
router.put("/slides-order", (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const update = db.prepare("UPDATE slides SET position = ? WHERE id = ?");
  db.transaction(() => ids.forEach((id, i) => update.run(i, String(id))))();
  res.json({ ok: true });
});

// ---------- نظرات ----------
router.get("/reviews", (req, res) => {
  const status = req.query.status;
  const rows = status && status !== "all"
    ? db.prepare("SELECT * FROM reviews WHERE status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM reviews ORDER BY created_at DESC").all();
  res.json(rows.map(reviewJson));
});

router.patch("/reviews/:id", (req, res) => {
  const status = String(req.body.status || "");
  if (!["pending", "approved", "rejected"].includes(status)) throw new HttpError(400, "وضعیت نامعتبر است.");
  const info = db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(status, req.params.id);
  if (!info.changes) throw new HttpError(404, "نظر پیدا نشد.");
  res.json(reviewJson(db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id)));
});

router.delete("/reviews/:id", (req, res) => {
  const info = db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);
  if (!info.changes) throw new HttpError(404, "نظر پیدا نشد.");
  res.json({ ok: true });
});

// ---------- چت ----------
router.get("/chat", (req, res) => {
  const convs = db
    .prepare(
      `SELECT c.conv, MAX(c.id) AS last_id FROM chat_messages c GROUP BY c.conv ORDER BY last_id DESC`
    )
    .all()
    .map((row) => {
      const last = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(row.last_id);
      const user = db.prepare("SELECT name, phone FROM users WHERE id = ?").get(row.conv);
      return {
        conv: row.conv,
        userName: user ? user.name : "کاربر حذف‌شده",
        userPhone: user ? user.phone : "",
        lastText: last.text,
        lastTime: Date.parse(last.created_at)
      };
    });
  res.json(convs);
});

router.get("/chat/:conv", (req, res) => {
  res.json(db.prepare("SELECT * FROM chat_messages WHERE conv = ? ORDER BY id").all(req.params.conv).map(chatJson));
});

router.post("/chat/:conv", (req, res) => {
  const text = cleanText(req.body.text, 1000);
  if (!text) throw new HttpError(400, "متن پاسخ خالی است.");
  db.prepare("INSERT INTO chat_messages (conv, sender, text, created_at) VALUES (?, 'admin', ?, ?)").run(
    req.params.conv,
    text,
    now()
  );
  res.status(201).json(db.prepare("SELECT * FROM chat_messages WHERE conv = ? ORDER BY id").all(req.params.conv).map(chatJson));
});

// ---------- تنظیمات فروشگاه ----------
router.get("/settings", (req, res) => res.json(getSetting("shop")));

router.patch("/settings", (req, res) => {
  const s = getSetting("shop") || {};
  const b = req.body || {};
  if (b.name !== undefined) s.name = cleanText(b.name, 100) || s.name;
  if (b.subtitle !== undefined) s.subtitle = cleanText(b.subtitle, 200);
  if (b.phone !== undefined) s.phone = cleanText(b.phone, 20);
  if (b.address !== undefined) s.address = cleanText(b.address, 300);
  if (Array.isArray(b.hours)) {
    s.hours = b.hours
      .map((h) => ({ label: cleanText(h.label, 60), time: cleanText(h.time, 100) }))
      .filter((h) => h.label && h.time);
  }
  if (b.bank && typeof b.bank === "object") {
    s.bank = {
      bankName: cleanText(b.bank.bankName, 100),
      cardNumber: cleanText(b.bank.cardNumber, 30),
      holder: cleanText(b.bank.holder, 100)
    };
  }
  if (Array.isArray(b.paymentNotes)) {
    s.paymentNotes = b.paymentNotes.map((n) => cleanText(n, 300)).filter(Boolean);
  }
  setSetting("shop", s);
  res.json(s);
});

router.post("/settings/photo", uploadImage.single("photo"), (req, res) => {
  if (!req.file) throw new HttpError(400, "عکسی انتخاب نشده است.");
  const s = getSetting("shop") || {};
  const url = registerUpload(req.file, "shop");
  removeUpload(s.photo);
  s.photo = url;
  setSetting("shop", s);
  res.json({ photo: url });
});

// ---------- فضای ذخیره‌سازی ----------
function usedUploads() {
  const used = new Set();
  db.prepare("SELECT image FROM products WHERE image IS NOT NULL").all().forEach((r) => used.add(r.image));
  db.prepare("SELECT image FROM slides WHERE image IS NOT NULL").all().forEach((r) => used.add(r.image));
  db.prepare("SELECT receipt FROM orders WHERE receipt IS NOT NULL").all().forEach((r) => used.add(r.receipt));
  const shop = getSetting("shop") || {};
  if (shop.photo) used.add(shop.photo);
  return used;
}

router.get("/storage", (req, res) => {
  const used = usedUploads();
  const files = db.prepare("SELECT * FROM files ORDER BY created_at DESC").all().map((f) => ({
    path: f.path,
    kind: f.kind,
    size: f.size,
    mime: f.mime,
    createdAt: f.created_at,
    inUse: used.has(f.path)
  }));
  res.json({
    files,
    totalSize: files.reduce((s, f) => s + f.size, 0),
    unusedCount: files.filter((f) => !f.inUse).length
  });
});

// حذف همه‌ی فایل‌های بلااستفاده
router.post("/storage/cleanup", (req, res) => {
  const used = usedUploads();
  const unused = db.prepare("SELECT path FROM files").all().filter((f) => !used.has(f.path));
  unused.forEach((f) => removeUpload(f.path));
  res.json({ removed: unused.length });
});

module.exports = router;
