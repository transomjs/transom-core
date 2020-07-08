"use strict";

const bunyan = require("bunyan");
const corsMiddleware = require("restify-cors-middleware2");
const debug = require("debug")("transom:core");
const favicon = require("serve-favicon");
const path = require("path");
const restify = require("restify");
const restifyPlugins = require("restify").plugins;
const CookieParser = require("restify-cookies");
const semver = require("semver");
const PocketRegistry = require("pocket-registry");
const wrapper = require("./wrapper");

function createLogger(options) {
  let bunyanLogger;
  if (options.transom && options.transom.requestLogger) {
    const requestLoggerOpts = options.transom.requestLogger || {};
    requestLoggerOpts.name = requestLoggerOpts.name || "TransomJS";
    // Use the provided logger, or create a default one.
    bunyanLogger = requestLoggerOpts.log || bunyan.createLogger(requestLoggerOpts);
  }
  return bunyanLogger;
}

// Process an array of Promises serially, discard the results.
function serial(promiseArray) {
  return promiseArray.reduce((acc, current) => {
    return acc.then(current);
  }, Promise.resolve());
}

// Create a single registry and plugins array for TransomCore.
let _registry;
let _plugins;
function TransomCore() {
  // Initialize on create
  _registry = new PocketRegistry();
  _plugins = [];
}

Object.defineProperties(TransomCore.prototype, {
  registry: {
    get: function() {
      // Pre-initialize registry access.
      return _registry;
    }
  }
});

TransomCore.prototype.configure = function(plugin, options) {
  debug("Adding Transom plugin:", plugin.constructor.name);
  options = options || {};
  _plugins.push({
    plugin,
    options
  });
};

TransomCore.prototype.initialize = function(restifyServer, options) {
  return new Promise((resolve, reject) => {
    // Fail nicely on old versions of Node.
    const minNodeVersion = "8.0.0";
    if (semver.lte(process.version, minNodeVersion)) {
      throw new Error(
        `TransomJS doesn't support NodeJS versions older than ${minNodeVersion}, currently running ${process.version}.`
      );
    }

    // Allow users to create their own Server & pass it in along with an options object.
    if (!options) {
      debug("Creating new Restify server");
      options = restifyServer || {};

      restifyServer = restify.createServer({
        log: createLogger(options)
      });
    } else {
      debug("Using the provided Restify server");
      const tmpLogger = createLogger(options);
      if (tmpLogger) {
        restifyServer.log = tmpLogger;
      }
    }

    // Create a wrapper around Restify, exposing the most common methods
    // and provide a 'restify' property for the ones we haven't exposed.
    const server = wrapper.wrapServer(restifyServer, _registry);

    // Apply the requestLogger, unless set to false!
    if (options.transom && options.transom.requestLogger !== false) {
      server.use(
        restify.plugins.requestLogger({
          log: server.log
        })
      );
    }

    // Put the transom configuration and API definition into a global registry.
    server.registry.set("transom-config", options);

    // Make sure we use the same default URI prefix everywhere.
    if (!server.registry.has("transom-config.definition.uri.prefix")) {
      server.registry.set("transom-config.definition.uri.prefix", "/api/v1");
    }
    // Confirm that the URI prefix starts with a /, but doesn't end in one.
    const prefix = server.registry.get("transom-config.definition.uri.prefix");
    if (!(prefix.length > 0 && prefix[0] === "/" && prefix[prefix.length - 1] !== "/")) {
      throw new Error(`Invalid URI prefix: ${prefix}`);
    }
    debug("Using URI prefix:", prefix);

    // Use CORS for handling cross-domain ajax requests.
    const corsOptions = server.registry.get("transom-config.transom.cors", {});
    if (corsOptions) {
      debug("Adding CORS handling");
      // Get an array of valid domain names for CORS and handle OPTIONS requests.
      corsOptions.origins = corsOptions.origins || ["*"];
      corsOptions.allowHeaders = (corsOptions.allowHeaders || []).concat(["authorization"]);

      const cors = corsMiddleware(corsOptions);
      server.pre(cors.preflight);
      server.use(cors.actual);
    }

    // Parse body parameters into the req.params object.
    const bodyOpts = server.registry.get("transom-config.transom.bodyParser", {});
    if (bodyOpts) {
      debug("Adding Restify BodyParser plugin");
      bodyOpts.mapParams = bodyOpts.mapParams === undefined ? true : bodyOpts.mapParams; // default true
      bodyOpts.limit = bodyOpts.limit === undefined ? 20000 : bodyOpts.limit; // default 20000
      server.use(restifyPlugins.bodyParser(bodyOpts));
    }

    // Parse query parameters into the req.params object.
    const queryOpts = server.registry.get("transom-config.transom.queryParser", {});
    if (queryOpts) {
      debug("Adding Restify QueryParser plugin");
      queryOpts.mapParams = queryOpts.mapParams === undefined ? true : queryOpts.mapParams; // default true
      server.use(restifyPlugins.queryParser(queryOpts));
    }

    // Parse url-encoded forms into the req.params object.
    const encBodyOpts = server.registry.get("transom-config.transom.urlEncodedBodyParser", {});
    if (encBodyOpts) {
      debug("Adding Restify UrlEncodedBodyParser plugin");
      encBodyOpts.mapParams = encBodyOpts.mapParams === undefined ? true : encBodyOpts.mapParams; // default true
      server.use(restifyPlugins.urlEncodedBodyParser(encBodyOpts));
    }

    // Parse cookies into the req.cookies object.
    const cookieParserOpts = server.registry.get("transom-config.transom.cookieParser", {});
    if (cookieParserOpts) {
      debug("Adding Restify CookieParser plugin");
      server.use(CookieParser.parse);
    }

    // Compress API responses with gzip.
    const gzipOpts = server.registry.get("transom-config.transom.gzipResponse", {});
    if (gzipOpts) {
      debug("Adding Restify GzipResponse plugin");
      server.use(restifyPlugins.gzipResponse(gzipOpts));
    }

    // Use fullResponse, adding a bunch of Headers to the response.
    const fullOpts = server.registry.get("transom-config.transom.fullResponse", {});
    if (fullOpts) {
      debug("Adding Restify FullResponse plugin");
      server.use(restifyPlugins.fullResponse(fullOpts));
    }

    // Provide a transom icon for API GET requests from a browser.
    const faviconOpts = server.registry.get("transom-config.transom.favicon", {});
    if (faviconOpts) {
      debug("Adding Favicon support");
      faviconOpts.path = faviconOpts.path || path.join(__dirname, "images", "favicon.ico");
      server.use(favicon(faviconOpts.path));
    }

    // Create req.locals *before* initializing all our plugins!
    server.use((req, res, next) => {
      debug("Initializing req.locals and req.session");
      req.locals = req.locals || {}; // Required by many of our API methods.
      req.session = req.session || {}; // required by FacebookStrategy.
      next();
    });

    // Configure each registered plugin, in the order they've been added.
    const pluginInitPromises = [];
    for (const each of _plugins) {
      debug("Initializing Transom plugin:", each.plugin.constructor.name);
      pluginInitPromises.push(() => each.plugin.initialize(server, each.options));
    }

    // All the initialize is done here
    serial(pluginInitPromises)
      .then(() => {
        // run preStart each registered plugin, in the order they've been added.
        const preStartPromises = [];
        for (const each of _plugins) {
          if (each.plugin.preStart) {
            debug("Prestarting Transom plugin:", each.plugin.constructor.name);
            preStartPromises.push(() => each.plugin.preStart(server, each.options));
          }
        }
        return serial(preStartPromises);
      })
      .then(() => {
        // Log all the routes to the debug output, if enabled.
        if (debug.enabled && server.router && server.router.mounts) {
          Object.keys(server.router.mounts).forEach(key => {
            const mount = server.router.mounts[key];
            if (mount.spec) {
              debug(`${mount.spec.method}\t${mount.spec.path}`);
            }
          });
        }
        debug("Transom plugins initialized");
        resolve(server);
      })
      .catch(err => {
        console.error("transom:core Error initializing plugins ", err);
        reject(err);
      });
  });
}; // end initialize

module.exports = TransomCore;
