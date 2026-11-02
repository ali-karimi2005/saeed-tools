// تنظیمات برنامه از فایل .env خوانده می‌شود
require("dotenv").config();
const path = require("path");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`متغیر ${name} در فایل .env تنظیم نشده است.`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: required("JWT_SECRET"),
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: required("ADMIN_PASSWORD"),
  frontendOrigins: (process.env.FRONTEND_ORIGINS || "http://127.0.0.1:5500,http://localhost:5500")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  dbPath: path.join(__dirname, "..", "data", "app.db"),
  uploadDir: path.join(__dirname, "..", "uploads")
};
