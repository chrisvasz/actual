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

function searchFilter(search: string, notes?: Map<string, string>) {
  const query = transactionsSearch(q('transactions'), search, 'MM/dd/yyyy', {
    payees,
    categories,
    accounts,
    notes,
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

  it("matches the register's normalised notes by id", () => {
    const notes = new Map([
      ['t-strasse', 'strasse 5'],
      ['t-lodz', 'trip to lodz'],
      ['t-other', 'rent'],
    ]);
    expect(searchFilter('STRAẞE', notes)).toEqual({
      $or: [{ id: { $oneofbound: ['t-strasse'] } }],
    });
    expect(searchFilter('Łódź', notes)).toEqual({
      $or: [
        { payee: { $oneof: ['payee-lodz'] } },
        { id: { $oneofbound: ['t-lodz'] } },
      ],
    });
    // Matching no notes still filters, rather than dropping the condition
    expect(searchFilter('zzz', notes)).toEqual({
      $or: [{ id: { $oneofbound: [] } }],
    });
  });
});
