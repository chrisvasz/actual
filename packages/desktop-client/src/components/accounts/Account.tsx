import React, {
  createRef,
  PureComponent,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
} from 'react';
import type { ReactElement, RefObject } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, useLocation, useParams } from 'react-router';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { listen, send } from '@actual-app/core/platform/client/connection';
import * as undo from '@actual-app/core/platform/client/undo';
import type { UndoState } from '@actual-app/core/server/undo';
import { memoizeOne } from '@actual-app/core/shared/memoize';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import type { RegisterGroup } from '@actual-app/core/shared/register-rows';
import {
  flattenGroups,
  makeSearchMatcher,
  matchGroups,
  runningBalances,
  scopeGroups,
  sortGroups,
} from '@actual-app/core/shared/register-view';
import type {
  RegisterLookups,
  RegisterSort,
} from '@actual-app/core/shared/register-view';
import {
  makeAsNonChildTransactions,
  makeChild,
  ungroupTransaction,
  ungroupTransactions,
} from '@actual-app/core/shared/transactions';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  CategoryGroupEntity,
  NewRuleEntity,
  PayeeEntity,
  RuleActionEntity,
  RuleConditionEntity,
  TransactionEntity,
  TransactionFilterEntity,
} from '@actual-app/core/types/models';
import { parseISO } from 'date-fns';
import { isEqual } from 'es-toolkit/compat';
import { v4 as uuidv4 } from 'uuid';

import { useReopenAccount, useUpdateAccount } from '#accounts';
import { markAccountRead } from '#accounts/accountsSlice';
import * as reconciliation from '#accounts/reconciliation';
import { FeatureErrorFallback } from '#components/FeatureErrorFallback';
import type { SavedFilter } from '#components/filters/SavedFilterMenuButton';
import type {
  TransactionTableColumn,
  TransactionTableColumnId,
} from '#components/transactions/table/columns';
import { TransactionList } from '#components/transactions/TransactionList';
import { validateAccountName } from '#components/util/accountValidation';
import { useAccountPreviewTransactions } from '#hooks/useAccountPreviewTransactions';
import { useAccounts } from '#hooks/useAccounts';
import { SchedulesProvider } from '#hooks/useCachedSchedules';
import { useCategories } from '#hooks/useCategories';
import { useDateFormat } from '#hooks/useDateFormat';
import { useLocalPref } from '#hooks/useLocalPref';
import { usePayees } from '#hooks/usePayees';
import { calculateRunningBalancesBottomUp } from '#hooks/usePreviewTransactions';
import { retryRegisterRows, useRegisterRows } from '#hooks/useRegisterRows';
import { getSchedulesQuery } from '#hooks/useSchedules';
import { SelectedProviderWithItems } from '#hooks/useSelected';
import type { Actions } from '#hooks/useSelected';
import {
  SplitsExpandedProvider,
  useSplitsExpanded,
} from '#hooks/useSplitsExpanded';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useTransactionBatchActions } from '#hooks/useTransactionBatchActions';
import { useTransactionFilters } from '#hooks/useTransactionFilters';
import {
  SPECIAL_VIEW_IDS,
  useTransactionTableColumns,
} from '#hooks/useTransactionTableColumns';
import {
  openAccountCloseModal,
  pushModal,
  replaceModal,
} from '#modals/modalsSlice';
import type { ConfirmTransactionEditReason } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useCreatePayee } from '#payees';
import * as queries from '#queries';
import { aqlQuery } from '#queries/aqlQuery';
import { watchLiveQuery } from '#queries/liveStore';
import type { LiveResult } from '#queries/liveStore';
import { useDispatch, useSelector } from '#redux';
import type { AppDispatch } from '#redux/store';
import type { RegisterSnapshot } from '#transactions/registerStore';
import { updateNewTransactions } from '#transactions/transactionsSlice';
import { clearPendingUndo } from '#undo';

import { AccountEmptyMessage } from './AccountEmptyMessage';
import { AccountHeader } from './Header';

type ConditionEntity = Partial<RuleConditionEntity> | TransactionFilterEntity;

// The query filters for the given filter conditions, to be combined with
// the screen's and/or operator
async function makeTransactionFilters(conditions: ConditionEntity[]) {
  const customQueryFilters = conditions
    .filter(
      (cond): cond is Partial<RuleConditionEntity> =>
        !isTransactionFilterEntity(cond),
    )
    .map(f => f.queryFilter);
  const { filters: queryFilters } = await send('make-filters-from-conditions', {
    conditions: conditions.filter(
      cond => isTransactionFilterEntity(cond) || !cond.customName,
    ),
  });
  return [...queryFilters, ...customQueryFilters];
}

function isTransactionFilterEntity(
  filter: ConditionEntity,
): filter is TransactionFilterEntity {
  return 'id' in filter;
}

type RunningBalances = ReadonlyMap<TransactionEntity['id'], IntegerAmount>;

type AllTransactionsProps = {
  account?: AccountEntity | undefined;
  transactions: TransactionEntity[];
  balances: RunningBalances | null;
  showBalances?: boolean | undefined;
  filtered?: boolean | undefined;
  children: (
    transactions: TransactionEntity[],
    balances: RunningBalances | null,
  ) => ReactElement;
};

function AllTransactions({
  account,
  transactions,
  balances,
  showBalances,
  filtered,
  children,
}: AllTransactionsProps) {
  const accountId = account?.id;
  const { dispatch: splitsExpandedDispatch } = useSplitsExpanded();
  const { previewTransactions, isLoading: isPreviewTransactionsLoading } =
    useAccountPreviewTransactions({ accountId });

  useEffect(() => {
    if (!isPreviewTransactionsLoading) {
      splitsExpandedDispatch({
        type: 'close-splits',
        ids: previewTransactions.filter(t => t.is_parent).map(t => t.id),
      });
    }
  }, [
    isPreviewTransactionsLoading,
    previewTransactions,
    splitsExpandedDispatch,
  ]);

  const runningBalance =
    showBalances && balances && transactions.length > 0
      ? (balances.get(transactions[0].id) ?? 0)
      : 0;

  const prependBalances = useMemo(() => {
    if (!showBalances) {
      return null;
    }

    return calculateRunningBalancesBottomUp(
      previewTransactions,
      'all',
      runningBalance,
    );
  }, [showBalances, previewTransactions, runningBalance]);

  const allTransactions = useMemo(() => {
    // Don't prepend scheduled transactions if we are filtering
    if (!filtered && previewTransactions.length > 0) {
      return previewTransactions.concat(transactions);
    }
    return transactions;
  }, [filtered, previewTransactions, transactions]);

  const allBalances = useMemo(() => {
    // Don't prepend scheduled transactions if we are filtering
    if (!filtered && prependBalances && balances) {
      const merged = new Map(balances);
      for (const [id, balance] of prependBalances) {
        merged.set(id, balance);
      }
      return merged;
    }
    return balances;
  }, [filtered, prependBalances, balances]);

  if (!previewTransactions?.length || filtered) {
    return children(transactions, balances);
  }
  return children(allTransactions, allBalances);
}

type AccountInternalProps = {
  accountId?:
    | AccountEntity['id']
    | 'onbudget'
    | 'offbudget'
    | 'uncategorized'
    | undefined;
  filterConditions: RuleConditionEntity[];
  showBalances?: boolean;
  showCleared?: boolean;
  showReconciled: boolean;
  setShowReconciled: (newValue: boolean) => void;
  showGroup: boolean;
  transactionColumns: TransactionTableColumn[];
  columnOrder: TransactionTableColumnId[];
  saveColumns: (columns: TransactionTableColumn[], applyToAll: boolean) => void;
  accounts: AccountEntity[];
  newTransactions: Array<TransactionEntity['id']>;
  matchedTransactions: Array<TransactionEntity['id']>;
  splitsExpandedDispatch: ReturnType<typeof useSplitsExpanded>['dispatch'];
  expandSplits?: boolean | undefined;
  savedFilters: TransactionFilterEntity[];
  onBatchEdit: ReturnType<typeof useTransactionBatchActions>['onBatchEdit'];
  onBatchDuplicate: ReturnType<
    typeof useTransactionBatchActions
  >['onBatchDuplicate'];
  onBatchLinkSchedule: ReturnType<
    typeof useTransactionBatchActions
  >['onBatchLinkSchedule'];
  onBatchUnlinkSchedule: ReturnType<
    typeof useTransactionBatchActions
  >['onBatchUnlinkSchedule'];
  onBatchDelete: ReturnType<typeof useTransactionBatchActions>['onBatchDelete'];
  categoryId?: string;
  location: ReturnType<typeof useLocation>;
  dateFormat: string;
  payees: PayeeEntity[];
  categoryGroups: CategoryGroupEntity[];
  hideFraction: boolean;
  dispatch: AppDispatch;
  onSetTransfer: ReturnType<typeof useTransactionBatchActions>['onSetTransfer'];
  onReopenAccount: (id: AccountEntity['id']) => void;
  onUpdateAccount: (account: AccountEntity) => Promise<unknown>;
  onCreatePayee: (
    name: PayeeEntity['name'],
  ) => Promise<PayeeEntity['id'] | null>;
  /** The register's rows (`useRegisterRows`), redrawn in the background */
  registerRows: RegisterSnapshot;
  /** Why the rows couldn't be read, as of now (not deferred) */
  registerError: Error | undefined;
  lookups: RegisterLookups;
};

type AccountInternalState = {
  /** The search box's text */
  search: string;
  /** The search the rows show, which follows `search` at transition priority */
  searchedFor: string;
  filterConditions: ConditionEntity[];
  filterId?: SavedFilter | undefined;
  filterConditionsOp: 'and' | 'or';
  workingHard: boolean;
  isReconciling: boolean;
  showBalances?: boolean | undefined;
  showCleared?: boolean | undefined;
  prevShowCleared?: boolean | undefined;
  showReconciled: boolean;
  nameError: string;
  isAdding: boolean;
  sort: RegisterSort | null;
  /**
   * The ids of the rows the filter conditions match, read by a query of
   * them; null without conditions
   */
  matches: ReadonlySet<TransactionEntity['id']> | null;
};

export type TableRef = RefObject<{
  edit: (updatedId: string | null, op?: string, someBool?: boolean) => void;
  setRowAnimation: (animation: boolean) => void;
  scrollTo: (focusId: string) => void;
  scrollToTop: () => void;
  getScrolledItem: () => string;
} | null>;

type MatchedGroup = {
  id: TransactionEntity['id'];
  _unmatched?: boolean;
  subtransactions: Array<{ id: TransactionEntity['id']; _unmatched?: boolean }>;
};

// The rows a grouped query of ids matched
function matchedIds(result: LiveResult<MatchedGroup[]>) {
  const ids = new Set<TransactionEntity['id']>();
  for (const group of result.data ?? []) {
    if (!group._unmatched) {
      ids.add(group.id);
    }
    for (const child of group.subtransactions) {
      if (!child._unmatched) {
        ids.add(child.id);
      }
    }
  }
  return ids;
}

// The total the filtered register shows: of every row it matched
function sumMatched(
  rows: readonly TransactionEntity[],
  showReconciled: boolean,
) {
  let total = 0;
  for (const row of rows) {
    if (
      !row.is_parent &&
      !row._unmatched &&
      (showReconciled || !row.reconciled)
    ) {
      total += row.amount;
    }
  }
  return total;
}

class AccountInternal extends PureComponent<
  AccountInternalProps,
  AccountInternalState
> {
  // The register's scope, and the scope with the filter conditions applied
  rootQuery!: Query;
  currentQuery!: Query;
  table: TableRef;
  unlisten?: () => void;
  stopMatches?: () => void;
  dispatchSelected?: (action: Actions) => void;

  // What the register shows, from the rows in memory. Each step runs again
  // only when its inputs change.
  scoped = memoizeOne(scopeGroups);
  matched = memoizeOne(
    (
      groups: readonly RegisterGroup[],
      matches: ReadonlySet<TransactionEntity['id']> | null,
      showReconciled: boolean,
    ) =>
      matches == null
        ? groups
        : // Hidden reconciled rows don't count as matches
          matchGroups(
            groups,
            row => matches.has(row.id) && (showReconciled || !row.reconciled),
          ),
  );
  searchMatcher = memoizeOne(
    (search: string, dateFormat: string, lookups: RegisterLookups) =>
      search === '' ? null : makeSearchMatcher(search, dateFormat, lookups),
  );
  searched = memoizeOne(
    (
      groups: readonly RegisterGroup[],
      isMatch: ((row: TransactionEntity) => boolean) | null,
      showReconciled: boolean,
    ) =>
      isMatch == null
        ? groups
        : matchGroups(
            groups,
            row => isMatch(row) && (showReconciled || !row.reconciled),
          ),
  );
  sorted = memoizeOne(
    (
      groups: readonly RegisterGroup[],
      sort: RegisterSort | null,
      lookups: RegisterLookups,
    ) => (sort ? sortGroups(groups, sort, lookups) : groups),
  );
  flattened = memoizeOne(flattenGroups);
  balances = memoizeOne((groups: readonly RegisterGroup[], show: boolean) =>
    show ? runningBalances(groups) : null,
  );
  filteredAmount = memoizeOne(sumMatched);
  selectable = memoizeOne(
    (transactions: TransactionEntity[], showReconciled: boolean) =>
      showReconciled ? transactions : transactions.filter(t => !t.reconciled),
  );

  constructor(props: AccountInternalProps) {
    super(props);
    this.table = createRef();

    this.state = {
      search: '',
      searchedFor: '',
      filterConditions: props.filterConditions || [],
      filterId: undefined,
      filterConditionsOp: 'and',
      workingHard: false,
      isReconciling: false,
      showBalances: props.showBalances,
      showCleared: props.showCleared,
      showReconciled: props.showReconciled,
      nameError: '',
      isAdding: false,
      sort: null,
      matches: null,
    };
  }

  componentDidMount() {
    const onUndo = ({ messages }: UndoState) => {
      // If all the messages are dealing with transactions, find the
      // first message referencing a non-deleted row so that we can
      // highlight the row
      //
      let focusId: null | string = null;
      if (
        messages.every(msg => msg.dataset === 'transactions') &&
        !messages.find(msg => msg.column === 'tombstone')
      ) {
        const focusableMsgs = messages.filter(
          msg =>
            msg.dataset === 'transactions' && !(msg.column === 'tombstone'),
        );

        focusId = focusableMsgs.length === 1 ? focusableMsgs[0].row : null;
      }

      // The undone rows are shown once their change has rendered
      setTimeout(() => {
        if (this.table.current) {
          this.table.current.edit(null);

          // Focus a transaction if applicable. There is a chance if the
          // user navigated away that focusId is a transaction that isn't
          // shown and we won't focus it. That's ok, we just do our best.
          if (focusId) {
            this.table.current.scrollTo(focusId);
          }
        }
      }, 0);
    };

    const unlistens = [listen('undo-event', onUndo)];

    this.unlisten = () => {
      unlistens.forEach(unlisten => unlisten());
    };

    const { filterConditions } = this.state;
    this.fetchTransactions(
      filterConditions.length > 0 ? filterConditions : undefined,
    );

    // If there is a pending undo, apply it immediately (this happens
    // when an undo changes the location to this page), then clear it so a
    // later mount doesn't apply it again
    const lastUndoEvent = undo.getUndoState('undoEvent');
    if (lastUndoEvent) {
      onUndo(lastUndoEvent);
      clearPendingUndo(lastUndoEvent);
    }
  }

  componentWillUnmount() {
    if (this.unlisten) {
      this.unlisten();
    }
    this.stopMatches?.();
  }

  /** What the register shows now. */
  getView() {
    const { registerRows, accountId, lookups, dateFormat } = this.props;
    const { matches, searchedFor, sort, showReconciled, showBalances } =
      this.state;
    const searchMatcher = this.searchMatcher(searchedFor, dateFormat, lookups);
    const groups = this.sorted(
      this.searched(
        this.matched(
          this.scoped(registerRows.groups, accountId, lookups),
          matches,
          showReconciled,
        ),
        searchMatcher,
        showReconciled,
      ),
      sort,
      lookups,
    );
    const transactions = this.flattened(groups);
    const isFiltered = matches != null || searchMatcher != null;
    return {
      groups,
      transactions,
      balances: this.balances(
        groups,
        !!showBalances && this.canCalculateBalance(),
      ),
      isFiltered,
      filteredAmount: isFiltered
        ? this.filteredAmount(transactions, showReconciled)
        : null,
    };
  }

  fetchAllIds = async () => {
    // Hidden reconciled transactions and split children that don't match
    // the filters aren't selectable, and neither is a parent with any.
    const showReconciled = this.state.showReconciled;
    const isSelectable = (t: TransactionEntity) =>
      !t._unmatched && (showReconciled || !t.reconciled);

    return this.getView().groups.flatMap(({ parent, children }) => {
      if (!showReconciled && parent.reconciled) {
        return [];
      }
      const childIds = children.filter(isSelectable).map(child => child.id);
      return childIds.length === children.length
        ? [parent.id, ...childIds]
        : childIds;
    });
  };

  fetchTransactions = (filterConditions?: ConditionEntity[]) => {
    this.rootQuery = this.currentQuery = queries.transactions(
      this.props.accountId,
    );
    if (filterConditions) {
      void this.applyFilters(filterConditions);
    } else {
      this.updateMatches();
    }

    if (this.props.accountId) {
      this.props.dispatch(markAccountRead({ id: this.props.accountId }));
    }
  };

  // Match the rows against the filter conditions (already applied to
  // `currentQuery`), and keep matching them as they change
  updateMatches = () => {
    this.stopMatches?.();
    this.stopMatches = undefined;
    if (this.state.filterConditions.length === 0) {
      this.setState({ matches: null }, this.onNewRows);
      return;
    }
    let isFirst = true;
    this.stopMatches = watchLiveQuery<MatchedGroup[]>(
      this.currentQuery.select(['id']),
      result => {
        this.setState(
          { matches: matchedIds(result) },
          isFirst ? this.onNewRows : undefined,
        );
        isFirst = false;
      },
    );
  };

  // A new set of rows starts at the top, with filtered splits collapsed
  onNewRows = () => {
    const isFiltered =
      this.state.filterConditions.length > 0 || this.state.searchedFor !== '';
    this.props.splitsExpandedDispatch({
      type: 'set-mode',
      mode: !isFiltered && this.props.expandSplits ? 'expand' : 'collapse',
    });
    this.table.current?.setRowAnimation(false);
    this.table.current?.scrollToTop();
    setTimeout(() => {
      this.table.current?.setRowAnimation(true);
    }, 0);
  };

  // The rows are in memory: each keystroke searches them. The box shows the
  // key right away, and the rows follow in the background, so typing never
  // waits on a search of every row.
  onSearch = (value: string) => {
    this.setState({ search: value });
    startTransition(() => {
      this.setState({ searchedFor: value }, this.onNewRows);
    });
  };

  onImport = async () => {
    const accountId = this.props.accountId;
    const account = this.props.accounts.find(acct => acct.id === accountId);

    if (account) {
      const res = await window.Actual.openFileDialog({
        filters: [
          {
            name: 'Financial files',
            extensions: ['qif', 'ofx', 'qfx', 'csv', 'tsv', 'xml'],
          },
        ],
      });

      if (res) {
        if (accountId && res?.length > 0) {
          this.props.dispatch(
            pushModal({
              modal: {
                name: 'import-transactions',
                options: {
                  accountId,
                  filename: res[0],
                },
              },
            }),
          );
        }
      }
    }
  };

  onExport = async (accountName: string) => {
    const exportedTransactions = await send('transactions-export-query', {
      query: this.currentQuery.serialize(),
    });
    const normalizedName =
      accountName && accountName.replace(/[()]/g, '').replace(/\s+/g, '-');
    const filename = `${normalizedName || 'transactions'}.csv`;

    void window.Actual.saveFile(
      exportedTransactions,
      filename,
      'Export transactions',
    );
  };

  // The rows show an edit once it's saved: saving changes the rows in
  // memory before anything is drawn
  onTransactionsChange = (updatedTransaction: TransactionEntity) => {
    this.props.dispatch(updateNewTransactions({ id: updatedTransaction.id }));
  };

  canCalculateBalance = () => {
    const accountId = this.props.accountId;
    const account = this.props.accounts.find(
      account => account.id === accountId,
    );

    if (!account) return false;
    if (this.state.searchedFor !== '') return false;
    if (this.state.filterConditions.length > 0) return false;
    if (this.state.sort === null) {
      return true;
    } else {
      return (
        this.state.sort.field === 'date' && this.state.sort.ascDesc === 'desc'
      );
    }
  };

  onRunRules = async (ids: string[]) => {
    try {
      this.setState({ workingHard: true });
      // Bulk fetch transactions
      const transactions = this.getView().transactions.filter(trans =>
        ids.includes(trans.id),
      );
      const changedTransactions: TransactionEntity[] = [];
      const allErrors: string[] = [];

      for (const transaction of transactions) {
        const res: TransactionEntity | null = await send('rules-run', {
          transaction,
        });
        if (res) {
          changedTransactions.push(...ungroupTransaction(res));

          // Collect formula errors
          if (res._ruleErrors && res._ruleErrors.length > 0) {
            allErrors.push(...res._ruleErrors);
          }
        }
      }

      // Show errors if any
      if (allErrors.length > 0) {
        this.props.dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: `Formula errors in rules:\n${allErrors.join('\n')}`,
              sticky: true,
            },
          }),
        );
      }

      // If we have changed transactions, update them in the database
      if (changedTransactions.length > 0) {
        await send('transactions-batch-update', {
          updated: changedTransactions,
        });
      }
    } catch (error) {
      console.error('Error applying rules:', error);
      this.props.dispatch(
        addNotification({
          notification: {
            type: 'error',
            message: 'Failed to apply rules to transactions',
          },
        }),
      );
    } finally {
      this.setState({ workingHard: false });
    }
  };

  onCloseAddTransaction = () => {
    this.setState({ isAdding: false });
  };

  onAddTransaction = () => {
    this.setState({ isAdding: true });
  };

  onSaveName = (name: string) => {
    const accountNameError = validateAccountName(
      name,
      this.props.accountId ?? '',
      this.props.accounts,
    );
    if (accountNameError) {
      this.setState({ nameError: accountNameError });
    } else {
      const account = this.props.accounts.find(
        account => account.id === this.props.accountId,
      );
      if (!account) {
        throw new Error(`Account with ID ${this.props.accountId} not found.`);
      }
      this.setState({ nameError: '' });
      return this.props.onUpdateAccount({ ...account, name });
    }
  };

  onMenuSelect = async (
    item:
      | 'close'
      | 'reopen'
      | 'export'
      | 'remove-sorting'
      | 'toggle-reconciled'
      | 'manage-columns'
      | 'account-group',
  ) => {
    const accountId = this.props.accountId!;
    const account = this.props.accounts.find(
      account => account.id === accountId,
    )!;

    switch (item) {
      case 'close':
        void this.props.dispatch(openAccountCloseModal({ accountId }));
        break;
      case 'account-group':
        this.props.dispatch(
          pushModal({
            modal: {
              name: 'account-groups',
              options: {
                accountId,
              },
            },
          }),
        );
        break;
      case 'reopen':
        this.props.onReopenAccount(accountId);
        break;
      case 'export':
        const accountName = this.getAccountTitle(account, accountId);
        void this.onExport(accountName);
        break;
      case 'remove-sorting':
        this.setState({ sort: null });
        break;
      case 'toggle-reconciled':
        this.props.setShowReconciled(!this.state.showReconciled);
        this.setState(state => ({ showReconciled: !state.showReconciled }));
        break;
      case 'manage-columns':
        this.onManageColumns();
        break;
      default:
    }
  };

  showAccountColumn = () => {
    const accountId = this.props.accountId;
    return !accountId || SPECIAL_VIEW_IDS.includes(accountId);
  };

  onManageColumns = () => {
    const columns = this.props.transactionColumns
      .filter(
        column =>
          (column.id !== 'account' || this.showAccountColumn()) &&
          (column.id !== 'balance' || this.canCalculateBalance()),
      )
      .map(column => {
        // Balance and cleared visibility can be temporarily overridden in
        // component state (e.g. while reconciling) and may still come from
        // the old per-account prefs, so state is the source of truth here.
        if (column.id === 'balance') {
          return { ...column, hidden: !this.state.showBalances };
        }
        if (column.id === 'cleared') {
          // During reconciliation the cleared column is temporarily forced
          // visible, so show the user's underlying preference instead
          const showCleared = this.state.isReconciling
            ? this.state.prevShowCleared
            : this.state.showCleared;
          return { ...column, hidden: !showCleared };
        }
        // Group visibility may come from the legacy pref fallback rather
        // than the saved config, so the resolved prop is the source of truth
        if (column.id === 'group') {
          return { ...column, hidden: !this.props.showGroup };
        }
        return column;
      });

    this.props.dispatch(
      pushModal({
        modal: {
          name: 'transaction-table-columns',
          options: {
            columns,
            onSave: this.onSaveColumns,
          },
        },
      }),
    );
  };

  onSaveColumns = (columns: TransactionTableColumn[], applyToAll: boolean) => {
    // Columns that aren't managed in the current view (e.g. the account
    // column on a single-account page) keep their previous position and
    // visibility so a save here doesn't clobber them.
    const merged = [...columns];
    this.props.transactionColumns.forEach((column, index) => {
      if (!merged.some(c => c.id === column.id)) {
        merged.splice(Math.min(index, merged.length), 0, column);
      }
    });

    this.props.saveColumns(merged, applyToAll);

    // Mirror the balance column into component state. Running balances
    // only show unfiltered and unsorted, so showing them clears both.
    const balance = columns.find(column => column.id === 'balance');
    const isBalanceVisible = balance && !balance.hidden;
    if (balance && isBalanceVisible !== !!this.state.showBalances) {
      if (!isBalanceVisible) {
        this.setState({ showBalances: false });
      } else {
        this.setState(
          {
            filterConditions: [],
            search: '',
            searchedFor: '',
            sort: null,
            showBalances: true,
          },
          () => {
            this.fetchTransactions();
          },
        );
      }
    }

    const cleared = columns.find(column => column.id === 'cleared');
    const isClearedVisible = cleared && !cleared.hidden;
    if (cleared && isClearedVisible !== !!this.state.showCleared) {
      // Also update prevShowCleared so finishing a reconciliation restores
      // the visibility chosen here, not the stale pre-reconcile value
      this.setState({
        showCleared: isClearedVisible,
        prevShowCleared: isClearedVisible,
      });
    }
  };

  getAccountTitle(account?: AccountEntity, id?: string) {
    const { filterName } = this.props.location.state || {};

    if (filterName) {
      return filterName;
    }

    if (!account) {
      if (id === 'onbudget') {
        return 'On Budget Accounts';
      } else if (id === 'offbudget') {
        return 'Off Budget Accounts';
      } else if (id === 'uncategorized') {
        return 'Uncategorized';
      } else if (!id) {
        return 'All Accounts';
      }
      return null;
    }

    return account.name;
  }

  getBalanceQuery(id?: string) {
    return {
      name: `balance-query-${id}`,
      query: queries.transactions(id).calculate({ $sum: '$amount' }),
    } as const;
  }

  isNew = (id: TransactionEntity['id']) => {
    return this.props.newTransactions.includes(id);
  };

  isMatched = (id: TransactionEntity['id']) => {
    return this.props.matchedTransactions.includes(id);
  };

  onCreatePayee = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed !== '') {
      return await this.props.onCreatePayee(name);
    }
    return null;
  };

  lockTransactions = async (date: string) => {
    const { accountId } = this.props;
    if (!accountId) {
      return;
    }

    // No `workingHard` here: the reconciliation banner's own button shows the
    // loading state for this action.
    await reconciliation.lockTransactions(accountId, date);
  };

  onReconcile = () => {
    this.setState(({ isReconciling, showCleared }) =>
      // A second press must not overwrite the saved column visibility with
      // the one reconciling forced on
      isReconciling
        ? null
        : {
            isReconciling: true,
            showCleared: true,
            prevShowCleared: showCleared,
          },
    );
  };

  onDoneReconciling = async (reconcileAmount: number, date: string) => {
    const { accountId } = this.props;
    const account = this.props.accounts.find(
      account => account.id === accountId,
    );
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found.`);
    }

    const isLocked = await reconciliation.finishReconciliation(
      account.id,
      reconcileAmount,
      date,
      () => this.lockTransactions(date),
    );
    // The balance moved since the panel showed a match (e.g. a sync landed);
    // stay open so the panel's live difference shows what's off
    if (!isLocked) {
      return;
    }

    const lastReconciled = parseISO(date).getTime().toString();
    void this.props.onUpdateAccount({
      ...account,
      last_reconciled: lastReconciled,
    });

    this.setState(state => ({
      isReconciling: false,
      showCleared: state.prevShowCleared,
    }));
  };

  onCancelReconciling = () => {
    this.setState(state => ({
      isReconciling: false,
      showCleared: state.prevShowCleared,
    }));
  };

  onCreateReconciliationTransaction = async (diff: number, date: string) => {
    const { accountId } = this.props;
    if (!accountId) {
      return;
    }

    await reconciliation.createReconciliationTransaction(accountId, diff, date);
  };

  onShowTransactions = async (ids: string[]) => {
    void this.onApplyFilter({
      customName: 'Selected transactions',
      queryFilter: { id: { $oneof: ids } },
    });
  };

  onBatchEdit = (name: keyof TransactionEntity, ids: string[]) => {
    void this.props.onBatchEdit({
      name,
      ids,
      onSuccess: updatedIds => {
        if (this.table.current) {
          this.table.current.edit(updatedIds[0], 'select', false);
        }
      },
    });
  };

  onBatchDuplicate = (ids: string[]) => {
    void this.props.onBatchDuplicate({ ids });
  };

  onBatchDelete = (ids: string[]) => {
    void this.props.onBatchDelete({ ids });
  };

  onMakeAsSplitTransaction = async (ids: string[]) => {
    this.setState({ workingHard: true });

    const { data } = await aqlQuery(
      q('transactions')
        .filter({ id: { $oneof: ids } })
        .select('*')
        .options({ splits: 'none' }),
    );

    const transactions: TransactionEntity[] = data;

    if (!transactions || transactions.length === 0) {
      return;
    }

    const [firstTransaction] = transactions;
    const parentTransaction = {
      id: uuidv4(),
      is_parent: true,
      cleared: transactions.every(t => !!t.cleared),
      date: firstTransaction.date,
      account: firstTransaction.account,
      amount: transactions
        .map(t => t.amount)
        .reduce((total, amount) => total + amount, 0),
    };
    const childTransactions = transactions.map(t =>
      makeChild(parentTransaction, t),
    );

    await send('transactions-batch-update', {
      added: [parentTransaction],
      updated: childTransactions,
    });

    this.setState({ workingHard: false });
  };

  onMakeAsNonSplitTransactions = async (ids: string[]) => {
    this.setState({ workingHard: true });

    const { data } = await aqlQuery(
      q('transactions')
        .filter({ id: { $oneof: ids } })
        .select('*')
        .options({ splits: 'grouped' }),
    );

    const groupedTransactions: TransactionEntity[] = data;

    let changes: {
      updated: TransactionEntity[];
      deleted: TransactionEntity[];
    } = {
      updated: [],
      deleted: [],
    };

    const groupedTransactionsToUpdate = groupedTransactions.filter(
      t => t.is_parent,
    );

    for (const groupedTransaction of groupedTransactionsToUpdate) {
      const transactions = ungroupTransaction(groupedTransaction);
      const [parentTransaction, ...childTransactions] = transactions;

      if (ids.includes(parentTransaction.id)) {
        // Unsplit all child transactions.
        const diff = makeAsNonChildTransactions(
          childTransactions,
          transactions,
        );

        changes = {
          updated: [...changes.updated, ...diff.updated],
          deleted: [...changes.deleted, ...diff.deleted],
        };

        // Already processed the child transactions above, no need to process them below.
        continue;
      }

      // Unsplit selected child transactions.

      const selectedChildTransactions = childTransactions.filter(t =>
        ids.includes(t.id),
      );

      if (selectedChildTransactions.length === 0) {
        continue;
      }

      const diff = makeAsNonChildTransactions(
        selectedChildTransactions,
        transactions,
      );

      changes = {
        updated: [...changes.updated, ...diff.updated],
        deleted: [...changes.deleted, ...diff.deleted],
      };
    }

    await send('transactions-batch-update', changes);

    this.setState({ workingHard: false });

    const transactionsToSelect = changes.updated.map(t => t.id);
    this.dispatchSelected?.({
      type: 'select-all',
      ids: transactionsToSelect,
    });
  };

  onMergeTransactions = async (ids: string[]) => {
    const keptId = await send(
      'transactions-merge',
      ids.map(id => ({ id })),
    );
    this.dispatchSelected?.({
      type: 'select-all',
      ids: [keptId],
    });
  };

  checkForReconciledTransactions = async (
    ids: string[],
    confirmReason: ConfirmTransactionEditReason,
    onConfirm: (ids: string[]) => void,
  ) => {
    const { data } = await aqlQuery(
      q('transactions')
        .filter({ id: { $oneof: ids }, reconciled: true })
        .select('*')
        .options({ splits: 'grouped' }),
    );
    const transactions = ungroupTransactions(data);
    if (transactions.length > 0) {
      this.props.dispatch(
        pushModal({
          modal: {
            name: 'confirm-transaction-edit',
            options: {
              onConfirm: () => {
                onConfirm(ids);
              },
              confirmReason,
            },
          },
        }),
      );
    } else {
      onConfirm(ids);
    }
  };

  onBatchLinkSchedule = (ids: string[]) => {
    void this.props.onBatchLinkSchedule({
      ids,
      account: this.props.accounts.find(a => a.id === this.props.accountId),
    });
  };

  onBatchUnlinkSchedule = (ids: string[]) => {
    void this.props.onBatchUnlinkSchedule({ ids });
  };

  onCreateRule = async (ids: string[]) => {
    const { data } = await aqlQuery(
      q('transactions')
        .filter({ id: { $oneof: ids } })
        .select('*')
        .options({ splits: 'grouped' }),
    );

    const transactions = ungroupTransactions(data);
    const ruleTransaction = transactions[0];
    const childTransactions = transactions.filter(
      t => t.parent_id === ruleTransaction.id,
    );

    const payeeCondition = ruleTransaction.imported_payee
      ? ({
          field: 'imported_payee',
          op: 'is',
          value: ruleTransaction.imported_payee,
          type: 'string',
        } satisfies RuleConditionEntity)
      : ({
          field: 'payee',
          op: 'is',
          value: ruleTransaction.payee!,
          type: 'id',
        } satisfies RuleConditionEntity);
    const amountCondition = {
      field: 'amount',
      op: 'isapprox',
      value: ruleTransaction.amount,
      type: 'number',
    } satisfies RuleConditionEntity;

    const rule = {
      stage: null,
      conditionsOp: 'and',
      conditions: [payeeCondition, amountCondition],
      actions: [
        ...(childTransactions.length === 0
          ? [
              {
                op: 'set',
                field: 'category',
                value: ruleTransaction.category,
                type: 'id',
                options: {
                  splitIndex: 0,
                },
              } satisfies RuleActionEntity,
            ]
          : []),
        ...childTransactions.flatMap((sub, index) => [
          {
            op: 'set-split-amount',
            value: sub.amount,
            options: {
              splitIndex: index + 1,
              method: 'fixed-amount',
            },
          } satisfies RuleActionEntity,
          {
            op: 'set',
            field: 'category',
            value: sub.category,
            type: 'id',
            options: {
              splitIndex: index + 1,
            },
          } satisfies RuleActionEntity,
        ]),
      ],
    } satisfies NewRuleEntity;

    this.props.dispatch(
      pushModal({ modal: { name: 'edit-rule', options: { rule } } }),
    );
  };

  onSetTransfer = async (ids: string[]) => {
    this.setState({ workingHard: true });
    await this.props.onSetTransfer(ids, this.props.payees, () =>
      this.setState({ workingHard: false }),
    );
  };

  onConditionsOpChange = (value: 'and' | 'or') => {
    this.setState(state => ({
      filterConditionsOp: value,
      filterId: { ...state.filterId, status: 'changed' } as SavedFilter,
    }));
    void this.applyFilters([...this.state.filterConditions]);
  };

  onReloadSavedFilter = (savedFilter: SavedFilter, item?: string) => {
    if (item === 'reload') {
      const [savedFilter] = this.props.savedFilters.filter(
        f => f.id === this.state.filterId?.id,
      );
      this.setState({ filterConditionsOp: savedFilter.conditionsOp ?? 'and' });
      void this.applyFilters([...savedFilter.conditions]);
    } else {
      if (savedFilter.status) {
        this.setState({
          filterConditionsOp: savedFilter.conditionsOp ?? 'and',
        });
        void this.applyFilters([...(savedFilter.conditions ?? [])]);
      }
    }
    this.setState(state => ({
      filterId: { ...state.filterId, ...savedFilter },
    }));
  };

  onClearFilters = () => {
    this.setState({ filterConditionsOp: 'and' });
    this.setState({ filterId: undefined });
    void this.applyFilters([]);
  };

  onUpdateFilter = (
    oldCondition: RuleConditionEntity,
    updatedCondition: RuleConditionEntity,
  ) => {
    void this.applyFilters(
      this.state.filterConditions.map(c =>
        c === oldCondition ? updatedCondition : c,
      ),
    );
    this.setState(state => ({
      filterId: {
        ...state.filterId,
        status: state.filterId && 'changed',
      } as SavedFilter,
    }));
  };

  onDeleteFilter = (condition: RuleConditionEntity) => {
    void this.applyFilters(
      this.state.filterConditions.filter(c => c !== condition),
    );
    if (this.state.filterConditions.length === 1) {
      this.setState({ filterId: undefined, filterConditionsOp: 'and' });
    } else {
      this.setState(state => ({
        filterId: {
          ...state.filterId,
          status: state.filterId && 'changed',
        } as SavedFilter,
      }));
    }
  };

  onApplyFilter = async (conditionOrSavedFilter: ConditionEntity) => {
    let filterConditions = this.state.filterConditions;

    if (
      'customName' in conditionOrSavedFilter &&
      conditionOrSavedFilter.customName
    ) {
      filterConditions = filterConditions.filter(
        c =>
          !isTransactionFilterEntity(c) &&
          c.customName !== conditionOrSavedFilter.customName,
      );
    }

    if (isTransactionFilterEntity(conditionOrSavedFilter)) {
      // A saved filter was passed in.
      const savedFilter = conditionOrSavedFilter;
      this.setState({
        filterId: { ...savedFilter, status: 'saved' },
      });
      this.setState({ filterConditionsOp: savedFilter.conditionsOp });
      void this.applyFilters([...savedFilter.conditions]);
    } else {
      // A condition was passed in.
      const condition = conditionOrSavedFilter;
      const isDuplicate = filterConditions.some(c => isEqual(c, condition));

      if (isDuplicate) {
        return;
      }

      this.setState(state => ({
        filterId: {
          ...state.filterId,
          status: state.filterId && 'changed',
        } as SavedFilter,
      }));
      void this.applyFilters([...filterConditions, condition]);
    }
  };

  onScheduleAction = async (
    name: 'skip' | 'post-transaction' | 'post-transaction-today' | 'complete',
    ids: TransactionEntity['id'][],
  ) => {
    const scheduleIds = ids.map(id => id.split('/')[1]);

    switch (name) {
      case 'post-transaction':
        for (const id of scheduleIds) {
          await send('schedule/post-transaction', { id });
        }
        break;
      case 'post-transaction-today':
        for (const id of scheduleIds) {
          await send('schedule/post-transaction', { id, today: true });
        }
        break;
      case 'skip':
        for (const id of scheduleIds) {
          await send('schedule/skip-next-date', { id });
        }
        break;
      case 'complete':
        for (const id of scheduleIds) {
          await send('schedule/update', { schedule: { id, completed: true } });
        }
        break;
      default:
    }
  };

  applyFilters = async (conditions: ConditionEntity[]) => {
    if (conditions.length > 0) {
      const filters = await makeTransactionFilters(conditions);
      // Read the operator only now: callers set it right before calling
      // this, and the update has only committed once the await is done.
      const conditionsOpKey =
        this.state.filterConditionsOp === 'or' ? '$or' : '$and';
      this.currentQuery = this.rootQuery.filter({
        [conditionsOpKey]: filters,
      });

      this.setState({ filterConditions: conditions }, this.updateMatches);
    } else {
      this.setState({ filterConditions: conditions }, () => {
        this.fetchTransactions();
      });
    }
  };

  onSort = (headerClicked: string, ascDesc: 'asc' | 'desc') => {
    this.setState(({ sort }) => ({
      sort:
        // Switching between ascending and descending keeps the previous
        // column; a new column makes the current one the previous one
        headerClicked === sort?.field
          ? { ...sort, ascDesc }
          : {
              field: headerClicked,
              ascDesc,
              prevField: sort?.field,
              prevAscDesc: sort?.ascDesc,
            },
    }));
  };

  render() {
    // A failed read shows the error boundary's message, whose retry reads
    // again; the rows it left are out of date
    if (this.props.registerError) {
      throw this.props.registerError;
    }
    const {
      accounts,
      categoryGroups,
      payees,
      dateFormat,
      hideFraction,
      accountId,
      categoryId,
    } = this.props;
    const {
      workingHard,
      filterId,
      isReconciling,
      showBalances,
      showCleared,
      showReconciled,
    } = this.state;
    const {
      transactions,
      balances,
      isFiltered: transactionsFiltered,
      filteredAmount,
    } = this.getView();

    const account = accounts.find(account => account.id === accountId);
    const accountName = this.getAccountTitle(account, accountId);

    if (!accountName) {
      // This is probably an account that was deleted, so redirect to
      // all accounts
      return <Navigate to="/accounts" replace />;
    }

    const category = categoryGroups
      .flatMap(g => g.categories)
      .find(category => category?.id === categoryId);

    const showEmptyMessage = !accountId && accounts.length === 0;

    const isNameEditable = accountId
      ? accountId !== 'onbudget' &&
        accountId !== 'offbudget' &&
        accountId !== 'uncategorized'
      : false;

    const balanceQuery = this.getBalanceQuery(accountId);

    return (
      <AllTransactions
        account={account}
        transactions={transactions}
        balances={balances}
        showBalances={showBalances}
        filtered={transactionsFiltered}
      >
        {(allTransactions, allBalances) => (
          <SelectedProviderWithItems
            name="transactions"
            // When reconciled transactions are hidden they are still
            // loaded (e.g. to calculate running balances), but they must
            // not be selectable. Mirror the filtering the transaction
            // table applies when rendering so that range selection
            // (shift+click) only covers visible transactions.
            items={this.selectable(allTransactions, showReconciled)}
            fetchAllIds={this.fetchAllIds}
            registerDispatch={dispatch => (this.dispatchSelected = dispatch)}
          >
            <View style={styles.page}>
              <AccountHeader
                tableRef={this.table}
                isNameEditable={isNameEditable ?? false}
                workingHard={workingHard ?? false}
                account={account}
                filterId={filterId}
                savedFilters={this.props.savedFilters}
                accountName={accountName}
                transactions={transactions}
                showReconciled={showReconciled ?? false}
                showEmptyMessage={showEmptyMessage ?? false}
                balanceQuery={balanceQuery}
                filteredAmount={filteredAmount}
                isFiltered={transactionsFiltered ?? false}
                isSorted={this.state.sort !== null}
                isReconciling={isReconciling}
                search={this.state.search}
                // @ts-expect-error fix me
                filterConditions={this.state.filterConditions}
                filterConditionsOp={this.state.filterConditionsOp}
                onSearch={this.onSearch}
                onShowTransactions={this.onShowTransactions}
                onMenuSelect={this.onMenuSelect}
                onAddTransaction={this.onAddTransaction}
                onSaveName={this.onSaveName}
                saveNameError={this.state.nameError}
                onReconcile={this.onReconcile}
                onDoneReconciling={this.onDoneReconciling}
                onCancelReconciling={this.onCancelReconciling}
                onCreateReconciliationTransaction={
                  this.onCreateReconciliationTransaction
                }
                onImport={this.onImport}
                onBatchDelete={this.onBatchDelete}
                onBatchDuplicate={this.onBatchDuplicate}
                onRunRules={this.onRunRules}
                onBatchEdit={this.onBatchEdit}
                onBatchLinkSchedule={this.onBatchLinkSchedule}
                onBatchUnlinkSchedule={this.onBatchUnlinkSchedule}
                onCreateRule={this.onCreateRule}
                onUpdateFilter={this.onUpdateFilter}
                onClearFilters={this.onClearFilters}
                onReloadSavedFilter={this.onReloadSavedFilter}
                onConditionsOpChange={this.onConditionsOpChange}
                onDeleteFilter={this.onDeleteFilter}
                onApplyFilter={this.onApplyFilter}
                onScheduleAction={this.onScheduleAction}
                onSetTransfer={this.onSetTransfer}
                onMakeAsSplitTransaction={this.onMakeAsSplitTransaction}
                onMakeAsNonSplitTransactions={this.onMakeAsNonSplitTransactions}
                onMergeTransactions={this.onMergeTransactions}
              />

              <View style={{ flex: 1 }}>
                <TransactionList
                  headerContent={undefined}
                  // @ts-expect-error - fix me
                  tableRef={this.table}
                  account={account}
                  transactions={transactions}
                  allTransactions={allTransactions}
                  accounts={accounts}
                  category={category}
                  categoryGroups={categoryGroups}
                  payees={payees}
                  balances={allBalances}
                  // Follow the setting rather than whether balances have
                  // loaded, so the column doesn't pop in after the rows.
                  showBalances={!!showBalances && this.canCalculateBalance()}
                  showReconciled={showReconciled}
                  showCleared={!!showCleared}
                  showGroup={this.props.showGroup}
                  showAccount={this.showAccountColumn()}
                  columnOrder={this.props.columnOrder}
                  allowReorder={
                    !!accountId &&
                    accountId !== 'offbudget' &&
                    accountId !== 'onbudget' &&
                    accountId !== 'uncategorized'
                  }
                  isAdding={this.state.isAdding}
                  isNew={this.isNew}
                  isMatched={this.isMatched}
                  isFiltered={transactionsFiltered}
                  dateFormat={dateFormat}
                  hideFraction={hideFraction}
                  renderEmpty={() =>
                    showEmptyMessage ? (
                      <AccountEmptyMessage
                        onAdd={() =>
                          this.props.dispatch(
                            replaceModal({
                              modal: { name: 'add-local-account' },
                            }),
                          )
                        }
                      />
                    ) : (
                      <View
                        style={{
                          color: theme.tableText,
                          marginTop: 20,
                          textAlign: 'center',
                          fontStyle: 'italic',
                        }}
                      >
                        No transactions
                      </View>
                    )
                  }
                  onSort={this.onSort}
                  sortField={this.state.sort?.field ?? ''}
                  ascDesc={this.state.sort?.ascDesc ?? 'asc'}
                  onChange={this.onTransactionsChange}
                  onBatchDelete={this.onBatchDelete}
                  onBatchDuplicate={this.onBatchDuplicate}
                  onBatchLinkSchedule={this.onBatchLinkSchedule}
                  onBatchUnlinkSchedule={this.onBatchUnlinkSchedule}
                  onCreateRule={this.onCreateRule}
                  onScheduleAction={this.onScheduleAction}
                  onMakeAsNonSplitTransactions={
                    this.onMakeAsNonSplitTransactions
                  }
                  onCloseAddTransaction={this.onCloseAddTransaction}
                  onCreatePayee={this.onCreatePayee}
                  onApplyFilter={this.onApplyFilter}
                />
              </View>
            </View>
          </SelectedProviderWithItems>
        )}
      </AllTransactions>
    );
  }
}

type AccountHackProps = Omit<
  AccountInternalProps,
  | 'dispatch'
  | 'splitsExpandedDispatch'
  | 'onBatchEdit'
  | 'onBatchDuplicate'
  | 'onBatchLinkSchedule'
  | 'onBatchUnlinkSchedule'
  | 'onBatchDelete'
  | 'onSetTransfer'
>;

function AccountHack(props: AccountHackProps) {
  const { dispatch: splitsExpandedDispatch } = useSplitsExpanded();
  const dispatch = useDispatch();
  const {
    onBatchEdit,
    onBatchDuplicate,
    onBatchLinkSchedule,
    onBatchUnlinkSchedule,
    onBatchDelete,
    onSetTransfer,
  } = useTransactionBatchActions();

  return (
    <AccountInternal
      dispatch={dispatch}
      splitsExpandedDispatch={splitsExpandedDispatch}
      onBatchEdit={onBatchEdit}
      onBatchDuplicate={onBatchDuplicate}
      onBatchLinkSchedule={onBatchLinkSchedule}
      onBatchUnlinkSchedule={onBatchUnlinkSchedule}
      onBatchDelete={onBatchDelete}
      onSetTransfer={onSetTransfer}
      {...props}
    />
  );
}

export function Account() {
  const params = useParams();
  const location = useLocation();

  // Accounts, payees, categories and notes are read synchronously, so the
  // screen draws them complete on its first render.
  const accounts = useAccounts();
  const payees = usePayees();
  const { grouped: categoryGroups } = useCategories();
  const newTransactions = useSelector(
    state => state.transactions.newTransactions,
  );
  const matchedTransactions = useSelector(
    state => state.transactions.matchedTransactions,
  );
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const [hideFraction] = useSyncedPref('hideFraction');
  const [expandSplits] = useLocalPref('expand-splits');
  const [hideReconciled, setHideReconciled] = useSyncedPref(
    `hide-reconciled-${params.id}`,
  );
  const {
    transactionColumns,
    columnOrder,
    showBalances,
    showCleared,
    showGroup,
    saveColumns,
  } = useTransactionTableColumns(params.id);

  const filterConditions = location?.state?.filterConditions || [];

  const savedFiters = useTransactionFilters();

  const schedulesQuery = useMemo(
    () => getSchedulesQuery(params.id),
    [params.id],
  );

  const reopenAccount = useReopenAccount();
  const onReopenAccount = (id: AccountEntity['id']) =>
    void reopenAccount({ id });

  // Settles once the change is applied, so the header can show the new name
  // until then. Failures are reported as a notification.
  const updateAccount = useUpdateAccount();
  const onUpdateAccount = (account: AccountEntity) =>
    updateAccount({ account });

  const createPayee = useCreatePayee();
  const onCreatePayee = async (name: PayeeEntity['name']) =>
    (await createPayee({ name })) ?? null;

  const showReconciled = String(hideReconciled) !== 'true';
  // A change redraws the register in the background, a little at a time:
  // it's computed from every row, and can take longer than a frame
  const currentRows = useRegisterRows(params.id);
  const registerRows = useDeferredValue(currentRows);
  const lookups = useMemo(
    (): RegisterLookups => ({
      accounts: new Map(accounts.map(account => [account.id, account])),
      payees: new Map(payees.map(payee => [payee.id, payee])),
      categories: new Map(
        categoryGroups
          .flatMap(group => group.categories ?? [])
          .map(category => [category.id, category]),
      ),
    }),
    [accounts, payees, categoryGroups],
  );

  return (
    <ErrorBoundary
      FallbackComponent={FeatureErrorFallback}
      onReset={() => retryRegisterRows(params.id)}
    >
      <SchedulesProvider query={schedulesQuery}>
        <SplitsExpandedProvider
          // A filtered screen collapses splits on its first load; start it
          // that way so its rows don't draw expanded first.
          initialMode={
            expandSplits && filterConditions.length === 0
              ? 'expand'
              : 'collapse'
          }
        >
          <AccountHack
            newTransactions={newTransactions}
            matchedTransactions={matchedTransactions}
            accounts={accounts}
            dateFormat={dateFormat}
            hideFraction={String(hideFraction) === 'true'}
            expandSplits={expandSplits}
            showBalances={showBalances}
            showCleared={showCleared}
            showReconciled={showReconciled}
            setShowReconciled={val => setHideReconciled(String(!val))}
            showGroup={showGroup}
            transactionColumns={transactionColumns}
            columnOrder={columnOrder}
            saveColumns={saveColumns}
            payees={payees}
            filterConditions={filterConditions}
            categoryGroups={categoryGroups}
            accountId={params.id}
            categoryId={location?.state?.categoryId}
            location={location}
            savedFilters={savedFiters}
            onReopenAccount={onReopenAccount}
            onUpdateAccount={onUpdateAccount}
            onCreatePayee={onCreatePayee}
            registerRows={registerRows}
            registerError={currentRows.error}
            lookups={lookups}
          />
        </SplitsExpandedProvider>
      </SchedulesProvider>
    </ErrorBoundary>
  );
}
