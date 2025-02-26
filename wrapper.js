'use strict';

module.exports = {
    wrapServer: function(_fastify) {
        const server = {
            get registry() {
                // Post-initialize registry access.
                return _fastify.registry;
            },
            get fastify(){
                return _fastify;
            },
            // get name(){
            //     return _fastify.name;
            // },
            // set name(value){
            //     return _fastify.name = value;
            // },
            // get url(){
            //     return _fastify.url;
            // },
            // set url(value){
            //     return _fastify.url = value;
            // },
            // get domain(){
            //     return _fastify.domain;
            // },
            // set domain(value){
            //     return _fastify.domain = value;
            // },
            get log(){
                return _fastify.log;
            },
            set log(value){
                return _fastify.log = value;
            },
            get(...args) {
                _fastify.emit('transom.route.get', args);
                return _fastify.get(...args);
            },
            head(...args) {
                _fastify.emit('transom.route.head', args);
                return _fastify.head(...args);
            },
            trace(...args) {
                _fastify.emit('transom.route.trace', args);
                return _fastify.trace(...args);
            },
            post(...args) {
                _fastify.emit('transom.route.post', args);
                return _fastify.post(...args);
            },
            put(...args) {
                _fastify.emit('transom.route.put', args);
                return _fastify.put(...args);
            },
            patch(...args) {
                _fastify.emit('transom.route.patch', args);
                return _fastify.patch(...args);
            },
            del(...args) {
                _fastify.emit('transom.route.del', args);
                return _fastify.delete(...args);
            },
            opts(...args) {
                _fastify.emit('transom.route.opts', args);
                return _fastify.opts(...args);
            },
            // pre(...args) {
            //     return _fastify.pre(...args);
            // },
            use(...args) {
                _fastify.emit('transom.route.all', args);
                return _fastify.all(...args);
            },
            // toString(...args) {
            //     return _fastify.listen(...args);
            // },
            // close(...args) {
            //     return _fastify.close(...args);
            // },
            // on(...args) {
            //     return _fastify.on(...args);
            // },
            // param(...args) {
            //     return _fastify.param(...args);
            // }, 
            // rm(...args) {
            //     _fastify.emit('transom.route.rm', args);
            //     return _fastify.rm(...args);
            // }, 
            // address() {
            //     return _fastify.address();
            // }, 
            // inflightRequests() {
            //     return _fastify.inflightRequests();
            // }, 
            // getDebugInfo() {
            //     return _fastify.getDebugInfo();
            // }, 
            // toString() {
            //     return _fastify.toString();
            // }
        };
        return server;
    }
};