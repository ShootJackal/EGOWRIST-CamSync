#!/usr/bin/env node
// One-shot LAN launcher. Prints your Mac's LAN IP, then runs both:
//   - the bridge server  (server/bridge → port 4000)
//   - the Expo web dev server  (port 8081)
// in the same terminal with prefixed output. Ctrl-C kills both.

const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

function lanIPs() {
  const ifaces = os.networkInterfaces();
  const out = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        out.push({ name, address: a.address });
      }
    }
  }
  return out;
}

const ips = lanIPs();
const primary = ips[0]?.address;

const banner = [
  '',
  '─────────────────────────────────────────────────────────────',
  '  EGO GoProSYNC — LAN dev launcher',
  '─────────────────────────────────────────────────────────────',
  '',
  '  Mac LAN IP(s):',
  ...ips.map((i) => `    • ${i.address}    (${i.name})`),
  '',
  '  On your phone (same Wi-Fi as this Mac):',
  '    1. Open Safari → http://' + (primary ?? 'YOUR_MAC_IP') + ':8081',
  '    2. Settings → Connection Mode → Local LAN',
  '    3. Bridge URL → http://' + (primary ?? 'YOUR_MAC_IP') + ':4000',
  '    4. Tap "Test Connection" → "Connected!"',
  '    5. Tap Save → go to Capture → Connect All → Start All',
  '',
  '  Ctrl-C here stops both servers.',
  '─────────────────────────────────────────────────────────────',
  '',
];
console.log(banner.join('\n'));

const procs = [];

function run(label, color, cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(child);
  const prefix = `\x1b[${color}m[${label}]\x1b[0m`;
  const pipe = (stream, target) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        target.write(`${prefix} ${buf.slice(0, nl)}\n`);
        buf = buf.slice(nl + 1);
      }
    });
    stream.on('end', () => {
      if (buf.length > 0) target.write(`${prefix} ${buf}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`${prefix} exited (${signal})`);
    } else if (code !== 0 && code !== null) {
      console.error(`${prefix} exited with code ${code}`);
    }
    shutdown();
  });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    if (!p.killed) {
      try { p.kill('SIGINT'); } catch { /* ignore */ }
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const repoRoot = path.resolve(__dirname, '..');
const bridgeDir = path.join(repoRoot, 'server', 'bridge');

run('bridge', '36', 'npm', ['run', 'dev'], { cwd: bridgeDir, env: process.env });
run('web   ', '35', 'npx', ['expo', 'start', '--web', '--port', '8081'], {
  cwd: repoRoot,
  env: { ...process.env, BROWSER: 'none' },
});
