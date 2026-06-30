function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  var status = err.status || 500;
  var code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  var message = status === 500 ? 'Something went wrong.' : err.message;

  if (status === 500 && process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  return res.status(status).json({
    error: {
      code: code,
      message: message,
    },
  });
}

module.exports = errorHandler;
