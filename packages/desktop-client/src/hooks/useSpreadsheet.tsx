import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

import { listen, send } from '@actual-app/core/platform/client/connection';
import { captureException } from '@actual-app/core/platform/exceptions';
import type { Query } from '@actual-app/core/shared/query';
import { LRUCache } from 'lru-cache';

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
  const LRUValueCache = new LRUCache<string, CellCacheValue>({ max: 1200 });
  const cellCache: CellCache = {};
  let observersDisabled = false;

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

    // Every caller has to settle, or the cells that asked would wait on a
    // promise that never resolves and never render.
    const settle = (apply: (waiter: Waiter, index: number) => void): void =>
      current.waiting.forEach(apply);

    void send('get-cells', { cells: current.cells }).then(
      values => {
        // Results are matched to requests by position, so a response of the
        // wrong shape would hand one cell's value to another cell. Fail the
        // batch rather than render numbers against the wrong names.
        if (!Array.isArray(values) || values.length !== current.cells.length) {
          settle(waiter =>
            waiter.reject(
              new Error(
                `get-cells returned ${
                  Array.isArray(values) ? values.length : typeof values
                } results for ${current.cells.length} cells`,
              ),
            ),
          );
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
          cellCache[name] = null;
        }
      };
    }

    disableObservers(): void {
      observersDisabled = true;
    }

    enableObservers(): void {
      observersDisabled = false;
    }

    prewarmCache(name: string, value: CellCacheValue): void {
      LRUValueCache.set(name, value);
    }

    listen(): () => void {
      return listen('cells-changed', event => {
        if (!observersDisabled) {
          // TODO: batch react so only renders once
          event.forEach(node => {
            const observers = cellObservers[node.name];
            if (observers) {
              observers.forEach(func => func(node));
              cellCache[node.name] = Promise.resolve(node);
              LRUValueCache.set(node.name, node);
            }
          });
        }
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

      if (cellCache[resolvedName] != null) {
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
            // A whole batch fails together, so leaving the rejection cached
            // would stop every cell in it from ever rendering.
            if (cellCache[resolvedName] === req) {
              cellCache[resolvedName] = null;
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
        // synchronous pass, so everything a page binds lands in this batch.
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

  useEffect(() => {
    return spreadsheet.listen();
  }, [spreadsheet]);

  return (
    <SpreadsheetContext.Provider value={spreadsheet}>
      {children}
    </SpreadsheetContext.Provider>
  );
}
