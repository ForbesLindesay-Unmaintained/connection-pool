'use strict';

var EventEmitter = require('events').EventEmitter;
var Promise = require('promise');

module.exports = BaseStrategy;
function BaseStrategy(provider) {
  EventEmitter.call(this);
  this.provider = provider;
  this.poolSize = 0;
  this.pool = [];
  this.queue = [];
  this.destroyed = false;
}
BaseStrategy.prototype = Object.create(EventEmitter.prototype);
BaseStrategy.prototype.constructor = BaseStrategy;

BaseStrategy.prototype._provider_create = function () {
  try {
    return Promise.from(this.provider.create());
  } catch (ex) {
    return new Promise(function (resolve, reject) {
      reject(ex);
    });
  }
};

BaseStrategy.prototype._provider_destroy = function (c) {
  if (this.provider.destroy) {
    try {
      return Promise.from(this.provider.destroy(c));
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex);
      });
    }
  } else {
    return Promise.from(null);
  }
};

BaseStrategy.prototype._provider_unwrap = function (c) {
  if (this.provider.unwrap) {
    try {
      return Promise.from(this.provider.unwrap(c));
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex);
      });
    }
  } else {
    return Promise.from(c);
  }
};

BaseStrategy.prototype._provider_isLive = function (c) {
  if (this.provider.isLive) {
    try {
      return Promise.from(this.provider.isLive(c));
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex);
      });
    }
  } else {
    return Promise.from(true);
  }
};

BaseStrategy.prototype._addConnection = function (connection) {
  if (this.queue.length) {
    this.emit('queue-shift');
    this.queue.shift()(connection);
  } else {
    this.pool.push(connection);
  }
};

BaseStrategy.prototype._getConnection = function () {
  if (this.pool.length) {
    var connection = this.pool.shift();
    return this._provider_isLive(connection).then(function (isLive) {
      if (isLive) {
        return connection;
      } else {
        this.poolSize--;
        this._provider_destroy(connection);
        return this._getConnection();
      }
    }.bind(this), function (err) {
      this.poolSize--;
      this._provider_destroy(connection);
      throw err;
    }.bind(this));
  } else {
    return new Promise(function (resolve) {
      this.emit('queue-push');
      this.queue.push(resolve);
    }.bind(this));
  }
};

BaseStrategy.prototype.expand = function () {
  if (this.destroyed) return Promise.from(null);
  this.emit('expand');
  this.poolSize++;
  return Promise.from(this._provider_create()).then(function (connection) {
    this._addConnection(connection);
  }.bind(this), function (err) {
    this.poolSize--;
    throw err;
  }.bind(this));
};
BaseStrategy.prototype.shrink = function () {
  this.emit('shrink');
  this.poolSize--;
  return this._getConnection().then(function (connection) {
    this._provider_destroy(connection);
  }.bind(this), function (err) {
    this.poolSize++;
    throw err;
  }.bind(this));
};

BaseStrategy.prototype.destroy = function () {
  this.emit('destroy');
  this.destroyed = true;
  while(this.poolSize) {
    this.shrink();
  }
};

BaseStrategy.prototype.use = function (fn, timeout) {
  if (this.destroyed) {
    var err = new Error('Cannot call `.use` on a destroyed connection pool');
    return new Promise(function (resolve, reject) { reject(err); });
  }
  this.emit('use');
  var self = this;
  var c;
  return this._getConnection().then(function (connection) {
    c = connection;
    self.emit('begin-transaction');
    return self._provider_unwrap(c).then(fn);
  }).then(function (res) {
    self.emit('end-transaction');
    self._addConnection(c);
    return res;
  }, function (err) {
    self.emit('end-transaction');
    if (err.fatal) {
      self.poolSize--;
      self._provider_destroy(c);
    } else {
      self._addConnection(c);
    }
    throw err;
  });
};
