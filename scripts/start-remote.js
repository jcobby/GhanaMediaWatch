/*
 * Run the app on a phone anywhere, over a dev tunnel.
 *
 *   npm run start:remote
 *
 * Expo's own `--tunnel` is not an option: it uses ngrok 2.3.41, and ngrok now
 * refuses any free account on an agent below 3.20.0. That is ngrok's policy and
 * no flag gets round it.
 *
 * This uses Microsoft dev tunnels instead — the same thing the backend is
 * already served through. The piece that makes it work is
 * `EXPO_PACKAGER_PROXY_URL`: without it Metro advertises the machine's LAN
 * address in its manifest, so a remote phone scans the code, connects, and then
 * fails to fetch a bundle from an address that does not exist on its network.
 *
 * Requires one manual step first, once per machine:
 *
 *   devtunnel user login
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT ?? '8081';

/**
 * Where devtunnel actually is.
 *
 * winget prints "Path environment variable modified; restart your shell" and
 * that is not a formality — an already-open terminal, and anything it spawns,
 * keeps the old PATH until it is closed. So `devtunnel` is genuinely not a
 * command in the shell that just installed it.
 *
 * winget also does not always create its `Links` shim, so the only reliable
 * answer is to look in the package directory itself.
 */
function devtunnelPath() {
  const fs = require('fs');
  const local = process.env.LOCALAPPDATA;

  const candidates = [];
  if (local) {
    candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', 'devtunnel.exe'));

    const packages = path.join(local, 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const dir of fs.readdirSync(packages)) {
        if (!dir.toLowerCase().startsWith('microsoft.devtunnel')) continue;
        candidates.push(path.join(packages, dir, 'devtunnel.exe'));
      }
    } catch {
      /* No winget packages directory — fall through to PATH. */
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Not installed by winget, or on a machine where it is already on PATH.
  return 'devtunnel';
}

const DEVTUNNEL = devtunnelPath();

const tunnel = spawn(DEVTUNNEL, ['host', '-p', PORT, '--allow-anonymous'], {
  // No shell: the path can contain spaces, and shell:true would split on them.
  shell: false,
});

let started = false;

tunnel.stdout.on('data', (chunk) => {
  const text = String(chunk);
  process.stdout.write(text);

  // The port URL, not the management one: `…-8081.<region>.devtunnels.ms`.
  const match = /https:\/\/[a-z0-9-]+-(\d+)\.[a-z0-9.-]*devtunnels\.ms/i.exec(text);
  if (!match || match[1] !== PORT || started) return;

  started = true;
  const url = match[0];
  console.log(`\n  Tunnel is up: ${url}`);
  console.log('  Starting Metro pointed at it…\n');

  const expo = spawn('npx', ['expo', 'start', '--go'], {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Read before anything else in Expo's UrlCreator — "proxy comes first" —
      // so every URL in the manifest points at the tunnel rather than the LAN.
      EXPO_PACKAGER_PROXY_URL: url,
    },
  });

  expo.on('exit', (code) => {
    tunnel.kill();
    process.exit(code ?? 0);
  });
});

tunnel.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));

tunnel.on('exit', (code) => {
  if (started) return;
  console.error(
    `\n  The tunnel exited with code ${code} before a URL appeared.\n` +
      '  If it says you are not logged in, run:  devtunnel user login\n',
  );
  process.exit(code ?? 1);
});

process.on('SIGINT', () => {
  tunnel.kill();
  process.exit(0);
});
