var assert = require('assert'),
    path = require('path'),
    request = require('request'),
    http = require('http'),
    flatiron = require('flatiron'),
    lib = require('../');

describe('Flatiron', function() {
  var port = 5000,
      app;

  // Create a fresh server and registry before each test.
  beforeEach(function(done) {
    app = flatiron.createApp();
    app.use(flatiron.plugins.http);
    app.use(lib.flatiron(path.join(__dirname, 'fixtures/views'), {silent: true}));
    app.start(port, done);
  });

  // Close the server after each test.
  afterEach(function(done) {
    app.server.close(done);
  });

  it('should be able to render data in the layout', function(done) {
    app.router.get('/', function() {
      this.render('hello', {name: 'Donatello', optional: 'Greeting:'});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body>Greeting:<h1>Hello Donatello</h1></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should render a 500 if the template cannot be found', function(done) {
    app.router.get('/', function() {
      this.render('nothere', {name: 'Donatello', optional: 'Greeting:'});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(res.statusCode, 500);
      done();
    });
  });

});
