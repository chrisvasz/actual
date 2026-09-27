import { createApp } from '#server/app';
import * as sheet from '#server/sheet';
import type { QueryState } from '#shared/query';

import { resolveName, unresolveName } from './util';

export type SpreadsheetHandlers = {
  'get-cell': typeof getCell;
  'get-cells': typeof getCells;
  'get-cell-names': typeof getCellNames;
  'create-query': typeof createQuery;
};

// Expose functions to the client
export const app = createApp<SpreadsheetHandlers>();
app.method('get-cell', getCell);
app.method('get-cells', getCells);
app.method('get-cell-names', getCellNames);
app.method('create-query', createQuery);

async function getCell({
  sheetName,
  name,
}: {
  sheetName: string;
  name: string;
}) {
  const node = sheet.get()._getNode(resolveName(sheetName, name));
  return { name: node.name, value: node.value };
}

// Reading cells is a plain in-memory lookup, so the cost of fetching a lot of
// them is almost entirely the round trip. Pages that bind many cells at once -
// the budget table binds roughly six per category per month - ask for them
// together rather than one message each.
async function getCells({
  cells,
}: {
  cells: Array<{ sheetName: string; name: string }>;
}) {
  return cells.map(({ sheetName, name }) => {
    const node = sheet.get()._getNode(resolveName(sheetName, name));
    return { name: node.name, value: node.value };
  });
}

async function getCellNames({ sheetName }: { sheetName: string }) {
  const names = [];
  for (const name of sheet.get().getNodes().keys()) {
    const { sheet: nodeSheet, name: nodeName } = unresolveName(name);
    if (nodeSheet === sheetName) {
      names.push(nodeName);
    }
  }
  return names;
}

async function createQuery({
  sheetName,
  name,
  query,
}: {
  sheetName: string;
  name: string;
  query: QueryState;
}) {
  // Always run it regardless of cache. We don't know anything has changed
  // between the cache value being saved and now
  sheet.get().createQuery(sheetName, name, query);
  return 'ok';
}
