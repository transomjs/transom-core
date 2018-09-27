'use strict';

module.exports = {
    wrapServer: function(_restify, _registry) {
        const server = {
            get registry() {
                // Post-initialize registry access.
                return _registry;
            },
            get restify(){
                return _restify;
            },
            get name(){
                return _restify.name;
            },
            set name(value){
                return _restify.name = value;
            },
            get url(){
                return _restify.url;
            },
            set url(value){
                return _restify.url = value;
            },
            get domain(){
                return _restify.domain;
            },
            set domain(value){
                return _restify.domain = value;
            },
            get log(){
                return _restify.log;
            },
            set log(value){
                return _restify.log = value;
            },
            get(...args) {
                _restify.get(...args);
            },
            head(...args) {
                _restify.head(...args);
            },
            post(...args) {
                _restify.post(...args);
            },
            put(...args) {
                _restify.put(...args);
            },
            patch(...args) {
                _restify.patch(...args);
            },
            del(...args) {
                _restify.del(...args);
            },
            opts(...args) {
                _restify.opts(...args);
            },
            pre(...args) {
                _restify.pre(...args);
            },
            use(...args) {
                _restify.use(...args);
            },
            listen(...args) {
                _restify.listen(...args);
            },
            close(...args) {
                _restify.listen(...args);
            },
            on(...args) {
                _restify.on(...args);
            }
        };
        return server;
    }
};