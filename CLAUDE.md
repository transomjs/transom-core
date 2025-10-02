# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`transom-core` is a low-code REST API framework built on Restify. It provides a foundation for quickly building REST APIs using metadata-driven configuration. The framework uses a plugin architecture where functionality is added through Transom modules.

## Key Commands

### Testing
```bash
# Run all tests with coverage (requires NODE_ENV=test and DEBUG enabled)
npm test

# Submit coverage to Coveralls
npm run coveralls
```

### Deployment
```bash
# Deploy using np (interactive release tool)
npm run deploy
```

### Running Tests
- Tests use Mocha with Chai assertions (ES module import)
- Sinon is used for spying/stubbing
- Tests are located in `test/*.spec.js`
- Debug output: Set `DEBUG='transom:*'` environment variable

## Architecture

### Core Components

**index.js** - Main entry point containing `TransomCore` class
- Creates and manages a single `PocketRegistry` instance for dependency injection
- Manages plugin lifecycle through `configure()` and `initialize()` methods
- Sets up default Restify middleware (CORS, body parsing, logging, etc.)
- Plugins are initialized serially, then `preStart()` hooks run serially

**wrapper.js** - Server wrapper
- Wraps the Restify server to expose common methods
- Emits custom events (`transom.route.*`) when routes are registered
- Provides access to the registry and underlying Restify instance

### Plugin System

Plugins must implement:
- `initialize(server, options)` - Required, called during server initialization
- `preStart(server, options)` - Optional, called after all plugins are initialized

Plugins are:
1. Registered via `transom.configure(plugin, options)`
2. Initialized serially in registration order
3. PreStart hooks executed serially after all initialization

### Registry Pattern

The framework uses `PocketRegistry` (from `pocket-registry` npm package) for dependency injection. The registry is accessible via:
- `transom.registry` - Before initialization
- `server.registry` - After initialization

Common registry keys:
- `transom-config` - Full API definition object
- `transom-config.definition.uri.prefix` - URI prefix (default: `/api/v1`)
- `transom-config.transom.*` - Core plugin configurations

### Default Middleware (Configurable)

All can be disabled by setting to `false` in the `transom` config node:
- `requestLogger` - Bunyan-based request logging with unique `req_id`
- `cors` - CORS middleware with preflight support
- `bodyParser` - Parse JSON/multipart bodies (mapParams: true by default)
- `queryParser` - Parse query strings (mapParams: true by default)
- `urlEncodedBodyParser` - Parse form data (mapParams: true by default)
- `cookieParser` - Parse cookies via restify-cookies
- `gzipResponse` - Compress responses
- `fullResponse` - Add standard HTTP headers
- `favicon` - Serve favicon (default location: `./images/favicon.ico`)

### Request Context

Middleware initializes on every request:
- `req.locals` - Request-scoped data storage
- `req.session` - Session data (required by some auth strategies)

### Typical Usage Pattern

```javascript
const Transom = require('@transomjs/transom-core');
const transom = new Transom();

// Register plugins
transom.configure(somePlugin, pluginOptions);

// Initialize with API definition
transom.initialize(apiDefinition).then(server => {
  server.listen(7000);
});
```

Or with custom server:
```javascript
const server = restify.createServer();
server.use(customMiddleware);
transom.initialize(server, apiDefinition);
```

## Important Notes

- Minimum Node version: 18 (enforced in package.json engines)
- URI prefix validation: Must start with `/`, cannot end with `/`
- Timezone warning: Framework warns if process runs with non-zero timezone offset
- Debug logging: Use `debug` package with namespace `transom:core`
- All routes are logged to debug output when `DEBUG='transom:*'` is enabled
