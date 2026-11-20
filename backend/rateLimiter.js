function createRateLimiter({ windowMs, limit }) {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    const now = Date.now();

    for (const [storedKey, storedEntry] of requests.entries()) {
      if (now >= storedEntry.resetAt) requests.delete(storedKey);
    }

    const entry = requests.get(key);

    if (!entry || now >= entry.resetAt) {
      requests.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: "Too many requests. Please wait before trying again.",
      });
    }

    next();
  };
}

module.exports = createRateLimiter;
