'use strict';
const sinon = require('sinon');
const Wrapper = require('../wrapper');

describe('TransomCore wrapper', function() {
    const properties = ['name', 'url', 'domain', 'log'];
    const httpMethods = ['get',
    'head',
    'post',
    'put',
    'patch',
    'del',
    'opts'];
    const fxs = [
        'get',
        'head',
        'post',
        'put',
        'patch',
        'del',
        'opts',
        'pre',
        'use',
        'listen',
        'close',
        'on'
    ];
    let restify;
    let expect;
    let spies;

    before(() => {
        // Use a dynamic import for the chai ES module!
        return import("chai").then((chai) => (expect = chai.expect));
    });

    beforeEach(function() {
        function MockRestify() {}

        // Define properties
        properties.map(p => {
            Object.defineProperty(MockRestify.prototype, p, {
                get: function() {
                    return this[`__${p}`];
                },
                set: function(val) {
                    this[`__${p}`] = val;
                }
            });
        });

        // We don't expose emit, but it gets used by the wrapper!
        Object.defineProperty(MockRestify.prototype, 'emit', {
            value: function() {}
        });

        // Define functions
        fxs.map(p => {
            Object.defineProperty(MockRestify.prototype, p, {
                value: function() {
                    return `Function name is ${p}.`
                }
            });
        });

        restify = new MockRestify();

        // Create and hang onto the spies!
        spies = {};
        properties.map(p => {
            spies[p] = sinon.spy(restify, p, ['set', 'get']);
        });

        spies['emit'] = sinon.spy(restify, 'emit');
        fxs.map(f => {
            spies[f] = sinon.spy(restify, f);
        });
    });

    it('can return a registry and mock Restify', function() {
        const registry = 'dummy-' + new Date().getTime();

        // Wrapper the registry & Restify.
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Return the Registry unaltered.
        expect(wrapper.registry).to.equal(registry);

        // Return the Restify instance unwrapped.
        expect(wrapper.restify).to.equal(restify);

        // Set
        wrapper.name = 'Mrs. Red';
        expect(spies['name'].set.callCount).to.equal(1);
        expect(spies['name'].set.firstCall.args.length).to.equal(1);
        expect(spies['name'].set.firstCall.args[0]).to.equal('Mrs. Red');

        // Get
        expect(wrapper.name).to.equal('Mrs. Red'); // trigger the getter!
        expect(spies['name'].get.callCount).to.equal(1);

        // Set again
        wrapper.name = 'Mr. Cyan';

        // Get again
        expect(wrapper.name).to.equal('Mr. Cyan');
        expect(spies['name'].get.callCount).to.equal(2);
    });

    it('calls on wrapped methods get passed through to Restify', function() {
        const registry = 'dummy-' + new Date().getTime();

        // Wrapper the registry & Restify.
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Test all of the defined properties that we're proxying them as expected
        properties.map(p => {
            wrapper[p] = `Hello, My name is property '${p}'`; // setter!
            expect(wrapper[p]).to.equal(`Hello, My name is property '${p}'`); // getter!
            // Verify that the actual restify property value is same.
            expect(wrapper.restify[p]).to.equal(`Hello, My name is property '${p}'`);
        });
        // Make sure each property is called only twice, as above.
        properties.map(p => {
            expect(`${spies[p].get.callCount}-${p}`).to.equal(`2-${p}`);
        });

        // Test the defined functions with a single argument.
        fxs.map(f => {
            wrapper[f](`Hello, My name is function '${f}'`); // call fx!
            expect(spies[f].firstCall.args[0]).to.equal(
                `Hello, My name is function '${f}'`
            );
        });
        // Make sure each function is called only once.
        fxs.map(f => {
            expect(spies[f].callCount).to.equal(1);
        });
    });

    it('calls on wrapped functions pass multiple args to Restify', function() {
        const registry = {};

        // Wrapper the registry & Restify.
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Test the defined functions with a single argument.
        fxs.map(f => {
            // Array of lengths 0-9 with values 0-100
            const randLen = Math.random() * 10;
            const fakeArgs = Array.from({ length: randLen }, () =>
                Math.floor(Math.random() * 100)
            );
            // console.log(fakeArgs);

            // Ensure that args are proxied through to restify
            const result = wrapper[f](...fakeArgs); // call fx!
            expect(result).to.equal(`Function name is ${f}.`);
            expect(spies[f].firstCall.args).to.have.members(fakeArgs);
        });
    });

    it('calls on wrapped httpMethods Emit those args', function() {
        const registry = {};

        // Wrapper the registry & Restify.
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Test the defined functions with a single argument.
        httpMethods.map(h => {
            // Ensure that args are proxied through to restify
            const result = wrapper[h](`Calling HTTP ${h} method!`); // call the fx!
            expect(result).to.equal(`Function name is ${h}.`);
            expect(spies['emit'].lastCall.args[0]).to.equal(`transom.route.${h}`);
            expect(spies['emit'].lastCall.args[1][0]).to.equal(`Calling HTTP ${h} method!`);
        });
        expect(spies['emit'].callCount).to.equal(httpMethods.length);
    });

    it('wrapper param() method passes args to Restify', function() {
        const registry = {};
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Mock the param method
        restify.param = sinon.spy(function() { return 'param-result'; });

        const result = wrapper.param('userId', sinon.stub());
        expect(restify.param.calledOnce).to.be.true;
        expect(result).to.equal('param-result');
    });

    it('wrapper rm() method emits event and passes args to Restify', function() {
        const registry = {};
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Mock the rm method
        restify.rm = sinon.spy(function() { return 'rm-result'; });

        const result = wrapper.rm('/some/route');
        expect(restify.rm.calledOnce).to.be.true;
        expect(spies['emit'].lastCall.args[0]).to.equal('transom.route.rm');
        expect(result).to.equal('rm-result');
    });

    it('wrapper address() method passes through to Restify', function() {
        const registry = {};
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Mock the address method
        const mockAddress = { port: 8080, family: 'IPv4', address: '127.0.0.1' };
        restify.address = sinon.spy(function() { return mockAddress; });

        const result = wrapper.address();
        expect(restify.address.calledOnce).to.be.true;
        expect(result).to.deep.equal(mockAddress);
    });

    it('wrapper inflightRequests() method passes through to Restify', function() {
        const registry = {};
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Mock the inflightRequests method
        restify.inflightRequests = sinon.spy(function() { return 42; });

        const result = wrapper.inflightRequests();
        expect(restify.inflightRequests.calledOnce).to.be.true;
        expect(result).to.equal(42);
    });

    it('wrapper getDebugInfo() method passes through to Restify', function() {
        const registry = {};
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Mock the getDebugInfo method
        const mockDebugInfo = { routes: [], server: 'info' };
        restify.getDebugInfo = sinon.spy(function() { return mockDebugInfo; });

        const result = wrapper.getDebugInfo();
        expect(restify.getDebugInfo.calledOnce).to.be.true;
        expect(result).to.deep.equal(mockDebugInfo);
    });

    it('wrapper toString() method passes through to Restify', function() {
        const registry = {};
        const wrapper = new Wrapper.wrapServer(restify, registry);

        // Mock the toString method
        restify.toString = sinon.spy(function() { return 'Server[name=test]'; });

        const result = wrapper.toString();
        expect(restify.toString.calledOnce).to.be.true;
        expect(result).to.equal('Server[name=test]');
    });
});
