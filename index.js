'use strict';

const favicon = require('serve-favicon');
const path = require('path');
const restify = require('restify');
const restifyPlugins = require('restify').plugins;
const PocketRegistry = require('pocket-registry');
const corsMiddleware = require('restify-cors-middleware');

function TransomCore() {

	const plugins = [];

	this.configure = function (plugin, options) {
		options = options || {};
		plugins.push({
			plugin,
			options
		});
	};

	this.initialize = function (server, options) {
		// Allow users to create their own Server & pass it in along with an options object.
		if (!options) {
			options = server || {};
			server = restify.createServer();
		}

		server.use(restify.requestLogger());

		server.registry = new PocketRegistry();
		server.registry.set('transom-options', options);

		// Get an array of valid domain names for CORS and handle OPTIONS requests.
		const corsOptions = server.registry.get('transom-options.api_definition.cors', {});
		corsOptions.origins = corsOptions.origins || ['*'];
		corsOptions.allowHeaders = (corsOptions.allowHeaders || []).concat(['authorization']);

		const cors = corsMiddleware(corsOptions);
		server.pre(cors.preflight);
		server.use(cors.actual);

		// Copy everything into req.params.
		server.use(restifyPlugins.bodyParser({
			mapParams: true,
			limit: 20000 // TODO: server option & test it.
		}));
		server.use(restifyPlugins.queryParser({
			mapParams: true
		}));
		server.use(restifyPlugins.urlEncodedBodyParser({
			mapParams: true
		}));

		server.use(restify.gzipResponse());
		server.use(restify.fullResponse());

		// Provide a transom icon for API GET requests from a browser.
		server.use(favicon(path.join(__dirname, 'images', 'favicon.ico')));

		// Create req.locals *before* initializing all our plugins!
		server.use(function (req, res, next) {
			req.locals = req.locals || {}; // Required by many of our API methods.
			req.session = req.session || {}; // required by FacebookStrategy.
			next();
		});

		console.log("Transom core initialize");
		try {
			// Setup each of our plugins, in the order they've been added.
			for (const pluginObj of plugins) {
				try {
					pluginObj.plugin.initialize(server, pluginObj.options);
				} catch (err) {
					console.error("Transom core initialize failed", err);
					throw err;
				}
			}
		} catch (err) {
			console.error("Transom core initialize failed", err);
			throw err;
		}
		return server;
	};
};

module.exports = new TransomCore();
