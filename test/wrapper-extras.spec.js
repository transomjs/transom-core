"use strict";
const http = require('http');
const sinon = require('sinon');
const express = require('express');
const Wrapper = require('../wrapper');

describe('Wrapper with other servers and a listening http server', function () {
    let expect;

    before(function () {
        return import("chai").then((chai) => (expect = chai.expect));
    });

    afterEach(function () {
        sinon.restore();
    });

    // A Restify-era server: del() and opts() instead of delete() and options().
    function restifyLike() {
        return {
            emit: sinon.spy(),
            del: sinon.stub().returns('del-result'),
            opts: sinon.stub().returns('opts-result'),
            use: sinon.stub().returns('use-result')
        };
    }

    it('uses del() and opts() when delete() and options() are missing', function () {
        const app = restifyLike();
        const server = Wrapper.wrapServer(app, {});
        server.log = { warn: sinon.spy() };
        expect(server.del('/x', 'h')).to.equal('del-result');
        expect(app.del.calledOnceWith('/x', 'h')).to.equal(true);
        expect(server.opts('/y', 'h')).to.equal('opts-result');
        expect(app.emit.calledWith('transom.route.opts', ['/y', 'h'])).to.equal(true);
        expect(server.log.warn.calledOnce).to.equal(true);
    });

    it('returns the app when neither delete/del nor options/opts exist', function () {
        const app = { emit: sinon.spy() };
        const server = Wrapper.wrapServer(app, {});
        expect(server.del('/x')).to.equal(app);
        expect(server.opts('/x')).to.equal(app);
    });

    it('skips the deprecation warnings when there is no logger', function () {
        const app = Object.assign(restifyLike(), { options: sinon.stub().returns('options-result') });
        const server = Wrapper.wrapServer(app, {});
        expect(server.log).to.equal(undefined);
        expect(server.opts('/y')).to.equal('options-result');
        expect(server.pre('mw')).to.equal('use-result');
        expect(server.rm('/y')).to.equal(server);
        expect(server.inflightRequests()).to.equal(0);
    });

    it('routes delete(), options() and pre() through Express', function () {
        const app = express();
        const emit = sinon.spy(app, 'emit');
        const server = Wrapper.wrapServer(app, {});
        server.log = { warn: sinon.spy() };
        const handler = (req, res) => res.end();
        expect(server.del('/thing', handler)).to.equal(app);
        expect(server.options('/thing', handler)).to.equal(app);
        expect(server.pre(handler)).to.equal(app);
        expect(emit.calledWith('transom.route.del')).to.equal(true);
        expect(emit.calledWith('transom.route.options')).to.equal(true);
        expect(server.log.warn.calledWith("The 'pre' method is deprecated. Use 'use' instead!")).to.equal(true);
        const routes = app._router.stack.filter((layer) => layer.route).map((layer) => Object.keys(layer.route.methods)[0]);
        expect(routes).to.deep.equal(['delete', 'options']);
    });

    it('warns when the deprecated restify property is read', function () {
        const warn = sinon.stub(console, 'warn');
        const app = express();
        expect(Wrapper.wrapServer(app, {}).restify).to.equal(app);
        expect(warn.calledOnce).to.equal(true);
    });

    it('sets the logger on the wrapped app', function () {
        const app = express();
        const server = Wrapper.wrapServer(app, {});
        const log = { warn() {} };
        server.log = log;
        expect(app.log).to.equal(log);
    });

    it('reports the router size in getDebugInfo()', function () {
        const app = express();
        const server = Wrapper.wrapServer(app, {});
        expect(server.getDebugInfo()).to.deep.equal({ routes: 0, env: app.get('env') });
        server.get('/a', (req, res) => res.end());
        expect(server.getDebugInfo().routes).to.be.greaterThan(0);
    });

    it('uses express.server for address() and close() when the caller sets it', async function () {
        const app = express();
        const server = Wrapper.wrapServer(app, {});
        app.server = http.createServer(app);
        await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
        expect(server.address().port).to.equal(app.server.address().port);
        await new Promise((resolve) => server.close(resolve));
        expect(app.server.listening).to.equal(false);
    });
});
