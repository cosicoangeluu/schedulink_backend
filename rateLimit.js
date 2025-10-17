const rateLimit = require('express-rate-limit');


const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs: windowMs,
    max: max,
    message: {
      error: message
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};


const apiLimiter = createRateLimiter(
  15 * 60 * 1000,
  100,
  'Too many requests from this IP, please try again later.'
);

// Strict rate limiter for sensitive operations
const strictLimiter = createRateLimiter(
  60 * 1000,
  10,
  'Too many sensitive operations, please try again later.'
);

module.exports = { apiLimiter, strictLimiter };
