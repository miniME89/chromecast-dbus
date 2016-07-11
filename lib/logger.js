var config = require('config');
var winston = require('winston');

var logger = winston.loggers.add('app', config.get('logger'));

module.exports = logger;
