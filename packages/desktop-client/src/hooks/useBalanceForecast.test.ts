import { describe, expect, it } from 'vitest';

import { buildBalanceForecastRequest } from './useBalanceForecast';

describe('buildBalanceForecastRequest', () => {
  it('keeps forecast filters and account selection', () => {
    expect(
      buildBalanceForecastRequest({
        accountIds: ['acct'],
        conditions: [{ field: 'account', op: 'is', value: 'acct' }],
        conditionsOp: 'and',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        includeAccountlessSchedules: true,
      }),
    ).toEqual({
      accountIds: ['acct'],
      conditions: [{ field: 'account', op: 'is', value: 'acct' }],
      conditionsOp: 'and',
      startDate: '2024-03-01',
      endDate: '2024-03-31',
      includeAccountlessSchedules: true,
    });
  });

  it('omits filters and account selection when undefined', () => {
    expect(
      buildBalanceForecastRequest({
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      }),
    ).toEqual({
      startDate: '2024-03-01',
      endDate: '2024-03-31',
    });
  });
});
