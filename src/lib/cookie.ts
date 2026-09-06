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

export function set(url: string, cookie: Cookie): Promise<boolean> {
  return window.electronAPI!.invoke('cookie:set', url, cookie);
}
export function get(url: string): Promise<Cookies> {
  return window.electronAPI!.invoke('cookie:get', url);
}
export function setFromResponse(url: string, cookie: string): Promise<boolean> {
  return window.electronAPI!.invoke('cookie:set-from-response', url, cookie);
}
export function flush(): Promise<void> {
  return window.electronAPI!.invoke('cookie:flush');
}
export function removeSessionCookies(): Promise<boolean> {
  return window.electronAPI!.invoke('cookie:remove-session');
}
