// The account register scenarios `bench-register.mjs` measures. Kept free of
// imports so the function can also run as a snippet in another Playwright
// host (one that hands over a `page`): see `bench-register.mjs --snippet`.

/**
 * Import the budget at `budgetUrl` into the app at `url` and measure each scenario.
 * Returns `{ results }`, or `{ profile }` (a CPU profile of one run of the
 * `cpuprofile` scenario).
 */
export async function runBench(
  page,
  cdp,
  { url, budgetUrl, throttle = 1, runs = 5, only, cpuprofile, log },
) {
  await cdp.send('Performance.enable');
  // A host's page may already have this from an earlier run: observe once
  await page.addInitScript(() => {
    if (window.__longtasks) {
      return;
    }
    window.__longtasks = [];
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        window.__longtasks.push({ start: e.startTime, duration: e.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  // Start from no budgets
  await page.goto(url);
  await cdp.send('Storage.clearDataForOrigin', {
    origin: new URL(url).origin,
    storageTypes: 'all',
  });
  await page.goto(url);
  // Import the budget the page fetches from `budgetUrl`, in place of the
  // file the dialog would ask for
  await page.evaluate(budgetUrl => {
    window.Actual.openFileDialog = async () => {
      const contents = await (await fetch(budgetUrl)).arrayBuffer();
      await window.__actionsForMenu.uploadFile('file.zip', contents);
      return ['/uploads/file.zip'];
    };
  }, budgetUrl);
  await page.getByRole('button', { name: 'Import my budget' }).click();
  await page
    .getByRole('button', { name: 'Actual Import a file exported from Actual' })
    .click();
  await page.getByRole('button', { name: 'Select file...' }).click();
  await page.getByTestId('budget-table').waitFor({ timeout: 300000 });
  await page.waitForTimeout(2000);

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

  // Wait until a second passes with no new long task
  async function quiet() {
    await page.waitForTimeout(300);
    let last = -1;
    for (;;) {
      const n = await page.evaluate(() => window.__longtasks.length);
      if (n === last) break;
      last = n;
      await page.waitForTimeout(1000 * Math.max(1, throttle / 2));
    }
  }

  async function taskMs() {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find(m => m.name === 'TaskDuration').value * 1000;
  }

  async function measure(fn) {
    await quiet();
    const t0 = await taskMs();
    await page.evaluate(() => {
      window.__longtasks = [];
      window.__t0 = performance.now();
    });
    await fn();
    await quiet();
    // Idle polling in quiet() adds a little task time to every build
    const task = Math.round((await taskMs()) - t0);
    return page.evaluate(task => {
      const ts = window.__longtasks.filter(t => t.start >= window.__t0 - 1);
      return {
        blocking: Math.round(ts.reduce((a, t) => a + t.duration, 0)),
        max: Math.round(Math.max(0, ...ts.map(t => t.duration))),
        task,
      };
    }, task);
  }

  function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  const navigate = p => page.evaluate(p => window.__navigate(p), p);
  const waitRegister = () =>
    page.getByTestId('transaction-table').waitFor({ timeout: 120000 });

  async function goTo(p) {
    if (new URL(page.url()).pathname !== p) {
      await navigate(p);
      if (p === '/budget') {
        await page.getByTestId('budget-table').waitFor();
      } else {
        await waitRegister();
      }
    }
  }

  const pick = await page.evaluate(async () => {
    const { data } = await window.$query(
      window
        .$q('transactions')
        .filter({ account: 'acct-checking', is_parent: false, is_child: false })
        .select(['id', 'amount'])
        .orderBy({ date: 'desc' })
        .limit(1),
    );
    return data[0];
  });

  const edit = i =>
    page.evaluate(
      ({ id, amount }) =>
        window.$send('transactions-batch-update', {
          updated: [{ id, amount }],
        }),
      { id: pick.id, amount: pick.amount + (i % 2 ? 0 : 1) },
    );

  const searchTerm = await page.evaluate(async () => {
    const { data } = await window.$query(
      window
        .$q('payees')
        .filter({ transfer_acct: null })
        .select(['name'])
        .limit(1),
    );
    return data[0].name;
  });

  async function search() {
    await page.getByPlaceholder('Search').first().fill(searchTerm);
    await page.waitForTimeout(1000);
  }

  let importRun = 0;
  async function importRows() {
    const run = importRun++;
    await page.evaluate(run => {
      const transactions = Array.from({ length: 2000 }, (_, i) => ({
        date: `2019-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        amount: -((i * 37) % 10000) - 1,
        payee_name: `Import payee ${i % 50}`,
        imported_id: `bench-${run}-${i}`,
        notes: `bench import ${run}`,
      }));
      return window.$send('transactions-import', {
        accountId: 'acct-checking',
        transactions,
        isPreview: false,
      });
    }, run);
  }

  const scenarios = {
    'open-one': {
      setup: () => goTo('/budget'),
      op: async () => {
        await navigate('/accounts/acct-checking');
        await waitRegister();
      },
    },
    'open-all': {
      setup: () => goTo('/budget'),
      op: async () => {
        await navigate('/accounts');
        await waitRegister();
      },
    },
    'edit-one': { setup: () => goTo('/accounts/acct-checking'), op: edit },
    'edit-all': { setup: () => goTo('/accounts'), op: edit },
    'search-one': {
      setup: async () => {
        await goTo('/budget');
        await goTo('/accounts/acct-checking');
      },
      op: search,
    },
    'search-all': {
      setup: async () => {
        await goTo('/budget');
        await goTo('/accounts');
      },
      op: search,
    },
    // Last: each run adds 2,000 rows
    'import-one': {
      setup: () => goTo('/accounts/acct-checking'),
      op: importRows,
    },
  };

  if (cpuprofile) {
    const { setup, op } = scenarios[cpuprofile];
    await setup();
    await quiet();
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    const result = await measure(() => op(0));
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return { result, profile };
  }

  const results = {};
  for (const [name, { setup, op }] of Object.entries(scenarios)) {
    if (only && !only.includes(name)) continue;
    const xs = [];
    // The first run warms up and isn't counted
    for (let i = -1; i < runs; i++) {
      await setup();
      const x = await measure(() => op(i));
      if (i >= 0) {
        xs.push(x);
      }
    }
    results[name] = {
      blocking: median(xs.map(x => x.blocking)),
      max: median(xs.map(x => x.max)),
      task: median(xs.map(x => x.task)),
      all: xs.map(x => x.blocking),
    };
    log?.(name, JSON.stringify(results[name]));
  }

  if (!only || only.includes('heap')) {
    await goTo('/budget');
    await quiet();
    await cdp.send('HeapProfiler.collectGarbage');
    const before = await cdp.send('Runtime.getHeapUsage');
    await goTo('/accounts');
    await quiet();
    await cdp.send('HeapProfiler.collectGarbage');
    const after = await cdp.send('Runtime.getHeapUsage');
    results.heap = {
      budgetMB: Math.round(before.usedSize / 1e5) / 10,
      allAccountsMB: Math.round(after.usedSize / 1e5) / 10,
    };
    log?.('heap', JSON.stringify(results.heap));
  }

  // Undo the edits
  await page.evaluate(
    ({ id, amount }) =>
      window.$send('transactions-batch-update', { updated: [{ id, amount }] }),
    pick,
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return { results };
}
