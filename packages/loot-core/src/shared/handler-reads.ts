import type { Handlers } from '#types/handlers';

/**
 * The tables each of these handlers reads. They run raw SQL or read an
 * in-memory cache rather than an AQL query, so unlike an AQL reply they don't
 * report their dependencies; a client caching one of their results refetches
 * it when a sync event lists one of these tables.
 *
 * `handler-reads.test.ts` runs each handler and fails unless the tables its
 * SQL reads are exactly the ones listed here, plus any it reads through an
 * in-memory cache. The rules cache counts as reading `rules`: a sync listener
 * keeps it current, and sync listeners run before the sync event goes out.
 */
export const handlerReads = {
  'accounts-get': ['accounts', 'banks'],
  'account-groups-get': ['account_groups'],
  'get-categories': ['categories', 'category_groups'],
  'payees-get': ['payees', 'accounts'],
  'payees-get-orphaned': ['payees', 'payee_mapping', 'transactions', 'rules'],
  'payees-get-rule-counts': ['rules', 'schedules', 'schedules_next_date'],
  'payees-get-rules': ['rules'],
  'rules-get': ['rules'],
  'tags-get': ['tags'],
} as const satisfies Partial<Record<keyof Handlers, readonly string[]>>;
