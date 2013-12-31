'use strict';

var ms = require('ms');
var SimpleStrategy = require('./simple.js');

module.exports = LimitStrategy;
function LimitStrategy(provider, options) {
  SimpleStrategy.call(this, provider);
  this.max = options.max || Infinity;
  this.min = options.min || 0;
  for (var i = 0; i < this.min; i++) {
    this.expand();
  }
  var idleTime = options.idleTime;
  var lowWaterMark = this.lowWaterMark || 0;
  if (idleTime && idleTime !== Infinity) {
    var self = this;

    idleTime = ms(idleTime.toString());
    var timeout;

    var tryShrink = function () {
      if (self.pool.length) {
        self.shrink();
      }
      if (self.pool.length) {
        timeout = setTimeout(tryShrink, idleTime);
      }
    }
    this.on('begin-transaction', function () {
      if (self.pool.length <= lowWaterMark) {
        clearTimeout(timeout);
      }
    });
    this.on('end-transaction', function () {
      timeout = setTimeout(tryShrink, idleTime);
    });
  }
}
LimitStrategy.prototype = Object.create(SimpleStrategy.prototype);
LimitStrategy.prototype.constructor = LimitStrategy;

/**
 * Only allow expanding if the pool size has not hit the maximum
 */
LimitStrategy.prototype.expand = function () {
  if (this.poolSize < this.max) {
    return SimpleStrategy.prototype.expand.call(this);
  }
};

/**
 * Only allow shrinking if the pool size is above the minimum or it is destroyed
 */
LimitStrategy.prototype.shrink = function () {
  if (this.poolSize > this.min || this.destroyed) {
    return SimpleStrategy.prototype.shrink.call(this);
  }
};

