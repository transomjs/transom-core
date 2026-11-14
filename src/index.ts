import crypto from "crypto";
import path from "path";
import type { Server } from "http";
import type { AddressInfo } from "net";
import bunyan from "bunyan";
import type Logger from "bunyan";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import createDebug from "debug";
import express from "express";
import type { ErrorRequestHandler, Express, Request, RequestHandler } from "express";
import favicon from "serve-favicon";
import semver from "semver";
import PocketRegistry from "pocket-registry";
import { wrapServer } from "./wrapper";

const debug = createDebug("transom:core");

/** The request properties transom-core adds; see TransomCore.TransomRequestExtras. */
type CoreRequest = Request & {
  id?: string;
  log?: Logger;
  locals?: Record<string, unknown>;
  session?: Record<string, unknown>;
};

function createLogger(options: TransomCore.TransomApiDefinition): Logger | undefined {
  let bunyanLogger: Logger | undefined;
  if (options.transom && options.transom.requestLogger) {
    const requestLoggerOpts = options.transom.requestLogger;
    requestLoggerOpts.name = requestLoggerOpts.name || "TransomJS";
    // Use the provided logger, or create a default one.
    bunyanLogger =
      requestLoggerOpts.log ||
      // Boundary: the options object is passed to bunyan as-is, as before; name is set above.
      bunyan.createLogger(requestLoggerOpts as Logger.LoggerOptions);
  }
  return bunyanLogger;
}

// Bunyan request logger middleware for Express
function requestLoggerMiddleware(log: Logger): RequestHandler {
  return function (request, res, next) {
    const req = request as CoreRequest;
    const reqId = crypto.randomUUID();
    req.id = reqId;
    req.log = log.child({ req_id: reqId });

    req.log.info(
      {
        method: req.method,
        url: req.url,
        headers: req.headers,
      },
      "request started",
    );

    next();
  };
}

/** Gives an inline middleware its Express parameter types (use() is overloaded, so they aren't inferred). */
function handler(fn: RequestHandler): RequestHandler {
  return fn;
}

// Process an array of Promise factories serially, discard the results.
function serial(promiseArray: Array<() => unknown>): Promise<unknown> {
  return promiseArray.reduce<Promise<unknown>>((acc, current) => {
    return acc.then(current);
  }, Promise.resolve());
}

// Route metadata utility function
function withMeta(metadata: unknown, handler: RequestHandler): RequestHandler;
function withMeta(metadata: unknown, handler: ErrorRequestHandler): RequestHandler;
function withMeta(
  metadata: unknown,
  handler: RequestHandler | ErrorRequestHandler,
): RequestHandler {
  return (req, res, next) => {
    res.locals.routeMeta = metadata;
    if (handler.length === 4) {
      // Error handler, called with a null error.
      (handler as ErrorRequestHandler)(null, req, res, next);
    } else {
      (handler as RequestHandler)(req, res, next);
    }
  };
}

interface PluginEntry {
  plugin: TransomCore.TransomPlugin<object>;
  options: object;
}

// A single registry and plugins array, shared by every TransomCore instance and
// reset whenever a new one is created.
let _registry: TransomCore.Registry;
let _plugins: PluginEntry[];

function pluginName(plugin: object): string {
  return plugin.constructor.name;
}

/**
 * Builds an Express server from an API definition and a list of plugins.
 *
 * @example
 * const transom = new TransomCore();
 * transom.configure(somePlugin, pluginOptions);
 * const server = await transom.initialize(apiDefinition);
 * server.listen(7000);
 */
class TransomCore {
  /** Route metadata utility: sets res.locals.routeMeta, then calls the handler. */
  static withMeta = withMeta;

  constructor() {
    // Initialize on create.
    // Boundary: the typed Registry describes pocket-registry's get/set by key.
    _registry = new PocketRegistry() as unknown as TransomCore.Registry;
    _plugins = [];
  }

  /** Pre-initialize registry access. After initialize(), use server.registry. */
  get registry(): TransomCore.Registry {
    return _registry;
  }

  /**
   * Adds a plugin. Plugins are initialized in the order they're configured.
   * `options` is checked against the options type of the plugin's initialize().
   */
  configure<P extends TransomCore.TransomPlugin<never>>(plugin: P, options?: TransomCore.PluginOptions<P>): void {
    debug("Adding Transom plugin:", pluginName(plugin));
    _plugins.push({
      // Boundary: each plugin is called back with the options it was configured with.
      plugin: plugin as TransomCore.TransomPlugin<object>,
      options: options || {},
    });
  }

  /**
   * Creates the server (or uses the one passed in), applies the default middleware,
   * then initializes every plugin and runs their preStart hooks, in order.
   */
  initialize(definition?: TransomCore.TransomApiDefinition): Promise<TransomCore.TransomServer>;
  initialize(
    server: Express,
    definition: TransomCore.TransomApiDefinition,
  ): Promise<TransomCore.TransomServer>;
  initialize(
    serverOrDefinition?: Express | TransomCore.TransomApiDefinition,
    definition?: TransomCore.TransomApiDefinition,
  ): Promise<TransomCore.TransomServer> {
    return new Promise((resolve, reject) => {
      // Fail nicely on old versions of Node.
      const minNodeVersion = "18.0.0";
      if (semver.lte(process.version, minNodeVersion)) {
        throw new Error(
          `TransomJS doesn't support NodeJS versions older than ${minNodeVersion}, currently running ${process.version}.`,
        );
      }

      // Allow users to create their own Server & pass it in along with an options object.
      let expressServer: Express & { log?: Logger };
      let options: TransomCore.TransomApiDefinition;
      if (!definition) {
        debug("Creating new Express server");
        // Boundary: with one argument, it's the API definition.
        options = (serverOrDefinition || {}) as TransomCore.TransomApiDefinition;

        expressServer = express();
        const logger = createLogger(options);
        if (logger) {
          expressServer.log = logger;
        }
      } else {
        debug("Using the provided Express server");
        options = definition;
        // Boundary: with two arguments, the first is the Express server.
        expressServer = serverOrDefinition as Express & { log?: Logger };
        const tmpLogger = createLogger(options);
        if (tmpLogger) {
          expressServer.log = tmpLogger;
        }
      }

      options.transom = options.transom || {};

      // Warn the developer if running with a non-zero timezone offset.
      const suppressTimezoneWarning = options.transom.suppressTimezoneWarning || false;
      const offset = new Date().getTimezoneOffset();
      if (!suppressTimezoneWarning && offset !== 0) {
        const parts = (process.argv[1] ?? "").split(path.sep);
        const entryFile = parts[parts.length - 1];
        const line = "*******************************************************************";
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
      const server = wrapServer(expressServer, _registry);

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
      if (!(prefix.length > 0 && prefix[0] === "/" && prefix[prefix.length - 1] !== "/")) {
        throw new Error(`Invalid URI prefix: ${prefix}`);
      }
      debug("Using URI prefix:", prefix);

      // Use CORS for handling cross-domain ajax requests.
      const corsOptions = server.registry.get("transom-config.transom.cors", {});
      if (corsOptions) {
        debug("Adding CORS handling");

        // Default CORS configuration
        const defaultCorsOptions = {
          origin: "*",
          allowedHeaders: ["authorization"],
          credentials: true,
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
          preflightContinue: false,
          optionsSuccessStatus: 200,
        };

        // Handle origins specifically - user can provide 'origins' or 'origin'
        let origin: TransomCore.CorsOptions["origin"] = defaultCorsOptions.origin;
        if (corsOptions.origins) {
          origin =
            corsOptions.origins.length === 1 && corsOptions.origins[0] === "*"
              ? "*"
              : corsOptions.origins;
        } else if (corsOptions.origin !== undefined) {
          origin = corsOptions.origin;
        }

        // Handle allowedHeaders - merge user headers with defaults
        let allowedHeaders = [...defaultCorsOptions.allowedHeaders];
        if (corsOptions.allowHeaders) {
          // Combine user headers with defaults, removing duplicates
          allowedHeaders = [...new Set([...allowedHeaders, ...corsOptions.allowHeaders])];
        } else if (corsOptions.allowedHeaders) {
          allowedHeaders = [...new Set([...allowedHeaders, ...corsOptions.allowedHeaders])];
        }

        // Merge user options with defaults, with user options taking precedence
        const expressCorsOptions = {
          ...defaultCorsOptions,
          ...corsOptions,
          origin,
          allowedHeaders,
        };

        server.use(cors(expressCorsOptions));
      }

      // Parse body parameters into the req.body object.
      const bodyOpts = server.registry.get("transom-config.transom.bodyParser", {});
      if (bodyOpts) {
        debug("Adding Express JSON body parser");
        const limit = bodyOpts.limit === undefined ? "20kb" : bodyOpts.limit;
        server.use(express.json({ limit }));

        // If mapParams is enabled, copy body to params
        if (bodyOpts.mapParams !== false) {
          server.use(handler((req, _res, next) => {
            Object.assign(req.params, req.body);
            next();
          }));
        }
      }

      // Parse query parameters - built into Express, just need to map to params if requested
      const queryOpts = server.registry.get("transom-config.transom.queryParser", {});
      if (queryOpts) {
        debug("Adding query parameter mapping");
        if (queryOpts.mapParams !== false) {
          server.use(handler((req, _res, next) => {
            Object.assign(req.params, req.query);
            next();
          }));
        }
      }

      // Parse url-encoded forms into the req.body object.
      const encBodyOpts = server.registry.get("transom-config.transom.urlEncodedBodyParser", {});
      if (encBodyOpts) {
        debug("Adding Express URL-encoded body parser");
        const limit = encBodyOpts.limit === undefined ? "20kb" : encBodyOpts.limit;
        server.use(express.urlencoded({ extended: true, limit }));

        // If mapParams is enabled, copy body to params
        if (encBodyOpts.mapParams !== false) {
          server.use(handler((req, _res, next) => {
            Object.assign(req.params, req.body);
            next();
          }));
        }
      }

      // Parse cookies into the req.cookies object.
      const cookieParserOpts = server.registry.get("transom-config.transom.cookieParser", {});
      if (cookieParserOpts) {
        debug("Adding cookie parser");
        server.use(cookieParser());
      }

      // Compress API responses with gzip.
      const gzipOpts = server.registry.get("transom-config.transom.gzipResponse", {});
      if (gzipOpts) {
        debug("Adding compression");
        server.use(compression(gzipOpts));
      }

      // Use fullResponse, adding a bunch of Headers to the response.
      const fullOpts = server.registry.get("transom-config.transom.fullResponse", {});
      if (fullOpts) {
        debug("Adding full response headers");
        server.use(handler((req, res, next) => {
          res.setHeader("X-Powered-By", "Transom");
          res.setHeader("X-Request-Id", (req as CoreRequest).id || "unknown");
          next();
        }));
      }

      // Provide a transom icon for API GET requests from a browser.
      const faviconOpts = server.registry.get("transom-config.transom.favicon", {});
      if (faviconOpts) {
        debug("Adding Favicon support");
        // The compiled code runs from dist/, and images/ sits beside it at the package root.
        faviconOpts.path = faviconOpts.path || path.join(__dirname, "..", "images", "favicon.ico");
        server.use(favicon(faviconOpts.path));
      }

      // Create req.locals *before* initializing all our plugins!
      server.use(handler((request, _res, next) => {
        debug("Initializing req.locals and req.session");
        const req = request as CoreRequest;
        req.locals = req.locals || {}; // Required by many of our API methods.
        req.session = req.session || {}; // required by FacebookStrategy.
        next();
      }));

      // Configure each registered plugin, in the order they've been added.
      const pluginInitPromises: Array<() => unknown> = [];
      for (const each of _plugins) {
        debug("Initializing Transom plugin:", pluginName(each.plugin));
        pluginInitPromises.push(() => each.plugin.initialize(server, each.options));
      }

      // All the initialize is done here
      serial(pluginInitPromises)
        .then(() => {
          // run preStart each registered plugin, in the order they've been added.
          const preStartPromises: Array<() => unknown> = [];
          for (const each of _plugins) {
            const preStart = each.plugin.preStart;
            if (preStart) {
              debug("Prestarting Transom plugin:", pluginName(each.plugin));
              preStartPromises.push(() => preStart.call(each.plugin, server, each.options));
            }
          }
          return serial(preStartPromises);
        })
        .then(() => {
          // Log all the routes to the debug output, if enabled.
          // Express types its private _router as any; this is the part we read.
          const router: ExpressRouter | undefined = server.express._router;
          if (debug.enabled && router) {
            router.stack.forEach((middleware) => {
              if (middleware.route) {
                const methods = Object.keys(middleware.route.methods);
                methods.forEach((method) => {
                  debug(`${method.toUpperCase()}\t${middleware.route?.path}`);
                });
              }
            });
          }
          debug("Transom plugins initialized");
          resolve(server);
        })
        .catch((err: unknown) => {
          console.error("transom:core Error initializing plugins ", err);
          reject(err);
        });
    });
  } // end initialize
}

/** Express 4's private router, read only to log the routes when debugging. */
interface ExpressRouter {
  stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
}

declare namespace TransomCore {
  /**
   * Registry keys and their value types. transom-core fills in the keys it sets; add
   * your own (and your plugins') with declaration merging:
   *
   * @example
   * declare module "@transomjs/transom-core" {
   *   interface RegistryMap { sequelize: Sequelize }
   * }
   */
  interface RegistryMap {
    /** The API definition passed to initialize(). */
    "transom-config": TransomApiDefinition;
    /** Defaults to "/api/v1". Starts with "/" and never ends with one. */
    "transom-config.definition.uri.prefix": string;
    "transom-config.transom.cors": false | CorsOptions;
    "transom-config.transom.bodyParser": false | ParserOptions;
    "transom-config.transom.queryParser": false | ParserOptions;
    "transom-config.transom.urlEncodedBodyParser": false | ParserOptions;
    "transom-config.transom.cookieParser": false | Record<string, unknown>;
    "transom-config.transom.gzipResponse": false | compression.CompressionOptions;
    "transom-config.transom.fullResponse": false | Record<string, unknown>;
    "transom-config.transom.favicon": false | FaviconOptions;
  }

  /** The value type for `K`: from RegistryMap for a known key, otherwise unknown. */
  type RegistryValue<K extends string> = K extends keyof RegistryMap ? RegistryMap[K] : unknown;

  /**
   * The pocket-registry instance shared by transom-core and its plugins. Keys are lodash
   * property paths, so "transom-config.definition.uri.prefix" reads into the stored
   * definition.
   */
  interface Registry {
    /** Throws if the key is missing. */
    get<K extends string>(key: K): RegistryValue<K>;
    /** Returns the default when the key is missing. */
    get<K extends string>(key: K, defaultValue: RegistryValue<K>): RegistryValue<K>;
    get<K extends string, D>(key: K, defaultValue: D): RegistryValue<K> | D;
    /** Throws if the key already exists or the value is undefined. */
    set<K extends string>(key: K, value: RegistryValue<K>): void;
    has(key: string): boolean;
    remove(key: string): void;
    /** The top-level keys. */
    readonly keys: string[];
  }

  type Middleware = RequestHandler | ErrorRequestHandler;
  /** Express accepts handlers and arrays of handlers, nested to any depth. */
  type RouteArg = Middleware | readonly RouteArg[];
  type RoutePath = string | RegExp | ReadonlyArray<string | RegExp>;
  /** The first overload types inline handlers; the second accepts error handlers and nested arrays. */
  interface RouteMethod {
    (path: RoutePath, ...handlers: RequestHandler[]): Express;
    (path: RoutePath, ...handlers: RouteArg[]): Express;
  }

  /**
   * The server returned by initialize() and passed to every plugin: the Express app,
   * wrapped. Route methods emit a `transom.route.<method>` event on the Express app
   * before registering the route.
   */
  interface TransomServer {
    readonly registry: Registry;
    /** The wrapped Express app, for anything the wrapper doesn't expose. */
    readonly express: Express;
    /** @deprecated Use `express`. */
    readonly restify: Express;
    /** Set when `transom.requestLogger` is configured (or a logger is passed in). */
    log: Logger | undefined;
    name: string | undefined;
    url: string | undefined;
    domain: string | undefined;

    get: RouteMethod;
    head: RouteMethod;
    post: RouteMethod;
    put: RouteMethod;
    patch: RouteMethod;
    /** Express's delete(). */
    del: RouteMethod;
    options: RouteMethod;
    /** @deprecated Use `options`. */
    opts: RouteMethod;
    /** @deprecated Use `use`. */
    pre(...handlers: RouteArg[]): Express;
    use(...handlers: RequestHandler[]): Express;
    use(path: RoutePath, ...handlers: RequestHandler[]): Express;
    use(...handlers: RouteArg[]): Express;
    use(path: RoutePath, ...handlers: RouteArg[]): Express;
    listen: Express["listen"];
    /** Closes `express.server` if the caller set one; otherwise resolves immediately. */
    close(callback?: (err?: Error) => void): Server | Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): Express;
    param: Express["param"];
    /** @deprecated Express can't remove routes; this does nothing. */
    rm(...args: unknown[]): TransomServer;
    /** The address of `express.server` if the caller set one, otherwise null. */
    address(): AddressInfo | string | null;
    /** @deprecated Express doesn't track this; always 0. */
    inflightRequests(): number;
    getDebugInfo(): { routes: number; env: unknown };
    toString(): string;
  }

  /**
   * A plugin passed to configure(). initialize() is called for each plugin in order
   * (awaited if it returns a promise), then preStart() for each plugin that has one.
   */
  interface TransomPlugin<Options extends object = Record<string, unknown>> {
    initialize(server: TransomServer, options: Options): unknown;
    preStart?(server: TransomServer, options: Options): unknown;
  }

  /** The options type a plugin's initialize() takes. */
  type PluginOptions<P extends TransomPlugin<never>> = Parameters<P["initialize"]>[1];

  /**
   * Properties transom-core adds to every request. transom-core doesn't augment
   * Express's Request type globally, so you can declare these the way your app uses them.
   */
  interface TransomRequestExtras {
    /** randomUUID() per request, set by the request logger. */
    id?: string;
    /** A bunyan child logger with req_id, set by the request logger. */
    log?: Logger;
    /** Request-scoped storage, created before any plugin middleware runs. */
    locals: Record<string, unknown>;
    /** Created before any plugin middleware runs, unless a session middleware set it. */
    session: Record<string, unknown>;
  }

  interface ParserOptions {
    /** Defaults to "20kb". */
    limit?: string | number;
    /** Copy the parsed values onto req.params. Defaults to true. */
    mapParams?: boolean;
  }

  /** The `cors` package's options, plus the Restify-era `origins` and `allowHeaders`. */
  interface CorsOptions extends Omit<cors.CorsOptions, "origin" | "allowedHeaders"> {
    origins?: string[];
    origin?: string | boolean | RegExp | Array<string | boolean | RegExp>;
    /** Added to the default ["authorization"]. */
    allowHeaders?: string[];
    /** Added to the default ["authorization"]. */
    allowedHeaders?: string[];
  }

  interface FaviconOptions {
    /** Defaults to the TransomJS icon. */
    path?: string;
  }

  interface RequestLoggerOptions extends Partial<Logger.LoggerOptions> {
    /** Use this logger instead of creating one. */
    log?: Logger;
  }

  /** The `transom` node of the API definition: transom-core's own settings. Set an entry to false to turn it off. */
  interface TransomOptions {
    requestLogger?: false | RequestLoggerOptions;
    cors?: false | CorsOptions;
    bodyParser?: false | ParserOptions;
    queryParser?: false | ParserOptions;
    urlEncodedBodyParser?: false | ParserOptions;
    cookieParser?: false | Record<string, unknown>;
    gzipResponse?: false | compression.CompressionOptions;
    fullResponse?: false | Record<string, unknown>;
    favicon?: false | FaviconOptions;
    suppressTimezoneWarning?: boolean;
  }

  /** The object passed to initialize(). Plugins read their own sections of `definition`. */
  interface TransomApiDefinition {
    note?: string;
    name?: string;
    version?: string;
    transom?: TransomOptions;
    definition?: {
      uri?: { prefix?: string };
      [section: string]: unknown;
    };
    [key: string]: unknown;
  }
}

export = TransomCore;
