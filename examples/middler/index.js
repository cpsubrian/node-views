var middler = require('middler'),
    views = require('../../'),
    server = require('http').createServer();

middler(server)
  .add(views.middleware(__dirname + '/views'))
  .add(function(req, res, next) {
    res.render('index', {title: 'My Middler Example', name: 'Brian'});
  });

server.listen(3000, function() {
  console.log('Listening on http:/localhost:3000');
});