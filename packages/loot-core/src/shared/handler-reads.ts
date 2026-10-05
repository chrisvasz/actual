import type { Handlers } from '#types/handlers';

/**
 * The tables each of these handlers reads. They run raw SQL or read an
 * in-memory cache rather than an AQL query, so unlike an AQL reply they don't
 * report their dependencies; a client caching one of their results refetches
 * it when a sync event lists one of these tables.
 *
 * `handler-reads.test.ts` runs each handler and fails unless the tables its
 * SQL reads, plus those behind any in-memory cache it reads, are exactly the
 * ones listed here. The rules cache reads `rules` and, because it rewrites the
 * ids in each rule when payees are merged or categories deleted, the mapping
 * tables. Sync listeners keep it current before the sync event goes out.
 */
export const handlerReads = {
  'accounts-get': ['accounts', 'banks'],
  'account-groups-get': ['account_groups'],
  'get-categories': ['categories', 'category_groups'],
  'payees-get': ['payees', 'accounts'],
  'payees-get-orphaned': ['payees', 'payee_mapping', 'transactions', 'rules'],
  'payees-get-rule-counts': [
    'rules',
    'payee_mapping',
    'category_mapping',
    'schedules',
    'schedules_next_date',
  ],
  'payees-get-rules': ['rules', 'payee_mapping', 'category_mapping'],
  'rules-get': ['rules', 'payee_mapping', 'category_mapping'],
  'tags-get': ['tags'],
} as const satisfies Partial<Record<keyof Handlers, readonly string[]>>;
