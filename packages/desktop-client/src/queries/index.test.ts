import { q } from '@actual-app/core/shared/query';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
} from '@actual-app/core/types/models';

import { transactionsSearch } from '.';

const payees = [
  { id: 'payee-cafe', name: 'Café Müller' },
  { id: 'payee-lodz', name: 'Łódź Market' },
  // A transfer payee's name is its account's name
  { id: 'payee-transfer', name: 'Savings', transfer_acct: 'acct-savings' },
] as PayeeEntity[];
const categories = [
  { id: 'cat-food', name: 'Food' },
  { id: 'cat-cafes', name: 'Cafes' },
] as CategoryEntity[];
const accounts = [
  { id: 'acct-checking', name: 'Checking' },
  { id: 'acct-savings', name: 'Savings' },
] as AccountEntity[];

function searchFilter(search: string) {
  const query = transactionsSearch(q('transactions'), search, 'MM/dd/yyyy', {
    payees,
    categories,
    accounts,
  });
  return query.serialize().filterExpressions.at(-1);
}

describe('transactionsSearch', () => {
  it('matches names ignoring case and accents, by id', () => {
    expect(searchFilter('CAFE')).toEqual({
      $or: [
        { payee: { $oneof: ['payee-cafe'] } },
        { category: { $oneof: ['cat-cafes'] } },
        { notes: { $like: '%CAFE%' } },
      ],
    });
    expect(searchFilter('lodz')).toEqual({
      $or: [
        { payee: { $oneof: ['payee-lodz'] } },
        { notes: { $like: '%lodz%' } },
      ],
    });
  });

  it("matches a transfer payee and its account by the account's name", () => {
    expect(searchFilter('saving')).toEqual({
      $or: [
        { payee: { $oneof: ['payee-transfer'] } },
        { account: { $oneof: ['acct-savings'] } },
        { notes: { $like: '%saving%' } },
      ],
    });
  });

  it('treats wildcards as literal text', () => {
    expect(searchFilter('100%')).toMatchObject({
      $or: expect.arrayContaining([{ notes: { $like: '%100\\%%' } }]),
    });
    expect(searchFilter('#')).toEqual({
      $or: [{ notes: { $like: '%#%' } }],
    });
  });
});
