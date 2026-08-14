'use strict';

// eslint-disable-next-line
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = [
  'fetch:request',
  'cloudflare:solve', 'cloudflare:solve-turnstile',
  'cookie:set', 'cookie:get', 'cookie:set-from-response',
  'cookie:flush', 'cookie:remove-session',
  'storage:init', 'storage:set', 'storage:get', 'storage:delete',
  'storage:get-all-keys', 'storage:clear-all',
  'settings:get', 'settings:set', 'settings:get-user-agent',
  'preview:open',
];

// Main -> renderer pushes the renderer is allowed to subscribe to.
const ALLOWED_EVENTS = ['preview:webstorage'];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => {
    if (ALLOWED_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel "${channel}" not allowed`));
  },
  on: (channel, listener) => {
    if (!ALLOWED_EVENTS.includes(channel)) return () => {};
    const wrapped = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
