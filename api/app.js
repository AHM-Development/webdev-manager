var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var cors = require('cors');
var env = require('./config/env');
var requestContext = require('./middleware/request-context');
var errorHandler = require('./middleware/error-handler');

var indexRouter = require('./routes/index');
var apiRouter = require('./routes/api');

var app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: env.clientUrl,
  credentials: true
}));
app.use(logger('dev'));
app.use(requestContext);
app.use(express.json({
  // Bulk project/credential imports post the parsed rows as JSON — the 100kb
  // default is far too small. Matches the 10MB multer file-upload cap.
  limit: '10mb',
  verify: function(req, res, buffer) {
    req.rawBody = buffer;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
// Static uploads (task attachments, scan screenshots, form evidence) are served
// from the API origin but embedded as <img>/links on the separate web origin.
// Helmet's default Cross-Origin-Resource-Policy is 'same-origin', which makes
// the browser refuse to render them cross-origin — relax it for these assets.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: function(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

app.use('/', indexRouter);
app.use('/api/v1', apiRouter);
app.use(errorHandler);

module.exports = app;
