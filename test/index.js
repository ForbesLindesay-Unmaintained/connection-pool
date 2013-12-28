'use strict';

var assert = require('assert');
var mysql = require('mysql');
var Promise = require('promise');

var MySqlProvider = require('../providers/mysql');

var Base = require('../strategies/base');
var Simple = require('../strategies/simple');
var Limit = require('../strategies/limit');

describe('connection-pool', function () {
  describe('providers', function () {
    describe('mysql', function () {
      it('implements a provider for mysql', function (done) {
        var sentinel = {};
        var a = {}, b = {}, c = {};
        mysql.createConnection = function (config) {
          var self = {
            connection: sentinel,
            config: config,
            connect: function (cb) {
              setImmediate(function () {
                self.connected = true;
                cb();
              });
            }, end: function () {
              self.connected = false;
              self.ended = true;
            }, on: function (name, cb) {
              assert(name === 'error');
              self.errorCb = cb;
            }
          };
          return self;
        };
        var provider = new MySqlProvider([a, b, c]);
        Promise.all(provider.create(), provider.create(), provider.create()).then(function (res) {
          assert(provider.unwrap(res[0]).config = a);
          assert(provider.unwrap(res[1]).config = b);
          assert(provider.unwrap(res[2]).config = c);
          for (var i = 0; i < res.length; i++) {
            assert(provider.unwrap(res[i]).connected);
            assert(provider.isLive(res[i]));
          }
          
          var A = provider.unwrap(res[0]);
          var B = provider.unwrap(res[1]);
          provider.destroy(res[0]);
          provider.unwrap(res[1]).errorCb({fatal: true});
          provider.unwrap(res[2]).errorCb({fatal: false});
          assert(!A.connected);
          assert(A.ended);
          assert(!provider.isLive(res[0]));
          assert(!B.connected);
          assert(B.ended);
          assert(!provider.isLive(res[1]));
          assert(provider.unwrap(res[2]).connected);
          assert(provider.isLive(res[2]));
        }).nodeify(done);
      });
    });
  });
});