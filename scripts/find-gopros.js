#!/usr/bin/env node
// Scan every IPv4 LAN subnet attached to this Mac for GoPro HTTP servers.
// A GoPro that has joined a Wi-Fi network (Station / COHN mode) listens on
// port 8080 and answers /gopro/camera/info with JSON containing its model
// name and serial. We just probe every host on every /24 and report the hits.
//
// Usage:  node scripts/find-gopros.js
// Output: a list of detected GoPros with their IPs, ready to paste into
//         server/bridge/config/cameras.json.

const os = require('node:os');
const http = require('node:http');

const PORT = 8080;
const PATH = '/gopro/camera/info';
const PER_HOST_TIMEOUT_MS = 600;
const CONCURRENCY = 64;

function lanSubnets() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && a.cidr && a.netmask === '255.255.255.0') {
        const base = a.address.split('.').slice(0, 3).join('.');
        out.push({ iface: name, base, self: a.address });
      }
    }
  }
  return out;
}

function probe(ip) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: ip, port: PORT, path: PATH, timeout: PER_HOST_TIMEOUT_MS, family: 4 },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(null);
          try {
            const j = JSON.parse(body);
            resolve({
              ip,
              model: j.model_name ?? j.modelName ?? null,
              serial: j.serial_number ?? j.serialNumber ?? null,
              firmware: j.firmware_version ?? j.firmwareVersion ?? null,
            });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const subnets = lanSubnets();
  if (subnets.length === 0) {
    console.error('No /24 LAN interfaces found. Are you on Wi-Fi?');
    process.exit(2);
  }

  console.log('');
  console.log('Scanning for GoPros on:');
  for (const s of subnets) console.log(`  ${s.base}.0/24  via ${s.iface}  (this Mac is ${s.self})`);
  console.log('  (probing port 8080 /gopro/camera/info — takes ~15 seconds)');
  console.log('');

  const found = [];
  for (const s of subnets) {
    const ips = Array.from({ length: 254 }, (_, i) => `${s.base}.${i + 1}`)
      .filter((ip) => ip !== s.self);
    const hits = (await pool(ips, CONCURRENCY, probe)).filter(Boolean);
    found.push(...hits);
  }

  if (found.length === 0) {
    console.log('No GoPros detected.');
    console.log('');
    console.log('Likely reasons:');
    console.log('  • Camera is in AP mode (broadcasting its own Wi-Fi) — the Mac');
    console.log('    has to be joined to that camera\'s Wi-Fi to reach 10.5.5.9.');
    console.log('  • Camera is asleep — wake it (Mode button).');
    console.log('  • Camera has not joined this Wi-Fi yet — pair it via the GoPro');
    console.log('    Quik mobile app first to enable COHN / Station mode.');
    process.exit(1);
  }

  console.log(`Found ${found.length} GoPro${found.length === 1 ? '' : 's'}:`);
  for (const c of found) {
    console.log(`  • ${c.ip}    ${c.model ?? 'GoPro'}    ${c.serial ?? ''}`);
  }
  console.log('');
  console.log('Suggested server/bridge/config/cameras.json:');
  console.log('');
  const cfg = found.slice(0, 3).map((c, i) => ({
    id: i + 1,
    name: c.serial ? `GoPro ${i + 1} (${c.serial.slice(-4)})` : `GoPro ${i + 1}`,
    ip: c.ip,
    port: 8080,
  }));
  console.log(JSON.stringify(cfg, null, 2));
  console.log('');
}

main().catch((err) => {
  console.error('find-gopros failed:', err.message);
  process.exit(1);
});
