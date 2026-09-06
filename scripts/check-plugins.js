import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { compiledPlugins } from './plugin-build-utils.js';
import { networkOptions, resolveNetworkOptions } from './check-network.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJsonFile = file =>
  JSON.parse(
    fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''),
  );
process.chdir(root);
const { values } = parseArgs({
  options: {
    ...networkOptions,
    plugin: { type: 'string', multiple: true },
    query: { type: 'string' },
    novel: { type: 'string' },
    chapter: { type: 'string' },
    method: { type: 'string' },
    args: { type: 'string' },
    'args-file': { type: 'string' },
    debug: { type: 'boolean' },
    inspect: { type: 'boolean' },
    config: { type: 'string' },
    timeout: { type: 'string', default: '15000' },
    output: { type: 'string', default: 'plugin-check-report.json' },
    list: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    'check:plugins [--plugin ID] [--query TEXT] [--novel PATH] [--chapter PATH]\n  [--config FILE] [--timeout MS] [--output FILE] [--list] [--debug]\n  [--method NAME --args JSON|--args-file FILE] [--inspect]\n  [--dns-mode secure|automatic|off] [--doh HTTPS_URL] [--no-ech]\nConfig: {"plugin.id":{"settings":{},"query":"...","novel":"...","chapter":"...","method":"parseNovel","args":["/path"]}}\n--method invokes only the selected method; --debug prints redacted diagnostics for either smoke or single-method checks. --inspect opens DevTools for one plugin/method and waits until you close the window.',
  );
} else {
  try {
    const timeout = Number(values.timeout);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) {
      throw new Error('--timeout must be an integer from 100 to 120000 ms');
    }
    const all = compiledPlugins();
    const network = resolveNetworkOptions(values);
    for (const id of values.plugin || []) {
      if (!all.some(({ plugin }) => plugin.id === id))
        throw new Error(`Unknown plugin: ${id}`);
    }
    const selected = all.filter(
      ({ plugin }) => !values.plugin || values.plugin.includes(plugin.id),
    );
    if (!selected.length) throw new Error('No active plugins found');
    if (values.list) {
      selected.forEach(({ plugin }) =>
        console.log(`${plugin.id}\t${plugin.name}`),
      );
    } else {
      if (
        selected.length !== 1 &&
        (values.query || values.novel || values.chapter)
      ) {
        throw new Error(
          'Select one --plugin when using --query, --novel or --chapter; use --config for per-plugin inputs',
        );
      }
      const config = values.config ? readJsonFile(values.config) : {};
      if (!config || Array.isArray(config) || typeof config !== 'object')
        throw new Error('Config must be an object keyed by plugin ID');
      if (values.method && selected.length !== 1)
        throw new Error('Select one --plugin when using --method/--args');
      const validMethods = new Set([
        'popularNovels',
        'searchNovels',
        'parseNovel',
        'parsePage',
        'parseChapter',
        'resolveUrl',
      ]);
      const requestedMethods = selected
        .map(({ plugin }) => values.method || config[plugin.id]?.method)
        .filter(Boolean);
      for (const method of requestedMethods) {
        if (!validMethods.has(method))
          throw new Error(`Unsupported method: ${method}`);
      }
      const inspected = selected.filter(
        ({ plugin }) => config[plugin.id]?.inspect,
      );
      if (
        (values.inspect || inspected.length) &&
        (selected.length !== 1 || !requestedMethods[0])
      )
        throw new Error(
          'Config inspect requires exactly one plugin with a method',
        );
      if (values.args && values['args-file'])
        throw new Error('Use only one of --args and --args-file');
      const cliArgs = values.args
        ? JSON.parse(values.args)
        : values['args-file']
          ? readJsonFile(values['args-file'])
          : undefined;
      if (cliArgs !== undefined && !Array.isArray(cliArgs))
        throw new Error('--args must be a JSON array of method arguments');
      if (
        cliArgs !== undefined &&
        (selected.length !== 1 || requestedMethods.length !== 1)
      )
        throw new Error(
          '--args/--args-file requires one selected plugin with a method',
        );
      for (const { plugin } of selected) {
        const configuredArgs = config[plugin.id]?.args;
        if (configuredArgs !== undefined && !Array.isArray(configuredArgs))
          throw new Error(`Config args for ${plugin.id} must be a JSON array`);
        if (
          configuredArgs !== undefined &&
          !(values.method || config[plugin.id]?.method)
        )
          throw new Error(`Config args for ${plugin.id} requires a method`);
      }
      const plugins = selected.map(({ dir, plugin }) => ({
        id: plugin.id,
        name: plugin.name,
        entry: `/${dir.replaceAll('\\', '/')}/index.ts`,
        options: {
          id: plugin.id,
          timeout,
          defaults: Object.fromEntries(
            Object.entries(plugin.pluginSettings || {}).map(
              ([key, setting]) => [key, setting.value],
            ),
          ),
          settings: config[plugin.id]?.settings || {},
          query: values.query || config[plugin.id]?.query,
          novel: values.novel || config[plugin.id]?.novel,
          chapter: values.chapter || config[plugin.id]?.chapter,
          debug: Boolean(
            values.debug || values.method || config[plugin.id]?.method,
          ),
          method: values.method || config[plugin.id]?.method,
          args: cliArgs ?? config[plugin.id]?.args,
          inspect: Boolean(values.inspect || config[plugin.id]?.inspect),
        },
      }));
      const output = path.resolve(values.output);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(
        output,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            runtime: 'electron',
            status: 'starting',
            results: [],
            network,
          },
          null,
          2,
        ),
      );
      process.env.NEKORI_PLUGIN_CHECKS = JSON.stringify({
        plugins,
        timeout,
        output,
        network,
      });
      process.env.NEKORI_CHECK_NETWORK = JSON.stringify(network);
      process.env.NEKORI_CHECK_PROFILE = path.join(
        root,
        '.js',
        `check-profile-${process.pid}`,
      );
      const profile = process.env.NEKORI_CHECK_PROFILE;
      process.on('exit', code => {
        // vite-plugin-electron otherwise tries to taskkill an already exited child.
        const child = process.electronApp;
        if (child && (child.exitCode !== null || child.signalCode !== null))
          process.electronApp = undefined;
        try {
          const report = JSON.parse(fs.readFileSync(output, 'utf8'));
          if (['starting', 'running'].includes(report.status)) {
            process.exitCode = 1;
            report.status = 'needs_attention';
            report.reason = `Checker stopped before completion (exit ${code})`;
            fs.writeFileSync(output, JSON.stringify(report, null, 2));
          }
        } catch (error) {
          console.error(`Could not finalize check report: ${error.message}`);
        }
        // This exact directory was created for this run, under the build directory.
        try {
          fs.rmSync(profile, { recursive: true, force: true });
        } catch {
          console.warn(`Could not remove temporary check profile: ${profile}`);
        }
      });
      delete process.env.ELECTRON_RUN_AS_NODE;
      console.log(
        `Checking ${plugins.length} plugins in Electron; report: ${output}`,
      );
      // Vite's Electron plugin forwards the child's exit status and shuts down its process tree.
      const watchdog = setTimeout(
        () => {
          console.error('Plugin check process exceeded its total time limit');
          process.exit(1);
        },
        plugins.length * (timeout * 8 + 15000) + 60000,
      );
      watchdog.unref();
      if (plugins.some(plugin => plugin.options.inspect))
        clearTimeout(watchdog);
      process.chdir(path.join(root, 'electron'));
      const { createServer } = await import('vite');
      const server = await createServer({
        configFile: path.join(root, 'electron/vite.config.ts'),
        clearScreen: false,
        server: { host: '127.0.0.1', port: 0, open: false, strictPort: false },
      });
      await server.listen();
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
