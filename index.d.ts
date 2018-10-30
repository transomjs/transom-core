import PocketRegistry from 'pocket-registry';
import Logger = require('bunyan');
import {Options as CorsOptions} from 'restify-cors-middleware';
import {
  plugins,
  RequestHandler,
  RequestHandlerType, Route,
  RouteOptions,
  Server as RestifyServer,
  ServerOptions as RestifyOptions
} from 'restify';
import BodyParserOptions = plugins.BodyParserOptions;
import QueryParserOptions = plugins.QueryParserOptions;
import UrlEncodedBodyParserOptions = plugins.UrlEncodedBodyParserOptions;
import {ListenOptions, Socket} from 'net';

interface Plugin<Options> {
  initialize(server: Server, options: Options): void;
  constructor: {
    name: string
  }
}

interface Server {
  readonly registry: PocketRegistry<{
    'transom-config': Partial<TransomOptions>
  }>;
  readonly restify: RestifyServer;
  name: string;
  url: string;
  domain: string//?
  log: Logger
  // HACK: This was duplicated from the typings for restify. These may become antiquated.
  // This was needed to be done because TS cannot import method types on interfaces
  get(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  head(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  post(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  put(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  patch(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  del(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  opts(opts: string | RegExp | RouteOptions, ...handlers: RequestHandlerType[]): Route | boolean;
  pre(...pre: RequestHandlerType[]): Server;
  use(...handlers: RequestHandlerType[]): Server;
  listen(...args: any[]): any;
  close(callback?: () => any): any;
  // HACK: Duplicated from Server typings from `@types/node`
  listen(port?: number, hostname?: string, backlog?: number, listeningListener?: Function): RestifyServer;
  listen(port?: number, hostname?: string, listeningListener?: Function): RestifyServer;
  listen(port?: number, backlog?: number, listeningListener?: Function): RestifyServer;
  listen(port?: number, listeningListener?: Function): RestifyServer;
  listen(path: string, backlog?: number, listeningListener?: Function): RestifyServer;
  listen(path: string, listeningListener?: Function): RestifyServer;
  listen(options: ListenOptions, listeningListener?: Function): RestifyServer;
  listen(handle: any, backlog?: number, listeningListener?: Function): RestifyServer;
  listen(handle: any, listeningListener?: Function): RestifyServer;
  on(event: string, listener: (...args: any[]) => void): RestifyServer;
  on(event: "close", listener: () => void): RestifyServer;
  on(event: "connection", listener: (socket: Socket) => void): RestifyServer;
  on(event: "error", listener: (err: Error) => void): RestifyServer;
  on(event: "listening", listener: () => void): RestifyServer;
}

interface TransomLogOps extends Logger.LoggerOptions {
  log?: Logger,
}

interface TransomOptions {
  transom: {
    requestLogger: TransomLogOps | false;
    cors: Partial<CorsOptions>;
    bodyParser: BodyParserOptions;
    queryParser: QueryParserOptions;
    urlEncodedBodyParser: UrlEncodedBodyParserOptions;
    gzipResponse: RequestHandler;
    fullResponse: RequestHandler;
    favicon: {
      path: string
    }
  }
}

declare class TransomCore {
  readonly registry: PocketRegistry;
  private _registry: PocketRegistry;
  private _plugins: Array<Plugin<any>>;
  private createLogger(options: TransomOptions): Logger;
  configure<PluginOptions = any>(plugin: Plugin<PluginOptions>, options: PluginOptions): void;
  initialize<Server = RestifyServer>(server: Server, options?: TransomOptions): Promise<Server>;
}

export default TransomCore;
