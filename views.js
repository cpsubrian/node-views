var path = require('path'),
    fs = require('fs'),
    existsSync = fs.existsSync || path.existsSync,
    url = require('url'),
    util = require('util'),
    async = require('async'),
    clone = require('clone'),
    cons = require('consolidate'),
    glob = require('glob'),
    ProtoListDeep = require('proto-list-deep'),
    _ = require('underscore');

// Create a views registry to use manually.
exports.createRegistry = function(root, options) {
  return new Views(root, options);
};
// Use a views registry as middleware.  Adds res.render() and res.renderStatus()
exports.middleware = function(views) {
  return function(req, res, next) {
    function renderCallback(err, str) {
      if (err) {
        views.log(err);
        return res.renderStatus(500);
      }
      res.writeHead(200, {"Content-Type": "text/html"});
      res.write(str);
      res.end();
    }
    res.render = function(view, options) {
      options = options || {};
      views.render.call(views, req, res, view, options, renderCallback);
    };
    res.renderStatus = views.renderStatus.bind(views, req, res);
    next();
  };
};
// Use views registry in a flatiron app. Attaches render() and renderStatus() to
// router scope.
exports.flatiron = function(root, options) {
  return {
    attach: function() {
      var app = this;
      var views = app.views = new Views(root, options);
      if (app.router) {
        app.router.attach(function() {
          var router = this;
          function renderCallback(err, str) {
            if (err) {
              views.log(err);
              return router.renderStatus(500);
            }
            router.res.writeHead(200, {"Content-Type": "text/html"});
            router.res.write(str);
            router.res.end();
          }
          this.render = function(view, options) {
            options = options || {};
            views.render.call(views, router.req, router.res, view, options, renderCallback);
          };
          this.renderStatus = views.renderStatus.bind(views, router.req, router.res);
        });
      }
    }
  };
};
exports.Views = Views;

/**
 * Views constructor.
 */
function Views(root, options) {
  this.conf = new ProtoListDeep();

  if (!options) {
    options = root;
    root = null;
  }
  if (options) {
    this.conf.push(options);
  }
  this.conf.push({
    layout: 'layout',
    ext: 'hbs',
    engine: 'handlebars'
  });

  this._parsedUrls = {};
  this._helpers = {};
  this._registry = [];
  this._cache = {};
  this._partials = {};

  if (root) {
    this.register(root);
  }
}

/**
 * Log output unless silent.
 */
Views.prototype.log = function() {
  if (!this.conf.get('silent')) {
    console.log.apply(console, arguments);
  }
};

/**
 * Cached url parser.
 */
Views.prototype._parseUrl = function(urlToParse) {
  var parsed = this._parsedUrls[urlToParse];
  if (parsed) {
    return parsed;
  }
  else {
    return this._parsedUrls[urlToParse] = url.parse(urlToParse);
  }
};

/**
 * Stringify a path, preparing it to be converted to new RegExp.
 *
 * @param path {String|RegExp} The string or regular expression to normalize.
 * @return {String} The normalized string representation of the path.
 */
Views.prototype._stringifyPath = function(path) {
  // Convert to string and clean up if its a regex.
  if (util.isRegExp(path)) {
    path = path.toString().replace(/^\//, '').replace(/\/$/, '');
  }
  // Make sure the path will be matched in-full.
  else {
    path = '^' + path + '$';
  }
  return path;
};

/**
 * Render a view.
 *
 * @param view {String} The path to a template, relative to ANY registered
 *   views namespace, excluding the template extension.
 * @param opts {Object} Template data and/or engine-specific options.
 * @param [cb] {Function} (err, str) Callback to handle the rendered text. A
 *   default callback is provided which calls `this.res.html(str)`.
 */
Views.prototype.render = function(req, res, view, options, cb) {
  var views = this,
      defaults = clone(this.conf),
      conf = clone(this.conf),
      tasks = [];

  // Support callback function as second argument.
  if (typeof options === 'function') {
    cb = options, options = {};
  }

  // If options is a string, assign it to options.content.
  if (typeof options === 'string') {
    options = {content: options};
  }

  // Merge options into conf.
  if (options) {
    conf.unshift(clone(options));
  }

  // Default render callback.
  cb = cb || function(err, str) {
    if (err) throw err;

    // Fallback to writing the content as html.
    res.writeHead(res.statusCode, {"Content-Type": "text/html"});
    res.write(str);
    res.end();
  };

  // Find the full path to the template.
  views.find(view, conf, function(err, template) {
    if (err) return cb(err);
    views._processHelpers(req, res, conf, function(err) {
      if (err) return cb(err);
      views._processPartials(req, res, conf, function(err) {
        if (err) return cb(err);
        cons[conf.get('engine')](template, conf.deep(), function(err, str) {
          if (err) return cb(err);

          var layout = conf.get('layout'),
              layoutConf = clone(defaults),
              template;

          layoutConf.push(conf.deep());
          layoutConf.unshift({content: str, layout: layout});

          // If we have a layout, and this is not the layout, render this
          // content inside the layout.
          if (layout && view !== layout) {
            try {
              views.render(req, res, layout, layoutConf.deep(), cb);
              return;
            }
            catch (err) {
              if (err.code !== 'ENOENT') {
                return cb(err);
              }
            }
          }
          cb(null, str);
        });
      });
    });
  });
};

/**
 * Render a status code page.
 *
 * @param code {Number} Status code
 * @param [message] {String} A custom error message.
 */
Views.prototype.renderStatus = function(req, res, code, message) {
  var messages = {
    403: 'Access denied',
    404: 'Page not found',
    500: 'Server error'
  };

  if (!message && messages[code]) {
    message = code + ' - ' + messages[code];
  }

  res.statusCode = code;

  try {
    this.render(req, res, 'status-' + code, {message: message});
  }
  catch (err) {
    res.end(message);
  }
};

/**
 * Register a views namespace.
 *
 * A views namespace associates a template prefix with a root directory
 * and some default options. A great use-case for multiple views
 * namespaces is when application plugins would like to expose views that
 * the main app can render.
 *
 * @param prefix {String} A template path prefix, no trailing slash.
 * @param root {String} The absolute path to directoy of views being
 *   registered.
 * @param opts {Object} Default options for all the views in this directory.
 *   Typically, this would include a custom templating engine and extension.
 */
Views.prototype.register = function(prefix, root, opts) {
  var views = this,
      reg = this._registry,
      cache = this._cache;

  if (arguments.length < 2) {
    root = prefix;
    prefix = '';
    opts = {};
  }
  if (arguments.length < 3) {
    if (typeof root !== 'string') {
      opts = root;
      root = prefix;
      prefix = '';
    }
    else {
      opts = {};
    }
  }

  // Confirm the root path exists.
  if (existsSync(root)) {
    // If a layout was passed in the options, confirm it exists.
    if (opts.layout) {
      if (!existsSync(path.join(root, opts.layout + '.' + opts.ext))) {
        // Its ok if the default doesn't exist.
        if (opts.layout === 'layout') {
          opts.layout = false;
        }
        else {
          throw new Error('The layout does not exist (' + opts.layout + ').');
        }
      }
    }

    // Add the new namespace.
    reg.push({
      prefix: prefix,
      root: root,
      opts: opts || {}
    });

    // Clear the cache.
    cache = {};

    // Register the default partials location.
    views.partials('partials');
  }
  else {
    throw new Error('Path does not exist for view namespace: ' + prefix);
  }
};

/**
 * Find the real path to a template.
 *
 * Fetch the path for a view, searching through all registered namespaces.
 * Namespaces are searched in reverse order of their registration.
 * Also, merges in the namespace default options.
 *
 * @param target {String} A namespaced (prefix) path to a view.
 * @param opts {Object} An options object that will have the namespace
 *   defaults merged in.
 * @param [cb] {Function} (err, path) Callback to receive the path.
 */
Views.prototype.find = function(target, conf, cb) {
  var key, check, namespace, regex, full, ext, tempOpts;
  var reg = this._registry;
  var cache = this._cache;

  // Convert conf to a ProtoListDeep if its an object literal.
  if (!(conf instanceof ProtoListDeep)) {
    var temp = clone(conf);
    conf = new ProtoListDeep();
    conf.push(temp);
  }

  // Create a unique key for this target (vary on extension if supplied).
  key = target;
  if (conf.get('ext')) {
    key = key + ':' + conf.get('ext');
  }

  // Check if the path exsts in the cache.
  if (!cache[key]) {
    // Loop through registered namespaces and check if our path matches one.
    check = reg.slice(0);
    while (namespace = check.pop()) {
      // Check for existence of the namespace prefix.
      if (target.indexOf(namespace.prefix) === 0) {
        regex = new RegExp(namespace.prefix + '\/?');
        ext = conf.get('ext') || namespace.opts.ext;
        full = path.resolve(namespace.root, target.replace(regex, '')) + '.' + ext;
        if (existsSync(full)) {
          cache[key] = {
            path: full,
            opts: clone(namespace.opts)
          };
          break;
        }
      }
    }
  }

  if (cache[key]) {
    // Add the namespace default options.
    conf.push(cache[key].opts);

    if (cb) return cb(null, cache[key].path);
    return cache[key].path;
  }
  else {
    var err = new Error('No registered views matched the path: ' + target);
    err.code = 'ENOENT';

    if (cb) return cb(err);
    throw err;
  }
};

/**
 * Find a views directory.
 *
 * Fetch the full path to a views directory, searching through all registered
 * namespaces.  Namespaces are searched in reverse order of their
 * registration.
 *
 * @param target {String} A namespaced (prefix) path to a views directory.
 */
Views.prototype.findDir = function(target) {
  var namespace, regex, full, stats;
  var reg = this._registry;
  var cache = this._cache;

  // Check if the path exsts in the cache.
  if (!cache[target]) {
    for (var i = reg.length - 1; i >= 0; i--) {
      namespace = reg[i];

      // Check for the existence of the namespace prefix.
      if (target.indexOf(namespace.prefix) === 0) {
        regex = new RegExp(namespace.prefix + '\/?');
        full = path.resolve(namespace.root, target.replace(regex, ''));
        if (existsSync(full)) {
          // Check if it is an actual directory.
          if (fs.statSync(full).isDirectory()) {
            cache[target] = full;
            break;
          }
        }
      }
    }
  }

  return cache[target] || false;
};

/**
 * Register a views helper.
 *
 * A helper can either be an object literal that will be merged with the
 * other template data, or a function. Dynamic helper functions allow
 * you to add template data based on a request.
 *
 * Dynamic helper functions will be called in the router scope (this.req,
 * this.res) during the view rendering phase. Helper funtions must accept a
 * callback to call with the arguments `callback(err, data)`.
 *
 * ####Example dynamic helper function:
 *
 *     function (req, res, callback){
 *       var user = req.user;
 *       return callback(null, { user: user });
 *     }
 *
 * @param [match] {String|RegExp} If specified, the helper will only be
 *   applied for urls that match this pattern.
 * @param helper {Object|Function} Template data or a helper function.
 */
Views.prototype.helper = function(match, helper) {
  if (arguments.length === 1) {
    helper = match;
    match = /.*/;
  }

  match = this._stringifyPath(match);

  // Instantiate path array.
  if (!this._helpers[match]) {
    this._helpers[match] = [];
  }

  this._helpers[match].push(helper);
};

/**
 * Clear all views helpers.
 *
 * @param [match] {String|RegExp} Only clear helpers registerd under this
 *   match pattern.
 */
Views.prototype.clearHelpers = function(match) {
  if (match) {
    match = this._stringifyPath(match);
    if (this._helpers[match]) {
      delete this._helpers[match];
    }
  }
  else {
    this._helpers = {};
  }
};

/**
 * Process views helpers.  Should be invoked in the 'router' scope.
 *
 * @param  templateData {Object} Template data to be extended.
 * @param  [url] {String|RegExp} Limit to helpers that match this url.
 * @param  callback {Function} (err) Callback to be invoked after all registered
 *   helpers have been processed.
 */
Views.prototype._processHelpers = function(req, res, conf, callback) {
  var views = this,
      tasks = [],
      reqPath = this._parseUrl(req.url).pathname,
      helpers = new ProtoListDeep();

  // Check for cached helpers data for this requests so we don't run
  // them more than once.
  if (req._viewsHelpersData) {
    conf.push(clone(req._viewsHelpersData));
    return callback(null);
  }

  Object.keys(views._helpers).forEach(function(match) {
    if (reqPath.match(new RegExp(match))) {
      views._helpers[match].forEach(function(helper) {
        tasks.push(function(done) {
          if (typeof helper === 'function') {
            helper.call(views, req, res, function(err, data) {
              if (data) {
                helpers.push(data);
              }
              done(err);
            });
          }
          else {
            helpers.push(helper);
            done(null);
          }
        });
      });
    }
  });

  async.parallel(tasks, function(err) {
    if (err) return callback(err);
    var processed = views._processHelpersJSON(helpers.deep());
    conf.push(processed);
    req._viewsHelpersData = processed;
    callback(err);
  });
};

/**
 * Process _json_ property in views helpers data.
 *
 * If one or more of the views helpers added a `_json_` object, stringify
 * each key/value pair and expose the values as helpers data.
 *
 * Does not overwrite existing data keys.
 *
 * The common use-case for this is to expose data to the client-side
 * javascript environtment.
 *
 * @param data {Object} The helpers data to process.
 */
Views.prototype._processHelpersJSON = function(data) {
  if (data.hasOwnProperty('_json_')) {
    for (var key in data._json_) {
      if (!data.hasOwnProperty(key)) {
        data[key] = JSON.stringify(data._json_[key]);
      }
    }
  }
  return data;
};

/**
 * Register partials.
 *
 * @param [match] {String|RegExp} A string or regex to limit partial rendering
 *   to matching urls.
 * @param source {String} The path to a directory of views.  Registered
 *   namespaces will be honored. The directory will be recursively searched
 *   for views matching options.ext,  and those will be rendered and attached
 *   to the template data as properties matching the filename with the
 *   extension stripped.
 */
Views.prototype.partials = function(match, source) {
  var views = this,
      conf = views.conf,
      dir, view, parts, assign, last;

  if (arguments.length === 1) {
    source = match;
    match = /.*/;
  }

  match = views._stringifyPath(match);
  views._partials[match] = views._partials[match] || {};

  // Get the full path to the source (apply registered namespace).
  dir = views.findDir(source);
  if (dir) {
    glob.sync(dir + '/**/*.*').forEach(function(file) {
      file = file.replace(dir + '/', '');
      view = file.replace('.' + conf.get('ext'), '');
      parts = view.replace(new RegExp(dir + '\/?'), '').split('/');

      assign = views._partials[match];
      last = parts.pop();
      parts.forEach(function(part) {
        assign[part] = assign[part] || {};
        assign = assign[part];
      });
      assign[last] = path.join(dir, file);
    });
  }
};

/**
 * Process the app partials, rendering them and merging them with the passed
 * templateData object.
 *
 * Should be invoked in the router scope.
 *
 * @param templateData {Object} The template data object to extend.
 * @param callback {Function} A callback to once the partials have been
 *   processed.
 */
Views.prototype._processPartials = function(req, res, conf, callback) {
  var views = this,
      tasks = [],
      reqPath = views._parseUrl(req.url).pathname;

  // Check for cached partials for this requests so we don't run
  // them more than once.
  if (req._partialsData) {
    conf.push(clone(req._partialsData));
    return callback(null);
  }

  // Loop through partials and render the ones that match the req url.
  Object.keys(views._partials).forEach(function(match) {
    var partials = views._partials[match];
    if (reqPath.match(new RegExp(match))) {
      tasks.push(function(done) {
        views._renderPartials(partials, conf, done);
      });
    }
  });
  if (tasks.length) {
    async.parallel(tasks, function(err, results) {
      if (err) throw err;
      req._partialsData = {};
      results.forEach(function(result) {
        _.defaults(req._partialsData, result);
      });
      conf.push(clone(req._partialsData));
      return callback(err);
    });
  }
  else {
    return callback(null);
  }
};

/**
 * Recursively loop through partials and render them.
 *
 * @param  partials {Object} The top-level partials to render.
 * @param  templateData {Object} The template data object to extend.
 * @param  callback {Function} A callback to invoke after all the partials
 *   have been rendered and merged into the template data.
 */
Views.prototype._renderPartials = function(partials, conf, callback) {
  var views = this,
      defaultConf = clone(this.conf),
      tasks = {};

  Object.keys(partials).forEach(function(key) {
    var partial = partials[key];
    if (typeof partial === 'object') {
      // Recurse
      tasks[key] = function(done) {
        views._renderPartials(partial, conf, done);
      };
    }
    else {
      // Render
      tasks[key] = function(done) {
        cons[defaultConf.get('engine')](partial, conf.deep(), done);
      };
    }
  });

  async.parallel(tasks, function(err, results) {
    callback(null, results);
  });
};
