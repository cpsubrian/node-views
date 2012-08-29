var assert = require('assert'),
    path = require('path'),
    request = require('request'),
    http = require('http'),
    lib = require('../');

describe('Rendering & Helpers', function() {
  var port = 5000,
      server,
      views;

  // Create a fresh server and registry before each test.
  beforeEach(function(done) {
    views = lib.createRegistry();
    views.register(path.join(__dirname, 'fixtures'));
    server = http.createServer();
    server.listen(port, done);
  });

  // Close the server after each test.
  afterEach(function(done) {
    server.close(done);
  });

  it('should be able to render templates with data', function(done) {
    server.on('request', function(req, res) {
      views.render(req, res, 'hello', { name: 'Leonardo' });
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><h1>Hello Leonardo</h1></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should be able to render templates with static helpers', function(done) {
    views.helper({name: 'Donatello'});
    server.on('request', function(req, res) {
      views.render(req, res, 'hello');
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><h1>Hello Donatello</h1></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should be able to render templates with dynamic helpers', function(done) {
    views.helper(function(cb) {
      cb(null, {name: 'Michelangelo'});
    });
    server.on('request', function(req, res) {
      views.render(req, res, 'hello');
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><h1>Hello Michelangelo</h1></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should be able to render templates with no layout', function(done) {
    server.on('request', function(req, res) {
      views.render(req, res, 'hello', {name: 'Raphael', layout: false});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<h1>Hello Raphael</h1>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should be able to render templates with a non-default layout', function(done) {
    server.on('request', function(req, res) {
      views.render(req, res, 'hello', {name: 'Raphael', layout: 'layout2'});
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><div><h1>Hello Raphael</h1></div></body></html>', 'template was rendered incorrectly');
      done();
    });
  });

  it('should respect String path-specific helpers', function(done) {
    views.helper('/hey', {name: 'Donatello'});
    server.on('request', function(req, res) {
      if (req.url === '/don') {
        views.render(req, res, 'hello');
      }
      else {
        views.render(req, res, 'hello');
      }
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><h1>Hello Donatello</h1></body></html>', 'template was rendered incorrectly');

      request('http://localhost:' + port + '/hey', function(err, res, body) {
        assert.ifError(err);
        assert.equal(body, '<html><body><h1>Hello </h1></body></html>', 'template was rendered incorrectly');
        done();
      });
    });
  });

  it('should respect RegExp path-specific helpers', function(done) {
    views.helper(/^\/hello$/, {name: 'Donatello'});
    server.on('request', function(req, res) {
      if (req.url === '/hey') {
        views.render(req, res, 'hello');
      }
      else {
        views.render(req, res, 'hello');
      }
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><h1>Hello Donatello</h1></body></html>', 'template was rendered incorrectly');

      request('http://localhost:' + port + '/hey', function(err, res, body) {
        assert.ifError(err);
        assert.equal(body, '<html><body><h1>Hello </h1></body></html>', 'template was rendered incorrectly');
        done();
      });
    });
  });

  it('should be process `_json_` helpers', function(done) {
    var data = {name: 'April', job: 'reporter'};
    views.helper({
      _json_: {
        character: data
      }
    });
    server.on('request', function(req, res) {
      if (req.url === '/character') {
        views.render(req, res, 'character', {layout: false});
      }
    });
    request('http://localhost:' + port + '/character', function(err, res, body) {
      assert.ifError(err);
      assert.deepEqual(body, JSON.stringify(data));
      done();
    });
  });

  it('should not allow dynamic helpers to modify static helper data', function(done) {
    var ran = false,
        data = {
          weapons: {
            leo: 'sword',
            don: 'bow'
          }
        },
        result = {},
        scope = null,
        all = {
          weapons: {
            leo: 'sword',
            don: 'bow',
            raph: 'sai',
            mike: 'nunchuck'
          }
        };

    views.helper(data);
    views.helper(function(cb) {
      if (!ran) {
        ran = true;
        cb(null, {
          weapons: {
            raph: 'sai'
          }
        });
      }
      else {
        cb(null, {
          weapons: {
            mike: 'nunchuck'
          }
        });
      }
    });

    var req = {url: '/'};
    var res = {};
    views._processHelpers(req, res, result, function(err) {
      views._processHelpers(req, res, result, function(err) {
        assert.deepEqual(result, all);
        assert.notDeepEqual(data, all);
        done();
      });
    });
  });

  it('should be able to render status code templates', function(done) {
    server.on('request', function(req, res) {
      views.renderStatus(req, res, 404);
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '<html><body><h1>404</h1><p>404 - Page not found</p></body></html>');
      done();
    });
  });

  it('should be able to render status code with NO template', function(done) {
    server.on('request', function(req, res) {
      views.renderStatus(req, res, 403);
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, '403 - Access denied');
      done();
    });
  });

  it('should be able to render status code with NO template and a custom message', function(done) {
    server.on('request', function(req, res) {
      views.renderStatus(req, res, 500, 'Opps! Something broke!');
    });
    request('http://localhost:' + port + '/', function(err, res, body) {
      assert.ifError(err);
      assert.equal(body, 'Opps! Something broke!');
      done();
    });
  });
});
