// آپلود فایل‌ها (عکس و فیش واریزی) با محدودیت حجم و نوع، و ثبت آن‌ها در جدول files
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const db = require("./db");
const config = require("./config");
const { now } = require("./utils");

fs.mkdirSync(config.uploadDir, { recursive: true });

const EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf"
};

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + (EXT[file.mimetype] || ".bin"))
});

// سازنده‌ی آپلودر با حد حجم (مگابایت)
function makeUploader(maxMb, { allowPdf = false } = {}) {
  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      const allowed = Object.keys(EXT).filter((m) => allowPdf || m.startsWith("image/"));
      if (!allowed.includes(file.mimetype)) {
        return cb(Object.assign(new Error("نوع فایل مجاز نیست."), { status: 400 }));
      }
      cb(null, true);
    }
  });
}

const uploadImage = makeUploader(4);          // عکس محصول، اسلاید و مغازه
const uploadReceipt = makeUploader(6, { allowPdf: true }); // فیش واریزی

// ثبت فایل آپلودشده و برگرداندن آدرس عمومی آن
function registerUpload(file, kind) {
  const url = "/uploads/" + file.filename;
  db.prepare("INSERT OR REPLACE INTO files (path, kind, size, mime, created_at) VALUES (?, ?, ?, ?, ?)").run(
    url,
    kind,
    file.size,
    file.mimetype,
    now()
  );
  return url;
}

// حذف فایل از دیسک و از جدول files (فقط آدرس‌های /uploads/)
function removeUpload(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  fs.unlink(path.join(config.uploadDir, path.basename(url)), () => {});
  db.prepare("DELETE FROM files WHERE path = ?").run(url);
}

module.exports = { uploadImage, uploadReceipt, registerUpload, removeUpload };
