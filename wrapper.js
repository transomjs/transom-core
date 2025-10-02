'use strict';

module.exports = {
    wrapServer: function(_express, _registry) {
        const server = {
            get registry() {
                // Post-initialize registry access.
                return _registry;
            },
            get express(){
                return _express;
            },
            get name(){
                return _express.name;
            },
            set name(value){
                return _express.name = value;
            },
            get url(){
                return _express.url;
            },
            set url(value){
                return _express.url = value;
            },
            get domain(){
                return _express.domain;
            },
            set domain(value){
                return _express.domain = value;
            },
            get log(){
                return _express.log;
            },
            set log(value){
                return _express.log = value;
            },
            get(...args) {
                _express.emit('transom.route.get', args);
                return _express.get(...args);
            },
            head(...args) {
                _express.emit('transom.route.head', args);
                return _express.head(...args);
            },
            post(...args) {
                _express.emit('transom.route.post', args);
                return _express.post(...args);
            },
            put(...args) {
                _express.emit('transom.route.put', args);
                return _express.put(...args);
            },
            patch(...args) {
                _express.emit('transom.route.patch', args);
                return _express.patch(...args);
            },
            del(...args) {
                _express.emit('transom.route.del', args);
                // Express doesn't have delete() but some servers might have del()
                if (typeof _express.delete === 'function') {
                    return _express.delete(...args);
                } else if (typeof _express.del === 'function') {
                    return _express.del(...args);
                }
                return _express;
            },
            opts(...args) {
                _express.emit('transom.route.opts', args);
                // Express uses options() instead of opts()
                if (typeof _express.options === 'function') {
                    return _express.options(...args);
                } else if (typeof _express.opts === 'function') {
                    return _express.opts(...args);
                }
                return _express;
            },
            pre(...args) {
                // Express doesn't have pre(), so we'll treat it like use()
                return _express.use(...args);
            },
            use(...args) {
                return _express.use(...args);
            },
            listen(...args) {
                return _express.listen(...args);
            },
            close(...args) {
                // Express apps don't have close(), but the http server does
                // This will be available after listen() is called
                if (_express.server) {
                    return _express.server.close(...args);
                }
                return Promise.resolve();
            },
            on(...args) {
                return _express.on(...args);
            },
            param(...args) {
                return _express.param(...args);
            },
            rm(...args) {
                _express.emit('transom.route.rm', args);
                // Express doesn't have rm(), but we can keep the API for compatibility
                // This would need custom implementation to remove routes
                return server;
            },
            address() {
                // Express apps don't have address(), but the http server does
                if (_express.server) {
                    return _express.server.address();
                }
                return null;
            },
            inflightRequests() {
                // Express doesn't track this, return 0 for compatibility
                return 0;
            },
            getDebugInfo() {
                // Return basic debug info for Express
                return {
                    routes: _express._router ? _express._router.stack.length : 0,
                    env: _express.get('env')
                };
            },
            toString() {
                return _express.toString();
            }
        };
        return server;
    }
};
