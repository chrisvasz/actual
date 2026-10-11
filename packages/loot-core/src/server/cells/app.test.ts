import { loadBudgetState, unloadBudgetState } from '#server/budget/state';
import { q } from '#shared/query';

import { app } from './app';
import { getQueryCellValue, hasQueryCell } from './query-cells';

beforeEach(global.emptyDatabase());

const query = q('transactions').calculate({ $sum: '$amount' }).serialize();

describe('create-query', () => {
  it('runs a bound query straight away', async () => {
    await loadBudgetState();
    await app.handlers['create-query']({
      sheetName: '__global',
      name: 'accounts-balance',
      query,
    });
    expect(hasQueryCell('__global!accounts-balance')).toBe(true);
    expect(getQueryCellValue('__global!accounts-balance')).toBe(0);
  });

  it('drops a bind that arrives while no budget is open', async () => {
    unloadBudgetState();
    await app.handlers['create-query']({
      sheetName: '__global',
      name: 'accounts-balance',
      query,
    });
    expect(hasQueryCell('__global!accounts-balance')).toBe(false);
  });
});
