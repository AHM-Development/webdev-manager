var env = require('../config/env');
var redisStore = require('../lib/redis');

function makeKey(prefix, req, includeUser) {
  var ip = (req.context && req.context.ip) || req.ip || 'unknown';
  var userId = includeUser && req.user ? req.user.id : 'anonymous';
  return includeUser ? prefix + ':user:' + userId : prefix + ':ip:' + ip;
}

function rateLimit(options) {
  var prefix = options.prefix;
  var windowSeconds = options.windowSeconds;
  var maxRequests = options.maxRequests;
  var includeUser = !!options.includeUser;

  return async function(req, res, next) {
    try {
      var redis = await redisStore.getRedis();
      var key = makeKey(prefix, req, includeUser);
      var count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      var ttl = await redis.ttl(key);

      res.set('X-RateLimit-Limit', String(maxRequests));
      res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)));
      res.set('X-RateLimit-Reset', String(Math.max(0, ttl)));

      if (count > maxRequests) {
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
          },
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  authRateLimit: rateLimit({
    prefix: 'rl:auth',
    windowSeconds: env.rateLimit.authWindowSeconds,
    maxRequests: env.rateLimit.authMaxRequests,
  }),
  apiIpRateLimit: rateLimit({
    prefix: 'rl:api',
    windowSeconds: env.rateLimit.apiWindowSeconds,
    maxRequests: env.rateLimit.apiMaxRequests,
  }),
  apiUserRateLimit: rateLimit({
    prefix: 'rl:user',
    windowSeconds: env.rateLimit.userWindowSeconds,
    maxRequests: env.rateLimit.userMaxRequests,
    includeUser: true,
  }),
};
