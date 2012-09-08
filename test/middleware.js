var assert = require('assert'),
    path = require('path'),
    request = require('request'),
    http = require('http'),
    middler = require('middler'),
    lib = require('../');

describe('Middleware', function() {
  var port = 5000,
      server;

  // Create a fresh server and registry before each test.
  beforeEach(function(done) {
    server = http.createServer();
    middler(server).add(lib.middleware(path.join(__dirname, 'fixtures/views'), {silent: true}));
    server.listen(port, done);
  });

  // Close the server after each test.
  afterEach(function(done) {
    server.close(done);
  });

  it('should be able to render data in the layout', function(done) {
    server.on('request', function(req, res) {
      res.render('hello', {name: 'Donatello', optional: 'Greeting:'});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body>Greeting:<h1>Hello Donatello</h1></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should render a 500 if the template cannot be found', function(done) {
    server.on('request', function(req, res) {
      res.render('nothere', {name: 'Donatello', optional: 'Greeting:'});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(res.statusCode, 500);
      done();
    });
  });

});
