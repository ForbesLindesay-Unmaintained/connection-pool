'use strict';

var assert = require('assert');
var inspect = require('util').inspect;
var mysql = require('mysql');
var Promise = require('promise');

var MySqlProvider = require('../providers/mysql');

var Base = require('../strategies/base');
var Simple = require('../strategies/simple');
var Limit = require('../strategies/limit');

function poolStatusAsserter(pool) {
  /**
   * Check the pool size is correct
   *
   * @param {Number} poolSize
   * @param {Number} available
   * @param {Number} queue
   */
  function poolStatus(poolSize, available, queue) {
    assert(pool.poolSize === poolSize,
           'Expected pool size to be ' + inspect(poolSize) + ' but got ' + inspect(pool.poolSize));
    assert(pool.pool.length === available,
           'Expected available size to be ' + inspect(available) + ' but got ' + inspect(pool.pool.length));
    assert(pool.queue.length === queue,
           'Expected queue length to be ' + inspect(queue) + ' but got ' + inspect(pool.queue.length));
  }
  return poolStatus;
}

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
  describe('strategies', function () {
    describe('base', function () {
      it('supports expand, use and contract', function (done) {
        var sentinel = {};
        var id = 0;
        var provider = {
          create: function () {
            return {
              sentinel: sentinel,
              id: id++
            };
          }
        };
        var pool = new Base(provider);
        var poolStatus = poolStatusAsserter(pool);
        poolStatus(0, 0, 0);
        pool.expand().then(function () {
          poolStatus(1, 1, 0);
          assert(id === 1);
          assert(pool.pool[0].sentinel === sentinel);
          assert(pool.pool[0].id === 0);
          var next;
          var final;
          return pool.use(function (connection) {
            assert(connection.sentinel === sentinel);
            assert(connection.id === 0);
            poolStatus(1, 0, 0);
            next = pool.use(function (connection) {
              assert(connection.sentinel === sentinel);
              assert(connection.id === 0);
              poolStatus(1, 0, 1);
              pool.expand();
              return final;
            });
            final = pool.use(function (connection) {
              assert(connection.sentinel === sentinel);
              assert(connection.id === 1);
              poolStatus(2, 0, 0);
            });
            poolStatus(1, 0, 2);
          }).then(function () {
            return next;
          });
        }).then(function () {
          return Promise.all(pool.shrink(), pool.shrink());
        }).then(function () {
          poolStatus(0, 0, 0);
          assert(id === 2);
        }).nodeify(done);
      });
    });
    describe('simple', function () {
      it('creates new connections whenever they are needed', function (done) {
        var sentinel = {};
        var id = 0;
        var provider = {
          create: function () {
            return {
              sentinel: sentinel,
              id: id++
            };
          }
        };
        var pool = new Simple(provider);
        var poolStatus = poolStatusAsserter(pool);
        poolStatus(0, 0, 0);
        pool.use(function (connection) {
          poolStatus(1, 0, 0);
          return pool.use(function (connection) {
            poolStatus(2, 0, 0);
          });
        }).then(function () {
          poolStatus(2, 2, 0);
          return pool.use(function (connection) {
            poolStatus(2, 1, 0);
          });
        }).then(function () {
          poolStatus(2, 2, 0);
          return Promise.all(pool.shrink(), pool.shrink());
        }).then(function () {
          poolStatus(0, 0, 0);
        }).nodeify(done);
      });
    });
    describe('limit', function () {
      it('supports min and max and idleTime', function (done) {
        var sentinel = {};
        var id = 0;
        var provider = {
          create: function () {
            return {
              sentinel: sentinel,
              id: id++
            };
          }
        };
        var pool = new Limit(provider, {min: 1, max: 2, idleTime: '50ms'});
        var poolStatus = poolStatusAsserter(pool);
        poolStatus(1, 0, 0);
        setTimeout(function () {
          poolStatus(1, 1, 0);
          pool.use(function (connection) {
            poolStatus(1, 0, 0);
            return pool.use(function (connection) {
              poolStatus(2, 0, 0);
            });
          }).then(function () {
            poolStatus(2, 2, 0);
            var pending;
            return pool.use(function (connection) {
              poolStatus(2, 1, 0);
              return pool.use(function (connection) {
                poolStatus(2, 0, 0);
                pending = pool.use(function (connection) {
                  poolStatus(2, 0, 0);
                });
              });
            }).then(function () { return pending; });
          }).then(function () {
            poolStatus(2, 2, 0);
            return Promise.all(pool.shrink(), pool.shrink());
          }).then(function () {
            poolStatus(1, 1, 0);
            return Promise.all(pool.expand(), pool.expand(), pool.expand());
          }).then(function () {
            poolStatus(2, 2, 0);
            return new Promise(function (resolve) {
              setTimeout(resolve, 100);
            }).then(function () {
              poolStatus(1, 1, 0);
            });
          }).nodeify(done);
        }, 100);
      });
    });
  });
});