#!/usr/bin/env node
// Renders contact sheets of the procedural roadster (or any GLB) with headless Edge/Chrome,
// and exports the procedural model to GLB.
//
//   node tools/roadster/render.mjs --out <dir> [--model /tools/roadster/model/index.ts | --glb /assets/x.glb]
//        [--shots grid,detail,front34] [--size 1680x1140] [--prefix name] [--export public/assets/models/roadster.glb]
//
// Module/GLB paths are URL paths served from the repository root (public/ is served at /).
// Prints a JSON summary (stats, files written, console errors) to stdout.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]?.startsWith('--') || all[index + 1] === undefined ? 'true' : all[index + 1]]);
  return pairs;
}, []));
const out = resolve(args.out ?? join(root, 'artifacts/roadster/renders'));
const shots = (args.shots ?? 'grid').split(',');
const [width, height] = (args.size ?? '1680x1140').split('x').map(Number);
const prefix = args.prefix ?? 'roadster';
const timeoutMs = Number(args.timeout ?? 120000);

const browserPath = [
  process.env.ROADSTER_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((path) => path && existsSync(path));
if (!browserPath) throw new Error('No Chromium-based browser found; set ROADSTER_BROWSER');

// Accepts repo-relative paths ("public/assets/x.glb", "tools/roadster/model/index.ts"), absolute paths
// inside the repo, or URL paths. Git Bash rewrites "/assets/x" to "C:/Program Files/Git/assets/x"; undo that.
const toUrlPath = (path) => {
  let value = path.replace(/\\/g, '/').replace(/^[A-Za-z]:\/Program Files\/Git(?=\/)/, '');
  const repo = root.replace(/\\/g, '/');
  if (value.toLowerCase().startsWith(repo.toLowerCase())) value = value.slice(repo.length);
  value = value.replace(/^\/+/, '').replace(/^public\//, '');
  return `/${value}`;
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const freePort = () => new Promise((done, fail) => {
  const probe = createNetServer().once('error', fail).listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});

async function main() {
  mkdirSync(out, { recursive: true });
  const port = await freePort();
  const server = await createServer({
    root, configFile: false, logLevel: 'error', clearScreen: false,
    cacheDir: join(tmpdir(), 'roadster-render-vite-cache'),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
  });
  await server.listen();
  const profile = mkdtempSync(join(tmpdir(), 'roadster-render-'));
  const browser = spawn(browserPath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  const consoleLines = [];
  const files = [];
  let socket;
  try {
    let devtoolsPort;
    for (let i = 0; i < 100 && !devtoolsPort; i++) {
      await sleep(100);
      try { devtoolsPort = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { /* browser still starting */ }
    }
    if (!devtoolsPort) throw new Error('Browser did not expose a DevTools port');
    const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
    let nextId = 1;
    const pending = new Map();
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) {
        const { done, fail } = pending.get(data.id); pending.delete(data.id);
        if (data.error) fail(new Error(data.error.message)); else done(data.result);
      } else if (data.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(data.params.type)) {
        consoleLines.push(`${data.params.type}: ${data.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`);
      } else if (data.method === 'Runtime.exceptionThrown') {
        consoleLines.push(`exception: ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`);
      }
    };
    const send = (method, params = {}) => new Promise((done, fail) => {
      const id = nextId++; pending.set(id, { done, fail }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const query = new URLSearchParams({ shots: shots[0], w: String(width), h: String(height) });
    if (args.glb) query.set('glb', toUrlPath(args.glb)); else query.set('model', toUrlPath(args.model ?? 'tools/roadster/model/index.ts'));
    if (args.paint) query.set('paint', args.paint);
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/tools/roadster/viewer.html?${query}` });
    const deadline = Date.now() + timeoutMs;
    let state;
    while (Date.now() < deadline) {
      await sleep(250);
      try { state = await evaluate('({ ready: !!window.__roadsterReady, errors: window.__roadsterErrors ?? [] })'); } catch { continue; }
      if (state.ready) break;
      if (state.errors.length) break;
    }
    if (!state?.ready) throw new Error(`Viewer failed: ${JSON.stringify(state?.errors ?? 'timeout')}\n${consoleLines.join('\n')}`);
    let stats;
    for (const shot of shots) {
      stats = await evaluate(`window.__render(${JSON.stringify(shot)}, ${width}, ${height})`);
      await sleep(150);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = join(out, `${prefix}-${shot.replace(/[^a-z0-9]+/gi, '_')}.png`);
      writeFileSync(file, Buffer.from(data, 'base64')); files.push(file);
    }
    let exported;
    if (args.export) {
      const bytes = await evaluate('window.__exportGlb()');
      const chunks = [];
      for (let offset = 0; offset < bytes; offset += 4 << 20) chunks.push(Buffer.from(await evaluate(`window.__exportChunk(${offset}, ${4 << 20})`), 'base64'));
      const file = resolve(args.export);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.concat(chunks));
      exported = { file, bytes };
    }
    process.stdout.write(JSON.stringify({ files, exported, stats, console: consoleLines }, null, 2) + '\n');
  } finally {
    socket?.close();
    browser.kill();
    await server.close();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still hold the profile lock briefly. */ }
  }
}

main().then(() => process.exit(0), (error) => { console.error(error.stack ?? error); process.exit(1); });
