"use strict";
const path = require('path');
const sinon = require('sinon');
const restifyErrors = require('restify-errors');
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

    it('includes restify-errors as a dependency', function () {
        const err = new restifyErrors.ImATeapotError("I'm a little teapot.");
        expect(err.message).to.equal("I'm a little teapot.");
        expect(err.code).to.equal("ImATeapot");
    });

    it('can be initialized with everything turned off', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
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
            expect(dummyServer.pre.notCalled).to.be.true;
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
        dummyServer.pre = sinon.spy();
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
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            transom: TRANSOM
        };

        Object.keys(myApi.transom).map(function (key) {
            myApi.transom[key] = {};
        })

        core.initialize(dummyServer, myApi).then(function(server){
        
            expect(dummyServer.pre.calledOnce).to.be.true;
            // Every entry in the transom node should result in a call to server.use
            // plus 1 extra for the req.locals middleware that's always called.
            expect(dummyServer.use.callCount).to.equal(Object.keys(myApi.transom).length + 1);
            // Cors preflight calls serve.pre
            expect(dummyServer.pre.calledOnce).to.be.true;
            // Default api URI prefix.
            const prefix = server.registry.get('transom-config.definition.uri.prefix', "dummy");
            expect(prefix).to.equal('/api/v1');

            done();
        });
    });

    it('can be initialized with a specific log stream', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
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
        dummyServer.pre = sinon.spy();
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
        dummyServer.pre = sinon.spy();
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
            expect(dummyServer.pre.calledOnce).to.be.true;
            // Every entry in the transom node should result in a call to server.use
            // plus 1 extra for the req.locals middleware that's always called.
            expect(dummyServer.use.callCount).to.equal(Object.keys(myApi.transom).length + 1);
            // Cors preflight calls serve.pre
            expect(dummyServer.pre.calledOnce).to.be.true;
        })
        .catch(function(err){
            expect(err.toString()).to.equal('no error');
        });
        done();
    });

    it('can throw errors if a plugin fails', function (done) {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
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
        dummyServer.pre = sinon.spy();
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
        dummyServer.pre = sinon.spy();
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

});