#!/usr/bin/env node

/**
 * Forces electron-builder to use the traversal node_modules collector.
 *
 * electron-builder 26.8.1 can fail on some npm 10/Linux environments while
 * parsing the dependency tree via `npm list`, even though the app itself is
 * fine. Traversal avoids that collector path and keeps packaging deterministic.
 */

const { Packager } = require('app-builder-lib/out/packager');
const { PM } = require('app-builder-lib/out/node-module-collector/packageManager');

Packager.prototype.getPackageManager = async function getPackageManager() {
  return PM.TRAVERSAL;
};

require('electron-builder/cli');
