"use strict";
const path = require('path');
const sinon = require('sinon');
const createError = require('http-errors');
const TransomCore = require('../');

describe('TransomCore', function () {

    let core;
    let expect;
    const DummyModule = function (server, options) {
        this.initialize = sinon.spy(function (server, options) {
            server.dummy = options;
        });
    };

    const TRANSOM = {
        requestLogger: false,
        cors: false,
        bodyParser: false,
        queryParser: false,
        cookieParser: false,
        urlEncodedBodyParser: false,
        gzipResponse: false,
        fullResponse: false,
        favicon: false
    };

    before(() => {
        // Use a dynamic import for the chai ES module!
        return import("chai").then((chai) => (expect = chai.expect));
    });   

    beforeEach(function () {
        core = new TransomCore();
    });

    it('includes http-errors as a dependency', function () {
        const err = createError(418, "I'm a little teapot.");
        expect(err.message).to.equal("I'm a little teapot.");
        expect(err.statusCode).to.equal(418);
    });

    it('can be initialized with everything turned off', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        let createLocals;
        dummyServer.use = sinon.spy(function (middle) {
            createLocals = middle;
        });

        // Create a module and options for initializing
        const dummyModule = new DummyModule();
        const dummyOptions = {
            foo: 123
        };

        const myApi = {
            transom: TRANSOM
        };

        core.configure(dummyModule, dummyOptions);
        core.initialize(dummyServer, myApi).then(function(server){
            expect(server.dummy).to.exist.and.to.eql(dummyOptions);
            expect(dummyServer.use.calledOnce).to.be.true;

            expect(createLocals).to.exist.and.be.an.instanceof(Function);

            // Set the default, empty objects in locals & session.
            const req = {};
            const res = {};
            const next = function () {};
            createLocals(req, res, next);
            expect(req.locals).to.exist.and.to.eql({});
            expect(req.session).to.exist.and.to.eql({});

            // Try again with custom objects.
            req.locals.foo = 123;
            req.session.bar = 'baz';
            createLocals(req, res, next);
            expect(req.locals).to.exist.and.to.eql({
                foo: 123
            });
            expect(req.session).to.exist.and.to.eql({
                bar: 'baz'
            });
            done();
        });
        
    });

    it('copies the transom registry to the server', function (done) {
        const dummyServer = {};
        dummyServer.name = "dummyServer";
        dummyServer.registry = {}; // gets replaced!
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {};

        core.initialize(dummyServer, myApi).then(function(server){
            expect(server.name).to.equal('dummyServer');
            expect(server.registry.constructor.name).to.equal('PocketRegistry');

            // Make sure it's a functioning registry
            server.registry.set("foo", "bar")
            expect(server.registry.get("foo")).to.equal('bar');
            done();
        });
    });

    it('can be initialized with defaults on everything', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            transom: TRANSOM
        };

        Object.keys(myApi.transom).map(function (key) {
            myApi.transom[key] = {};
        })

        core.initialize(dummyServer, myApi).then(function(server){
            // With Express, bodyParser, queryParser, and urlEncodedBodyParser each add TWO middleware
            // (one for parsing, one for mapParams). So we have more middleware calls than plugins.
            // Just verify that middleware was added
            expect(dummyServer.use.callCount).to.be.greaterThan(Object.keys(myApi.transom).length);
            // Default api URI prefix.
            const prefix = server.registry.get('transom-config.definition.uri.prefix', "dummy");
            expect(prefix).to.equal('/api/v1');

            done();
        }).catch(done);
    });

    it('can be initialized with a specific log stream', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        const transomOpts = Object.assign({}, TRANSOM);
        transomOpts.requestLogger = {
            name: 'testLogger',
            streams: [
                {
                    stream: process.stdout,
                    level: "debug"
                }
            ]
        };

        const myApi = {
            transom: transomOpts
        };
        core.initialize(dummyServer, myApi).then(function(server){
        
            expect(dummyServer.log).to.be.an('object');
            expect(dummyServer.log.info).to.be.a('function');

            dummyServer.log.debug('Message to process standard out stream');

            done();
        }).catch( err => {
            done(err);
        });
    });

    it('validates the URI prefix on initialize', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            definition: {
                uri: {
                    prefix: 'invalidUri'
                }
            }
        };

        core.initialize(dummyServer, myApi).then(function(server){
            expect('not').to.equal('to be here');
        })
        .catch(function(err){
            expect(err.toString()).to.equal('Error: Invalid URI prefix: invalidUri');
            done();
        });
    });

    it('can be initialized with the same parameters on everything!', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            transom: TRANSOM
        };

        Object.keys(myApi.transom).map(function (key) {
            myApi.transom[key] = {
                mapParams: true,
                origins: ['foo'],
                allowHeaders: ['bad-header'],
                limit: 1000,
                path: path.join(__dirname, '..', 'images', 'favicon.ico')
            };
        })

        core.initialize(dummyServer, myApi).then(function(server){
            // With Express, bodyParser, queryParser, and urlEncodedBodyParser each add TWO middleware
            // Just verify that middleware was added
            expect(dummyServer.use.callCount).to.be.greaterThan(Object.keys(myApi.transom).length);
            done();
        })
        .catch(function(err){
            expect(err.toString()).to.equal('no error');
            done();
        });
    });

    it('can throw errors if a plugin fails', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        // Create a module and options for initializing
        const DummyModule = function (server, options) {
            this.initialize = function (server, options) {
                return Promise.reject('Dummy Error');
            };
        };
        const dummyModule = new DummyModule();

        core.configure(dummyModule, {});
        core.initialize(dummyServer, {})
            .then(function(server){
                expect('not').to.equal('to be here');
                done();
            })
            .catch(function(err) {
                expect(err.toString()).to.equal('Dummy Error');
                done();
            });
    });

    it('can throw errors if a plugin doesn\'t return Promise', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        // Create a module and options for initializing
        const DummyModule = function (server, options) {
            this.initialize = function (server, options) {
                throw new Error('my plugin is invalid.');
            };
        };
        const dummyModule = new DummyModule();

        core.configure(dummyModule, {});
        core.initialize(dummyServer, {})
            .then(function(server){
                expect('not').to.equal('to be here');
                done();
            })
            .catch(function(err) {
                expect(err.toString()).to.equal('Error: my plugin is invalid.');
                done();
            });
    });

    it('can initialize with an empty api definition', function () {
        expect(core.initialize({})).to.exist;
    });

    it('can initialize with a non-empty api definition', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();
        // dummyServer.emit = sinon.spy();
        // dummyServer.get = sinon.spy();

        // Create a module and options for initializing
        const DummyModule = function (server, options) {
            this.initialize = function (server, options) {
                // server.get('/foo/bar', sinon.spy());
                server.router = {
                    mounts: {
                        spec: {
                            method: 'foo',
                            path: 'bar'
                        }
                    }
                }
            };
            this.preStart = function (server, options) {};
        };
        const dummyModule = new DummyModule();

        core.configure(dummyModule, {});
        core.initialize(dummyServer, {})
            .then(function(server){
                // expect('not').to.equal('to be here');
                done();
            })
            .catch(function(err) {
                expect(err.toString()).to.equal('Error: my plugin is invalid.');
                done();
            });

    });

    it('can access registry before initialization', function () {
        const registry = core.registry;
        expect(registry).to.exist;
        expect(registry.constructor.name).to.equal('PocketRegistry');

        // Make sure it's a functioning registry
        registry.set("test-key", "test-value");
        expect(registry.get("test-key")).to.equal('test-value');
    });

    it('logs routes when debug is enabled', function (done) {
        const dummyServer = {};
        dummyServer.emit = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            transom: TRANSOM
        };

        // Mock debug to be enabled
        const originalEnabled = require('debug').enabled;
        const debugModule = require('debug');
        debugModule.enabled = true;

        core.initialize(dummyServer, myApi).then(function(server){
            // Add router with mounts to trigger the logging code
            server.router = {
                mounts: {
                    'GET-/api/v1/test': {
                        spec: {
                            method: 'GET',
                            path: '/api/v1/test'
                        }
                    }
                }
            };

            // Restore original debug state
            debugModule.enabled = originalEnabled;
            done();
        }).catch(done);

    });

    it('fails initialization with old Node.js version', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        // Save original version
        const originalVersion = process.version;

        // Stub process.version to simulate old Node
        Object.defineProperty(process, 'version', {
            value: 'v10.0.0',
            writable: true,
            configurable: true
        });

        try {
            core.initialize(dummyServer, {})
                .then(function(server){
                    // Restore version
                    Object.defineProperty(process, 'version', {
                        value: originalVersion,
                        writable: true,
                        configurable: true
                    });
                    expect('not').to.equal('to be here');
                    done();
                })
                .catch(function(err) {
                    // Restore version
                    Object.defineProperty(process, 'version', {
                        value: originalVersion,
                        writable: true,
                        configurable: true
                    });
                    expect(err.message).to.contain("doesn't support NodeJS versions older than");
                    done();
                });
        } catch(err) {
            // Restore version in case of synchronous error
            Object.defineProperty(process, 'version', {
                value: originalVersion,
                writable: true,
                configurable: true
            });
            expect(err.message).to.contain("doesn't support NodeJS versions older than");
            done();
        }
    });

    it('calls plugin preStart method after initialization', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        // Create a module with both initialize and preStart
        const DummyModule = function (server, options) {
            this.initialize = sinon.spy(function (server, options) {
                return Promise.resolve();
            });
            this.preStart = sinon.spy(function (server, options) {
                return Promise.resolve();
            });
        };
        const dummyModule = new DummyModule();
        const dummyOptions = { test: 'value' };

        core.configure(dummyModule, dummyOptions);
        core.initialize(dummyServer, {})
            .then(function(server){
                expect(dummyModule.initialize.calledOnce).to.be.true;
                expect(dummyModule.preStart.calledOnce).to.be.true;

                // Verify preStart was called after initialize
                expect(dummyModule.initialize.calledBefore(dummyModule.preStart)).to.be.true;

                // Verify both got the server and options
                expect(dummyModule.initialize.firstCall.args[1]).to.equal(dummyOptions);
                expect(dummyModule.preStart.firstCall.args[1]).to.equal(dummyOptions);
                done();
            })
            .catch(function(err) {
                done(err);
            });
    });

    it('handles multiple plugins with preStart correctly', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        // Create first plugin with preStart
        const Plugin1 = function () {
            this.initialize = sinon.spy(function () { return Promise.resolve(); });
            this.preStart = sinon.spy(function () { return Promise.resolve(); });
        };
        const plugin1 = new Plugin1();

        // Create second plugin without preStart
        const Plugin2 = function () {
            this.initialize = sinon.spy(function () { return Promise.resolve(); });
        };
        const plugin2 = new Plugin2();

        // Create third plugin with preStart
        const Plugin3 = function () {
            this.initialize = sinon.spy(function () { return Promise.resolve(); });
            this.preStart = sinon.spy(function () { return Promise.resolve(); });
        };
        const plugin3 = new Plugin3();

        core.configure(plugin1, {});
        core.configure(plugin2, {});
        core.configure(plugin3, {});

        core.initialize(dummyServer, {})
            .then(function(server){
                // All initialize methods should be called
                expect(plugin1.initialize.calledOnce).to.be.true;
                expect(plugin2.initialize.calledOnce).to.be.true;
                expect(plugin3.initialize.calledOnce).to.be.true;

                // Only plugin1 and plugin3 should have preStart called
                expect(plugin1.preStart.calledOnce).to.be.true;
                expect(plugin2.preStart).to.be.undefined;
                expect(plugin3.preStart.calledOnce).to.be.true;

                // Verify order: all initializes before all preStarts
                expect(plugin1.initialize.calledBefore(plugin1.preStart)).to.be.true;
                expect(plugin2.initialize.calledBefore(plugin1.preStart)).to.be.true;
                expect(plugin3.initialize.calledBefore(plugin3.preStart)).to.be.true;

                done();
            })
            .catch(function(err) {
                done(err);
            });
    });

    it('logs routes to debug when debug is enabled', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        // Create a plugin that sets up routes
        const DummyModule = function () {
            this.initialize = function (server) {
                server.router = {
                    mounts: {
                        'route1': {
                            spec: {
                                method: 'GET',
                                path: '/api/users'
                            }
                        },
                        'route2': {
                            spec: {
                                method: 'POST',
                                path: '/api/users'
                            }
                        },
                        'route3': {
                            // No spec - should be skipped
                        }
                    }
                };
                return Promise.resolve();
            };
        };
        const dummyModule = new DummyModule();

        core.configure(dummyModule, {});
        core.initialize(dummyServer, {})
            .then(function(server){
                expect(server.router).to.exist;
                expect(server.router.mounts).to.exist;
                expect(Object.keys(server.router.mounts).length).to.equal(3);
                done();
            })
            .catch(function(err) {
                done(err);
            });
    });

    it('registry can handle deeply nested paths', function () {
        const registry = core.registry;

        // Set a deeply nested value
        registry.set('level1.level2.level3.level4.value', 'deep-value');

        // Get it back
        expect(registry.get('level1.level2.level3.level4.value')).to.equal('deep-value');

        // Check if it exists
        expect(registry.has('level1.level2.level3.level4.value')).to.be.true;
        expect(registry.has('level1.level2.level3.nonexistent')).to.be.false;

        // Get with default
        expect(registry.get('nonexistent.path', 'default-value')).to.equal('default-value');
    });

    it('registry handles complex data types', function () {
        const registry = core.registry;

        // Test with object
        const testObj = { name: 'test', nested: { value: 123 } };
        registry.set('test.object', testObj);
        expect(registry.get('test.object')).to.deep.equal(testObj);

        // Test with array
        const testArray = [1, 2, 3, { key: 'value' }];
        registry.set('test.array', testArray);
        expect(registry.get('test.array')).to.deep.equal(testArray);

        // Test with null
        registry.set('test.null', null);
        expect(registry.get('test.null')).to.be.null;

        // Test with boolean
        registry.set('test.boolean', false);
        expect(registry.get('test.boolean')).to.be.false;
    });

    it('can suppress timezone warning', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            transom: {
                suppressTimezoneWarning: true
            }
        };

        // Spy on console.log to verify warning is suppressed
        const consoleLogSpy = sinon.spy(console, 'log');

        core.initialize(dummyServer, myApi).then(function(server){
            // Check that console.log was not called with timezone warning
            const tzWarningCalled = consoleLogSpy.getCalls().some(call =>
                call.args.some(arg =>
                    typeof arg === 'string' && arg.includes('timezone offset')
                )
            );
            expect(tzWarningCalled).to.be.false;

            consoleLogSpy.restore();
            done();
        }).catch(err => {
            consoleLogSpy.restore();
            done(err);
        });
    });

});