import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

import { listen, send } from '@actual-app/core/platform/client/connection';
import { captureException } from '@actual-app/core/platform/exceptions';
import type { Query } from '@actual-app/core/shared/query';
import { LRUCache } from 'lru-cache';

import { useMetadataPref } from './useMetadataPref';

type SpreadsheetContextValue = ReturnType<typeof makeSpreadsheet>;
const SpreadsheetContext = createContext<SpreadsheetContextValue | undefined>(
  undefined,
);

export function useSpreadsheet() {
  const context = useContext(SpreadsheetContext);
  if (!context) {
    throw new Error('useSpreadsheet must be used within a SpreadsheetProvider');
  }
  return context;
}

// TODO: Make this generic and replace the Binding type in the desktop-client package.
type Binding = string | { name: string; query?: Query | undefined };

type CellCacheValue = { name: string; value: string | number | boolean | null };
type CellCache = { [name: string]: Promise<CellCacheValue> | null };
type CellObserverCallback = (node: CellCacheValue) => void;
type CellObservers = { [name: string]: CellObserverCallback[] };

const GLOBAL_SHEET_NAME = '__global';

function makeSpreadsheet() {
  const cellObservers: CellObservers = {};
  const cellCache: CellCache = {};
  // The LRU owns how long a cached cell lives; `cellCache` holds the same
  // values in the form `bind` consumes and is evicted alongside it. Sizing is
  // only a speed tradeoff - an evicted cell is refetched - so this is set
  // comfortably above what one budget page binds (roughly six cells per
  // category, per month on screen).
  //
  // A cached value is only trusted while something is observing it. The
  // backend drops a whole batch of `cells-changed` if any cell in it fails to
  // evaluate, so a cell nothing was watching may have moved on without us
  // hearing about it - see `staleNames`.
  const LRUValueCache = new LRUCache<string, CellCacheValue>({
    max: 20000,
    dispose: (_value, name, reason) => {
      // Only when the entry is actually gone. `dispose` also fires when a key
      // is overwritten, and dropping the cache then would throw away the value
      // that just replaced it.
      if (reason === 'evict' || reason === 'expire') {
        delete cellCache[name];
      }
    },
  });
  // Cells we hold a value for but stopped observing. They can still be
  // painted immediately, but have to be re-read before they can be trusted.
  const staleNames = new Set<string>();

  type CellRequest = { sheetName: string; name: string };
  type Waiter = {
    resolve: (value: CellCacheValue) => void;
    reject: (error: unknown) => void;
  };
  let batch: { cells: CellRequest[]; waiting: Waiter[] } | null = null;

  function flushBatch() {
    const current = batch;
    batch = null;
    if (!current) {
      return;
    }

    // Every caller has to settle, or the cells that asked would hang
    // unresolved and never render.
    const settle = (apply: (waiter: Waiter, index: number) => void): void =>
      current.waiting.forEach(apply);

    void send('get-cells', { cells: current.cells }).then(
      values => {
        // Results are matched to requests by position, so a response of the
        // wrong shape would hand one cell's value to another cell. Fail the
        // batch instead of rendering numbers against the wrong names.
        if (!Array.isArray(values) || values.length !== current.cells.length) {
          const error = new Error(
            `get-cells returned ${
              Array.isArray(values) ? values.length : typeof values
            } results for ${current.cells.length} cells`,
          );
          settle(waiter => waiter.reject(error));
          return;
        }
        settle((waiter, i) => waiter.resolve(values[i]));
      },
      error => settle(waiter => waiter.reject(error)),
    );
  }

  class Spreadsheet {
    observeCell(name: string, callback: CellObserverCallback): () => void {
      if (!cellObservers[name]) {
        cellObservers[name] = [];
      }
      cellObservers[name].push(callback);

      return () => {
        cellObservers[name] = cellObservers[name].filter(cb => cb !== callback);

        if (cellObservers[name].length === 0) {
          staleNames.add(name);
        }
      };
    }

    /**
     * Drop every cached cell. Sheet names repeat across budget files, so the
     * caches have to go when one closes or the next file would read them.
     */
    clear(): void {
      LRUValueCache.clear();
      for (const name of Object.keys(cellCache)) {
        delete cellCache[name];
      }
      staleNames.clear();
    }

    listen(): () => void {
      return listen('cells-changed', event => {
        // TODO: batch react so only renders once
        event.forEach(node => {
          const observers = cellObservers[node.name];
          if (observers?.length) {
            observers.forEach(func => func(node));
          }

          // Keep cells we hold a value for up to date even when nothing is
          // bound to them, so revisiting a page usually finds them current.
          if (observers?.length || cellCache[node.name] != null) {
            cellCache[node.name] = Promise.resolve(node);
            LRUValueCache.set(node.name, node);
            staleNames.delete(node.name);
          }
        });
      });
    }

    bind(
      sheetName: string = GLOBAL_SHEET_NAME,
      binding: Binding,
      callback: CellObserverCallback,
    ): () => void {
      binding = typeof binding === 'string' ? { name: binding } : binding;

      if (binding.query) {
        void this.createQuery(sheetName, binding.name, binding.query);
      }

      const resolvedName = `${sheetName}!${binding.name}`;
      const cleanup = this.observeCell(resolvedName, callback);

      // Always synchronously call with the existing value if it has one.
      // This is a display optimization to avoid flicker. The LRU cache
      // will keep a number of recent nodes in memory.
      if (LRUValueCache.has(resolvedName)) {
        const node = LRUValueCache.get(resolvedName);
        if (node) {
          callback(node);
        }
      }

      // A value nothing has been observing has to be re-read before it can be
      // trusted - it was already painted above, so this costs a round trip and
      // no flicker.
      const isStale = staleNames.has(resolvedName);
      staleNames.delete(resolvedName);

      if (cellCache[resolvedName] != null && !isStale) {
        void cellCache[resolvedName].then(callback);
      } else {
        const req = this.get(sheetName, binding.name);
        cellCache[resolvedName] = req;

        void req.then(
          result => {
            // We only want to call the callback if it's still waiting on
            // the same request. If we've received a `cells-changed` event
            // for this already then it's already been called and we don't
            // need to call it again (and potentially could be calling it
            // with an old value depending on the order of messages)
            if (cellCache[resolvedName] === req) {
              LRUValueCache.set(resolvedName, result);
              callback(result);
            }
          },
          error => {
            // Leaving the rejected request in the cache would make every
            // later bind of this cell replay the failure and never render.
            if (cellCache[resolvedName] === req) {
              delete cellCache[resolvedName];
            }
            captureException(error);
          },
        );
      }

      return cleanup;
    }

    /**
     * Read a cell, batched with every other cell asked for in the same tick.
     * A page that binds hundreds of cells does so in one commit, so without
     * this each one costs its own round trip to the backend worker.
     */
    get(sheetName: string, name: string): Promise<CellCacheValue> {
      if (!batch) {
        batch = { cells: [], waiting: [] };
        // Flushed on a microtask: React runs a commit's effects in one
        // synchronous pass, so everything that page binds lands in this batch.
        void Promise.resolve().then(flushBatch);
      }

      const current = batch;
      return new Promise((resolve, reject) => {
        current.cells.push({ sheetName, name });
        current.waiting.push({ resolve, reject });
      });
    }

    getCellNames(sheetName: string) {
      return send('get-cell-names', { sheetName });
    }

    createQuery(sheetName: string, name: string, query: Query) {
      return send('create-query', {
        sheetName,
        name,
        query: query.serialize(),
      });
    }
  }

  return new Spreadsheet();
}

type SpreadsheetProviderProps = {
  children: ReactNode;
};

export function SpreadsheetProvider({ children }: SpreadsheetProviderProps) {
  const spreadsheet = useMemo(() => makeSpreadsheet(), []);
  const [budgetId] = useMetadataPref('id');

  useEffect(() => {
    return spreadsheet.listen();
  }, [spreadsheet]);

  useEffect(() => {
    if (!budgetId) {
      return;
    }
    return () => spreadsheet.clear();
  }, [spreadsheet, budgetId]);

  return (
    <SpreadsheetContext.Provider value={spreadsheet}>
      {children}
    </SpreadsheetContext.Provider>
  );
}
