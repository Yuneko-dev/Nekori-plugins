#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compiledPlugins } from './plugin-build-utils.js';
import { probeSite } from './site-probe.js';
import { resolveNetworkOptions } from './check-network.js';

const DEFAULT_OUTPUT = 'broken-sites-report.json';
export function parseArgs(argv) {
  const args = {
    timeout: 15000,
    attempts: 2,
    concurrency: 4,
    output: DEFAULT_OUTPUT,
    'dns-mode': 'secure',
    doh: 'https://cloudflare-dns.com/dns-query',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (
      [
        '--plugin',
        '--url',
        '--timeout',
        '--attempts',
        '--concurrency',
        '--output',
        '--dns-mode',
        '--doh',
      ].includes(value) &&
      (!argv[i + 1] || argv[i + 1].startsWith('--'))
    )
      throw new Error(`Missing value for ${value}`);
    if (value === '--plugin') args.plugin = argv[++i];
    else if (value === '--url') args.url = argv[++i];
    else if (value === '--timeout') args.timeout = Number(argv[++i]);
    else if (value === '--attempts') args.attempts = Number(argv[++i]);
    else if (value === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (value === '--output') args.output = argv[++i];
    else if (value === '--dns-mode') args['dns-mode'] = argv[++i];
    else if (value === '--doh') args.doh = argv[++i];
    else if (value === '--no-ech') args['no-ech'] = true;
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  for (const key of ['timeout', 'attempts', 'concurrency'])
    if (!Number.isInteger(args[key]) || args[key] < 1)
      throw new Error(`--${key} must be a positive integer`);
  args.network = resolveNetworkOptions(args);
  return args;
}
function usage() {
  return 'Usage: node scripts/check-plugin-sites.js [--plugin ID] [--url URL] [--timeout MS] [--attempts N] [--concurrency N] [--dns-mode secure|automatic|off] [--doh HTTPS_URL] [--no-ech] [--output FILE]';
}
export function siteEntries(plugins, filterId, standaloneUrl) {
  if (standaloneUrl)
    return [
      { url: standaloneUrl, plugins: filterId ? [{ id: filterId }] : [] },
    ];
  const grouped = new Map();
  for (const { plugin } of plugins) {
    if (filterId && plugin.id !== filterId) continue;
    if (
      typeof plugin.site !== 'string' ||
      !plugin.site.trim() ||
      plugin.site === 'url'
    )
      continue;
    const record = { id: plugin.id, name: plugin.name, lang: plugin.lang };
    const existing = grouped.get(plugin.site);
    if (existing) existing.plugins.push(record);
    else grouped.set(plugin.site, { url: plugin.site, plugins: [record] });
  }
  return [...grouped.values()];
}
async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, consume),
  );
  return output;
}
export async function runChecks(entries, options) {
  return mapLimit(entries, options.concurrency, async entry => ({
    ...entry,
    result: await probeSite(entry.url, options),
  }));
}
export function runChromiumChecks(entries, options) {
  const require = createRequire(import.meta.url);
  const electron = require('electron');
  const worker = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'electron-site-check.cjs',
  );
  return new Promise((resolve, reject) => {
    const inputPath = path.join(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.js'),
      `site-check-${process.pid}-${Date.now()}.json`,
    );
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(
      inputPath,
      JSON.stringify({
        entries,
        options: { ...options, network: undefined, ...options.network },
      }),
    );
    const outputPath = `${inputPath}.out`;
    const featureArg = options.network.ech
      ? '--enable-features=UseDnsHttpsSvcb,EncryptedClientHello'
      : '--disable-features=UseDnsHttpsSvcb,EncryptedClientHello';
    const child = spawn(
      electron,
      [
        '--disable-gpu',
        '--disable-gpu-compositing',
        '--in-process-gpu',
        featureArg,
        worker,
      ],
      {
        cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
        stdio: ['ignore', 'ignore', 'inherit'],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
          NEKORI_SITE_CHECK_INPUT: inputPath,
          NEKORI_SITE_CHECK_OUTPUT: outputPath,
        },
        windowsHide: true,
      },
    );
    const watchdog = setTimeout(
      () => {
        child.kill();
        reject(new Error('Electron site checker exceeded its time limit'));
      },
      30000 +
        options.timeout *
          (options.attempts || 2) *
          Math.ceil(entries.length / (options.concurrency || 4)),
    );
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(watchdog);
      let output;
      if (code === 0) {
        try {
          output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        } catch (error) {
          reject(
            new Error(`Invalid Electron site-check output: ${error.message}`),
          );
          output = null;
        }
      }
      try {
        fs.rmSync(inputPath, { force: true });
        fs.rmSync(outputPath, { force: true });
      } catch {
        /* Best-effort cleanup of the bounded input file. */
      }
      if (code !== 0) {
        reject(new Error(`Electron site checker exited with ${code}`));
        return;
      }
      if (output) resolve(output);
    });
  });
}
export function makeReport(records, options = {}) {
  const statuses = [
    'accessible',
    'blocked',
    'http_error',
    'network_error',
    'timeout',
    'invalid_url',
  ];
  const counts = Object.fromEntries(
    statuses.map(status => [
      status,
      records.filter(record => record.result.status === status).length,
    ]),
  );
  return {
    timestamp: new Date().toISOString(),
    ...(options.network ? { network: options.network } : {}),
    total: records.length,
    counts,
    sites: records.map(({ url, plugins, result }) => ({
      url,
      plugins,
      ...result,
    })),
  };
}
export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const plugins = options.url ? [] : compiledPlugins();
  const entries = siteEntries(plugins, options.plugin, options.url);
  if (options.plugin && !options.url && !entries.length)
    throw new Error(`Plugin not found or has no site: ${options.plugin}`);
  const output = path.resolve(options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const pending = { ...makeReport([], options), status: 'running' };
  fs.writeFileSync(output, JSON.stringify(pending, null, 2));
  let records;
  try {
    records = await runChromiumChecks(entries, options);
  } catch (error) {
    fs.writeFileSync(
      output,
      JSON.stringify(
        { ...pending, status: 'needs_attention', reason: error.message },
        null,
        2,
      ),
    );
    throw error;
  }
  const report = makeReport(records, options);
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  for (const record of records)
    console.log(
      `${record.result.status.padEnd(13)} ${record.url}${record.result.finalUrl !== record.url ? ` -> ${record.result.finalUrl}` : ''}`,
    );
  console.log(`Checked ${records.length} site(s); report: ${output}`);
  return records.some(
    record => !['accessible', 'blocked'].includes(record.result.status),
  )
    ? 1
    : 0;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error.message);
      console.error(usage());
      process.exitCode = 1;
    });
