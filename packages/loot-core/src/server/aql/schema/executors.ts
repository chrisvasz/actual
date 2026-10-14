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
import { aqlQuery, compileQuery, schema, schemaConfig } from '..';

// Transactions executor

type SplitsOption = 'all' | 'inline' | 'none' | 'grouped';

// Above this many groups, walking every transaction beats per-id
// index lookups when fetching the rows of a grouped query
const MAX_INDEXED_GROUP_LOOKUP = 1000;

// How many groups a filtered grouped query looks through for its page
// before matching every transaction instead (see `pageInWindow`), and
// the largest page it does that for
const WINDOW_GROUPS = 2000;
const MAX_WINDOW_PAGE = 500;

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

// The query's filter as a condition, without the WHERE keyword
function whereCondition(sqlPieces: SqlPieces) {
  return sqlPieces.where === '' ? '1' : sqlPieces.where.replace(/^WHERE /, '');
}

// The first page of groups of a filtered grouped query, or null if it
// isn't found among the first few groups in the query's order.
//
// A group (a parent or standalone transaction) is shown when its own row
// matches, or when one of its live children does. Matching every
// transaction, then grouping and sorting the matches (as the fallback
// does) costs the same however few groups are shown, which is slow for
// a page of a broad search. Here SQLite instead checks the groups in
// order and stops at the page. To keep a search that matches few groups
// from checking every one of them, one by one, it only looks through a
// window of the first groups. If the page isn't full by then, the query
// matches few groups, and the fallback finds them faster.
//
// A group's children are found by their raw `parent_id` (indexed), then
// each one is matched by `id` against the query's own FROM, joins and
// filter, so the filter needn't be compiled for another alias. That inner
// FROM shadows the outer one, which is why the children are found through
// `_child` first. The filter appears more than once, so this is only for
// queries without parameters, whose values are bound in order.
function pageInWindow(queryState: QueryState, sqlPieces: SqlPieces) {
  const { from, joins, orderBy, limit } = sqlPieces;
  const filter = whereCondition(sqlPieces);

  // The window: the first groups in the query's order that pass its
  // account and date filters. A parent can be shown for a child that
  // passes them when it doesn't, so parents are always included. (A
  // child's account and date follow its parent's, so a group whose
  // parent lost its split flag is left out only if those differ too.)
  const windowState = {
    ...queryState,
    filterExpressions: queryState.filterExpressions.filter(
      expr => !_isUnhappy(expr),
    ),
    selectExpressions: ['id'],
    limit: null,
    offset: null,
    // Only widens the window, and saves joining the accounts to check
    validateRefs: false,
  };
  const window = compileQuery(windowState, schema, schemaConfig).sqlPieces;
  const windowSql = `
    SELECT ${window.from}.id AS _group_id FROM ${window.from}
    ${window.joins}
    WHERE ${window.from}.is_child = 0 AND
      IFNULL(${window.from}.tombstone, 0) = 0 AND
      (${whereCondition(window)} OR ${window.from}.is_parent = 1)
    ${window.orderBy}
    LIMIT ${WINDOW_GROUPS}
  `;

  const rows = db.all<{ group_id: string }>(`
    SELECT ${from}.id AS group_id
    FROM (${windowSql}) _window
    CROSS JOIN ${from} ON ${from}.id = _window._group_id
    ${joins}
    WHERE (${from}.tombstone = 0 AND (${filter})) OR (
      IFNULL(${from}.tombstone, 0) = 0 AND
      EXISTS (
        SELECT 1 FROM transactions _child
        WHERE _child.parent_id = ${from}.id AND
          _child.isChild = 1 AND
          _child.tombstone = 0 AND
          EXISTS (
            SELECT 1 FROM ${from}
            ${joins}
            WHERE ${from}.id = _child.id AND (${filter})
          )
      )
    )
    ${orderBy}
    LIMIT ${limit}
  `);
  return rows.length === limit ? rows : null;
}

function execTransactionsGrouped(
  compilerState: CompilerState,
  queryState: QueryState,
  sqlPieces: SqlPieces,
  params: (string | number)[],
  outputTypes: OutputTypes,
) {
  const { withDead } = queryState;
  const whereDead = withDead ? '' : `AND ${sqlPieces.from}.tombstone = 0`;

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

  let rows;
  let matched = null;
  const isHappyPath = isHappyPathQuery(queryState);
  const windowRows =
    !isHappyPath &&
    params.length === 0 &&
    // The window is a prefix of the default order (cheap to walk), and
    // holds a first page, or a few, but not a page at an offset
    queryState.orderExpressions.length === 0 &&
    sqlPieces.offset == null &&
    sqlPieces.limit > 0 &&
    sqlPieces.limit <= MAX_WINDOW_PAGE
      ? pageInWindow(queryState, sqlPieces)
      : null;

  if (isHappyPath) {
    // This is just an optimization - we can just filter out children
    // directly and only list parents
    const rowSql = `
      SELECT ${sqlPieces.from}.id as group_id
      FROM ${sqlPieces.from}
      ${sqlPieces.joins}
      ${appendWhere(sqlPieces.where, `is_child = 0 ${whereDead}`)}
      ${sqlPieces.orderBy}
      ${sqlPieces.limit != null ? `LIMIT ${sqlPieces.limit}` : ''}
      ${sqlPieces.offset != null ? `OFFSET ${sqlPieces.offset}` : ''}
    `;
    rows = db.all<db.DbViewTransactionInternal>(rowSql, params);
  } else if (windowRows) {
    rows = windowRows;
  } else {
    // TODO: phew, what a doozy. write docs why it works this way
    //
    // The join back to the view is an inner join. A LEFT JOIN stops
    // SQLite from flattening the view, so it materializes every
    // transaction just to look up a page of groups. A group whose own
    // row isn't in the view has no parent to show below anyway.
    const rowSql = `
      SELECT group_id, matched FROM (
        SELECT
          group_id,
          GROUP_CONCAT(id) as matched
          FROM (
            SELECT ${sqlPieces.from}.id, IFNULL(${sqlPieces.from}.parent_id, ${sqlPieces.from}.id) as group_id
            FROM ${sqlPieces.from}
            LEFT JOIN transactions _t2 ON ${sqlPieces.from}.is_child = 1 AND _t2.id = ${sqlPieces.from}.parent_id
            ${sqlPieces.joins}
            ${appendWhere(sqlPieces.where, `${sqlPieces.from}.tombstone = 0 AND IFNULL(_t2.tombstone, 0) = 0`)}
          )
        GROUP BY group_id
      )
      JOIN ${sqlPieces.from} ON ${sqlPieces.from}.id = group_id
      ${sqlPieces.joins}
      ${sqlPieces.orderBy}
      ${sqlPieces.limit != null ? `LIMIT ${sqlPieces.limit}` : ''}
      ${sqlPieces.offset != null ? `OFFSET ${sqlPieces.offset}` : ''}
    `;

    rows = db.all<db.DbViewTransactionInternal>(rowSql, params);
    matched = new Set(
      [].concat.apply(
        [],
        rows.map(row => row.matched.split(',')),
      ),
    );
  }

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
  // A row of a shown group matches if it's alive and matches the filter
  // (its parent, the group's own row, is always alive here)
  const matchedColumn = windowRows
    ? `, (${sqlPieces.from}.tombstone = 0 AND (${whereCondition(sqlPieces)})) AS _matched`
    : '';
  const finalSql = `
    SELECT ${sqlPieces.select}, parent_id AS _parent_id${matchedColumn} FROM ${from}
    ${sqlPieces.joins}
    WHERE ${where} ${whereDead}
    ${sqlPieces.orderBy}
  `;

  const allRows = db.all<
    db.DbViewTransactionInternal & {
      _parent_id: db.DbViewTransactionInternal['parent_id'];
    }
  >(finalSql);

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

  const mapper = trans => {
    const isUnmatched = windowRows
      ? !trans._matched
      : matched != null && !matched.has(trans.id);
    delete trans._matched;

    Object.keys(trans).forEach(name => {
      trans[name] = convertOutputType(trans[name], outputTypes.get(name));
    });

    if (isUnmatched) {
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
