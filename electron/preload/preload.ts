import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_CHANNELS = [
  'fetch:request',
  'cloudflare:solve',
  'cloudflare:solve-turnstile',
  'cookie:set',
  'cookie:get',
  'cookie:set-from-response',
  'cookie:flush',
  'cookie:remove-session',
  'storage:init',
  'storage:set',
  'storage:get',
  'storage:delete',
  'storage:get-all-keys',
  'storage:clear-all',
  'settings:get',
  'settings:set',
  'settings:get-user-agent',
  'preview:open',
] as const;

// Main -> renderer pushes the renderer is allowed to subscribe to.
const ALLOWED_EVENTS = ['preview:webstorage'] as const;

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) => {
    if ((ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel "${channel}" not allowed`));
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    if (!(ALLOWED_EVENTS as readonly string[]).includes(channel)) {
      return () => {};
    }
    const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
