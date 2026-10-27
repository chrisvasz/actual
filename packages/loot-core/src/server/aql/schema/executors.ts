// @ts-strict-ignore

import { appendWhere, isAggregateQuery } from '#server/aql/compiler';
import type {
  CompilerState,
  OutputTypes,
  SqlPieces,
} from '#server/aql/compiler';
import { execQuery } from '#server/aql/exec';
import type { AqlQueryExecutor } from '#server/aql/exec';
import { convertOutputType } from '#server/aql/schema-helpers';
import * as db from '#server/db';
import { whereIn } from '#server/db/util';
import { q } from '#shared/query';
import type { QueryState } from '#shared/query';
import type { CategoryEntity } from '#types/models';
import { aqlQuery } from '..';

// Transactions executor

type SplitsOption = 'all' | 'inline' | 'none' | 'grouped';

// Above this many groups, walking every transaction beats per-id
// index lookups when fetching the rows of a grouped query
const MAX_INDEXED_GROUP_LOOKUP = 1000;

function toGroup(parents, children, mapper = x => x) {
  return parents.reduce((list, parent) => {
    const childs = children.get(parent.id) || [];
    list.push({
      ...mapper(parent),
      subtransactions: childs.map(mapper),
    });
    return list;
  }, []);
}

// These two queries will return very different things:
//
// q('transactions').select({ $count: 'id' })
// q('transactions', { splits: "grouped" }).select({ $count: 'id' })
//
// The first will return the count of non-split and child
// transactions, and the second will return the count of all parent
// (or non-split) transactions

function execTransactions(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) {
  const tableOptions = queryState.tableOptions || {};
  const splitType = tableOptions.splits
    ? (tableOptions.splits as string)
    : 'inline';
  if (!isValidSplitsOption(splitType)) {
    throw new Error(`Invalid "splits" option for transactions: "${splitType}"`);
  }

  if (splitType === 'all' || splitType === 'inline' || splitType === 'none') {
    return execTransactionsBasic(
      compilerState,
      queryState,
      sqlPieces,
      params,
      splitType,
      outputTypes,
    );
  } else if (splitType === 'grouped') {
    return execTransactionsGrouped(
      compilerState,
      queryState,
      sqlPieces,
      params,
      outputTypes,
    );
  }
}

function _isUnhappy(filter) {
  // `$and`/`$or` can hold a list of filters; check each one rather
  // than treating the list's indexes as field names
  if (Array.isArray(filter)) {
    return filter.some(_isUnhappy);
  }

  // The compiler skips empty entries in those lists (e.g. the account
  // page's `$and` holds `undefined` for conditions without a custom
  // filter), so they don't affect the path either
  if (filter == null) {
    return false;
  }

  // These fields can be filtered - all split transactions will
  // still be returned regardless
  for (const key of Object.keys(filter)) {
    if (key === '$or' || key === '$and') {
      if (filter[key] && _isUnhappy(filter[key])) {
        return true;
      }
    } else if (!(key.indexOf('account') === 0 || key === 'date')) {
      return true;
    }
  }
  return false;
}

export function isHappyPathQuery(queryState) {
  return queryState.filterExpressions.find(_isUnhappy) == null;
}

function execTransactionsGrouped(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) {
  const { withDead } = queryState;
  // A NULL tombstone counts as alive, as in `v_transactions_internal_alive`
  const whereDead = withDead
    ? ''
    : `AND IFNULL(${sqlPieces.from}.tombstone, 0) = 0`;

  // Aggregate queries don't make sense for a grouped transactions
  // query. We never should include both parent and children
  // transactions as it would duplicate amounts and the final number
  // would never make sense. In this case, switch back to the "inline"
  // type where only non-parent transactions are considered
  if (isAggregateQuery(queryState)) {
    const s = { ...sqlPieces };

    // Modify the where to only include non-parents
    s.where = appendWhere(s.where, `${s.from}.is_parent = 0`);

    // We also want to exclude deleted transactions. Normally we
    // handle this manually down below, but now that we are doing a
    // normal query we want to rely on the view. Unfortunately, SQL
    // has already been generated so we can't easily change the view
    // name here; instead, we change it and map it back to the name
    // used elsewhere in the query. Ideally we'd improve this
    if (!withDead) {
      s.from = 'v_transactions_internal_alive v_transactions_internal';
    }

    return execQuery(queryState, compilerState, s, params, outputTypes);
  }

  const t = sqlPieces.from;
  const alive = `IFNULL(${t}.tombstone, 0) = 0`;
  const isHappyPath = isHappyPathQuery(queryState);
  // The filter without its `WHERE`; off the happy path there is one
  const matches = sqlPieces.where.replace(/^WHERE /, '');
  const page = `
    ${sqlPieces.orderBy}
    ${sqlPieces.limit != null ? `LIMIT ${sqlPieces.limit}` : ''}
    ${sqlPieces.offset != null ? `OFFSET ${sqlPieces.offset}` : ''}
  `;

  // A page of groups, each given by its parent (or standalone)
  // transaction. Account and date filters match a split's parent and
  // children alike, so filtering the parents is enough, and SQLite
  // walks them in order until the page is full. Other filters can
  // match a child but not its parent, so collect the groups of the
  // alive rows that match, then sort only those groups' rows. A group
  // whose parent is dead is left out, like its children.
  const rowSql = isHappyPath
    ? `
      SELECT ${t}.id as group_id
      FROM ${t}
      ${sqlPieces.joins}
      ${appendWhere(sqlPieces.where, `is_child = 0 ${whereDead}`)}
      ${page}
    `
    : `
      SELECT ${t}.id as group_id
      FROM (
        SELECT DISTINCT IFNULL(${t}.parent_id, ${t}.id) AS _group_id
        FROM ${t}
        ${sqlPieces.joins}
        WHERE ${alive} AND ${matches}
      ) _groups
      CROSS JOIN ${t} ON ${t}.id = _groups._group_id
      ${sqlPieces.joins}
      WHERE ${alive}
      ${page}
    `;
  const rows = db.all<{ group_id: string }>(rowSql, params);

  const groupIds = rows.map(row => row.group_id);
  const where = whereIn(
    groupIds,
    `IFNULL(${sqlPieces.from}.parent_id, ${sqlPieces.from}.id)`,
  );
  // The view computes `parent_id` with a CASE expression, so the
  // `IFNULL(parent_id, id) IN (...)` filter can't use an index and
  // SQLite walks every transaction. For a page of groups, start from
  // the candidate rows instead: each group's parent (or standalone
  // transaction) by `id`, plus the rows whose raw `parent_id` points
  // at it, both indexed. CROSS JOIN pins that join order so the
  // planner can't fall back to the full walk. The original filter
  // still applies, so the result is unchanged. For a large set of
  // groups the full walk is cheaper, so keep it there.
  const from =
    groupIds.length <= MAX_INDEXED_GROUP_LOOKUP
      ? `(
          SELECT id AS _candidate_id FROM transactions
          WHERE ${whereIn(groupIds, 'id')} OR ${whereIn(groupIds, 'parent_id')}
        ) _candidates
        CROSS JOIN ${sqlPieces.from}
          ON ${sqlPieces.from}.id = _candidates._candidate_id`
      : sqlPieces.from;
  // Off the happy path, mark the rows that didn't match the filter
  const matchedColumn = isHappyPath
    ? ''
    : `, ${alive} AND ${matches} AS _matched`;
  const finalSql = `
    SELECT ${sqlPieces.select}, parent_id AS _parent_id${matchedColumn}
    FROM ${from}
    ${sqlPieces.joins}
    WHERE ${where} ${whereDead}
    ${sqlPieces.orderBy}
  `;

  const allRows = db.all<
    db.DbViewTransactionInternal & {
      _parent_id: db.DbViewTransactionInternal['parent_id'];
      _matched?: number | null;
    }
  >(finalSql, isHappyPath ? [] : params);

  // Group the parents and children up
  const { parents, children } = allRows.reduce(
    (acc, trans) => {
      const pid = trans._parent_id;
      delete trans._parent_id;

      if (pid == null) {
        acc.parents.push(trans);
      } else {
        const arr = acc.children.get(pid) || [];
        arr.push(trans);
        acc.children.set(pid, arr);
      }
      return acc;
    },
    { parents: [], children: new Map() },
  );

  const mapper = ({ _matched, ...trans }) => {
    Object.keys(trans).forEach(name => {
      trans[name] = convertOutputType(trans[name], outputTypes.get(name));
    });

    if (!isHappyPath && !_matched) {
      trans._unmatched = true;
    }
    return trans;
  };

  return toGroup(parents, children, mapper);
}

function execTransactionsBasic(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  splitType: SplitsOption,
  outputTypes: OutputTypes,
) {
  const s = { ...sqlPieces };

  if (splitType !== 'all') {
    if (splitType === 'none') {
      s.where = appendWhere(s.where, `${s.from}.parent_id IS NULL`);
    } else {
      s.where = appendWhere(s.where, `${s.from}.is_parent = 0`);
    }
  }

  return execQuery(queryState, compilerState, s, params, outputTypes);
}

function isValidSplitsOption(splits: string): splits is SplitsOption {
  return ['all', 'inline', 'none', 'grouped'].includes(splits);
}

// Category groups executor

type CategoriesOption = 'all' | 'none';

function execCategoryGroups(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) {
  const tableOptions = queryState.tableOptions || {};
  const categoriesOption = tableOptions.categories
    ? (tableOptions.categories as string)
    : 'all';
  if (!isValidCategoriesOption(categoriesOption)) {
    throw new Error(
      `Invalid "categories" option for category_groups: "${categoriesOption}"`,
    );
  }

  if (categoriesOption !== 'none') {
    return execCategoryGroupsWithCategories(
      compilerState,
      queryState,
      sqlPieces,
      params,
      categoriesOption,
      outputTypes,
    );
  }
  return execCategoryGroupsBasic(
    compilerState,
    queryState,
    sqlPieces,
    params,
    outputTypes,
  );
}

function execCategoryGroupsWithCategories(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  categoriesOption: CategoriesOption,
  outputTypes: OutputTypes,
) {
  const categoryGroups = execCategoryGroupsBasic(
    compilerState,
    queryState,
    sqlPieces,
    params,
    outputTypes,
  );

  if (categoriesOption === 'none') {
    return categoryGroups;
  }

  const { data: categories }: { data: CategoryEntity[] } = aqlQuery(
    q('categories')
      .filter({
        group: { $oneof: categoryGroups.map(cg => cg.id) },
      })
      .select('*'),
  );

  return categoryGroups.map(group => {
    const cats = categories.filter(cat => cat.group === group.id);
    return {
      ...group,
      categories: cats,
    };
  });
}

function execCategoryGroupsBasic(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) {
  return execQuery(queryState, compilerState, sqlPieces, params, outputTypes);
}

function isValidCategoriesOption(
  categories: string,
): categories is CategoriesOption {
  return ['all', 'none'].includes(categories);
}

export const schemaExecutors: Record<string, AqlQueryExecutor> = {
  transactions: execTransactions,
  category_groups: execCategoryGroups,
};
