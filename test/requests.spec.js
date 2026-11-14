"use strict";
const sinon = require('sinon');
const TransomCore = require('../');

// Everything off; each test turns on what it needs.
const ALL_OFF = {
    requestLogger: false,
    cors: false,
    bodyParser: false,
    queryParser: false,
    cookieParser: false,
    urlEncodedBodyParser: false,
    gzipResponse: false,
    fullResponse: false,
    favicon: false,
    suppressTimezoneWarning: true
};

// A plugin that records req.params as the middleware chain leaves it (before routing),
// and echoes what the route handler sees.
function echoPlugin() {
    return {
        initialize(server) {
            server.use(function (req, res, next) {
                res.locals.paramsBeforeRouting = Object.assign({}, req.params);
                next();
            });
            const echo = function (req, res) {
                res.json({
                    paramsBeforeRouting: res.locals.paramsBeforeRouting,
                    routeParams: req.params,
                    id: req.id || null,
                    locals: req.locals,
                    session: req.session
                });
            };
            server.get('/echo', echo);
            server.post('/echo', echo);
            server.put('/items/:id', echo);
            server.del('/items/:id', echo);
            // Added straight to Express, so the wrapper doesn't map params for it.
            server.express.get('/unwrapped', echo);
            server.get('/meta', TransomCore.withMeta({ summary: 'normal' }, function (req, res) {
                res.json(res.locals.routeMeta);
            }));
            server.get('/meta-error', TransomCore.withMeta({ summary: 'error' }, function (err, req, res, next) {
                res.json({ err, meta: res.locals.routeMeta, hasNext: typeof next === 'function' });
            }));
        }
    };
}

async function start(transom) {
    const core = new TransomCore();
    core.configure(echoPlugin());
    const server = await core.initialize({ transom: Object.assign({}, ALL_OFF, transom), definition: {} });
    const listener = await new Promise((resolve) => {
        const l = server.listen(0, '127.0.0.1', () => resolve(l));
    });
    const base = 'http://127.0.0.1:' + listener.address().port;
    return {
        server,
        fetch: (path, init) => fetch(base + path, init),
        close: () => new Promise((resolve) => listener.close(resolve))
    };
}

describe('TransomCore request handling', function () {
    let expect;
    let running;

    before(function () {
        return import("chai").then((chai) => (expect = chai.expect));
    });

    afterEach(async function () {
        if (running) {
            await running.close();
            running = null;
        }
        sinon.restore();
    });

    it('creates req.locals and req.session for every request', async function () {
        running = await start({});
        const body = await (await running.fetch('/echo')).json();
        expect(body.locals).to.deep.equal({});
        expect(body.session).to.deep.equal({});
    });

    describe('mapping values onto req.params', function () {
        // Express replaces req.params for every router layer, so the values are copied
        // in as each route's first handler. Middleware that runs before routing (use())
        // never sees them.
        function postJson(path, data, method) {
            return running.fetch(path, {
                method: method || 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        it('gives route handlers the JSON body as params, but not use() middleware', async function () {
            running = await start({ bodyParser: {} });
            const body = await (await postJson('/echo', { name: 'Jo', age: 7 })).json();
            expect(body.routeParams).to.deep.equal({ name: 'Jo', age: 7 });
            expect(body.paramsBeforeRouting).to.deep.equal({});
        });

        it('gives route handlers the query string as params', async function () {
            running = await start({ queryParser: {} });
            const body = await (await running.fetch('/echo?a=1&b=two')).json();
            expect(body.routeParams).to.deep.equal({ a: '1', b: 'two' });
        });

        it('gives route handlers a url-encoded form as params', async function () {
            running = await start({ urlEncodedBodyParser: {} });
            const res = await running.fetch('/echo', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'colour=blue&size=9'
            });
            const body = await res.json();
            expect(body.routeParams).to.deep.equal({ colour: 'blue', size: '9' });
        });

        it('never lets a body or query value override a route parameter', async function () {
            running = await start({ bodyParser: {}, queryParser: {} });
            let body = await (await postJson('/items/42?id=99&q=x', { id: 7, name: 'Jo' }, 'PUT')).json();
            expect(body.routeParams).to.deep.equal({ id: '42', name: 'Jo', q: 'x' });
            body = await (await running.fetch('/items/5?id=6', { method: 'DELETE' })).json();
            expect(body.routeParams).to.deep.equal({ id: '5' });
        });

        it('lets the query override the body, in the order the parsers are applied', async function () {
            running = await start({ bodyParser: {}, queryParser: {}, urlEncodedBodyParser: {} });
            const body = await (await postJson('/echo?name=fromQuery', { name: 'fromBody', other: 1 })).json();
            expect(body.routeParams).to.deep.equal({ name: 'fromQuery', other: 1 });
        });

        it('ignores a __proto__ key in the body', async function () {
            running = await start({ bodyParser: {} });
            const res = await running.fetch('/echo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{"__proto__": {"polluted": true}, "ok": 1}'
            });
            const body = await res.json();
            expect(body.routeParams).to.deep.equal({ ok: 1 });
            expect({}.polluted).to.equal(undefined);
        });

        it('does not map routes added straight to Express', async function () {
            running = await start({ queryParser: {} });
            const body = await (await running.fetch('/unwrapped?a=1')).json();
            expect(body.routeParams).to.deep.equal({});
        });

        it('parses without mapping when mapParams is false', async function () {
            running = await start({
                bodyParser: { mapParams: false },
                queryParser: { mapParams: false },
                urlEncodedBodyParser: { mapParams: false }
            });
            const body = await (await postJson('/echo?q=1', { name: 'Jo' })).json();
            expect(body.routeParams).to.deep.equal({});
        });

        it('rejects bodies over the limit (20kb by default, or the configured limit)', async function () {
            running = await start({ bodyParser: {}, urlEncodedBodyParser: { limit: '1kb' } });
            let res = await running.fetch('/echo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ big: 'x'.repeat(25 * 1024) })
            });
            expect(res.status).to.equal(413);
            res = await running.fetch('/echo', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: 'big=' + 'x'.repeat(2 * 1024)
            });
            expect(res.status).to.equal(413);
        });
    });

    describe('fullResponse and the request logger', function () {
        it('adds X-Powered-By and an "unknown" X-Request-Id when there is no request logger', async function () {
            running = await start({ fullResponse: {} });
            const res = await running.fetch('/echo');
            expect(res.headers.get('x-powered-by')).to.equal('Transom');
            expect(res.headers.get('x-request-id')).to.equal('unknown');
        });

        it('gives each request an id and a child logger from the provided log', async function () {
            const info = sinon.spy();
            const child = sinon.stub().returns({ info });
            const log = { child, info: sinon.spy(), warn: sinon.spy() };
            running = await start({ requestLogger: { log }, fullResponse: {} });
            expect(running.server.log).to.equal(log);

            const res = await running.fetch('/echo?x=1');
            const body = await res.json();
            expect(body.id).to.match(/^[0-9a-f-]{36}$/);
            expect(res.headers.get('x-request-id')).to.equal(body.id);
            expect(child.calledOnceWith({ req_id: body.id })).to.equal(true);
            expect(info.firstCall.args[0]).to.include({ method: 'GET', url: '/echo?x=1' });
            expect(info.firstCall.args[1]).to.equal('request started');
        });

        it('creates a bunyan logger from the requestLogger options', async function () {
            running = await start({ requestLogger: { name: 'MyApi', level: 'fatal' } });
            expect(running.server.log.fields.name).to.equal('MyApi');
            expect(running.server.log.level()).to.equal(60);
        });

        it('names the bunyan logger TransomJS by default', async function () {
            running = await start({ requestLogger: { level: 'fatal' } });
            expect(running.server.log.fields.name).to.equal('TransomJS');
        });
    });

    describe('CORS', function () {
        it('allows a list of origins and adds headers to the defaults', async function () {
            running = await start({ cors: { origins: ['https://a.test', 'https://b.test'], allowHeaders: ['x-custom'] } });
            const res = await running.fetch('/echo', {
                method: 'OPTIONS',
                headers: { origin: 'https://b.test', 'access-control-request-method': 'GET' }
            });
            expect(res.status).to.equal(200);
            expect(res.headers.get('access-control-allow-origin')).to.equal('https://b.test');
            expect(res.headers.get('access-control-allow-headers')).to.equal('authorization,x-custom');
        });

        it('accepts origins ["*"], or origin and allowedHeaders in the cors package style', async function () {
            running = await start({ cors: { origins: ['*'] } });
            let res = await running.fetch('/echo', { headers: { origin: 'https://any.test' } });
            expect(res.headers.get('access-control-allow-origin')).to.equal('*');
            await running.close();

            running = await start({ cors: { origin: 'https://only.test', allowedHeaders: ['x-other', 'authorization'] } });
            res = await running.fetch('/echo', {
                method: 'OPTIONS',
                headers: { origin: 'https://only.test', 'access-control-request-method': 'GET' }
            });
            expect(res.headers.get('access-control-allow-origin')).to.equal('https://only.test');
            expect(res.headers.get('access-control-allow-headers')).to.equal('authorization,x-other');
        });
    });

    describe('withMeta', function () {
        it('sets res.locals.routeMeta before a normal handler', async function () {
            running = await start({});
            const body = await (await running.fetch('/meta')).json();
            expect(body).to.deep.equal({ summary: 'normal' });
        });

        it('calls a four-argument handler with a null error', async function () {
            running = await start({});
            const body = await (await running.fetch('/meta-error')).json();
            expect(body).to.deep.equal({ err: null, meta: { summary: 'error' }, hasNext: true });
        });
    });
});

describe('TransomCore setup details', function () {
    let expect;

    before(function () {
        return import("chai").then((chai) => (expect = chai.expect));
    });

    afterEach(function () {
        sinon.restore();
    });

    it('initializes with no API definition at all', async function () {
        sinon.stub(Date.prototype, 'getTimezoneOffset').returns(0);
        const server = await new TransomCore().initialize();
        expect(server.registry.get('transom-config.definition.uri.prefix')).to.equal('/api/v1');
    });

    it('gives a plugin configured without options an empty object', async function () {
        const core = new TransomCore();
        const plugin = { initialize: sinon.spy() };
        core.configure(plugin);
        await core.initialize({ transom: ALL_OFF });
        expect(plugin.initialize.firstCall.args[1]).to.deep.equal({});
    });

    it('warns about a timezone offset, naming the entry script', async function () {
        sinon.stub(Date.prototype, 'getTimezoneOffset').returns(60);
        const log = sinon.stub(console, 'log');
        await new TransomCore().initialize({ transom: Object.assign({}, ALL_OFF, { suppressTimezoneWarning: false }) });
        log.restore();
        expect(log.calledOnce).to.equal(true);
        expect(log.firstCall.args[1]).to.include('timezone offset of 60 minutes');
    });

    it('still warns when there is no entry script (e.g. node -e)', async function () {
        sinon.stub(Date.prototype, 'getTimezoneOffset').returns(60);
        sinon.replace(process, 'argv', [process.argv[0]]);
        const log = sinon.stub(console, 'log');
        await new TransomCore().initialize({ transom: Object.assign({}, ALL_OFF, { suppressTimezoneWarning: false }) });
        log.restore();
        expect(log.firstCall.args[1]).to.include('at the top of your  before');
    });

    it('does not warn with a zero offset', async function () {
        sinon.stub(Date.prototype, 'getTimezoneOffset').returns(0);
        const log = sinon.stub(console, 'log');
        await new TransomCore().initialize({ transom: Object.assign({}, ALL_OFF, { suppressTimezoneWarning: false }) });
        log.restore();
        expect(log.called).to.equal(false);
    });
});
