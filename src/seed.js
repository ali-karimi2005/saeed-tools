// داده‌ی اولیه: اولین بار که سرور اجرا می‌شود، دسته‌ها، محصولات، اسلایدها و تنظیمات ساخته می‌شوند.
// حساب ادمین هم در هر راه‌اندازی با مقدار ADMIN_PASSWORD در .env همگام می‌شود.
const bcrypt = require("bcryptjs");
const db = require("./db");
const config = require("./config");
const { getSetting, setSetting } = require("./models");
const { randomId } = require("./utils");

function seed() {
  // ادمین
  const hash = bcrypt.hashSync(config.adminPassword, 10);
  const admin = db.prepare("SELECT id FROM admins WHERE username = ?").get(config.adminUsername);
  if (admin) {
    db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hash, admin.id);
  } else {
    db.prepare("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)").run(
      randomId("a"),
      config.adminUsername,
      hash
    );
  }

  // دسته‌ها و محصولات نمونه (فقط اگر جدول خالی باشد)
  if (!db.prepare("SELECT 1 FROM categories LIMIT 1").get()) {
    const cats = [
      ["power-tools", "ابزار برقی"],
      ["hand-tools", "ابزار دستی"],
      ["measuring", "اندازه‌گیری"],
      ["safety", "ایمنی و حفاظت"]
    ];
    const insertCat = db.prepare("INSERT INTO categories (id, name, position) VALUES (?, ?, ?)");
    cats.forEach(([id, name], i) => insertCat.run(id, name, i));

    const insertProduct = db.prepare(
      "INSERT INTO products (name, category_id, price, in_stock, description) VALUES (?, ?, ?, ?, ?)"
    );
    [
      ["دریل شارژی ۱۸ ولت", "power-tools", 2850000, 1, "دریل شارژی با دو باتری ۱۸ ولتی، قدرت بالا و گیربکس دو سرعته. مناسب کارهای خانگی و نجاری سبک."],
      ["فرز ۱۲۰۰ وات", "power-tools", 1960000, 1, "فرز دستی با توان ۱۲۰۰ وات و دیسک ۱۱۰ میلی‌متری، مناسب برش و سنباده‌زنی."],
      ["مجموعه آچار بکس ۲۴ تکه", "hand-tools", 1450000, 1, "مجموعه ۲۴ تکه بکس و آچار با جعبه‌ی فلزی، ساخت کروم وانادیوم."],
      ["پیچ‌گوشتی ضربه‌ای ۶ تکه", "hand-tools", 380000, 0, "مجموعه ۶ تکه پیچ‌گوشتی ضربه‌ای با سرهای قابل تعویض."],
      ["متر لیزری دیجیتال", "measuring", 690000, 1, "متر لیزری با دقت بالا و نمایشگر دیجیتال، برد تا ۴۰ متر."],
      ["تراز آلومینیومی ۶۰ سانتی", "measuring", 240000, 1, "تراز آلومینیومی ۶۰ سانتی‌متری با سه حباب، مقاوم و سبک."],
      ["دستکش کار ضدبرش", "safety", 180000, 1, "دستکش کار با لایه‌ی ضدبرش، مناسب کار با ورق و چوب."],
      ["عینک ایمنی شفاف", "safety", 150000, 1, "عینک ایمنی با لنز ضدخش و قاب قابل تنظیم، مناسب هنگام کار با دریل و فرز."]
    ].forEach((p) => insertProduct.run(...p));

    const insertSlide = db.prepare(
      "INSERT INTO slides (id, title, subtitle, image, link_type, link_value, position) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    insertSlide.run("s-1", "ابزار مطمئن برای کار شما", "ابزار برقی، دستی و تجهیزات ایمنی با بهترین قیمت", null, "category", "power-tools", 0);
    insertSlide.run("s-2", "دریل شارژی ۱۸ ولت", "قدرت بالا برای کارهای خانگی و نجاری", null, "product", "1", 1);
  }

  // تنظیمات فروشگاه
  if (!getSetting("shop")) {
    setSetting("shop", {
      name: "saeed tools",
      subtitle: "ابزار فروشی سعید",
      address: "بندرعباس، زیراوقاف، فاز ۳ اوقاف",
      phone: "09331370985",
      hours: [{ label: "هر روز هفته", time: "۸:۰۰ تا ۱۲:۰۰ و ۱۶:۰۰ تا ۲۲:۰۰" }],
      photo: null,
      bank: { bankName: "نام بانک", cardNumber: "6000-0000-0000-0000", holder: "نام صاحب کارت" },
      paymentNotes: [
        "مبلغ را دقیقاً مطابق جمع سفارش واریز کنید.",
        "کد سفارش را در بخش توضیحات (شرح) واریز یادداشت کنید.",
        "فقط به شماره کارت اعلام‌شده در همین صفحه واریز کنید و قبل از واریز نام صاحب کارت را بررسی کنید.",
        "فیش را واضح و کامل (شامل تاریخ، ساعت و شماره پیگیری) آپلود کنید.",
        "بعد از آپلود رسید، تأیید سفارش پس از بررسی انجام می‌شود و ممکن است چند ساعت طول بکشد.",
        "سفارش فقط پس از دریافت پیام تأیید از طرف فروشگاه نهایی می‌شود.",
        "اگر واریز از کارت شخص دیگری انجام می‌شود، نام واریزکننده را در توضیحات بنویسید.",
        "در صورت بروز مشکل، از طریق چت آنلاین یا شماره‌ی تماس فروشگاه با ما در تماس باشید."
      ]
    });
  }
}

module.exports = { seed };
