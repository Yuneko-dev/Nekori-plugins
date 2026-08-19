// Placeholder for cookie management functions. These functions are not implemented yet,
// but they can be used in the LNReader-eXtended / Nekori application.

type Cookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  version?: string;
  expires?: string;
  secure?: boolean;
  httpOnly?: boolean;
};

type Cookies = Record<string, Cookie>;

function set(url: string, cookie: Cookie) {
  return Promise.resolve(true);
}

function get(url: string): Promise<Cookies> {
  return Promise.resolve({});
}

function setFromResponse(url: string, cookie: string) {
  return Promise.resolve(true);
}

function flush() {
  return Promise.resolve();
}

function removeSessionCookies() {
  return Promise.resolve(true);
}

export { set, get, setFromResponse, flush, removeSessionCookies };
