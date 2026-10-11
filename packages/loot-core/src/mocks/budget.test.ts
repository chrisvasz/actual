import { aqlQuery } from '#server/aql';
import { loadBudgetState } from '#server/budget/state';
import * as db from '#server/db';
import { handlers } from '#server/main';
import { q } from '#shared/query';

import { createTestBudget } from './budget';

vi.mock('#server/post');

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadBudgetState();
});

describe('createTestBudget', () => {
  it('creates the demo accounts with their own names', async () => {
    await createTestBudget(handlers);

    const accounts = db.runQuery<{ id: string; name: string }>(
      'SELECT id, name FROM accounts WHERE tombstone = 0 ORDER BY name',
      [],
      true,
    );
    expect(accounts.map(a => a.name)).toEqual([
      'Ally Savings',
      'Bank of America',
      'Capital One Checking',
      'HSBC',
      'House Asset',
      'Mortgage',
      'Roth IRA',
      'Vanguard 401k',
    ]);

    // The primary checking account is kept out of the negative
    const primary = accounts.find(a => a.name === 'Bank of America');
    const { data: balance } = aqlQuery(
      q('transactions')
        .filter({ account: primary?.id })
        .calculate({ $sum: '$amount' })
        .serialize(),
    );
    expect(balance).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
