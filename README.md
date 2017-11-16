# transom-core
Transom-core is a foundation for low-code REST API server development. Transom is based on Restify and provides a simple framework to configure and load modules to provide common REST API functions. Features not available in an existing module can be added directly to the restify server as usual or rolled into a custom module loaded with other Transom modules.

[![Build Status](https://travis-ci.org/transomjs/transom-core.svg?branch=master)](https://travis-ci.org/transomjs/transom-core)
[![Coverage Status](https://coveralls.io/repos/github/transomjs/transom-core/badge.svg?branch=master)](https://coveralls.io/github/transomjs/transom-core?branch=master)

## Installation

```bash
$ npm install --save @transomjs/transom-core
```

## Usage Example

```
const myApi = require('./myApi');
const Transom = require('@transomjs/transom-core');

const transom = new Transom();

// Register Transom modules
transom.configure(transomMongoose, {
  mongodb_uri: 'mongodb://local-mongodb/transom-dev'
});

// Initialize all modules at once, returns a Restify server instance.
const server = transom.initialize(myApi);

// Add any additional routes as necessary.
server.get('/hello', function (req, res, next) {
  res.json({hello: 'world'});
  next();
});

```
