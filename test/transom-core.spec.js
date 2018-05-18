"use strict";
const expect = require('chai').expect;
const path = require('path');
const sinon = require('sinon');
const restifyErrors = require('restify-errors');
const TransomCore = require('../');

describe('TransomCore', function () {

    let core;
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
        urlEncodedBodyParser: false,
        gzipResponse: false,
        fullResponse: false,
        favicon: false
    };

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

        const myApi = {
            transom: TRANSOM,
            logOptions: {
                name: 'testLogger',
                streams: [
                    {
                        stream: process.stdout,
                        level: "debug"
                    }
                ]
            }
        };

        Object.keys(myApi.transom).map(function (key) {
            myApi.transom[key] = {};
        })

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
            expect(err.toString()).to.equal('Invalid URI prefix: invalidUri');

        });
        done();
        //expect(core.initialize.bind(core, dummyServer, myApi)).to.throw('Invalid URI prefix: invalidUri');
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
                return new Promise((resolve, reject) => {
                    throw new Error('Dummy Error') ;
                });
                // throw new Error('Dummy Error');
                
            };
        };
        const dummyModule = new DummyModule();

        core.configure(dummyModule, {});
        //expect(core.initialize.bind(core, dummyServer, {})).to.throw('Dummy error');
        core.initialize(dummyServer, {}).then(function(server){
            expect('not').to.equal('to be here');
            done();
        })
        .catch(function(err) {
            expect(err.toString()).to.equal('Error: Dummy Error');
            done();
        });
        
    });

    it('can initialize with an empty api definition', function () {
        expect(core.initialize({})).to.exist;
    });
});