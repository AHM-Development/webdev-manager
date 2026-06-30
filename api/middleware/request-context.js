function requestContext(req, res, next) {
  var forwardedFor = req.headers['x-forwarded-for'];
  req.context = {
    ip:
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '')
        .split(',')[0]
        .trim() ||
      req.ip ||
      req.connection.remoteAddress ||
      null,
    userAgent: req.headers['user-agent'] || null,
  };
  next();
}

module.exports = requestContext;
