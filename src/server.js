// نقطه‌ی ورود سرور API
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const config = require("./config");
require("./db");
const { seed } = require("./seed");
const path = require("path");
const { HttpError } = require("./utils");

seed();

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// فقط از آدرس‌های مجاز فرانت درخواست پذیرفته می‌شود
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.frontendOrigins.includes(origin)),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "100kb" }));

// فایل‌های آپلودشده (عکس محصول، اسلاید، مغازه، فیش)
app.use("/uploads", express.static(config.uploadDir, { dotfiles: "deny", index: false }));

// فرانت (صفحات HTML، CSS، JS و عکس‌ها) از پوشه‌ی public
app.use(express.static(path.join(__dirname, "..", "public")));

// محدودیت تلاش برای ورود (ضد حدس رمز)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth", authLimiter);
app.use("/api/admin/login", adminLoginLimiter);

app.use("/api", require("./routes/public"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api", require("./routes/user"));

app.use("/api", (req, res) => res.status(404).json({ error: "مسیر پیدا نشد." }));

// مدیریت یکجای خطاها
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "حجم فایل بیشتر از حد مجاز است." });
  if (err instanceof HttpError || err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "داده‌ی ارسالی نامعتبر است." });
  console.error(err);
  res.status(500).json({ error: "خطای داخلی سرور." });
});

app.listen(config.port, () => {
  console.log(`سایت و API آماده است: http://localhost:${config.port}`);
});
