'use strict';

var BaseStrategy = require('./base.js');

module.exports = SimpleStrategy;
function SimpleStrategy(provider, options) {
  BaseStrategy.call(this, provider);
  this.on('queue-push', function () {
    self.expand();
  });
}
SimpleStrategy.prototype = Object.create(BaseStrategy.prototype);
SimpleStrategy.prototype.constructor = SimpleStrategy;
