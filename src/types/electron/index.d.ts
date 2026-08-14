/* eslint-disable @typescript-eslint/consistent-type-definitions */
interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<any>;
  /** Subscribe to a main-process push. Returns an unsubscribe function. */
  on?(channel: string, listener: (...args: any[]) => void): () => void;
}
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
export {};
