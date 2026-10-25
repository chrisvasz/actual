import type { ReactNode } from 'react';

import type {
  PayeeEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import { renderHook } from '@testing-library/react';

import { initLiveReads } from '#mocks/live-reads';

import { DisplayPayeeProvider, useDisplayPayee } from './useDisplayPayee';

const payees: PayeeEntity[] = [
  { id: 'p-grocer', name: 'Grocer' },
  { id: 'p-cafe', name: 'Cafe' },
];

function transaction(payee: string): TransactionEntity {
  return {
    id: 't1',
    account: 'a',
    date: '2024-01-01',
    amount: -100,
    payee,
  } as TransactionEntity;
}

beforeEach(() => {
  initLiveReads(null, name => ({
    data: name === 'payees-get' ? payees : [],
    dependencies: [],
  }));
});

describe('DisplayPayeeProvider', () => {
  it("shows a row's new payee once the rows change", () => {
    let rows = [transaction('p-grocer')];
    const { result, rerender } = renderHook(
      () => useDisplayPayee({ transaction: rows[0] }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <DisplayPayeeProvider transactions={rows}>
            {children}
          </DisplayPayeeProvider>
        ),
      },
    );
    expect(result.current).toBe('Grocer');

    rows = [transaction('p-cafe')];
    rerender();
    expect(result.current).toBe('Cafe');
  });
});
