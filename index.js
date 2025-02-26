"use strict";

// const bunyan = require("bunyan");
// const corsMiddleware = require("restify-cors-middleware2");
const debug = require("debug")("transom:core");
const favicon = require("serve-favicon");
const path = require("path");
const fastify = require("fastify");
const compress = require('@fastify/compress');
const cookie = require('@fastify/cookie');
const formbody = require('@fastify/formbody');
const multipart = require('@fastify/multipart');
const queryParser = require('query-parser');
const cors = require('@fastify/cors');
// const restify = require("restify");
// const restifyPlugins = require("restify").plugins;
// const CookieParser = require("restify-cookies");
const semver = require("semver");
const PocketRegistry = require("pocket-registry");
const wrapper = require("./wrapper");

// function createLogger(options) {
//   let bunyanLogger;
//   if (options.transom && options.transom.requestLogger) {
//     const requestLoggerOpts = options.transom.requestLogger || {};
//     requestLoggerOpts.name = requestLoggerOpts.name || "TransomJS";
//     // Use the provided logger, or create a default one.
//     bunyanLogger =
//       requestLoggerOpts.log || bunyan.createLogger(requestLoggerOpts);
//   }
//   return bunyanLogger;
// }

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

TransomCore.prototype.initialize = function (fastifyServer, options) {
  return new Promise(async (resolve, reject) => {
    // Fail nicely on old versions of Node.
    const minNodeVersion = "18.0.0";
    if (semver.lte(process.version, minNodeVersion)) {
      throw new Error(
        `TransomJS doesn't support NodeJS versions older than ${minNodeVersion}, currently running ${process.version}.`
      );
    }

    // Allow users to create their own Server & pass it in along with an options object.
    // if (!options) {
    //   debug("Creating new Fastify server");
    //   options = fastifyServer || {};
    // 
    //   fastifyServer = fastify.createServer({
    //     log: createLogger(options),
    //   });
    // } else {
    //   debug("Using the provided Fastify server");
    //   const tmpLogger = createLogger(options);
    //   if (tmpLogger) {
    //     fastifyServer.log = tmpLogger;
    //   }
    // }

    options.transom = options.transom || {};

    // Warn the developer if running with a non-zero timezone offset.
    const suppressTimezoneWarning = options.transom.suppressTimezoneWarning || false;
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

    fastify.decorate('registry', {
      getter() {
        return _registry;
      }
    });

    // Create a wrapper around Fastify, exposing the most common methods
    // and provide a 'fastify' property for the ones we haven't exposed.
    const server = wrapper.wrapServer(fastifyServer);

    // Apply the requestLogger, unless set to false!
    // if (options.transom && options.transom.requestLogger !== false) {
    //   server.use(
    //     restify.plugins.requestLogger({
    //       log: server.log,
    //     })
    //   );
    // }

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
      // https://www.npmjs.com/package/@fastify/cors
      await fastify.register(cors, corsOptions)
    }

    // Parse body parameters into the req.params object.
    const bodyOpts = server.registry.get(
      "transom-config.transom.bodyParser",
      {}
    );
    if (bodyOpts) {
      // Add a parser for the content type application/x-www-form-urlencoded.
      debug("Adding Fastify formbody (BodyParser) plugin");
      bodyOpts.bodyLimit = bodyOpts.limit || 20000;

      await fastify.register(formbody, bodyOpts);
    }
    const multipartOpts = server.registry.get(
      "transom-config.transom.multipart",
      {}
    );
    if (multipartOpts) {
      debug("Adding Fastify Multipart plugin");
      await fastify.register(multipart, multipartOpts);
    }

    // Parse query parameters into the req.params object.
    const queryOpts = server.registry.get(
      "transom-config.transom.queryParser",
      {}
    );
    if (queryOpts) {
      debug("Adding Fastify fastify-qs (QueryParser) plugin");
      fastify.register(queryParser, queryOpts)
    }

    // Parse url-encoded forms into the req.params object.
    // const encBodyOpts = server.registry.get(
    //   "transom-config.transom.urlEncodedBodyParser",
    //   {}
    // );
    // if (encBodyOpts) {
    //   debug("Adding Restify UrlEncodedBodyParser plugin");
    //   encBodyOpts.mapParams =
    //     encBodyOpts.mapParams === undefined ? true : encBodyOpts.mapParams; // default true
    //   server.use(restifyPlugins.urlEncodedBodyParser(encBodyOpts));
    // }

    // Parse cookies into the req.cookies object.
    const cookieParserOpts = server.registry.get(
      "transom-config.transom.cookieParser",
      {}
    );
    if (cookieParserOpts) {
      debug("Adding Fastify CookieParser plugin");
      // {
      //   secret: "my-secret", // for cookies signature
      //   hook: 'onRequest', // set to false to disable cookie autoparsing or 
      //                     // set autoparsing on any of the following hooks: 
      //                     // 'onRequest', 'preParsing', 'preHandler', 'preValidation'. 
      //                     // default: 'onRequest'
      //   parseOptions: {}  // options for parsing cookies
      // }
      fastify.register(cookie, cookieParserOpts);
    }

    // Compress API responses with gzip.
    const gzipOpts = server.registry.get(
      "transom-config.transom.compress",
      { global: true }
    );
    if (gzipOpts) {
      debug("Adding Fastify Compress plugin");
      await fastify.register(compress, gzipOpts);
    }

    // Use fullResponse, adding a bunch of Headers to the response.
    // const fullOpts = server.registry.get(
    //   "transom-config.transom.fullResponse",
    //   {}
    // );
    // if (fullOpts) {
    //   debug("Adding Restify FullResponse plugin");
    //   server.use(restifyPlugins.fullResponse(fullOpts));
    // }

    // Provide a transom icon for API GET requests from a browser.
    const faviconOpts = server.registry.get(
      "transom-config.transom.favicon",
      {}
    );
    if (faviconOpts) {
      debug("Adding Favicon support");
      faviconOpts.path = faviconOpts.path || path.join(__dirname, "images");
      faviconOpts.name = faviconOpts.name || "favicon.ico";
      faviconOpts.maxAge = faviconOpts.maxAge || 3600;

      fastify.register(require('fastify-favicon'), faviconOpts);
    }

    // Create req.locals *before* initializing all our plugins!
    // Required by many of our API methods.
    debug("Initializing req.locals and req.session");
    fastify.decorateRequest('locals', {
      getter() {
        if (!this._locals) {
          this._locals = {};
        }
        return this._locals;
      },
      setter(value) {
        this._locals = value;
      }
    });
  
    // Required by FacebookStrategy.
    fastify.decorateRequest('session', {
      getter() {
        if (!this._session) {
          this._session = {};
        }
        return this._session;
      },
      setter(value) {
        this._session = value;
      }
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
        if (debug.enabled && server.router && server.router.mounts) {
          Object.keys(server.router.mounts).forEach((key) => {
            const mount = server.router.mounts[key];
            if (mount.spec) {
              debug(`${mount.spec.method}\t${mount.spec.path}`);
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
