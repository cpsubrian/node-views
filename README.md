node-views
==========

Views registry and rendering for node.js.

[![build status](https://secure.travis-ci.org/cpsubrian/node-views.png)](http://travis-ci.org/cpsubrian/node-views)

Features
--------
- Register one or more views namespaces (relative path -> absolute path)
- Render templates with or without layouts
- Use any templating engine that [consolidate.js](https://github.com/visionmedia/consolidate.js) supports
- Supports 'helpers' (static or dynamically generated data exposed to templates)
- Provides an easy-to-use middleware compatible with connect or middler.
- Provides a plugin compatible with flatiron http applications.

Examples
--------
See [./examples](https://github.com/cpsubrian/node-views/tree/master/examples). Currently there are examples for how to use Views with Middler and Flatiron.

Usage
-----
**Use with [middler](http://github.com/carlos8f/node-middler)**

```js
var middler = require('middler'),
    views = require('views'),
    server = require('http').createServer(),
    registry = views.createRegistry(__dirname + '/views'); // <-- Your views directory

middler(server)
  .add(views.middleware(registry))
  .add(function(req, res, next) {
    // The middleware exposes res.render() and res.renderStatus()
    res.render('index', {title: 'My Middler Example', name: 'Brian'});
  });

server.listen(3000, function() {
  console.log('Listening on http:/localhost:3000');
});
```

**Use with [flatiron](http://flatironjs.org/)**

```js
var flatiron = require('flatiron'),
    app = flatiron.app,
    views = require('views');

app.use(flatiron.plugins.http);
app.use(views.flatiron(__dirname + '/views')); // <-- Your views directory

app.router.get('/', function () {
  // The plugin exposes this.render() and this.renderStatus() in the
  // router scope.
  this.render('index', {title: 'My Flatiron Example', name: 'Brian'});
});

app.start(3000, function() {
  console.log('Listening on http:/localhost:3000');
});
```

**Use the API manually**

```js
var path = require('path'),
    http = require('http');

var views = require('views').createRegistry({
  // These are the defaults but you can override them.
  layout: 'layout',
  ext: 'hbs',
  engine: 'handlebars'
});

// Register a default namespace.
views.register(path.join(__dirname, 'views'));

// Register an alternate namespace with custom options.
views.register('jade', path.join(__dirname, 'jade_views'), {ext: 'html', engine: 'jade'});

// Now you can use render or renderStatus inside your http request handlers.
var server = http.createServer(function(req, res) {
  if (req.url === '/') {
    views.render(req, res, 'index', {title: 'Home Page'});
  }
  else if (req.url === '/foo') {
    views.render(req, res, 'foo', {title: 'Foo Bar'});
  }
  else {
    // Render status will look for status-404.[ext] and render it.
    // If a matching status template does not exist then it will just write
    // a standard status message.
    views.renderStatus(404);
  }
});
server.listen(8080);
```

Partials
--------

Views 0.2.x supported 'partials' by pre-rendering templates that were
registered with `view.partials()`.  This functionality was removed in
0.3.0 in favor of utilizing native partials support provided by the
templating engines themselves. This was done for a few reasons:

- Performance. Previously, all registered partials were re-rendered for every
request, whether or not they were used.
- Recursion. To avoid crazy performance costs, partials were cached per
request, but this meant ceratin recursive use-cases for partials were
broken.
- Simplicity. Partials are complicated. Its seemed prudent to piggy back on the
great work being done in consolidate.js and template engines rather than
reinvent the wheel.

- - -

### Developed by [Terra Eclipse](http://www.terraeclipse.com)
Terra Eclipse, Inc. is a nationally recognized political technology and
strategy firm located in Aptos, CA and Washington, D.C.

- - -

### License: MIT
Copyright (C) 2012 Terra Eclipse, Inc. ([http://www.terraeclipse.com](http://www.terraeclipse.com))

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
