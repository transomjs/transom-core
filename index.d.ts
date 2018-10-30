import PocketRegistry from 'pocket-registry';
import Logger = require('bunyan');
import {Options as CorsOptions} from 'restify-cors-middleware';
import {plugins, RequestHandler, Server as RestifyServer} from 'restify';
import BodyParserOptions = plugins.BodyParserOptions;
import QueryParserOptions = plugins.QueryParserOptions;
import UrlEncodedBodyParserOptions = plugins.UrlEncodedBodyParserOptions;

interface Plugin<Options> {
  initialize(server: Server, options: Options): void;
  constructor: {
    name: string
  }
}

interface Server {
  registry: PocketRegistry<{
    'transom-config': TransomOptions
  }>;
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
  registry: PocketRegistry;
  private plugins: Array<Plugin<any>>;
  private createLogger(options: TransomOptions): Logger;
  configure<PluginOptions = any>(plugin: Plugin<PluginOptions>, options: PluginOptions): void;
  initialize<Server = RestifyServer>(server: Server, options?: TransomOptions): Promise<Server>;
}

export default TransomCore;