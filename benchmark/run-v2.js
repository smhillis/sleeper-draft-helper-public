#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const originalReadFileSync = fs.readFileSync.bind(fs);
fs.readFileSync = function patchedReadFileSync(file, ...args) {
  const value = originalReadFileSync(file, ...args);
  if (path.basename(String(file)) === 'benchmark.js' && typeof value === 'string') return value.trimEnd();
  return value;
};

require('./benchmark-v2');
