import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginId = 'yuneko.m3uplayer';
const pluginScript = path.join(root, 'scripts', 'check-plugins.js');
fs.mkdirSync(path.join(root, '.js'), { recursive: true });
const tempDir = fs.mkdtempSync(
  path.join(root, '.js', 'plugin-check-regression-'),
);
const playlist = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="demo" group-title="Demo",Regression Channel',
  'https://example.com/regression.m3u8',
  '',
].join('\n');

const server = http.createServer((request, response) => {
  if (request.url === '/redirect.m3u') {
    response.writeHead(302, { location: '/valid.m3u' }).end();
    return;
  }
  if (request.url === '/empty.m3u') {
    response.writeHead(200, { 'content-type': 'application/x-mpegurl' });
    response.end('#EXTM3U\n');
    return;
  }
  if (request.url === '/malformed.m3u') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('this is not an m3u playlist');
    return;
  }
  response.writeHead(200, { 'content-type': 'application/x-mpegurl' });
  response.end(playlist);
});

async function main() {
  await buildPlugins();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await runCase('valid', `http://127.0.0.1:${port}/redirect.m3u`, result => {
    const expected = [
      'popularNovels',
      'searchNovels',
      'parseNovel',
      'parseChapter',
    ];
    for (const method of expected) assertStatus(result, method, 'passed');
    assertStatus(result, 'resolveUrl:novel', 'passed');
    assertStatus(result, 'resolveUrl:chapter', 'passed');
    if (result.status !== 'passed')
      throw new Error(`valid case overall status: ${result.status}`);
    assert.ok(result.methods.find(m => m.method === 'searchNovels').args);
  });
  await runCase('empty', `http://127.0.0.1:${port}/empty.m3u`, result => {
    if (result.status === 'passed')
      throw new Error('empty playlist unexpectedly passed');
    assertStatus(result, 'popularNovels', 'empty');
  });
  await runCase(
    'malformed',
    `http://127.0.0.1:${port}/malformed.m3u`,
    result => {
      if (result.status === 'passed')
        throw new Error('malformed playlist unexpectedly passed');
      if (!['failed', 'blocked', 'needs_attention'].includes(result.status)) {
        throw new Error(`malformed case did not fail: ${result.status}`);
      }
    },
  );
  const argsPath = path.join(tempDir, 'args.json');
  const novelPath =
    '/m3u?url=https%3A%2F%2Fexample.com%2Fvideo.m3u8&name=Debug';
  fs.writeFileSync(argsPath, '\uFEFF' + JSON.stringify([novelPath]));
  await runCase(
    'direct',
    `http://127.0.0.1:${port}/valid.m3u`,
    result => {
      assert.equal(result.mode, 'single_method');
      assert.equal(result.methods.length, 1);
      assertStatus(result, 'parseNovel', 'passed');
      assert.deepEqual(result.methods[0].args, [novelPath]);
    },
    ['--method', 'parseNovel', '--args-file', argsPath, '--debug'],
    0,
  );
  await runCase(
    'direct-error',
    `http://127.0.0.1:${port}/valid.m3u`,
    result => {
      assertStatus(result, 'parseNovel', 'failed');
      assert.ok(result.methods[0].stack);
      assert.ok(!JSON.stringify(result).includes('regression-secret'));
    },
    [
      '--method',
      'parseNovel',
      '--args',
      '["/invalid?token=regression-secret"]',
      '--debug',
    ],
    1,
  );
  const invalidArgsCode = await runProcess(
    process.execPath,
    [
      pluginScript,
      '--plugin',
      pluginId,
      '--method',
      'parseNovel',
      '--args',
      '{}',
    ],
    true,
  );
  assert.equal(invalidArgsCode, 1);
  assert.equal(
    await runProcess(
      process.execPath,
      [pluginScript, '--plugin', pluginId, '--args', '[]'],
      true,
    ),
    1,
  );
  await runCase(
    'direct-chapter',
    `http://127.0.0.1:${port}/valid.m3u`,
    result => {
      assertStatus(result, 'parseChapter', 'passed');
      assert.equal(result.methods[0].result.type, 'string');
      assert.ok(result.methods[0].result.length > 0);
      assert.ok(!JSON.stringify(result.methods[0].result).includes('<meta'));
    },
    ['--method', 'parseChapter', '--args-file', argsPath, '--debug'],
    0,
  );
  await runCase(
    'direct-empty',
    `http://127.0.0.1:${port}/empty.m3u`,
    result => {
      assert.equal(result.mode, 'single_method');
      assertStatus(result, 'searchNovels', 'empty');
    },
    ['--method', 'searchNovels', '--args', '["missing",1]'],
    1,
  );
  console.log(
    'Plugin checker regression passed (smoke, explicit args, stack, redaction, malformed args).',
  );
}

async function buildPlugins() {
  await runProcess(process.execPath, [
    path.join(root, 'scripts', 'build-plugins.js'),
  ]);
}

async function runCase(
  name,
  url,
  validate,
  extraArgs = [],
  expectedCode = name === 'valid' ? 0 : 1,
) {
  const configPath = path.join(tempDir, `${name}.json`);
  const outputPath = path.join(tempDir, `${name}-report.json`);
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      [pluginId]: { settings: { m3uUrl: url } },
    }),
  );
  const exitCode = await runProcess(
    process.execPath,
    [
      pluginScript,
      '--plugin',
      pluginId,
      '--config',
      configPath,
      '--timeout',
      '5000',
      '--output',
      outputPath,
      ...extraArgs,
    ],
    true,
  );
  if (!fs.existsSync(outputPath))
    throw new Error(`${name}: checker did not write a report`);
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const result = report.results?.[0];
  if (!result) throw new Error(`${name}: report has no plugin result`);
  validate(result);
  if (exitCode !== expectedCode)
    throw new Error(`${name}: unexpected exit code ${exitCode}`);
}

function assertStatus(result, methodName, status) {
  const method = result.methods.find(item => item.method === methodName);
  if (!method || method.status !== status) {
    throw new Error(
      `${result.id}: expected ${methodName}=${status}, got ${method?.status || 'missing'}`,
    );
  }
}

function runProcess(command, args, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 || allowFailure
        ? resolve(code)
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

main()
  .catch(error => {
    console.error(`Plugin checker regression failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
