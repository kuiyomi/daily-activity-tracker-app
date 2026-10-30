/**
 * src/version.js – Single source of truth for the application version and identity.
 *
 * Plain script without export syntax so it can be loaded in classic script
 * contexts (sw.js via importScripts) and module contexts (side-effect import).
 */

self.APP_VERSION = '0.2.1';
self.APP_NAME = 'Agenda';
