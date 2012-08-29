var path = require('path'),
    url = require('url'),
    util = require('util'),
    clone = require('clone'),
    cons = require('consolidate'),
    ProtoListDeep = require('proto-list-deep'),
    _ = require('underscore');

exports.createRegistry = function(options) {
  return new Views(options);
};
exports.Views = Views;

/**
 * Views constructor.
 */
function Views(options) {
  this.conf = new ProtoListDeep();
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
}

/**
 * Cached url parser.
 */
Views.prototype._parseUrl = function(url) {
  var parsed = this._parsedUrls[url];
  if (parsed) {
    return parsed;
  }
  else {
    return _parsedUrls[url] = url.parse(url);
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
    conf.unshift(options);
  }

  // Default render callback.
  cb = cb || function(err, str) {
    var layout = conf.get('layout');
    var layoutOpts = {content: str, layout: layout};

    // If we have a layout, and this is not the layout, render this
    // content inside the layout.
    if (layout && view !== layout && views.find(layout, layoutOpts)) {
      self.render(layout, layoutOpts);
    }
    else {
      res.writeHeader(200, {"Content-Type": "text/html"});
      res.write(str);
      res.end();
    }
  };

  // Find the full path to the template.
  var template = views.find(view, conf);
  if (template) {
    // Process view helpers.
    views._processHelpers(req, res, conf, function(err) {
      if (err) throw err;
      views._processPartials(req, res, conf, function(err) {
        if (err) throw err;
        cons[conf.get('engine')](template, conf.deepSnapshot, cb);
      });
    });
  }
  else {
    cb(new Error('Could not find the requested view: ' + view));
  }
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
    this.render('status-' + code, {message: message});
  }
  catch (err) {
    res.end(message);
  }
};

/**
 * Register a views helper.
 *
 * A helper can either be an object literal that will be merged with the
 * other template data, or a function. Function ('dynamic') helpers allow
 * you to add template data based on a request.
 *
 * Helper functions will be called in the router scope (this.req, this.res,
 * this.app) during the view rendering phase.  Helper funtions accept a
 * callback that should be called with the arguments `callback(err, data)`.
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
 * Process views helpers.  Shoud be invoked in the 'router' scope.
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
    conf.push(req._viewsHelpersData);
    return callback(null);
  }

  Object.keys(views._helpers).forEach(function(match) {
    if (reqPath.match(new RegExp(match))) {
      views._helpers[match].forEach(function(helper) {
        tasks.push(function(done) {
          if (typeof helper === 'function') {
            helper.call(self, function(err, data) {
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
    var processed = views._processHelpersJSON(helpers.deepSnapshot);
    conf.push(processed);
    self.req._viewsHelpersData = processed;
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

  if (arguments.length < 3) {
    root = prefix;
    opts = root;
    prefix = '';
  }
  opts = opts || {};

  // Confirm the root path exists.
  if (path.existsSync(root)) {
    // If a layout was passed in the options, confirm it exists.
    if (opts.layout) {
      if (!path.existsSync(path.join(root, opts.layout + '.' + opts.ext))) {
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
 */
Views.prototype.find = function(target, opts) {
  var key, namespace, regex, full, ext, tempOpts;
  var reg = this._registry;
  var cache = this._cache;

  // Create a unique key for this target (vary on extension if supplied).
  key = target;
  if (opts.ext) {
    key = key + ':' + opts.ext;
  }

  // Check if the path exsts in the cache.
  if (!cache[key]) {
    // Loop through registered namespaces and check if our path matches one.
    for (var i = reg.length - 1; i >= 0; i--) {
      namespace = reg[i];
      // Check for existence of the namespace prefix.
      if (target.indexOf(namespace.prefix) === 0) {
        regex = new RegExp(namespace.prefix + '\/?');
        ext = opts.ext || namespace.opts.ext;
        full = path.resolve(namespace.root, target.replace(regex, '')) + '.' + ext;
        if (path.existsSync(full)) {
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
    // Merge in the namespace default options.
    _.defaults(opts, cache[key].opts);

    // Return the path to the view.
    return cache[key].path;
  }
  else {
    throw new Error('No registered views matched the path: ' + target);
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
        if (path.existsSync(full)) {
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



