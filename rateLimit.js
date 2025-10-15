const rateLimit = require('express-rate-limit');

// Memory store kullanarak rate limiting
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs: windowMs, // Zaman aralığı (ms)
    max: max, // Maksimum istek sayısı
    message: {
      error: message
    },
    standardHeaders: true, // Rate limit bilgilerini header'da döndür
    legacyHeaders: false, // Eski header'ları kullanma
  });
};

// Genel API rate limiter
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 dakika
  100, // 100 istek
  'Too many requests from this IP, please try again later.'
);

// Strict rate limiter for sensitive operations
const strictLimiter = createRateLimiter(
  60 * 1000, // 1 dakika
  10, // 10 istek
  'Too many sensitive operations, please try again later.'
);

module.exports = { apiLimiter, strictLimiter };
