'use strict';

var EventEmitter = require('events').EventEmitter;
var Promsie = require('promise');

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

BaseStrategy.prototype.provider_create = function () {
  try {
    return Promise.from(this.provider.create());
  } catch (ex) {
    return new Promise(function (resolve, reject) {
      reject(ex);
    });
  }
};

BaseStrategy.prototype.provider_destroy = function (c) {
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

BaseStrategy.prototype.provider_unwrap = function (c) {
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

BaseStrategy.prototype.provider_isLive = function (c) {
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

BaseStrategy.prototype.expand = function () {
  if (this.destroyed) return Promise.from(null);
  this.poolSize++;
  return Promise.from(this.provider_create()).then(function (connection) {
    this.addConnection(connection);
  }.bind(this), function (err) {
    this.poolSize--;
    throw err;
  }.bind(this));
};
BaseStrategy.prototype.shrink = function () {
  this.poolSize--;
  return this.getConnection().then(function (connection) {
    this.provider_destroy(connection);
  }, function (err) {
    this.poolSize++;
    throw err;
  }.bind(this));
};

BaseStrategy.prototype.destroy = function () {
  this.destroyed = true;
  while(this.poolSize) {
    this.shrink();
  }
};

BaseStrategy.prototype.addConnection = function (connection) {
  this.emit('add-connection');
  if (this.queue) {
    this.emit('queue-shift');
    this.queue.shift()(connection);
  } else {
    this.pool.push(connection);
  }
};

BaseStrategy.prototype.getConnection = function () {
  this.emit('get-connection');
  if (this.pool.length) {
    var connection = this.pool.pop()
    return this.provider_isLive(connection).then(function (isLive) {
      if (isLive) {
        return connection;
      } else {
        this.poolSize--;
        this.provider_destroy(connection);
        return this.getConnection();
      }
    }.bind(this), function (err) {
      this.poolSize--;
      this.provider_destroy(connection);
      throw err;
    }.bind(this));
  } else {
    return new Promise(function (resolve) {
      this.emit('queue-push');
      this.queue.push(resolve);
    }.bind(this));
  }
};

BaseStrategy.prototype.use = function (fn, timeout) {
  if (this.destroyed) {
    var err = new Error('Cannot call `.use` on a destroyed connection pool');
    return new Promise(function (resolve, reject) { reject(err); });
  }
  var self = this;
  var c;
  return this.getConnection().then(function (connection) {
    c = connection;
    self.emit('begin-use');
    return self.provider_unwrap(c).then(fn);
  }).then(function (res) {
    self.emit('end-use');
    self.addConnection(c);
    return res;
  }, function (err) {
    self.emit('end-use');
    if (err.fatal) {
      self.poolSize--;
      self.provider_destroy(c);
    } else {
      self.addConnection(c);
    }
    throw err;
  });
};
