const DEFAULT_DOH = 'https://cloudflare-dns.com/dns-query';

export const networkOptions = {
  'dns-mode': { type: 'string', default: 'secure' },
  doh: { type: 'string', default: DEFAULT_DOH },
  'no-ech': { type: 'boolean' },
};

export function resolveNetworkOptions(values = {}) {
  const dnsMode = values['dns-mode'] || values.dnsMode || 'secure';
  if (!['secure', 'automatic', 'off'].includes(dnsMode))
    throw new Error('--dns-mode must be secure, automatic, or off');
  const doh = values.doh || DEFAULT_DOH;
  try {
    const url = new URL(doh);
    if (url.protocol !== 'https:' || !url.hostname)
      throw new Error('must be an HTTPS URL');
  } catch (error) {
    throw new Error(`--doh must be an HTTPS URL: ${error.message}`);
  }
  return { dnsMode, doh, ech: !values['no-ech'] && values.ech !== false };
}

export function applyNetworkFeatures(electronApp, config) {
  const flag = config.ech ? 'enable-features' : 'disable-features';
  const features = electronApp.commandLine
    .getSwitchValue(flag)
    .split(',')
    .filter(Boolean);
  electronApp.commandLine.appendSwitch(
    flag,
    // Current Chromium discovers ECH through HTTPS records; the legacy feature
    // name is retained for older Electron versions.
    [...new Set([...features, 'UseDnsHttpsSvcb', 'EncryptedClientHello'])].join(
      ',',
    ),
  );
}

/** Configure Secure DNS after Electron's ready event. */
export function configureNetwork(electronApp, config) {
  const resolver = {
    enableBuiltInResolver: true,
    secureDnsMode: config.dnsMode,
    enableAdditionalDnsQueryTypes: true,
  };
  if (config.dnsMode !== 'off') resolver.secureDnsServers = [config.doh];
  electronApp.configureHostResolver(resolver);
}

export { DEFAULT_DOH };
