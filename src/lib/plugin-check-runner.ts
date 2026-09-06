import type { Plugin } from '@/types/plugin';
import { storage } from '@libs/storage';
import { resolvePluginAssets } from '@/lib/plugin-asset-paths';
import {
  classifyError,
  errorReason,
  validateChapter,
  validateNovel,
  validateNovelList,
  validatePage,
  diagnosticPreview,
  diagnosticStack,
  diagnosticErrorReason,
  type CheckStatus,
  type MethodCheck,
} from './plugin-check-validation';

type CheckOptions = {
  id: string;
  timeout: number;
  query?: string;
  novel?: string;
  chapter?: string;
  settings?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  method?: DebugMethod;
  args?: unknown[];
  debug?: boolean;
  inspect?: boolean;
};

type DebugMethod =
  | 'popularNovels'
  | 'searchNovels'
  | 'parseNovel'
  | 'parsePage'
  | 'parseChapter'
  | 'resolveUrl';

export type PluginCheckResult = {
  id: string;
  name: string;
  methods: MethodCheck[];
  status: CheckStatus;
  mode?: 'smoke' | 'single_method';
};

const modules = import.meta.glob<Plugin.PluginSource>(
  ['/plugins/*/*/index.ts', '!/plugins/*/broken_*/**', '!/plugins/multisrc/**'],
  { import: 'default' },
);

export async function checkPlugin(
  entry: string,
  options: CheckOptions,
): Promise<PluginCheckResult> {
  const methods: MethodCheck[] = [];
  const timeout = Math.max(1, options.timeout || 1);
  let plugin: Plugin.PluginSource | undefined;
  let name = options.id;

  seedStorage(options.defaults);
  seedStorage(options.settings);

  try {
    const loader = modules[entry];
    if (!loader) throw new Error(`plugin entry not found: ${entry}`);
    plugin = resolvePluginAssets(await loader());
    name = plugin.name || name;
  } catch (error) {
    const status = classifyError(error);
    methods.push(record('load', status, 0, errorReason(error)));
    return { id: options.id, name, methods, status };
  }

  if (options.method) {
    return runDebug(
      plugin,
      { ...options, timeout: options.inspect ? 0 : options.timeout },
      name,
    );
  }

  let popular: Plugin.NovelItem[] = [];
  let searched: Plugin.NovelItem[] = [];
  let parsed:
    | (Plugin.SourceNovel & { totalPages?: number; content?: string })
    | undefined;
  let pageChapters: Plugin.ChapterItem[] | undefined;
  let timedOut = false;

  const run = async <T>(
    method: string,
    action: () => Promise<T>,
    empty?: (value: T) => boolean,
    args?: unknown[],
  ) => {
    if (timedOut) {
      methods.push(record(method, 'skipped', 0, 'skipped after timeout'));
      return undefined;
    }
    const startedAt = Date.now();
    try {
      const value = await withTimeout(action(), timeout);
      const durationMs = Date.now() - startedAt;
      const reportArgs = args;
      if (empty?.(value)) {
        methods.push(
          record(
            method,
            'empty',
            durationMs,
            'returned no results',
            0,
            startedAt,
            reportArgs,
            undefined,
            options.debug ? value : undefined,
          ),
        );
      } else {
        methods.push(
          record(
            method,
            'passed',
            durationMs,
            undefined,
            countOf(value),
            startedAt,
            reportArgs,
            undefined,
            options.debug ? value : undefined,
          ),
        );
      }
      return value;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const status =
        error instanceof TimeoutError ? 'timeout' : classifyError(error);
      methods.push(
        record(
          method,
          status,
          durationMs,
          diagnosticErrorReason(error),
          undefined,
          startedAt,
          args,
          error,
        ),
      );
      if (status === 'timeout') timedOut = true;
      return undefined;
    }
  };

  const filters = Object.fromEntries(
    Object.entries(plugin.filters || {}).map(([key, filter]) => [
      key,
      { type: filter.type, value: filter.value },
    ]),
  );
  await run(
    'popularNovels',
    async () => {
      const value = validateNovelList(
        await plugin!.popularNovels(1, { showLatestNovels: false, filters }),
      );
      popular = value;
      return value;
    },
    value => value.length === 0,
    [1, { showLatestNovels: false, filters }],
  );

  const query = options.query || popular[0]?.name;
  if (query) {
    await run(
      'searchNovels',
      async () => {
        const value = validateNovelList(await plugin!.searchNovels(query, 1));
        searched = value;
        return value;
      },
      value => value.length === 0,
      [query, 1],
    );
  } else {
    methods.push(
      record(
        'searchNovels',
        'skipped',
        0,
        'no query or popular novel available',
      ),
    );
  }

  const novelPath = options.novel || popular[0]?.path || searched[0]?.path;
  if (novelPath) {
    parsed = (await run(
      'parseNovel',
      async () => validateNovel(await plugin!.parseNovel(novelPath)),
      undefined,
      [novelPath],
    )) as typeof parsed;
  } else {
    methods.push(record('parseNovel', 'skipped', 0, 'no novel path available'));
  }

  if (
    parsed &&
    'parsePage' in plugin &&
    typeof plugin.parsePage === 'function'
  ) {
    const pageNumber = (parsed.totalPages || 0) > 1 ? '2' : '1';
    const page = await run(
      'parsePage',
      async () =>
        validatePage(await plugin!.parsePage!(novelPath!, pageNumber)),
      value => value.chapters.length === 0,
      [novelPath, pageNumber],
    );
    pageChapters = page?.chapters;
  } else {
    methods.push(
      record(
        'parsePage',
        'skipped',
        0,
        parsed ? 'parsePage unavailable' : 'parseNovel unavailable',
      ),
    );
  }

  const chapterPath =
    options.chapter || parsed?.chapters?.[0]?.path || pageChapters?.[0]?.path;
  if (chapterPath) {
    await run(
      'parseChapter',
      async () => validateChapter(await plugin!.parseChapter(chapterPath)),
      undefined,
      [chapterPath],
    );
  } else {
    methods.push(
      record('parseChapter', 'skipped', 0, 'no chapter path available'),
    );
  }

  if (plugin.resolveUrl && (novelPath || chapterPath)) {
    if (novelPath)
      await run(
        'resolveUrl:novel',
        async () => validateResolved(plugin!.resolveUrl!(novelPath!, true)),
        undefined,
        [novelPath, true],
      );
    if (chapterPath)
      await run(
        'resolveUrl:chapter',
        async () => validateResolved(plugin!.resolveUrl!(chapterPath, false)),
        undefined,
        [chapterPath, false],
      );
  } else {
    methods.push(
      record(
        'resolveUrl',
        'skipped',
        0,
        'resolveUrl unavailable or no path available',
      ),
    );
  }

  return {
    id: options.id,
    name,
    methods,
    status: summarize(methods),
    mode: 'smoke',
  };
}

async function runDebug(
  plugin: Plugin.PluginSource,
  options: CheckOptions,
  name: string,
): Promise<PluginCheckResult> {
  const method = options.method!;
  const args = options.args;
  if (!Array.isArray(args)) {
    const error = new Error('debug method requires --args as a JSON array');
    const check = record(
      method,
      'failed',
      0,
      error.message,
      undefined,
      Date.now(),
      [],
      error,
    );
    return {
      id: options.id,
      name,
      methods: [check],
      status: 'failed',
      mode: 'single_method',
    };
  }
  if (options.inspect) {
    // Pause with plugin source loaded so Step Into enters the selected method.
    // eslint-disable-next-line no-debugger
    debugger;
  }
  const startedAt = Date.now();
  try {
    let value: unknown;
    switch (method) {
      case 'popularNovels':
        value = await withTimeout(
          plugin.popularNovels(
            ...(args as Parameters<Plugin.PluginSource['popularNovels']>),
          ),
          options.timeout,
        );
        break;
      case 'searchNovels':
        value = await withTimeout(
          plugin.searchNovels(
            ...(args as Parameters<Plugin.PluginSource['searchNovels']>),
          ),
          options.timeout,
        );
        break;
      case 'parseNovel':
        value = await withTimeout(
          (plugin.parseNovel as (path: string) => Promise<unknown>)(
            ...(args as [string]),
          ),
          options.timeout,
        );
        break;
      case 'parsePage':
        if (!('parsePage' in plugin) || typeof plugin.parsePage !== 'function')
          throw new Error('parsePage unavailable');
        value = await withTimeout(
          (
            plugin.parsePage as (path: string, page: string) => Promise<unknown>
          )(...(args as [string, string])),
          options.timeout,
        );
        break;
      case 'parseChapter':
        value = await withTimeout(
          plugin.parseChapter(
            ...(args as Parameters<Plugin.PluginSource['parseChapter']>),
          ),
          options.timeout,
        );
        break;
      case 'resolveUrl':
        if (!plugin.resolveUrl) throw new Error('resolveUrl unavailable');
        value = plugin.resolveUrl(
          ...(args as Parameters<
            NonNullable<Plugin.PluginSource['resolveUrl']>
          >),
        );
        break;
      default:
        throw new Error(`unsupported debug method: ${method}`);
    }
    if (method === 'popularNovels' || method === 'searchNovels')
      validateNovelList(value);
    else if (method === 'parseNovel') validateNovel(value);
    else if (method === 'parsePage') validatePage(value);
    else if (method === 'parseChapter') validateChapter(value);
    else if (method === 'resolveUrl') validateResolved(value);
    const count = countOf(value);
    const status =
      ['popularNovels', 'searchNovels', 'parsePage'].includes(method) &&
      count === 0
        ? 'empty'
        : 'passed';
    const check = record(
      method,
      status,
      Date.now() - startedAt,
      status === 'empty' ? 'returned no results' : undefined,
      count,
      startedAt,
      args,
      undefined,
      value,
    );
    return {
      id: options.id,
      name,
      methods: [check],
      status,
      mode: 'single_method',
    };
  } catch (error) {
    const status =
      error instanceof TimeoutError ? 'timeout' : classifyError(error);
    const check = record(
      method,
      status,
      Date.now() - startedAt,
      diagnosticErrorReason(error),
      undefined,
      startedAt,
      args,
      error,
    );
    return {
      id: options.id,
      name,
      methods: [check],
      status,
      mode: 'single_method',
    };
  }
}

function seedStorage(values?: Record<string, unknown>) {
  if (!values) return;
  for (const [key, value] of Object.entries(values)) storage.set(key, value);
}

function validateResolved(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('resolveUrl did not return a URL string');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('resolveUrl did not return an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('resolveUrl did not return an absolute HTTP(S) URL');
  }
  return url.toString();
}

function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  if (timeout <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), timeout);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class TimeoutError extends Error {
  constructor() {
    super('method timed out');
  }
}

function record(
  method: string,
  status: CheckStatus,
  durationMs: number,
  reason?: string,
  count?: number,
  startedAt = Date.now(),
  args?: unknown[],
  error?: unknown,
  result?: unknown,
): MethodCheck {
  return {
    method,
    status,
    durationMs,
    startedAt,
    finishedAt: startedAt + durationMs,
    ...(reason ? { reason } : {}),
    ...(count === undefined ? {} : { count }),
    ...(args === undefined ? {} : { args: diagnosticPreview(args) }),
    ...(result === undefined
      ? {}
      : { result: diagnosticPreview(result, 0, true) }),
    ...(error === undefined ? {} : { stack: diagnosticStack(error) }),
  };
}

function countOf(value: unknown): number | undefined {
  return Array.isArray(value)
    ? value.length
    : value &&
        typeof value === 'object' &&
        Array.isArray((value as any).chapters)
      ? (value as any).chapters.length
      : undefined;
}

function summarize(methods: MethodCheck[]): CheckStatus {
  if (methods.some(method => method.status === 'timeout')) return 'timeout';
  if (methods.some(method => method.status === 'blocked')) return 'blocked';
  if (methods.some(method => method.status === 'failed')) return 'failed';
  if (methods.some(method => method.status === 'empty')) return 'empty';
  const required = new Set([
    'popularNovels',
    'searchNovels',
    'parseNovel',
    'parseChapter',
  ]);
  if (
    methods.some(
      method => required.has(method.method) && method.status === 'skipped',
    )
  )
    return 'skipped';
  if (methods.some(method => method.status === 'passed')) return 'passed';
  return 'skipped';
}
