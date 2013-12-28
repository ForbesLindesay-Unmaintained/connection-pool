'use strict';

var Promise = require('promise');
var mysql = require('mysql');

module.exports = MySqlSource;
function MySqlSource(configs) {
  if (!Array.isArray(configs)) configs = [configs];
  this.configs = configs;
}

/**
 * Create and return a new Connection object
 *
 * @return {Promise.<MySqlConnection>}
 */
MySqlSource.prototype.create = function () {
  var config = this.configs.pop();
  this.configs.unshift(config);
  return new MySqlConnection(config).ready;
};

/**
 * Destroy a MySql connection
 *
 * @param {MySqlConnection} connection The connection to close
 */
MySqlSource.prototype.destroy = function (connection) {
  return connection.destroy();
};

/**
 * Attempt to get the underlying connection object from a MySql connection, will fail if it has been closed
 *
 * @param {MySqlConnection} connection The connection to clsoe
 * @return {Connection}
 */
MySqlSource.prototype.unwrap = function (connection) {
  return connection.unwrap();
};

/**
 * Test if a connection is still alive and return true if it is
 *
 * @param {MySqlConnection} connection The connection to test
 * @return {Boolean}
 */
MySqlSource.prototype.isLive = function (connection) {
  return connection.isLive();
};

function MySqlConnection(config) {
  var self = this;
  this.conn = mysql.createConnection(config);
  this.connected = false;
  this.ready = new Promise(function (resolve, reject) {
    self.conn.connect(function(err) {
      if (err) return reject(err);
      self.connected = true;
      resolve(self);
    });
  });
  this.conn.on('error', function (err) {
    if (err.fatal && self.connected) {
      self.destroy();
    }
  });
}

/**
 * Attempt to close the connection
 */
MySqlConnection.prototype.destroy = function () {
  this.connected = false;
  try {
    this.conn.end();
  } catch (ex) {}
};

/**
 * Get the underlying connection object
 *
 * @return {Connection}
 */
MySqlConnection.prototype.unwrap = function () {
  if (!this.connected) {
    throw new Error('Connection is not connected');
  }
  return this.conn;
};

/**
 * Test whether the connection is still live
 *
 * @return {Boolean}
 */
MySqlConnection.prototype.isLive = function () {
  return this.connected;
};
