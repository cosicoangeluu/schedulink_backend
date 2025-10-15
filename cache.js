const cache = (duration) => {
  return (req, res, next) => {
    next();
  };
};

const clearCache = (pattern) => {
  return (req, res, next) => {
    next();
  };
};

module.exports = { cache, clearCache };
