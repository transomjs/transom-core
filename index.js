"use strict";

const bunyan = require("bunyan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const debug = require("debug")("transom:core");
const express = require("express");
const favicon = require("serve-favicon");
const path = require("path");
const semver = require("semver");
const PocketRegistry = require("pocket-registry");
const wrapper = require("./wrapper");

function createLogger(options) {
  let bunyanLogger;
  if (options.transom && options.transom.requestLogger) {
    const requestLoggerOpts = options.transom.requestLogger || {};
    requestLoggerOpts.name = requestLoggerOpts.name || "TransomJS";
    // Use the provided logger, or create a default one.
    bunyanLogger =
      requestLoggerOpts.log || bunyan.createLogger(requestLoggerOpts);
  }
  return bunyanLogger;
}

// Bunyan request logger middleware for Express
function requestLoggerMiddleware(log) {
  return function (req, res, next) {
    const reqId = require("crypto").randomUUID();
    req.id = reqId;
    req.log = log.child({ req_id: reqId });

    req.log.info({
      method: req.method,
      url: req.url,
      headers: req.headers
    }, "request started");

    next();
  };
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
    get: function () {
      // Pre-initialize registry access.
      return _registry;
    },
  },
});

TransomCore.prototype.configure = function (plugin, options) {
  debug("Adding Transom plugin:", plugin.constructor.name);
  options = options || {};
  _plugins.push({
    plugin,
    options,
  });
};

TransomCore.prototype.initialize = function (expressServer, options) {
  return new Promise((resolve, reject) => {
    // Fail nicely on old versions of Node.
    const minNodeVersion = "18.0.0";
    if (semver.lte(process.version, minNodeVersion)) {
      throw new Error(
        `TransomJS doesn't support NodeJS versions older than ${minNodeVersion}, currently running ${process.version}.`
      );
    }

    // Allow users to create their own Server & pass it in along with an options object.
    if (!options) {
      debug("Creating new Express server");
      options = expressServer || {};

      expressServer = express();
      const logger = createLogger(options);
      if (logger) {
        expressServer.log = logger;
      }
    } else {
      debug("Using the provided Express server");
      const tmpLogger = createLogger(options);
      if (tmpLogger) {
        expressServer.log = tmpLogger;
      }
    }

    options.transom = options.transom || {};

    // Warn the developer if running with a non-zero timezone offset.
    const suppressTimezoneWarning =
      options.transom.suppressTimezoneWarning || false;
    const offset = new Date().getTimezoneOffset();
    if (!suppressTimezoneWarning && offset !== 0) {
      const parts = process.argv[1].split(path.sep);
      const entryFile = parts[parts.length - 1];
      const line =
        "*******************************************************************";
      const warningMsg = `
This Node process is running with a timezone offset of ${offset} minutes.
It's recommended to run the service with an offset of 0 minutes using the
following line at the top of your ${entryFile} before any Dates are used.

process.env.TZ = 'Etc/GMT';\n`;
      const yellow = "\x1b[33m%s\x1b[0m";
      const reset = "\x1b[0m";
      console.log(yellow, line + warningMsg + line, reset);
    }

    // Create a wrapper around Express, exposing the most common methods
    // and provide a 'express' property for the ones we haven't exposed.
    const server = wrapper.wrapServer(expressServer, _registry);

    // Apply the requestLogger, unless set to false!
    if (options.transom && options.transom.requestLogger !== false) {
      if (server.log) {
        server.use(requestLoggerMiddleware(server.log));
      }
    }

    // Put the transom configuration and API definition into a global registry.
    server.registry.set("transom-config", options);

    // Make sure we use the same default URI prefix everywhere.
    if (!server.registry.has("transom-config.definition.uri.prefix")) {
      server.registry.set("transom-config.definition.uri.prefix", "/api/v1");
    }
    // Confirm that the URI prefix starts with a /, but doesn't end in one.
    const prefix = server.registry.get("transom-config.definition.uri.prefix");
    if (
      !(
        prefix.length > 0 &&
        prefix[0] === "/" &&
        prefix[prefix.length - 1] !== "/"
      )
    ) {
      throw new Error(`Invalid URI prefix: ${prefix}`);
    }
    debug("Using URI prefix:", prefix);

    // Use CORS for handling cross-domain ajax requests.
    const corsOptions = server.registry.get("transom-config.transom.cors", {});
    if (corsOptions) {
      debug("Adding CORS handling");
      // Get an array of valid domain names for CORS and handle OPTIONS requests.
      const origins = corsOptions.origins || ["*"];
      const allowHeaders = (corsOptions.allowHeaders || []).concat([
        "authorization",
      ]);

      const expressCorsOptions = {
        origin: origins.length === 1 && origins[0] === "*" ? "*" : origins,
        allowedHeaders: allowHeaders,
        credentials: corsOptions.credentials !== false,
      };

      server.use(cors(expressCorsOptions));
    }

    // Parse body parameters into the req.body object.
    const bodyOpts = server.registry.get(
      "transom-config.transom.bodyParser",
      {}
    );
    if (bodyOpts) {
      debug("Adding Express JSON body parser");
      const limit = bodyOpts.limit === undefined ? "20kb" : bodyOpts.limit;
      server.use(express.json({ limit }));

      // If mapParams is enabled, copy body to params
      if (bodyOpts.mapParams !== false) {
        server.use((req, res, next) => {
          req.params = req.params || {};
          Object.assign(req.params, req.body);
          next();
        });
      }
    }

    // Parse query parameters - built into Express, just need to map to params if requested
    const queryOpts = server.registry.get(
      "transom-config.transom.queryParser",
      {}
    );
    if (queryOpts) {
      debug("Adding query parameter mapping");
      if (queryOpts.mapParams !== false) {
        server.use((req, res, next) => {
          req.params = req.params || {};
          Object.assign(req.params, req.query);
          next();
        });
      }
    }

    // Parse url-encoded forms into the req.body object.
    const encBodyOpts = server.registry.get(
      "transom-config.transom.urlEncodedBodyParser",
      {}
    );
    if (encBodyOpts) {
      debug("Adding Express URL-encoded body parser");
      const limit = encBodyOpts.limit === undefined ? "20kb" : encBodyOpts.limit;
      server.use(express.urlencoded({ extended: true, limit }));

      // If mapParams is enabled, copy body to params
      if (encBodyOpts.mapParams !== false) {
        server.use((req, res, next) => {
          req.params = req.params || {};
          Object.assign(req.params, req.body);
          next();
        });
      }
    }

    // Parse cookies into the req.cookies object.
    const cookieParserOpts = server.registry.get(
      "transom-config.transom.cookieParser",
      {}
    );
    if (cookieParserOpts) {
      debug("Adding cookie parser");
      server.use(cookieParser());
    }

    // Compress API responses with gzip.
    const gzipOpts = server.registry.get(
      "transom-config.transom.gzipResponse",
      {}
    );
    if (gzipOpts) {
      debug("Adding compression");
      server.use(compression(gzipOpts));
    }

    // Use fullResponse, adding a bunch of Headers to the response.
    const fullOpts = server.registry.get(
      "transom-config.transom.fullResponse",
      {}
    );
    if (fullOpts) {
      debug("Adding full response headers");
      server.use((req, res, next) => {
        res.setHeader("X-Powered-By", "Transom");
        res.setHeader("X-Request-Id", req.id || "unknown");
        next();
      });
    }

    // Provide a transom icon for API GET requests from a browser.
    const faviconOpts = server.registry.get(
      "transom-config.transom.favicon",
      {}
    );
    if (faviconOpts) {
      debug("Adding Favicon support");
      faviconOpts.path =
        faviconOpts.path || path.join(__dirname, "images", "favicon.ico");
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
      pluginInitPromises.push(() =>
        each.plugin.initialize(server, each.options)
      );
    }

    // All the initialize is done here
    serial(pluginInitPromises)
      .then(() => {
        // run preStart each registered plugin, in the order they've been added.
        const preStartPromises = [];
        for (const each of _plugins) {
          if (each.plugin.preStart) {
            debug("Prestarting Transom plugin:", each.plugin.constructor.name);
            preStartPromises.push(() =>
              each.plugin.preStart(server, each.options)
            );
          }
        }
        return serial(preStartPromises);
      })
      .then(() => {
        // Log all the routes to the debug output, if enabled.
        if (debug.enabled && server.express && server.express._router) {
          server.express._router.stack.forEach((middleware) => {
            if (middleware.route) {
              const methods = Object.keys(middleware.route.methods);
              methods.forEach((method) => {
                debug(`${method.toUpperCase()}\t${middleware.route.path}`);
              });
            }
          });
        }
        debug("Transom plugins initialized");
        resolve(server);
      })
      .catch((err) => {
        console.error("transom:core Error initializing plugins ", err);
        reject(err);
      });
  });
}; // end initialize

module.exports = TransomCore;
