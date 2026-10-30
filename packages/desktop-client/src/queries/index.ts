import {
  dayFromDate,
  getDayMonthFormat,
  getDayMonthRegex,
  getShortYearFormat,
  getShortYearRegex,
} from '@actual-app/core/shared/months';
import { getNormalisedString } from '@actual-app/core/shared/normalisation';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import {
  amountToInteger,
  currencyToAmount,
} from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
} from '@actual-app/core/types/models';
import type { SyncedPrefs } from '@actual-app/core/types/prefs';
// @ts-strict-ignore
import { isValid as isDateValid, parse as parseDate } from 'date-fns';

import type { NotesCache } from './notesCache';

export function accountFilter(
  accountId?:
    | AccountEntity['id']
    | 'onbudget'
    | 'offbudget'
    | 'closed'
    | 'uncategorized',
  field = 'account',
) {
  if (accountId) {
    if (accountId === 'onbudget') {
      return {
        $and: [
          { [`${field}.offbudget`]: false },
          { [`${field}.closed`]: false },
        ],
      };
    } else if (accountId === 'offbudget') {
      return {
        $and: [
          { [`${field}.offbudget`]: true },
          { [`${field}.closed`]: false },
        ],
      };
    } else if (accountId === 'closed') {
      return { [`${field}.closed`]: true };
    } else if (accountId === 'uncategorized') {
      return {
        [`${field}.offbudget`]: false,
        category: null,
        is_parent: false,
        $or: [
          {
            'payee.transfer_acct.offbudget': true,
            'payee.transfer_acct': null,
          },
        ],
      };
    } else {
      return { [field]: accountId };
    }
  }

  return null;
}

export function transactions(
  accountId?:
    | AccountEntity['id']
    | 'onbudget'
    | 'offbudget'
    | 'closed'
    | 'uncategorized',
) {
  let query = q('transactions').options({ splits: 'grouped' });

  const filter = accountFilter(accountId);
  if (filter) {
    query = query.filter(filter);
  }

  return query;
}

export function transactionsSearch(
  currentQuery: Query,
  search: string,
  dateFormat: SyncedPrefs['dateFormat'],
  {
    payees,
    categories,
    accounts,
    notes,
  }: {
    payees: PayeeEntity[];
    categories: CategoryEntity[];
    accounts: AccountEntity[];
    // The register's normalised notes, if it could read them
    notes?: NotesCache | null;
  },
) {
  const amount = currencyToAmount(search);
  const escapedSearch = search.replace(/[\\%?]/g, '\\$&');

  // Support various date formats
  let parsedDate;
  if (getDayMonthRegex(dateFormat).test(search)) {
    parsedDate = parseDate(search, getDayMonthFormat(dateFormat), new Date());
  } else if (getShortYearRegex(dateFormat).test(search)) {
    parsedDate = parseDate(search, getShortYearFormat(dateFormat), new Date());
  } else {
    parsedDate = parseDate(search, dateFormat, new Date());
  }

  // Payees, categories and accounts are few and already loaded, so match
  // their names here and filter transactions by id. Matching them in SQL
  // calls back into JS for every row, which can freeze the page when SQLite
  // picks a bad plan. A transfer payee's name is its account's name.
  const term = getNormalisedString(search);
  const matchingIds = (items: Array<{ id: string; name: string }>) =>
    items
      .filter(item => getNormalisedString(item.name ?? '').includes(term))
      .map(item => item.id);
  const payeeIds = matchingIds(payees);
  const categoryIds = matchingIds(categories);
  const accountIds = matchingIds(accounts);
  // Notes differ on every row, so without the register's cache they're
  // matched in SQL, calling into JS for every row. Matching the cache
  // passes the ids as one bound parameter: always present, even empty, so
  // a search matching nothing shows nothing.
  const notesFilter = notes
    ? {
        id: {
          $oneofbound: [...notes]
            .filter(([, value]) => value.includes(term))
            .map(([id]) => id),
        },
      }
    : { notes: { $like: `%${escapedSearch}%` } };

  return currentQuery.filter({
    $or: [
      payeeIds.length > 0 && { payee: { $oneof: payeeIds } },
      categoryIds.length > 0 && { category: { $oneof: categoryIds } },
      accountIds.length > 0 && { account: { $oneof: accountIds } },
      notesFilter,
      isDateValid(parsedDate) && { date: dayFromDate(parsedDate) },
      amount != null && {
        amount: { $transform: '$abs', $eq: amountToInteger(amount) },
      },
      amount != null &&
        Number.isInteger(amount) && {
          amount: {
            $transform: { $abs: { $idiv: ['$', 100] } },
            $eq: amount,
          },
        },
    ].filter(Boolean),
  });
}

export function uncategorizedTransactions() {
  return q('transactions').filter({
    'account.offbudget': false,
    category: null,
    $or: [
      {
        'payee.transfer_acct.offbudget': true,
        'payee.transfer_acct': null,
      },
    ],
  });
}
