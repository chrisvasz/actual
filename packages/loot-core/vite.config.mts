import path from 'path';

import { visualizer } from 'rollup-plugin-visualizer';
import { defaultClientConditions, defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// sqlite-wasm's only browser entry includes `sqlite3Worker1Promiser`, whose
// `new Worker(new URL('sqlite3-worker1.mjs', import.meta.url))` makes Vite
// emit the ~1.3 MB Worker1 bundle. The backend calls sqlite directly and
// never starts that worker, so drop the reference before Vite sees it.
const WORKER1_REFERENCE =
  'new Worker(new URL("sqlite3-worker1.mjs", import.meta.url), { type: "module" })';

const dropSqliteWorker1 = (): Plugin => ({
  name: 'drop-sqlite-worker1',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('/@sqlite.org/sqlite-wasm/dist/index.mjs')) {
      return null;
    }
    if (!code.includes(WORKER1_REFERENCE)) {
      // A new sqlite-wasm release changed the code: update the reference
      // (or drop this plugin if the entry no longer starts the worker)
      this.error('sqlite-wasm no longer contains the Worker1 reference');
    }
    return {
      code: code.replace(
        WORKER1_REFERENCE,
        '(() => { throw new Error("sqlite3 Worker1 is not bundled"); })()',
      ),
      // Only one expression within a line changes, so the mappings still hold
      map: null,
    };
  },
});

// The browser app's backend: an ES module the page imports at startup and
// runs on its main thread (see platform/client/browser-preload).
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  const outDir = path.resolve(__dirname, 'lib-dist/browser');

  return {
    mode,
    build: {
      target: 'es2020',
      outDir,
      emptyOutDir: true,
      lib: {
        entry: path.resolve(__dirname, 'src/server/main.ts'),
        formats: ['es'],
        fileName: () =>
          isDev ? 'kcab.backend.dev.js' : `kcab.backend.[hash].js`,
      },
      rolldownOptions: {
        output: {
          // Users debug from raw stack traces, so compress and strip
          // whitespace but never mangle identifiers (overrides the
          // mangle: true that `minify: 'oxc'` implies).
          ...(!isDev && {
            minify: {
              compress: true,
              mangle: false,
              codegen: true,
            },
          }),
          // One file, so the page loads the backend with a single request
          codeSplitting: false,
        },
        external: [],
      },
      sourcemap: true,
      minify: isDev ? false : 'oxc',
    },
    resolve: {
      // Pick the in-process implementations of platform modules (e.g. the
      // connection) over the Worker ones
      conditions: ['main-thread', ...defaultClientConditions],
    },
    define: {
      'process.env': '{}',
      'process.env.IS_DEV': JSON.stringify(isDev),
      'process.env.PUBLIC_URL': JSON.stringify(process.env.PUBLIC_URL || '/'),
      'process.env.ACTUAL_DATA_DIR': JSON.stringify('/'),
      'process.env.ACTUAL_DOCUMENT_DIR': JSON.stringify('/documents'),
    },
    plugins: [
      dropSqliteWorker1(),
      nodePolyfills({
        include: [
          'process',
          'stream',
          'path',
          'crypto',
          'timers',
          'util',
          'zlib',
          'fs',
          'assert',
          'buffer',
        ],
        globals: {
          process: true,
          global: true,
        },
      }),
      visualizer({ template: 'raw-data', filename: `${outDir}/stats.json` }),
    ],
    optimizeDeps: {
      include: [
        'buffer',
        'process',
        'assert',
        'crypto-browserify',
        'path-browserify',
        'stream-browserify',
        'timers-browserify',
        'util',
        'browserify-zlib',
      ],
    },
  };
});
