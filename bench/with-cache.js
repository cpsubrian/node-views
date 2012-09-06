var middler = require('middler'),
    http = require('http'),
    views = require('../'),
    server;

exports.version = require(require('path').resolve(__dirname, '../package.json')).version;

exports.listen = function(options, cb) {
  server = http.createServer();

  middler(server)
    .add(views.middleware(__dirname + '/views', {cache: true}))
    .add(function(req, res, next) {
      res.render('index', {title: 'Views benchmark - no cache'});
    });

  server.listen(0, function() {
    cb(null, server.address().port);
  });
};

exports.close = function() {
  server.close();
};