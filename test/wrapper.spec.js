'use strict';
const expect = require('chai').expect;
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
    let spies;

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
});
