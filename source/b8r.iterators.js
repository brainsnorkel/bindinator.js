/**
# Iterators

    makeArray(arrayish) // => [array]

Creates a proper array from annoying array-like objects,
like *NodeLists* and *arguments* (although *don't use arguments, use ...args**).

    forEachKey(object, method)

Exactly like forEach except it iterates on the object's keys.

    mapEachKey(object, method) // => {map}

Just like map, except it creates an object from an object instead of an array
from an array.

    findKey(object, predicateMethod) // => first key whose corresponding value
passes predicateMethod

Like findIndex for arrays, but returns key instead.

    findValue(object, predicateMethod) // => returns first value that passes
predicateMethod

Like find for arrays, but iterates over keys to find the value.

~~~~
Test(() => document.querySelectorAll('div') instanceof Array).shouldBe(false);
Test(() => b8r.makeArray(document.querySelectorAll('div')) instanceof
Array).shouldBe(true);
Test(() => {
  const obj = {a: 10, b: 5};
  const s = [];
  b8r.forEachKey(obj, (val, key) => s.push(key + '=' + val));
  return s.join(',');
}).shouldBe('a=10,b=5');
Test(() => {
  const obj = {a: 10, b: 5};
  const map = b8r.mapEachKey(obj, (val, key) => key.charCodeAt(0) + val);
  return JSON.stringify(map);
}).shouldBe('{"a":107,"b":103}');
Test(() => {
  const obj = {a: 10, b: 12, c: 5};
  return b8r.findKey(obj, val => val % 3 === 0);
}).shouldBe('b');
Test(() => {
  const obj = {a: 10, b: 12, c: 5};
  return JSON.stringify(b8r.filterKeys(obj, val => val % 5 === 0));
}).shouldBe('["a","c"]');
Test(() => {
  const obj = {a: 10, b: 12, c: 5};
  return JSON.stringify(b8r.filterObject(obj, val => val % 5 === 0));
}).shouldBe('{"a":10,"c":5}');
~~~~
*/
/* global module */

(function(module) {
  'use strict';

  const makeArray = arrayish => [].slice.apply(arrayish);

  const forEachKey = (object, method) => {
    var key;
    for (var i = 0, keys = Object.keys(object); i < keys.length; i++) {
      key = keys[i];
      if (method(object[key], key) === false) {
        break;
      }
    }
  };

  const mapEachKey = (object, method) => {
    const map = {};
    forEachKey(object, (val, key) => map[key] = method(val, key));
    return map;
  };

  const findKey = (object, test) => {
    var foundKey = null;
    forEachKey(object, (val, key) => {
      if (test(val)) {
        foundKey = key;
        return false;
      }
    });
    return foundKey;
  };

  const findValue = (object, test) => {
    const key = findKey(object, test);
    return key ? object[key] : null;
  };

  const filterKeys = (object, test) => {
    var filtered = [];
    forEachKey(object, (val, key) => {
      if (test(val)) {
        filtered.push(key);
      }
    });
    return filtered;
  };

  const filterObject = (object, test) => {
    var filtered = {};
    forEachKey(object, (val, key) => {
      if (test(val)) {
        filtered[key] = val;
      }
    });
    return filtered;
  };

  module.exports = {
    makeArray,
    forEachKey,
    mapEachKey,
    findKey,
    findValue,
    filterKeys,
    filterObject
  };
}(module));