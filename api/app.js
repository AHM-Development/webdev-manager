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
  verify: function(req, res, buffer) {
    req.rawBody = buffer;
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api/v1', apiRouter);
app.use(errorHandler);

module.exports = app;
