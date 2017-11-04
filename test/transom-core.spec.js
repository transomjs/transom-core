"use strict";
const expect = require('chai').expect;
const sinon = require('sinon');
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

    it('can be initialized with everything turned off', function () {
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
        const server = core.initialize(dummyServer, myApi);
        expect(server.dummy).to.exist.and.to.eql(dummyOptions);
        expect(dummyServer.pre.notCalled).to.be.true;
        expect(dummyServer.use.calledOnce).to.be.true;

        expect(createLocals).to.exist.and.be.an.instanceof(Function);

        const req = {};
        createLocals(req, {}, {});
        expect(req.locals).to.exist;
        expect(req.session).to.exist;

    });

    it('can be initialized with defaults on everything', function () {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        const myApi = {
            transom: TRANSOM
        };

        Object.keys(myApi.transom).map(function (key) {
            myApi.transom[key] = {};
        })

        const server = core.initialize(dummyServer, myApi);
        expect(dummyServer.pre.calledOnce).to.be.true;
        // Every entry in the transom node should result in a call to server.use
        // plus 1 extra for the req.locals middleware that's always called.
        expect(dummyServer.use.callCount).to.equal(Object.keys(myApi.transom).length + 1);
        // Cors preflight calls serve.pre
        expect(dummyServer.pre.calledOnce).to.be.true;
    });

    it('can throw errors if a plugin fails', function () {
        const dummyServer = {};
        dummyServer.pre = sinon.spy();
        dummyServer.use = sinon.spy();

        // Create a module and options for initializing
        const DummyModule = function (server, options) {
            this.initialize = sinon.spy(function (server, options) {
                throw new Error('Dummy error');
            });
        };
        const dummyModule = new DummyModule();

        core.configure(dummyModule, {});
        expect(core.initialize.bind(core, dummyServer, {})).to.throw('Dummy error');
    });

    it('can initialize with an empty api definition', function () {
        expect(core.initialize({})).to.exist;
    });


});