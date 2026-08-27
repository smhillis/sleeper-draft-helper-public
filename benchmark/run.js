#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// benchmark.js began life as a CLI and ends with `main();` plus a trailing
// newline. benchmark-v2 loads the same production benchmark functions as a
// library without executing v1's CLI. Normalize only that source read so the
// loader's explicit entrypoint guard remains fail-closed if anything else in
// the file shape changes.
const originalReadFileSync = fs.readFileSync.bind(fs);
fs.readFileSync = function benchmarkLibraryRead(file, ...args) {
  const value = originalReadFileSync(file, ...args);
  if (typeof value === 'string' && path.resolve(String(file)) === path.resolve(__dirname, 'benchmark.js')) return value.trimEnd();
  return value;
};

require('./benchmark-v2');
