
# transom-core
Transom-core is a foundation for low-code REST API and realtime server development. Transom applications use meta-data to configure pre-built and tested modules that allow developers to quickly piece together services that 'just work'! 

[![Build Status](https://travis-ci.org/transomjs/transom-core.svg?branch=master)](https://travis-ci.org/transomjs/transom-core)
[![Coverage Status](https://coveralls.io/repos/github/transomjs/transom-core/badge.svg?branch=master)](https://coveralls.io/github/transomjs/transom-core?branch=master)

## Based on many projects you already know!
Transom uses Restify as it's core. We use Passport for authentication, Mongoose for data, SocketIO for realtime updates, Nodemailer for sending emails created with EJS templates!

Did we miss your favorite project or something you need for your product? Create a Transom module and let us know about it!

## Extensible
A transom server without modules, is just an empty Restify server. Adding functionality goes quickly with well thought out 
Out of the box, 
Transom provides a simple framework to configure and load modules to provide common REST API functions. Features not available in an existing module can be added directly to the (Restify) server as custom routes or rolled into a custom module that can be loaded along-side loaded with other Transom modules.

metadata to define routes adding support for 

## Installation

```bash
$ npm install --save @transomjs/transom-core
```

## Features
* Mongoose

## Usage Example

The following simple example is the `index.js` file from a REST API built with Transom. 

* Import the Transom-core and create an new instance.
* Import and configure any Transom modules.
* Import your API definition; This is the metadata that defines your API.
* Call transom.initialize() with your metadata object. It will return a restify server.
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

// Initialize all modules at once, returning a Restify server instance.
const server = transom.initialize(myApi);

// Add any additional routes as necessary.
server.get('/hello', function (req, res, next) {
  res.json({hello: 'world'});
  next();
});

// Add your own Error handlers

// Start the server!
server.listen(7000, function () {
	console.log('%s listening at %s', server.name, server.url);
});
```
## What does the metadata look like?

If you can create simple JavaScript Objects, you can handle the metadata. By using JavaScript Objects, we can piece together bits of metadata from just about anywhere. 

The following is the.. :

```javascript
module.exports = {
	note: "default api definition",
	name: "My App",
	administrator_email: "admin@mymail.foo",
	transom: {},
	api_definition: {
		api_version: 1,
		api_code: "abc123",
		api_description: "",
		api_context: {
			contact_name: "",
			contact_email: "",
			contact_url: "",
			license_url: "",
			license_name: "",
			terms_of_service_url: ""
		},
		cors: {
			origins: ['http://localhost:8080'],
			exposeHeaders: ['foo']
		},
```

## Transom modules

Transom modules can be as simple as middleware, or complex ORM solutions. The following demonstrates how simple a Transom module can really be.

```javascript
function TransomConsole() {
	this.initialize = function(server, options) {
		console.log("Initializing Transom-console...");

		server.use(function(req, res, next) {
					console.log("Transom-console...", req.url);
		});
	}
}
module.exports = new TransomConsole();
```
