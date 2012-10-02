var assert = require('assert'),
    path = require('path'),
    request = require('request'),
    http = require('http'),
    ProtoListDeep = require('proto-list-deep'),
    lib = require('../');

describe('Partials', function() {
  var port = 5000,
      server,
      views;

  // Create a fresh server and registry before each test.
  beforeEach(function(done) {
    views = lib.createRegistry();
    views.register(path.join(__dirname, 'fixtures/views'));
    server = http.createServer();
    server.listen(port, done);
  });

  // Close the server after each test.
  afterEach(function(done) {
    server.close(done);
  });

  it('should render templates with partials applied', function(done) {
    server.on('request', function(req, res) {
      views.render(req, res, 'hello-turtle', {first: 'Casey', last: 'Jones'});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(res.statusCode, 200);
      assert.equal(body, '<html><body><h1>Hello Casey Jones</h1></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

});