#!/usr/bin/env node
// Measures the account register in a production build, in headless Chromium.
//
//   yarn build:browser
//   REGISTER_BENCH_EXPORT=/tmp/bench.zip yarn workspace @actual-app/core \
//     vitest --run src/server/budget/register-bench-budget.test.ts
//   node packages/desktop-client/bin/bench-register.mjs \
//     packages/desktop-client/build /tmp/bench.zip [--throttle 4] [--runs 5] \
//     [--only open-one,search-all,heap] [--cpuprofile open-one --out x.cpuprofile]
//
// The budget is a generated one (about 50k transactions over 10 years, with
// splits, transfers, accented payee names and notes), imported afresh.
//
// For each scenario (see `bench-register-scenarios.mjs`) it reports, as the
// median over runs: `blocking`, the total time of long tasks (50ms or more),
// `max`, the longest one, and `task`, all main-thread task time. `heap` is
// the JS heap after GC on the budget page and with all accounts' register
// open.
//
// With `--snippet <url>` instead of a build directory, it prints the bench
// as one `async page => …` function for a Playwright host that runs code
// against its own page, and exits. `<url>` serves the build, with the
// budget beside its index.html under the zip's file name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBench } from './bench-register-scenarios.mjs';

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const snippetUrl = opt('snippet');
const positional = args.filter(
  (arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'),
);
const [buildDir, budgetZip] = snippetUrl ? [null, positional[0]] : positional;
if ((!buildDir && !snippetUrl) || !budgetZip) {
  console.error(
    'Usage: bench-register.mjs <buildDir> <budget.zip> [--throttle N] [--runs N] [--only a,b] [--cpuprofile scenario --out file]\n' +
      '       bench-register.mjs --snippet <url> <budget.zip> [options]',
  );
  process.exit(1);
}
const options = {
  throttle: Number(opt('throttle') ?? 1),
  runs: Number(opt('runs') ?? 5),
  only: opt('only')?.split(','),
  cpuprofile: opt('cpuprofile'),
};

if (snippetUrl) {
  const source = fs
    .readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'bench-register-scenarios.mjs',
      ),
      'utf8',
    )
    .replace('export async function runBench', 'async function runBench');
  // The host's app must serve the budget too
  const snippetOptions = JSON.stringify({
    ...options,
    url: snippetUrl,
    budgetUrl: `${snippetUrl}/${path.basename(budgetZip)}`,
  });
  // It keeps `runBench` on the browser context, for later snippets to call
  console.log(`async page => {
${source}
  page.context().__runBench = runBench;
  const cdp = await page.context().newCDPSession(page);
  return runBench(page, cdp, ${snippetOptions});
}`);
  process.exit(0);
}

const { chromium } = await import('@playwright/test');

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
// Served through request interception rather than a local server, so the
// bench needs no port
const root = path.resolve(buildDir);
const url = 'http://bench.localhost';
const BUDGET_PATH = '/__bench/budget.zip';
function serve(route) {
  const p = decodeURIComponent(new URL(route.request().url()).pathname);
  let file = p === BUDGET_PATH ? path.resolve(budgetZip) : path.join(root, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(p)) {
      return route.fulfill({ status: 404 });
    }
    file = path.join(root, 'index.html');
  }
  return route.fulfill({
    body: fs.readFileSync(file),
    headers: {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  });
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-register-'));
const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 1400, height: 900 },
});
try {
  await ctx.route(`${url}/**`, serve);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', e => console.error('pageerror', e.message));
  const cdp = await ctx.newCDPSession(page);

  const { results, result, profile } = await runBench(page, cdp, {
    ...options,
    url,
    budgetUrl: url + BUDGET_PATH,
    log: console.error,
  });
  if (profile) {
    console.error(options.cpuprofile, JSON.stringify(result));
    fs.writeFileSync(
      opt('out') ?? 'register.cpuprofile',
      JSON.stringify(profile),
    );
  } else {
    console.log(JSON.stringify({ throttle: options.throttle, results }));
  }
} finally {
  await ctx.close();
  fs.rmSync(profileDir, { recursive: true, force: true });
}
