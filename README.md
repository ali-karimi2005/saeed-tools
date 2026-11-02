# saeed tools — سایت کامل (فرانت + بک‌اند)

فرانت در پوشه‌ی `public` و بک‌اند در پوشه‌ی `src` قرار دارد. هر دو با یک سرور اجرا می‌شوند.

## راه‌اندازی در VS Code

1. پوشه‌ی `saeed-tools-backend` را در VS Code باز کن.
2. ترمینال را باز کن و دستورها را اجرا کن:

```bash
npm install
```

3. فایل `.env.example` را کپی کن و نامش را `.env` بگذار. مقادیر را تغییر بده:
   - `JWT_SECRET`: یک رشته‌ی طولانی و تصادفی
   - `ADMIN_USERNAME` و `ADMIN_PASSWORD`: مشخصات ورود پنل ادمین
4. سرور را اجرا کن:

```bash
npm run dev
```

سایت: http://localhost:3000
API: http://localhost:3000/api/health

نیازی به Live Server نیست؛ همه‌چیز از همان آدرس بالا باز می‌شود.

## ساختار

- `src/server.js` نقطه‌ی ورود، امنیت (helmet، CORS، محدودیت تلاش ورود)
- `src/db.js` جدول‌های SQLite (فایل دیتابیس در `data/app.db` ساخته می‌شود)
- `src/seed.js` داده‌ی اولیه: دسته‌ها، محصولات، اسلایدها و تنظیمات
- `src/routes/public.js` مسیرهای عمومی و ثبت‌نام/ورود کاربر
- `src/routes/user.js` حساب کاربری، سفارش، فیش، نظر و چت (نیاز به ورود)
- `src/routes/admin.js` پنل ادمین (نیاز به ورود ادمین)
- `uploads/` فایل‌های آپلودشده (عکس و فیش)

## امنیت که در این مرحله رعایت شده

- رمز عبور کاربران و ادمین با bcrypt هش می‌شود؛ هیچ‌کدام به صورت متن ذخیره نمی‌شود.
- قیمت‌ها در سرور از دیتابیس خوانده می‌شوند و فرانت نمی‌تواند قیمت را تغییر دهد.
- ورود تا ۳۰ بار در ۱۵ دقیقه (کاربر) و ۱۰ بار (ادمین) محدود است.
- حجم فیش حداکثر ۶ مگابایت (فقط عکس یا PDF)، حجم عکس‌ها ۴ مگابایت (فقط عکس).
- هر کاربر فقط سفارش‌ها و چت خودش را می‌بیند.

## قرارداد API (مبنای اتصال فرانت در مرحله‌ی ۳)

همه‌ی آدرس‌ها با `/api` شروع می‌شوند. برای مسیرهای کاربر و ادمین باید هدر زیر فرستاده شود:
`Authorization: Bearer <token>`

### عمومی
| روش | مسیر | توضیح |
|---|---|---|
| GET | /health | وضعیت سرور |
| GET | /shop | نام، زیرعنوان، آدرس، تلفن، ساعت کاری، عکس مغازه |
| GET | /categories | دسته‌بندی‌ها |
| GET | /products?category=id | لیست محصولات |
| GET | /products/:id | جزئیات محصول به همراه میانگین امتیاز |
| GET | /products/:id/reviews | نظرات تأیید‌شده |
| GET | /slides | اسلایدهای صفحه‌ی اصلی |
| POST | /auth/register | ثبت‌نام: `{name, phone, password}` → `{token, user}` |
| POST | /auth/login | ورود: `{phone, password}` → `{token, user}` |

### کاربر (با توکن کاربر)
| روش | مسیر | توضیح |
|---|---|---|
| GET | /me | اطلاعات کاربر |
| PATCH | /me | `{name, oldPassword, newPassword}` |
| POST | /orders | `{customer:{name,phone,address}, items:[{id,qty}]}` → سفارش و اطلاعات پرداخت |
| GET | /orders | سفارش‌های کاربر |
| GET | /orders/:id | جزئیات یک سفارش |
| POST | /orders/:id/receipt | آپلود فیش با فیلد `receipt` (multipart) |
| GET | /me/reviews | نظرات کاربر |
| POST | /products/:id/reviews | `{rating (1-5), comment}` |
| GET | /chat | پیام‌های چت کاربر |
| POST | /chat | `{text}` → لیست کامل پیام‌ها |

### ادمین (با توکن ادمین)
| روش | مسیر | توضیح |
|---|---|---|
| POST | /admin/login | `{username, password}` → `{token}` |
| GET | /admin/orders | همه‌ی سفارش‌ها |
| POST | /admin/orders/:id/confirm | تأیید سفارش |
| POST | /admin/orders/:id/reject | رد سفارش |
| DELETE | /admin/orders/:id/receipt | حذف فیش از حافظه |
| GET | /admin/users | کاربران |
| DELETE | /admin/users/:id | حذف کاربر |
| GET/POST | /admin/products | لیست و افزودن (multipart با فیلد `image` اختیاری) |
| PATCH/DELETE | /admin/products/:id | ویرایش و حذف |
| GET/POST | /admin/categories | لیست و افزودن |
| PATCH/DELETE | /admin/categories/:id | تغییر نام و حذف |
| GET/POST | /admin/slides | لیست و افزودن (فیلد `image` اختیاری، `target` = `p:id` یا `c:id` یا `none`) |
| PATCH/DELETE | /admin/slides/:id | ویرایش و حذف |
| PUT | /admin/slides-order | `{ids:[...]}` ترتیب جدید |
| GET | /admin/reviews?status=pending | نظرات (pending، approved، rejected، all) |
| PATCH/DELETE | /admin/reviews/:id | `{status}` برای تأیید یا رد، و حذف |
| GET | /admin/chat | گفتگوها |
| GET/POST | /admin/chat/:userId | خواندن و پاسخ دادن |
| GET | /admin/settings | همه‌ی تنظیمات (شامل کارت) |
| PATCH | /admin/settings | ویرایش تنظیمات |
| POST | /admin/settings/photo | عکس مغازه (فیلد `photo`) |
| GET | /admin/storage | فایل‌ها و حجم |
| POST | /admin/storage/cleanup | حذف فایل‌های بلااستفاده |

فایل‌های آپلودشده در آدرس `/uploads/<نام فایل>` در دسترس‌اند.

## نکته‌ی مهم

رمز ادمین در هر بار اجرای سرور از `.env` خوانده و در دیتابیس به‌روز می‌شود. برای تغییر رمز، فقط مقدار `ADMIN_PASSWORD` را عوض کن و سرور را دوباره اجرا کن.
