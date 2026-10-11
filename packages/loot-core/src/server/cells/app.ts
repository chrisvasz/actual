import { createApp } from '#server/app';
import { getBudgetCellValue } from '#server/budget/state';
import type { QueryState } from '#shared/query';

import {
  createQueryCell,
  getQueryCellValue,
  hasQueryCell,
} from './query-cells';

export type CellHandlers = {
  'get-cell': typeof getCell;
  'get-cells': typeof getCells;
  'create-query': typeof createQuery;
};

// Expose cells to the client: budget values by name, and cells bound to a
// query.
export const app = createApp<CellHandlers>();
app.method('get-cell', getCell);
app.method('get-cells', getCells);
app.method('create-query', createQuery);

function readCell(sheetName: string, name: string) {
  const full = `${sheetName}!${name}`;
  return {
    name: full,
    value: hasQueryCell(full)
      ? getQueryCellValue(full)
      : getBudgetCellValue(sheetName, name),
  };
}

async function getCell({
  sheetName,
  name,
}: {
  sheetName: string;
  name: string;
}) {
  return readCell(sheetName, name);
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
  return cells.map(({ sheetName, name }) => readCell(sheetName, name));
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
  // A query bound for the first time since the budget loaded always runs.
  // Re-binding an unchanged query is a no-op because applied changes already
  // keep the cell current.
  createQueryCell(`${sheetName}!${name}`, query);
  return 'ok';
}
