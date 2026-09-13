/**
 * Compatible only with the Nekori app.
 */
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

/** Set a cookie for an absolute URL in the host cookie jar. */
export function set(url: string, cookie: Cookie): Promise<boolean> {
  return window.electronAPI!.invoke('cookie:set', url, cookie);
}
/** Read cookies applicable to an absolute URL, keyed by cookie name. */
export function get(url: string): Promise<Cookies> {
  return window.electronAPI!.invoke('cookie:get', url);
}
/** Apply a Set-Cookie response header to the host cookie jar. */
export function setFromResponse(url: string, cookie: string): Promise<boolean> {
  return window.electronAPI!.invoke('cookie:set-from-response', url, cookie);
}
/** Persist pending cookie changes; does not synchronize plugin storage. */
export function flush(): Promise<void> {
  return window.electronAPI!.invoke('cookie:flush');
}
/** Remove session cookies from the shared host jar. */
export function removeSessionCookies(): Promise<boolean> {
  return window.electronAPI!.invoke('cookie:remove-session');
}
