// توکن JWT و میان‌افزارهای احراز هویت
const jwt = require("jsonwebtoken");
const config = require("./config");
const { HttpError } = require("./utils");

function signToken(payload, role) {
  const expiresIn = role === "admin" ? "12h" : "30d";
  return jwt.sign({ ...payload, role }, config.jwtSecret, { expiresIn });
}

// نقش مورد نیاز: "user" یا "admin"
function requireRole(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return next(new HttpError(401, "ابتدا وارد شوید."));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.role !== role) throw new Error("wrong role");
      req.auth = payload;
      next();
    } catch (e) {
      next(new HttpError(401, "نشست شما معتبر نیست؛ دوباره وارد شوید."));
    }
  };
}

module.exports = { signToken, requireRole };
