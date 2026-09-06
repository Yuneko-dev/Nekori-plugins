export type NetworkOptions = {
  dnsMode: 'secure' | 'automatic' | 'off';
  doh: string;
  ech: boolean;
};

export declare function resolveNetworkOptions(
  values?: Record<string, unknown>,
): NetworkOptions;

export declare function configureNetwork(
  electronApp: {
    commandLine: { appendSwitch(name: string, value: string): void };
    whenReady(): Promise<unknown>;
    configureHostResolver(options: Record<string, unknown>): void;
  },
  config: NetworkOptions,
): void;

export declare function applyNetworkFeatures(
  electronApp: {
    commandLine: {
      appendSwitch(name: string, value: string): void;
      getSwitchValue(name: string): string;
    };
  },
  config: NetworkOptions,
): void;

export declare const DEFAULT_DOH: string;
export declare const networkOptions: {
  'dns-mode': { type: 'string'; default: string };
  doh: { type: 'string'; default: string };
  'no-ech': { type: 'boolean' };
};
