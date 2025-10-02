
# transom-core
Transom-core is a foundation for low-code REST API and realtime server development. Transom applications use metadata to configure pre-built and tested modules that allow developers to quickly piece together services that 'just work'! 

[![Build Status](https://travis-ci.org/transomjs/transom-core.svg?branch=master)](https://travis-ci.org/transomjs/transom-core)
[![Coverage Status](https://coveralls.io/repos/github/transomjs/transom-core/badge.svg?branch=master)](https://coveralls.io/github/transomjs/transom-core?branch=master)

## Based on many projects you already know!
Transom uses Express as it's core. We use Passport for authentication, Mongoose for data, SocketIO for realtime updates, Nodemailer for sending emails created with EJS templates!

#### Need something else?
Did we miss your favorite project or something you need for your product? Create a Transom module and let us know about it!

## Extensible
A transom server without modules, is just an empty Express server. Adding functionality goes quickly with well thought out modules to provide common REST API functions. Features not available in an existing module can be added directly to the (Express) server as custom routes or rolled into a custom module that can be loaded along-side with other Transom modules.

## Installation
```bash
$ npm install --save @transomjs/transom-core
```

## Usage Example
#### myApi.js
An API definition is quite simply a JavaScript Object. It can be a single file, but it doesn't need to be. Break it up into logical pieces as needed or as your project grows. 
 * Checkout the API definition file from our <a target="_blank" href="https://github.com/4umfreak/transom-mongoose-example/blob/master/myApi.js">transom-mongoose-example</a> app.
 
#### index.js
The following simple example is the `index.js` file from a REST API built with Transom. 
* Import the Transom-core and create a new instance.
* Import and configure any Transom modules.
* Import your API definition; This is the metadata that defines your API.
* Call transom.initialize() with your metadata object. It will return a Promise that resolves to your Express server.
* Call server.listen()

```javascript
// Require your API definition
const myApi = require('./myApi');

// Require the Transom-core and any Transom modules
const Transom = require('@transomjs/transom-core');
const transomMongoose = require('@transomjs/transom-mongoose');

// Instantiate Transom
const transom = new Transom();

// Register and configure Transom modules
transom.configure(transomMongoose, {
  mongodb_uri: 'mongodb://localhost/transom-dev'
});

// Initialize all modules at once, returning an Express server instance.
transom.initialize(myApi).then(function(server){

	// Add any additional routes as necessary.
	server.get('/hello', function (req, res, next) {
	  res.json({hello: 'world'});
	  next();
	});

	// Add your own Error handlers

	// Start the server!
	const httpServer = server.listen(7000, function () {
		console.log('Server listening at http://localhost:7000');
	});
});
```

## Example apps
We've created a few small apis to demonstrate the usage of individual plugins:

* https://github.com/binaryops-wiebo/transom-scaffold-example
* https://github.com/4umfreak/transom-smtp-example
* https://github.com/4umfreak/transom-mongoose-example
* https://github.com/binaryops-wiebo/transom-functions-simple-example
* https://github.com/binaryops-wiebo/transom-functions-secured-example
* https://github.com/binaryops-wiebo/transom-socketio-internal-example

## Want to add something before the Transom plugins?
That's easy too. Simply create your own server instance and pass it to Transom after it's been initialized.
```javascript
// Create your own Express server instance and initialize it as needed.
const express = require('express');
const server = express();
server.use(myCustomMiddleware);
// Later, initialize the registered Transom modules.
transom.initialize(server, myApi);
```

## What does the metadata look like?

If you can create [simple JavaScript Objects](https://github.com/4umfreak/transom-mongoose-example/blob/master/myApi.js), you can handle the metadata. By using JavaScript Objects, we can piece together bits of metadata from just about anywhere. 

## Configuring Transom-Core

TransomCore uses attributes from the `transom` node in the definition file to apply defaults on start-up. If you don't need to make any specific configuration changes, the node can be dropped altogether to use the provided defaults.
```javascript
const myApi = {
	transom: {
		requestLogger: {},
		cors: {
			origins: ['http://localhost:8080', 'http://my-dev-server']
		},
		bodyParser: {
			mapParams: true
		},
		queryParser: {
			mapParams: true
		},
		cookieParser: {},
		urlEncodedBodyParser: {
			mapParams: true
		},
		gzipResponse: {},
		fullResponse: {},
		favicon: {
			path: "/assets/favicon.ico"
		}
	}
};
```

### TransomCore plugins
The following plugins come standard in a Transom based server because we've found them to be both necessary and useful. Options provided in the definition are passed directly to each plugin unless otherwise documented below. Transom Core now uses Express middleware for all plugins.

If you would prefer not to use any of the individual plugins applied in core, set the corresponding option to false. The following config disables the default `favicon` plugin.
```javascript
const myApi = {
	transom: {
		favicon: false
	}
};
```

#### requestLogger
The `requestLogger` option can be used a number of ways depending on your need to customize logging within your API.

* Disable request logging by setting `requestLogger` to false. TransomJS will not add request logging middleware.
```javascript
transom: {
	requestLogger: false
}
```
* Create your own Bunyan logger object and pass it in as `log`. Transom will use your logger and include a unique `req_id` on each individual request.
```javascript
transom: {
	requestLogger: {
		log: myCustomBunyan
	}
}
```
* Define a custom [Bunyan logger](https://www.npmjs.com/package/bunyan), Transom will create a new Bunyan logger using your configuration.
```javascript
transom: {
	requestLogger: {
		name: 'MyTestLogger',
		streams: [
			{
				stream: process.stdout,
				level: "debug"
			}
		]
	}
}
```

#### cors
https://www.npmjs.com/package/cors
The `authorization` header is added to the `allowHeaders` option automatically as it's required for Bearer authentication.
The `origins` option is set to a wildcard for easier development and can be set with an environment variable when moving to test or production. Keep in mind that `http://localhost:8100` is different than `http://127.0.0.1:8100` which is again different than `http://[::]:8100` even though they *may* all resolve to the same service. CORS middleware can accept an array of strings or RegEx patterns to match acceptable URI patterns. See the official documentation for additional details.

#### bodyParser
Uses Express built-in `express.json()` middleware.
The `mapParams` option is set to true by default. Many Transom modules will only look for submitted values in req.params, rather than having to check in each of req.query or req.body.

#### urlEncodedBodyParser
Uses Express built-in `express.urlencoded()` middleware. The `mapParams` option is set to true by default.

#### queryParser
Query parsing is built into Express. The `mapParams` option is set to true by default, which copies query parameters to req.params.

#### cookieParser
https://www.npmjs.com/package/cookie-parser
Standard Express cookie parser middleware.

#### gzipResponse
https://www.npmjs.com/package/compression
Uses the `compression` middleware to compress API responses with gzip.

#### fullResponse
Custom middleware that adds standard HTTP response headers including `X-Powered-By` and `X-Request-Id`.

#### favicon
https://www.npmjs.com/package/serve-favicon
If a `path` option is not provided, an icon will be served from ./node_modules/transom-core/images/favicon.ico.


## Transom modules

Transom modules can be simple middleware, or complex ORM solutions. The following demonstrates how simple a Transom module can really be.

```javascript
function TransomConsole() {
	this.initialize = function(server, options) {
		console.log("Initializing Transom-console.");
		server.use(function(req, res, next) {
			console.log("Transom-console...", req.url);
			next();
		});
	}
}
module.exports = new TransomConsole();
```

## Need Support?
TransomJS is developed and maintained by [BinaryOps Software Inc.](https://binaryops.ca) in Canada.
