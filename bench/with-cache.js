var middler = require('middler'),
    http = require('http'),
    views = require('../'),
    server,
    registry;

exports.version = require(require('path').resolve(__dirname, '../package.json')).version;

exports.listen = function(options, cb) {
  server = http.createServer();
  registry = views.createRegistry(__dirname + '/views', {cache: true});
  middler(server)
    .add(views.middleware(registry))
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