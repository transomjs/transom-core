import type { Server } from "http";
import type { AddressInfo } from "net";
import type { Express } from "express";
import type Logger from "bunyan";
import type TransomCore = require("./index");

/**
 * The Express app as the wrapper sees it. Besides Express itself, it may carry a bunyan
 * logger, an http server (set by the caller), and Restify-era properties.
 */
type WrappedApp = Express & {
  name?: string;
  url?: string;
  domain?: string;
  log?: Logger;
  server?: Server;
  del?: (...args: unknown[]) => unknown;
  opts?: (...args: unknown[]) => unknown;
  _router?: { stack: unknown[] };
};

/** Express's route methods have many overloads; the wrapper passes arguments straight through. */
type Passthrough = (...args: unknown[]) => unknown;

/**
 * Forwards the caller's arguments unchanged, as the JavaScript version did. This is the
 * one typing boundary in the wrapper: `R` is what the forwarded Express method returns.
 */
function call<R>(method: unknown, thisArg: unknown, args: unknown[]): R {
  return (method as Passthrough).apply(thisArg, args) as R;
}

/**
 * Wraps the Express app to expose the common methods, emit `transom.route.<method>`
 * events when routes are registered, and give plugins access to the registry.
 *
 * A plain function, not an arrow, so existing `new wrapServer(...)` calls keep working.
 */
export function wrapServer(expressApp: Express, _registry: TransomCore.Registry): TransomCore.TransomServer {
  const _express = expressApp as WrappedApp;
  const server: TransomCore.TransomServer = {
    get registry() {
      // Post-initialize registry access.
      return _registry;
    },
    get restify() {
      console.warn("The 'restify' property is deprecated. Use 'express' instead!");
      return _express;
    },
    get express() {
      return _express;
    },
    get name() {
      return _express.name;
    },
    set name(value) {
      _express.name = value;
    },
    get url() {
      return _express.url;
    },
    set url(value) {
      _express.url = value;
    },
    get domain() {
      return _express.domain;
    },
    set domain(value) {
      _express.domain = value;
    },
    get log() {
      return _express.log;
    },
    set log(value) {
      _express.log = value;
    },
    get(...args: unknown[]) {
      _express.emit("transom.route.get", args);
      return call<Express>(_express.get, _express, args);
    },
    head(...args: unknown[]) {
      _express.emit("transom.route.head", args);
      return call<Express>(_express.head, _express, args);
    },
    post(...args: unknown[]) {
      _express.emit("transom.route.post", args);
      return call<Express>(_express.post, _express, args);
    },
    put(...args: unknown[]) {
      _express.emit("transom.route.put", args);
      return call<Express>(_express.put, _express, args);
    },
    patch(...args: unknown[]) {
      _express.emit("transom.route.patch", args);
      return call<Express>(_express.patch, _express, args);
    },
    del(...args: unknown[]) {
      _express.emit("transom.route.del", args);
      // Express has delete(); some other servers have del().
      if (typeof _express.delete === "function") {
        return call<Express>(_express.delete, _express, args);
      } else if (typeof _express.del === "function") {
        return call<Express>(_express.del, _express, args);
      }
      return _express;
    },
    opts(...args: unknown[]) {
      _express.emit("transom.route.opts", args);
      this.log?.warn("The 'opts' method is deprecated. Use 'options' instead!");
      // Express uses options() instead of opts().
      if (typeof _express.options === "function") {
        return call<Express>(_express.options, _express, args);
      } else if (typeof _express.opts === "function") {
        return call<Express>(_express.opts, _express, args);
      }
      return _express;
    },
    options(...args: unknown[]) {
      _express.emit("transom.route.options", args);
      return call<Express>(_express.options, _express, args);
    },
    pre(...args: unknown[]) {
      this.log?.warn("The 'pre' method is deprecated. Use 'use' instead!");
      // Express doesn't have pre(), so treat it like use().
      return call<Express>(_express.use, _express, args);
    },
    use(...args: unknown[]) {
      return call<Express>(_express.use, _express, args);
    },
    listen(...args: unknown[]) {
      return call<Server>(_express.listen, _express, args);
    },
    close(...args: unknown[]) {
      // Express apps don't have close(), but the http server does, once listening.
      if (_express.server) {
        return call<Server>(_express.server.close, _express.server, args);
      }
      return Promise.resolve();
    },
    on(...args: unknown[]) {
      return call<Express>(_express.on, _express, args);
    },
    param(...args: unknown[]) {
      return call<Express>(_express.param, _express, args);
    },
    rm(...args: unknown[]) {
      _express.emit("transom.route.rm", args);
      // Express can't remove routes; the method is kept for compatibility.
      this.log?.warn("The 'rm' method is not implemented in Express. No action taken.");
      return server;
    },
    address(): AddressInfo | string | null {
      // Express apps don't have address(), but the http server does.
      if (_express.server) {
        return _express.server.address();
      }
      return null;
    },
    inflightRequests() {
      // Express doesn't track this; return 0 for compatibility.
      this.log?.warn("The 'inflightRequests' method is not implemented in Express. Returning 0.");
      return 0;
    },
    getDebugInfo() {
      return {
        routes: _express._router ? _express._router.stack.length : 0,
        env: _express.get("env"),
      };
    },
    toString() {
      return _express.toString();
    },
  };
  return server;
}
