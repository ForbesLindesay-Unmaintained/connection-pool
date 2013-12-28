# connection-pool

Connection pooling logic for use with any service

[![Build Status](https://travis-ci.org/ForbesLindesay/connection-pool.png?branch=master)](https://travis-ci.org/ForbesLindesay/connection-pool)
[![Dependency Status](https://gemnasium.com/ForbesLindesay/connection-pool.png)](https://gemnasium.com/ForbesLindesay/connection-pool)
[![NPM version](https://badge.fury.io/js/connection-pool.png)](http://badge.fury.io/js/connection-pool)

## Installation

    npm install connection-pool

## Example

For example, say you wanted to set up and use a connection pool for MySQL:

```js
var MySqlProvider = require('connection-pool/providers/mysql');
var LimitStrategy = require('connection-pool/strategies/limit');

var pool = new LimitStrategy(new MySqlProvider({
  host: 'hostname',
  port: 'port',
  user: 'user',
  password: 'password',
  database: 'database'
}), {
  limit: 20,
  idleTime: '10 minutes'
});

function query(str) {
  return pool.use(function (connection) {
    return new Promise(function (resolve, reject) {
      connection.query(str, function (err, rows) {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  });
}
```

## Strategies

Each strategy takes a `Provider` as it's first argument and an options object as its second argument.

### Base

The base strategy provides the following public methods:

 - `expand` - increases the number of connections available in the pool by one.
 - `shrink` - reduces the number of connections available in the pool by one.
 - `destroy` - removes all connections from the pool and prevents any more being opened.
 - `use(fn)` - take a connection out of the pool and give it to fn, wait for fn to complete, then return the connection to the pool.  It will return a `Promise` for the result of calling fn.
 
 By default the base strategy is pretty useless as it starts with an empty pool.  You can call `expand` to add to the pool though, so could fairly easilly have a fixed sized pool.

```js
// create a connection pool of size 2
var BaseStrategy = require('conneciton-pool/strategies/base');

var pool = new BaseStrategy(provider);
pool.expand();
pool.expand();
```

### Simple

The simple strategy creates a new connection whenever there is an operation waiting for a connection.  The problem with this is that a sudden spike can lead to a lot of connections staying open forever (unless you manually close them using `shrink`).

### Limit

Limit extends the `Simple` strategy by letting you specify a maximum number of connections to create and/or a maximum time to have idle connections before closing one.

```js
var LimitStrategy = require('conneciton-pool/strategies/limit');

var pool = new LimitStrategy(provider, {
  min: 4, // always keep at least one connection open (default: 0)
  max: 20, // never open more than 20 connections (default: Infinity)
  idleTime: '10 minutes', // every 10 minutes that go past with at least the `lowWaterMark` number of
                          // connections going spare, close a conneciton (default: Infinity)
  lowWaterMark: 2 // only close connections if there are more than this many spare (default: 0)
});
```

## License

  MIT