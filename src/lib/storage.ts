const PLUGIN_STORAGE = '_DB_';
const WEBVIEW_LOCAL_STORAGE = '_LocalStorage';
const WEBVIEW_SESSION_STORAGE = '_SessionStorage';

type StoredItem = {
  created: Date;
  value: any;
  expires?: number;
};

function getPluginId() {
  if (typeof window === 'undefined') return '__global__';
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('plugin') || '__global__';
}

class Storage {
  #pluginID?: string;
  constructor(pluginID?: string) {
    this.#pluginID = pluginID;
  }

  private get pid() {
    return this.#pluginID || getPluginId();
  }

  set(key: string, value: any, expires?: Date | number): void {
    const item: StoredItem = {
      created: new Date(),
      value,
      expires: expires instanceof Date ? expires.getTime() : expires,
    };
    window.localStorage.setItem(
      this.pid + PLUGIN_STORAGE + key,
      JSON.stringify(item),
    );
  }

  get(key: string, raw?: boolean): any {
    const storedItem = window.localStorage.getItem(
      this.pid + PLUGIN_STORAGE + key,
    );
    if (storedItem) {
      const item: StoredItem = JSON.parse(storedItem);
      if (item.expires) {
        if (Date.now() > item.expires) {
          this.delete(key);
          return undefined;
        }
        if (raw) {
          item.expires = new Date(item.expires).getTime();
        }
      }
      return raw ? item : item.value;
    }
    return undefined;
  }

  delete(key: string): void {
    window.localStorage.removeItem(this.pid + PLUGIN_STORAGE + key);
  }

  clearAll(): void {
    const keysToRemove = this.getAllKeys();
    keysToRemove.forEach(key => this.delete(key));
  }

  getAllKeys(): string[] {
    const prefix = this.pid + PLUGIN_STORAGE;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key.replace(prefix, ''));
      }
    }
    return keys;
  }
}

class LocalStorage {
  #pluginID?: string;
  constructor(pluginID?: string) {
    this.#pluginID = pluginID;
  }
  private get pid() {
    return this.#pluginID || getPluginId();
  }

  get(): StoredItem['value'] | undefined {
    const data = window.localStorage.getItem(this.pid + WEBVIEW_LOCAL_STORAGE);
    return data ? JSON.parse(data) : undefined;
  }
}

class SessionStorage {
  #pluginID?: string;
  constructor(pluginID?: string) {
    this.#pluginID = pluginID;
  }
  private get pid() {
    return this.#pluginID || getPluginId();
  }

  get(): StoredItem['value'] | undefined {
    const data = window.localStorage.getItem(
      this.pid + WEBVIEW_SESSION_STORAGE,
    );
    return data ? JSON.parse(data) : undefined;
  }
}

export const storage = new Storage();
export const localStorage = new LocalStorage();
export const sessionStorage = new SessionStorage();
export { Storage, LocalStorage, SessionStorage };
