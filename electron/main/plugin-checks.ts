import { app, BrowserWindow, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

type Method = {
  method: string;
  status: string;
  reason?: string;
  startedAt?: number;
  finishedAt?: number;
};
type CheckResult = {
  id: string;
  name: string;
  status: string;
  methods: Method[];
  reason?: string;
  mode?: 'smoke' | 'single_method';
};
type Request = {
  at: number;
  url: string;
  statusCode?: number;
  error?: string;
  kind?: 'request' | 'redirect';
  from?: string;
  to?: string;
  httpMethod?: string;
};
type Config = {
  plugins: {
    id: string;
    name: string;
    entry: string;
    options: Record<string, unknown>;
  }[];
  timeout: number;
  output: string;
};

export async function runPluginChecks(
  raw: string,
  session: Session,
  preload: string,
) {
  const config = JSON.parse(raw) as Config;
  const origin = new URL(process.env.VITE_DEV_SERVER_URL!).origin;
  const report = {
    timestamp: new Date().toISOString(),
    runtime: 'electron',
    status: 'running',
    results: [] as (CheckResult & { requests: Request[] })[],
  };
  const save = () => {
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    fs.writeFileSync(config.output, JSON.stringify(report, null, 2));
  };
  let requests: Request[] = [];
  let activePlugin = 0;
  const owners = new Map<number, number>();
  session.webRequest.onBeforeRequest((details, callback) => {
    if (!owners.has(details.id)) owners.set(details.id, activePlugin);
    callback({});
  });
  session.webRequest.onBeforeRedirect(details => {
    const owner = owners.get(details.id);
    if (owner !== activePlugin || requests.length >= 100) return;
    const safeUrl = (value: string) => {
      try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol)
          ? parsed.origin + parsed.pathname
          : undefined;
      } catch {
        return undefined;
      }
    };
    const from = safeUrl(details.url);
    const to = safeUrl(details.redirectURL);
    if (from && to) {
      requests.push({
        at: Date.now(),
        url: to,
        kind: 'redirect',
        from,
        to,
        httpMethod: details.method,
        statusCode: details.statusCode,
      });
    }
  });
  const record = (id: number, url: string, data: Partial<Request>) => {
    const owner = owners.get(id);
    owners.delete(id);
    if (owner !== activePlugin) return;
    const parsed = new URL(url);
    if (
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.origin !== origin &&
      requests.length < 100
    ) {
      requests.push({
        at: Date.now(),
        url: parsed.origin + parsed.pathname,
        kind: 'request',
        ...data,
      });
    }
  };
  session.webRequest.onCompleted(details =>
    record(details.id, details.url, { statusCode: details.statusCode }),
  );
  session.webRequest.onErrorOccurred(details =>
    record(details.id, details.url, { error: details.error }),
  );
  save();
  for (const plugin of config.plugins) {
    activePlugin += 1;
    requests = [];
    const win = new BrowserWindow({
      show: Boolean(plugin.options.inspect),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session,
        preload,
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: CheckResult;
    const inspect = Boolean(plugin.options.inspect);
    try {
      const execute = (async () => {
        await win.loadURL(
          `${origin}/electron/checks/index.html?plugin=${encodeURIComponent(plugin.id)}`,
        );
        if (inspect)
          await new Promise<void>((resolve, reject) => {
            const startupTimer = setTimeout(
              () =>
                reject(new Error('DevTools did not open within 10 seconds')),
              10000,
            );
            win.webContents.once('devtools-opened', () => {
              clearTimeout(startupTimer);
              resolve();
            });
            win.once('closed', () => {
              clearTimeout(startupTimer);
              reject(new Error('Inspection window closed'));
            });
            win.webContents.openDevTools({ mode: 'detach' });
          });
        const invocation = `import('/src/lib/plugin-check-runner.ts').then(m => m.checkPlugin(${JSON.stringify(plugin.entry)}, ${JSON.stringify(plugin.options)}))`;
        return win.webContents.executeJavaScript(
          invocation,
        ) as Promise<CheckResult>;
      })();
      if (inspect) result = await execute;
      else {
        result = await Promise.race([
          execute,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(
                    'Whole-plugin timeout (including renderer startup)',
                  ),
                ),
              config.timeout * 8 + 15000,
            );
          }),
        ]);
      }
      if (!result || !Array.isArray(result.methods))
        throw new Error('Runner returned an invalid report');
      for (const method of result.methods) {
        if (!['failed', 'empty'].includes(method.status)) continue;
        const related = requests.filter(
          r =>
            r.at >= (method.startedAt || 0) &&
            r.at <= (method.finishedAt || Date.now()),
        );
        const blocked = related.find(r =>
          [401, 403, 429].includes(r.statusCode || 0),
        );
        const networkError = related.find(r => r.error);
        if (blocked) {
          method.status = 'blocked';
          method.reason = `HTTP ${blocked.statusCode}; request blocked or authentication required`;
        } else if (networkError) {
          method.status = 'network_error';
          method.reason = networkError.error;
        }
      }
      result.status = result.methods.some(
        m =>
          !['passed', 'skipped'].includes(m.status) ||
          (m.status === 'skipped' &&
            [
              'popularNovels',
              'searchNovels',
              'parseNovel',
              'parseChapter',
            ].includes(m.method)),
      )
        ? 'needs_attention'
        : result.methods.some(m => m.status === 'passed')
          ? 'passed'
          : 'skipped';
    } catch (error) {
      result = {
        id: plugin.id,
        name: plugin.name,
        status: 'needs_attention',
        methods: [],
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
      if (!inspect && !win.isDestroyed()) win.destroy();
    }
    report.results.push({ ...result, requests });
    save();
    console.log(
      `[${result.status}] ${plugin.name}: ${result.methods.map(m => `${m.method}=${m.status}`).join(', ') || result.reason}`,
    );
    if (plugin.options.debug || plugin.options.inspect)
      console.log(
        JSON.stringify(
          { mode: result.mode || 'smoke', methods: result.methods, requests },
          null,
          2,
        ),
      );
    if (inspect && !win.isDestroyed()) {
      await new Promise<void>(resolve => win.once('closed', () => resolve()));
    }
  }
  report.status = report.results.every(r => r.status === 'passed')
    ? 'passed'
    : 'needs_attention';
  save();
  console.log(`Plugin checks: ${report.status}. Report: ${config.output}`);
  app.exit(report.status === 'passed' ? 0 : 1);
}
