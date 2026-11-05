import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Run after npm run build: exercise the emitted asset through the production
// server, since an HTML fallback or wrong MIME type also breaks module workers.
test('production bundle references a locally served MapLibre module worker', async () => {
  const frontend = fileURLToPath(new URL('../', import.meta.url));
  const assets = new URL('../dist/assets/', import.meta.url);
  const files = await readdir(assets);
  const page = files.find((name) => /^WestBengalPowerMap-.*\.js$/.test(name));
  assert.ok(page, 'Build the frontend before running this test');
  const bundle = await readFile(new URL(page, assets), 'utf8');
  const workerPath = bundle.match(/\/assets\/maplibre-gl-worker-[\w-]+\.mjs/)?.[0];
  assert.ok(workerPath, 'MapLibre worker must be emitted and referenced explicitly');

  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const server = spawn(process.execPath, ['server.cjs'], {
    cwd: frontend,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test server did not start')), 10000);
      server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Test server exited: ${code}`)); });
      server.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('Production frontend server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    const response = await fetch(`http://127.0.0.1:${port}${workerPath}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    const worker = await response.text();
    const library = await readFile(new URL('../src/vendor/maplibre-gl/maplibre-gl.mjs', import.meta.url), 'utf8');
    assert.equal(worker.match(/blob\/v([^/]+)\/LICENSE/)?.[1], library.match(/blob\/v([^/]+)\/LICENSE/)?.[1]);
    assert.match(worker, /self\.worker=/);
    const missing = await fetch(`http://127.0.0.1:${port}/assets/missing-worker.mjs`);
    assert.equal(missing.status, 404, 'Missing workers must not receive the SPA HTML');
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
});
