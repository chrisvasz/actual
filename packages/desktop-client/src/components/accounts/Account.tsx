import React, {
  createRef,
  PureComponent,
  startTransition,
  useEffect,
  useMemo,
} from 'react';
import type { ReactElement, RefObject } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Trans } from 'react-i18next';
import { Navigate, useLocation, useParams } from 'react-router';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { listen, send } from '@actual-app/core/platform/client/connection';
import * as undo from '@actual-app/core/platform/client/undo';
import type { UndoState } from '@actual-app/core/server/undo';
import { currentDay } from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
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
import {
  QueryObserver,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { debounce, isEqual } from 'es-toolkit/compat';
import { t } from 'i18next';
import { v4 as uuidv4 } from 'uuid';

import {
  accountQueries,
  useReopenAccountMutation,
  useSyncAndDownloadMutation,
  useUnlinkAccountMutation,
  useUpdateAccountMutation,
} from '#accounts';
import { markAccountRead } from '#accounts/accountsSlice';
import * as reconciliation from '#accounts/reconciliation';
import { categoryQueries } from '#budget';
import { FeatureErrorFallback } from '#components/FeatureErrorFallback';
import type { SavedFilter } from '#components/filters/SavedFilterMenuButton';
import type {
  TransactionTableColumn,
  TransactionTableColumnId,
} from '#components/transactions/table/columns';
import { TransactionList } from '#components/transactions/TransactionList';
import { validateAccountName } from '#components/util/accountValidation';
import { useAccountPreviewTransactions } from '#hooks/useAccountPreviewTransactions';
import { SchedulesProvider } from '#hooks/useCachedSchedules';
import { useDateFormat } from '#hooks/useDateFormat';
import { useLocalPref } from '#hooks/useLocalPref';
import { getSchedulesQuery } from '#hooks/useSchedules';
import { SelectedProviderWithItems } from '#hooks/useSelected';
import type { Actions } from '#hooks/useSelected';
import {
  SplitsExpandedProvider,
  useSplitsExpanded,
} from '#hooks/useSplitsExpanded';
import { useSpreadsheet } from '#hooks/useSpreadsheet';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useTransactionBatchActions } from '#hooks/useTransactionBatchActions';
import { useTransactionFilters } from '#hooks/useTransactionFilters';
import { calculateRunningBalancesBottomUp } from '#hooks/useTransactions';
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
import { noteQueries } from '#notes/queries';
import { addNotification } from '#notifications/notificationsSlice';
import { payeeQueries, useCreatePayeeMutation } from '#payees';
import * as queries from '#queries';
import { aqlQuery } from '#queries/aqlQuery';
import { useDispatch, useSelector } from '#redux';
import type { AppDispatch } from '#redux/store';
import {
  hasMoreTransactions,
  loadMoreTransactions,
  transactionQueries,
} from '#transactions';
import type { TransactionsSnapshot } from '#transactions';
import { updateNewTransactions } from '#transactions/transactionsSlice';

import { AccountEmptyMessage } from './AccountEmptyMessage';
import { AccountHeader } from './Header';
import { clearedBalanceCell } from './Reconcile';

type ConditionEntity = Partial<RuleConditionEntity> | TransactionFilterEntity;

const TRANSACTIONS_PAGE_COUNT = 150;

// The rows query for a transactions query. Hidden reconciled transactions
// are only filtered out when running balances aren't shown, since those are
// derived from every row. Shared by the screen's rows query and the preload
// of its first page, which have to fetch the same rows.
function selectTransactionRows(
  query: Query,
  {
    showReconciled,
    showBalances,
    canCalculateBalance,
  }: {
    showReconciled: boolean;
    showBalances: boolean | undefined;
    canCalculateBalance: boolean;
  },
) {
  if (!showReconciled && (!showBalances || !canCalculateBalance)) {
    query = query.filter({ reconciled: { $eq: false } });
  }
  return query.select('*');
}

// The query filters for the given filter conditions, to be combined with
// the screen's and/or operator. Shared by the screen's filters and the
// preload of a screen that opens filtered, which have to fetch the same rows.
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

/**
 * The first page of transactions and their running balances (or, when the
 * screen opens filtered, the filtered total), loaded before the account
 * screen mounts so it can render complete on its first paint.
 */
type AccountPreload = {
  transactions: TransactionEntity[];
  balances: Record<TransactionEntity['id'], IntegerAmount> | null;
  filteredAmount: number | null;
} | null;

// Every fetch counts as new rows, even when they come back unchanged, so a
// refetch always recomputes the totals that an optimistic edit skips.
function rowsQueryOptions(args: Parameters<typeof transactionQueries.aql>[0]) {
  return { ...transactionQueries.aql(args), structuralSharing: false };
}

function isTransactionFilterEntity(
  filter: ConditionEntity,
): filter is TransactionFilterEntity {
  return 'id' in filter;
}

type AllTransactionsProps = {
  account?: AccountEntity | undefined;
  transactions: TransactionEntity[];
  balances: Record<TransactionEntity['id'], IntegerAmount> | null;
  showBalances?: boolean | undefined;
  filtered?: boolean | undefined;
  children: (
    transactions: TransactionEntity[],
    balances: Record<TransactionEntity['id'], IntegerAmount> | null,
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

  transactions ??= [];

  const runningBalance = useMemo(() => {
    if (!showBalances) {
      return 0;
    }

    return balances && transactions?.length > 0
      ? (balances[transactions[0].id] ?? 0)
      : 0;
  }, [showBalances, balances, transactions]);

  const prependBalances = useMemo(() => {
    if (!showBalances) {
      return null;
    }

    return Object.fromEntries(
      calculateRunningBalancesBottomUp(
        previewTransactions,
        'all',
        runningBalance,
      ),
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
      return { ...prependBalances, ...balances };
    }
    return balances;
  }, [filtered, prependBalances, balances]);

  if (!previewTransactions?.length || filtered) {
    return children(transactions, balances);
  }
  return children(allTransactions, allBalances);
}

// A row's running balance is the total less every row above it. Pages load
// from the top, so the rows above a loaded row are always loaded too. Child
// rows are skipped because their parent's amount already includes theirs.
function calculateRunningBalancesFromTotal(
  transactions: TransactionEntity[],
  total: IntegerAmount,
) {
  const balances: Record<TransactionEntity['id'], IntegerAmount> = {};
  let balance = total;
  for (const transaction of transactions) {
    if (transaction.is_child) {
      continue;
    }
    balances[transaction.id] = balance;
    balance -= transaction.amount;
  }
  return balances;
}

function getField(field?: string) {
  if (!field) {
    return 'date';
  }

  switch (field) {
    case 'account':
      return 'account.name';
    case 'payee':
      return 'payee.name';
    case 'category':
      return 'category.name';
    case 'payment':
      return 'amount';
    case 'deposit':
      return 'amount';
    default:
      return field;
  }
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
  showNetWorthChart: boolean;
  setShowNetWorthChart: (newValue: boolean) => void;
  showCleared?: boolean;
  showReconciled: boolean;
  setShowReconciled: (newValue: boolean) => void;
  showGroup: boolean;
  showExtraBalances?: boolean;
  setShowExtraBalances: (newValue: boolean) => void;
  transactionColumns: TransactionTableColumn[];
  columnOrder: TransactionTableColumnId[];
  saveColumns: (columns: TransactionTableColumn[], applyToAll: boolean) => void;
  modalShowing?: boolean;
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
  dateFormat: ReturnType<typeof useDateFormat>;
  payees: PayeeEntity[];
  categoryGroups: CategoryGroupEntity[];
  hideFraction: boolean;
  accountsSyncing: string[];
  dispatch: AppDispatch;
  onSetTransfer: ReturnType<typeof useTransactionBatchActions>['onSetTransfer'];
  onReopenAccount: (id: AccountEntity['id']) => void;
  onUpdateAccount: (account: AccountEntity) => Promise<unknown>;
  onUnlinkAccount: (id: AccountEntity['id']) => void;
  onSyncAndDownload: (accountId?: AccountEntity['id']) => void;
  onCreatePayee: (name: PayeeEntity['name']) => Promise<PayeeEntity['id']>;
  preload: AccountPreload;
  queryClient: QueryClient;
};

type AccountInternalState = {
  search: string;
  filterConditions: ConditionEntity[];
  filterId?: SavedFilter | undefined;
  filterConditionsOp: 'and' | 'or';
  loading: boolean;
  workingHard: boolean;
  isReconciling: boolean;
  transactions: TransactionEntity[];
  transactionsFiltered?: boolean;
  showBalances?: boolean | undefined;
  balances: Record<TransactionEntity['id'], IntegerAmount> | null;
  showCleared?: boolean | undefined;
  prevShowCleared?: boolean | undefined;
  showReconciled: boolean;
  nameError: string;
  isAdding: boolean;
  modalShowing?: boolean;
  sort: {
    ascDesc: 'asc' | 'desc';
    field: string;
    prevField?: string | undefined;
    prevAscDesc?: 'asc' | 'desc' | undefined;
  } | null;
  filteredAmount: null | number;
};

export type TableRef = RefObject<{
  edit: (updatedId: string | null, op?: string, someBool?: boolean) => void;
  setRowAnimation: (animation: boolean) => void;
  scrollTo: (focusId: string) => void;
  scrollToTop: () => void;
  getScrolledItem: () => string;
} | null>;

class AccountInternal extends PureComponent<
  AccountInternalProps,
  AccountInternalState
> {
  // The rows on screen: the first `rowsLimit` rows of `rowsQuery`, read as
  // one snapshot. Loading more raises the limit.
  rows: QueryObserver<TransactionsSnapshot> | null = null;
  rowsQuery: Query | null = null;
  rowsLimit = TRANSACTIONS_PAGE_COUNT;
  stopRows?: () => void;
  _isLoadingMoreRows = false;
  // Whether the last fetched rows filled the limit. Kept apart from the rows
  // on screen, which an optimistic delete can shorten.
  _hasMoreRows = false;
  // Rows set by an optimistic update, which skip the aggregate queries
  _optimisticRows: TransactionsSnapshot | null = null;
  rootQuery!: Query;
  currentQuery!: Query;
  table: TableRef;
  unlisten?: () => void;
  dispatchSelected?: (action: Actions) => void;
  _pendingBalanceTotal: Promise<number | null> | null = null;

  constructor(props: AccountInternalProps) {
    super(props);
    this.table = createRef();

    this.state = {
      search: '',
      filterConditions: props.filterConditions || [],
      filterId: undefined,
      filterConditionsOp: 'and',
      // With a preload the screen mounts with its first page already in
      // hand; the rows query below still runs to take over live updates.
      loading: props.preload == null,
      workingHard: false,
      isReconciling: false,
      transactions: props.preload?.transactions ?? [],
      // Set up front so scheduled transactions aren't prepended to a
      // preloaded filtered list until the rows query catches up.
      transactionsFiltered:
        props.preload != null && (props.filterConditions?.length ?? 0) > 0,
      showBalances: props.showBalances,
      balances: props.preload?.balances ?? null,
      showCleared: props.showCleared,
      showReconciled: props.showReconciled,
      nameError: '',
      isAdding: false,
      sort: null,
      filteredAmount: props.preload?.filteredAmount ?? null,
    };
  }

  async componentDidMount() {
    const maybeRefetch = (tables: string[]) => {
      if (
        tables.includes('transactions') ||
        tables.includes('category_mapping') ||
        tables.includes('payee_mapping')
      ) {
        return this.refetchTransactions();
      }
    };

    const onUndo = async ({ tables, messages }: UndoState) => {
      await maybeRefetch(tables);

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

        // Highlight the transactions
        // this.table && this.table.highlight(focusableMsgs.map(msg => msg.row));
      }

      if (this.table.current) {
        this.table.current.edit(null);

        // Focus a transaction if applicable. There is a chance if the
        // user navigated away that focusId is a transaction that has
        // been "paged off" and we won't focus it. That's ok, we just
        // do our best.
        if (focusId) {
          this.table.current.scrollTo(focusId);
        }
      }

      undo.setUndoState('undoEvent', null);
    };

    const unlistens = [listen('undo-event', onUndo)];

    this.unlisten = () => {
      unlistens.forEach(unlisten => unlisten());
    };

    // Important that any async work happens last so that the
    // listeners are set up synchronously
    //
    // Passing conditions routes through `applyFilters`, which costs a full
    // render before the query is issued. On mount that render has nothing to
    // do - there are no transactions to clear and no sort to reapply - so go
    // straight to the query when the screen opens unfiltered.
    const { filterConditions } = this.state;
    this.fetchTransactions(
      filterConditions.length > 0 ? filterConditions : undefined,
    );

    // If there is a pending undo, apply it immediately (this happens
    // when an undo changes the location to this page)
    const lastUndoEvent = undo.getUndoState('undoEvent');
    if (lastUndoEvent) {
      void onUndo(lastUndoEvent);
    }
  }

  componentDidUpdate(prevProps: AccountInternalProps) {
    // If the user was on a different screen and is now coming back to
    // the transactions, automatically refresh the transaction to make
    // sure we have updated state
    if (prevProps.modalShowing && !this.props.modalShowing) {
      // This is clearly a hack. Need a better way to track which
      // things are listening to transactions and refetch
      // automatically (use ActualQL?)
      setTimeout(() => {
        void this.refetchTransactions();
      }, 100);
    }
  }

  componentWillUnmount() {
    if (this.unlisten) {
      this.unlisten();
    }
    this.stopRows?.();
  }

  fetchAllIds = async () => {
    if (!this.rowsQuery) {
      return [];
    }

    const { data } = await aqlQuery(
      this.rowsQuery.select(['id', 'reconciled']),
    );
    // Hidden reconciled transactions and split children that don't match
    // the filters aren't selectable, and neither is a parent with any.
    const showReconciled = this.state.showReconciled;
    const isSelectable = (t: TransactionEntity) =>
      !t._unmatched && (showReconciled || !t.reconciled);

    // Remember, this is the `grouped` split type so we need to deal
    // with the `subtransactions` property
    return data.flatMap((t: TransactionEntity) => {
      if (!showReconciled && t.reconciled) {
        return [];
      }
      const subtransactions = t.subtransactions ?? [];
      const childIds = subtransactions.filter(isSelectable).map(sub => sub.id);
      return childIds.length === subtransactions.length
        ? [t.id, ...childIds]
        : childIds;
    });
  };

  refetchTransactions = async () => {
    const rows = this.rows;
    if (rows == null) {
      return;
    }
    // A refetch joins a fetch that's already running unless there are rows
    // to keep showing meanwhile, and that fetch may predate the change being
    // refetched for. Cancel it so this one reads the latest rows.
    const { data, isPlaceholderData } = rows.getCurrentResult();
    if (data == null || isPlaceholderData) {
      await this.props.queryClient.cancelQueries({
        queryKey: rows.options.queryKey,
        exact: true,
      });
    }
    void rows.refetch();
  };

  fetchTransactions = (filterConditions?: ConditionEntity[]) => {
    const query = this.makeRootTransactionsQuery();
    this.rootQuery = this.currentQuery = query;
    if (filterConditions) void this.applyFilters(filterConditions);
    else this.updateQuery(query);

    if (this.props.accountId) {
      this.props.dispatch(markAccountRead({ id: this.props.accountId }));
    }
  };

  makeRootTransactionsQuery = () => {
    const accountId = this.props.accountId;

    return queries.transactions(accountId);
  };

  updateQuery(query: Query, isFiltered: boolean = false) {
    this.stopRows?.();

    const rowsQuery = selectTransactionRows(query, {
      showReconciled: this.state.showReconciled,
      showBalances: this.state.showBalances,
      canCalculateBalance: this.canCalculateBalance(),
    });
    this.rowsQuery = rowsQuery;
    this.rowsLimit = TRANSACTIONS_PAGE_COUNT;
    this._hasMoreRows = false;

    const rows = new QueryObserver(
      this.props.queryClient,
      rowsQueryOptions({ query: rowsQuery, limit: this.rowsLimit }),
    );
    this.rows = rows;

    let shownRows: TransactionsSnapshot | null = null;
    const unsubscribeRows = rows.subscribe(result => {
      // Placeholder rows are the smaller snapshot, still shown while the
      // larger one loads
      if (
        result.data == null ||
        result.isPlaceholderData ||
        result.data === shownRows
      ) {
        return;
      }
      const prevRows = shownRows;
      shownRows = result.data;
      if (result.data !== this._optimisticRows) {
        this._hasMoreRows = hasMoreTransactions(result.data, this.rowsLimit);
      }
      void this.onRows(result.data, prevRows, isFiltered);
    });

    // As before, local changes reach this screen through optimistic updates
    // and its own refetches, so only refetch for changes synced from other
    // devices.
    const unlistenSync = listen('sync-event', event => {
      if (event.type !== 'success') {
        return;
      }
      const dependencies = rows.getCurrentResult().data?.dependencies;
      if (
        dependencies == null ||
        event.tables.some(table => dependencies.includes(table))
      ) {
        void rows.refetch();
      }
    });

    this.stopRows = () => {
      unsubscribeRows();
      unlistenSync();
      // Drop the rows now rather than on the next tick, so running the same
      // query again reads it fresh instead of finding these still cached.
      this.props.queryClient.removeQueries({
        queryKey: rows.options.queryKey,
        exact: true,
      });
      this.rows = null;
    };

    // The balance total depends on the query, not on the rows that come
    // back, so start it alongside the first page instead of waiting for it.
    const pendingBalanceTotal = this.state.showBalances
      ? this.getBalanceTotal()
      : null;
    // Keep an unconsumed result (the column can be switched off before the
    // rows land) from surfacing as an unhandled rejection. `onRows` still
    // sees the rejection if it does await this promise.
    pendingBalanceTotal?.catch(() => null);
    this._pendingBalanceTotal = pendingBalanceTotal;
  }

  // Shows a new snapshot of the rows. `prevRows` is null on a query's first
  // load.
  onRows = async (
    snapshot: TransactionsSnapshot,
    prevRows: TransactionsSnapshot | null,
    isFiltered: boolean,
  ) => {
    const data = ungroupTransactions([...snapshot.data]);
    const firstLoad = prevRows == null;

    // Fast path for optimistic updates (e.g. field edits): skip the
    // expensive aggregate DB queries (calculateBalances, getFilteredAmount)
    // and just update the transaction list in state directly. Balances and
    // filteredAmount will be refreshed on the next full DB-driven onRows.
    if (snapshot === this._optimisticRows) {
      this._optimisticRows = null;
      const transactionsSnapshot = data;
      const balances = this.state.showBalances
        ? await this.calculateBalances(data)
        : null;
      // Wrap in startTransition so React treats this as a low-priority
      // update. Without this, setState blocks the main thread for the
      // full duration of the re-render (~40–220ms with large transaction
      // lists), preventing input events from being processed and making
      // the UI feel frozen. startTransition lets React break the render
      // into chunks and yield to the browser between them, keeping the
      // UI responsive while the row update happens in the background.
      startTransition(() => {
        this.setState({
          transactions: transactionsSnapshot,
          balances,
        });
      });
      return;
    }

    if (firstLoad) {
      this.table.current?.setRowAnimation(false);

      if (isFiltered) {
        this.props.splitsExpandedDispatch({
          type: 'set-mode',
          mode: 'collapse',
        });
      } else {
        this.props.splitsExpandedDispatch({
          type: 'set-mode',
          mode: this.props.expandSplits ? 'expand' : 'collapse',
        });
      }
    }

    // Both aggregates are independent of each other and of `data`, so
    // run them together rather than serially. `filteredAmount` is only
    // rendered behind `isFiltered`, so skip that round trip entirely
    // when nothing will read it.
    const pendingBalanceTotal = this._pendingBalanceTotal;
    this._pendingBalanceTotal = null;
    const [balances, filteredAmount] = await Promise.all([
      this.state.showBalances
        ? this.calculateBalances(data, pendingBalanceTotal ?? undefined)
        : null,
      isFiltered ? this.getFilteredAmount() : null,
    ]);
    this.setState(
      {
        transactions: data,
        transactionsFiltered: isFiltered,
        loading: false,
        workingHard: false,
        balances,
        filteredAmount,
      },
      () => {
        if (firstLoad) {
          this.table.current?.scrollToTop();
        }

        setTimeout(() => {
          this.table.current?.setRowAnimation(true);
        }, 0);
      },
    );
  };

  loadMoreRows = async () => {
    const rows = this.rows;
    const query = this.rowsQuery;
    if (rows == null || query == null || this._isLoadingMoreRows) {
      return;
    }
    if (rows.getCurrentResult().isPlaceholderData || !this._hasMoreRows) {
      return;
    }

    this._isLoadingMoreRows = true;
    try {
      const next = await loadMoreTransactions(this.props.queryClient, {
        query,
        limit: this.rowsLimit,
        pageSize: TRANSACTIONS_PAGE_COUNT,
      });
      // The query may have changed while the page loaded
      if (this.rows === rows) {
        this.rowsLimit = next.limit;
        rows.setOptions(rowsQueryOptions(next));
      }
    } finally {
      this._isLoadingMoreRows = false;
    }
  };

  onSearch = (value: string) => {
    this.stopRows?.();
    this.setState({ search: value }, this.onSearchDone);
  };

  onSearchDone = debounce(() => {
    if (this.state.search === '') {
      this.updateQuery(
        this.currentQuery,
        this.state.filterConditions.length > 0,
      );
    } else {
      this.updateQuery(
        queries.transactionsSearch(
          this.currentQuery,
          this.state.search,
          this.props.dateFormat,
        ),
        true,
      );
    }
  }, 150);

  onSync = async () => {
    const accountId = this.props.accountId;
    const account = this.props.accounts.find(acct => acct.id === accountId);

    this.props.onSyncAndDownload(account ? account.id : accountId);
  };

  onImport = async () => {
    const accountId = this.props.accountId;
    const account = this.props.accounts.find(acct => acct.id === accountId);

    if (account) {
      const res = await window.Actual.openFileDialog({
        filters: [
          {
            name: t('Financial files'),
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
                  onImported: (didChange: boolean) => {
                    if (didChange) {
                      this.fetchTransactions();
                    }
                  },
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
      t('Export transactions'),
    );
  };

  onTransactionsChange = (updatedTransaction: TransactionEntity) => {
    // Apply changes to the rows optimistically. `onRows` recognizes these
    // rows and skips the expensive aggregate DB queries for them.
    const rows = this.rows;
    const current = rows?.getCurrentResult().data;
    if (rows && current) {
      const data = updatedTransaction._deleted
        ? current.data.filter(t => t.id !== updatedTransaction.id)
        : current.data.map(t =>
            t.id === updatedTransaction.id ? updatedTransaction : t,
          );
      // Set before `setQueryData`, which notifies `onRows` synchronously
      this._optimisticRows = { ...current, data };
      this.props.queryClient.setQueryData(
        rows.options.queryKey,
        this._optimisticRows,
      );
    }

    this.props.dispatch(updateNewTransactions({ id: updatedTransaction.id }));
  };

  canCalculateBalance = () => {
    const accountId = this.props.accountId;
    const account = this.props.accounts.find(
      account => account.id === accountId,
    );

    if (!account) return false;
    if (this.state.search !== '') return false;
    if (this.state.filterConditions.length > 0) return false;
    if (this.state.sort === null) {
      return true;
    } else {
      return (
        this.state.sort.field === 'date' && this.state.sort.ascDesc === 'desc'
      );
    }
  };

  getBalanceTotal = async (): Promise<number | null> => {
    if (!this.canCalculateBalance() || !this.rowsQuery) {
      return null;
    }

    const { data }: { data: number | null } = await aqlQuery(
      this.rowsQuery.options({ splits: 'none' }).calculate({ $sum: '$amount' }),
    );
    return data ?? 0;
  };

  // Running balances for the loaded rows only. Computing them for every row
  // in the account cost a window query over all of them, plus formatting
  // each one to size the balance column.
  async calculateBalances(
    transactions: TransactionEntity[],
    pendingTotal: Promise<number | null> = this.getBalanceTotal(),
  ) {
    const total = await pendingTotal;
    return total == null
      ? null
      : calculateRunningBalancesFromTotal(transactions, total);
  }

  onRunRules = async (ids: string[]) => {
    try {
      this.setState({ workingHard: true });
      // Bulk fetch transactions
      const transactions = this.state.transactions.filter(trans =>
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

      // Fetch updated transactions once at the end
      this.fetchTransactions();
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

  onToggleExtraBalances = () => {
    this.props.setShowExtraBalances(!this.props.showExtraBalances);
  };

  onMenuSelect = async (
    item:
      | 'link'
      | 'unlink'
      | 'close'
      | 'reopen'
      | 'export'
      | 'remove-sorting'
      | 'toggle-reconciled'
      | 'toggle-net-worth-chart'
      | 'manage-columns'
      | 'account-group',
  ) => {
    const accountId = this.props.accountId!;
    const account = this.props.accounts.find(
      account => account.id === accountId,
    )!;

    switch (item) {
      case 'link':
        this.props.dispatch(
          pushModal({
            modal: {
              name: 'add-account',
              options: {
                upgradingAccountId: accountId,
              },
            },
          }),
        );
        break;
      case 'unlink':
        this.props.dispatch(
          pushModal({
            modal: {
              name: 'confirm-unlink-account',
              options: {
                accountName: account.name,
                isViewBankSyncSettings: false,
                onUnlink: () => {
                  this.props.onUnlinkAccount(accountId);
                },
              },
            },
          }),
        );
        break;
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
      case 'remove-sorting': {
        this.setState({ sort: null }, () => {
          const filterConditions = this.state.filterConditions;
          if (filterConditions.length > 0) {
            void this.applyFilters([...filterConditions]);
          } else {
            this.fetchTransactions();
          }
          if (this.state.search !== '') {
            this.onSearch(this.state.search);
          }
        });
        break;
      }
      case 'toggle-reconciled':
        if (this.state.showReconciled) {
          this.props.setShowReconciled(false);
          this.setState({ showReconciled: false }, () =>
            this.fetchTransactions(this.state.filterConditions),
          );
        } else {
          this.props.setShowReconciled(true);
          this.setState({ showReconciled: true }, () =>
            this.fetchTransactions(this.state.filterConditions),
          );
        }
        break;
      case 'toggle-net-worth-chart':
        if (this.props.showNetWorthChart) {
          this.props.setShowNetWorthChart(false);
        } else {
          this.props.setShowNetWorthChart(true);
        }
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

    // Toggling the balance column changes which queries run, so mirror the
    // change into component state and refetch when needed.
    const balance = columns.find(column => column.id === 'balance');
    const isBalanceVisible = balance && !balance.hidden;
    if (balance && isBalanceVisible !== !!this.state.showBalances) {
      if (!isBalanceVisible) {
        this.setState({ showBalances: false, balances: null });
      } else {
        this.setState(
          {
            transactions: [],
            filterConditions: [],
            search: '',
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
        return t('On Budget Accounts');
      } else if (id === 'offbudget') {
        return t('Off Budget Accounts');
      } else if (id === 'uncategorized') {
        return t('Uncategorized');
      } else if (!id) {
        return t('All Accounts');
      }
      return null;
    }

    return account.name;
  }

  getBalanceQuery(id?: string) {
    return {
      name: `balance-query-${id}`,
      query: this.makeRootTransactionsQuery().calculate({ $sum: '$amount' }),
    } as const;
  }

  getFilteredAmount = async () => {
    if (!this.rowsQuery) {
      return 0;
    }

    const { data: amount } = await aqlQuery(
      this.rowsQuery.calculate({ $sum: '$amount' }),
    );
    return amount;
  };

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
    await this.refetchTransactions();
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

    await reconciliation.createReconciliationTransaction(
      accountId,
      diff,
      date,
      // Optimistic UI: update the transaction list before sending the data to the database
      reconciliationTransactions =>
        this.setState(state => ({
          transactions: [...reconciliationTransactions, ...state.transactions],
        })),
    );
    await this.refetchTransactions();
  };

  onShowTransactions = async (ids: string[]) => {
    void this.onApplyFilter({
      customName: t('Selected transactions'),
      queryFilter: { id: { $oneof: ids } },
    });
  };

  onBatchEdit = (name: keyof TransactionEntity, ids: string[]) => {
    void this.props.onBatchEdit({
      name,
      ids,
      onSuccess: updatedIds => {
        void this.refetchTransactions();

        if (this.table.current) {
          this.table.current.edit(updatedIds[0], 'select', false);
        }
      },
    });
  };

  onBatchDuplicate = (ids: string[]) => {
    void this.props.onBatchDuplicate({
      ids,
      onSuccess: this.refetchTransactions,
    });
  };

  onBatchDelete = (ids: string[]) => {
    void this.props.onBatchDelete({ ids, onSuccess: this.refetchTransactions });
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

    void this.refetchTransactions();
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

    void this.refetchTransactions();

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
    await this.refetchTransactions();
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
      onSuccess: this.refetchTransactions,
    });
  };

  onBatchUnlinkSchedule = (ids: string[]) => {
    void this.props.onBatchUnlinkSchedule({
      ids,
      onSuccess: this.refetchTransactions,
    });
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
    await this.props.onSetTransfer(
      ids,
      this.props.payees,
      this.refetchTransactions,
    );
  };

  onConditionsOpChange = (value: 'and' | 'or') => {
    this.setState(state => ({
      filterConditionsOp: value,
      filterId: { ...state.filterId, status: 'changed' } as SavedFilter,
    }));
    void this.applyFilters([...this.state.filterConditions]);
    if (this.state.search !== '') {
      this.onSearch(this.state.search);
    }
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
    if (this.state.search !== '') {
      this.onSearch(this.state.search);
    }
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
    if (this.state.search !== '') {
      this.onSearch(this.state.search);
    }
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
    if (this.state.search !== '') {
      this.onSearch(this.state.search);
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

    if (this.state.search !== '') {
      this.onSearch(this.state.search);
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
        void this.refetchTransactions();
        break;
      case 'post-transaction-today':
        for (const id of scheduleIds) {
          await send('schedule/post-transaction', { id, today: true });
        }
        void this.refetchTransactions();
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

      this.setState(
        {
          filterConditions: conditions,
        },
        () => {
          this.updateQuery(this.currentQuery, true);
        },
      );
    } else {
      this.setState(
        {
          transactions: [],
          filterConditions: conditions,
        },
        () => {
          this.fetchTransactions();
        },
      );
    }

    if (this.state.sort !== null) {
      this.applySort();
    }
  };

  applySort = (
    field?: string,
    ascDesc?: 'asc' | 'desc',
    prevField?: string,
    prevAscDesc?: 'asc' | 'desc',
  ) => {
    const filterConditions = this.state.filterConditions;
    const isFiltered = filterConditions.length > 0;
    const sortField = getField(!field ? this.state.sort?.field : field);
    const sortAscDesc = !ascDesc ? this.state.sort?.ascDesc : ascDesc;
    const sortPrevField = getField(
      !prevField ? this.state.sort?.prevField : prevField,
    );
    const sortPrevAscDesc = !prevField
      ? this.state.sort?.prevAscDesc
      : prevAscDesc;

    const sortCurrentQuery = function (
      that: AccountInternal,
      sortField: string,
      sortAscDesc?: 'asc' | 'desc',
    ) {
      if (sortField === 'cleared') {
        that.currentQuery = that.currentQuery.orderBy({
          reconciled: sortAscDesc,
        });
      }

      that.currentQuery = that.currentQuery.orderBy({
        [sortField]: sortAscDesc,
      });
    };

    const sortRootQuery = function (
      that: AccountInternal,
      sortField: string,
      sortAscDesc?: 'asc' | 'desc',
    ) {
      if (sortField === 'cleared') {
        that.currentQuery = that.rootQuery.orderBy({
          reconciled: sortAscDesc,
        });
        that.currentQuery = that.currentQuery.orderBy({
          cleared: sortAscDesc,
        });
      } else {
        that.currentQuery = that.rootQuery.orderBy({
          [sortField]: sortAscDesc,
        });
      }
    };

    // sort by previously used sort field, if any
    const maybeSortByPreviousField = function (
      that: AccountInternal,
      sortPrevField: string,
      sortPrevAscDesc?: 'asc' | 'desc',
    ) {
      if (!sortPrevField) {
        return;
      }

      if (sortPrevField === 'cleared') {
        that.currentQuery = that.currentQuery.orderBy({
          reconciled: sortPrevAscDesc,
        });
      }

      that.currentQuery = that.currentQuery.orderBy({
        [sortPrevField]: sortPrevAscDesc,
      });
    };

    switch (true) {
      // called by applyFilters to sort an already filtered result
      case !field:
        sortCurrentQuery(this, sortField, sortAscDesc);
        break;

      // called directly from UI by sorting a column.
      // active filters need to be applied before sorting
      case isFiltered:
        void this.applyFilters([...filterConditions]);
        sortCurrentQuery(this, sortField, sortAscDesc);
        break;

      // called directly from UI by sorting a column.
      // no active filters, start a new root query.
      case !isFiltered:
        sortRootQuery(this, sortField, sortAscDesc);
        break;

      default:
    }

    maybeSortByPreviousField(this, sortPrevField, sortPrevAscDesc);

    // Always add sort_order as a final tiebreaker to maintain stable ordering
    // when transactions have the same values in the sorted column(s)
    this.currentQuery = this.currentQuery.orderBy({ sort_order: sortAscDesc });

    this.updateQuery(this.currentQuery, isFiltered);
  };

  onSort = (headerClicked: string, ascDesc: 'asc' | 'desc') => {
    let prevField: string | undefined;
    let prevAscDesc: 'asc' | 'desc' | undefined;
    //if staying on same column but switching asc/desc
    //then keep prev the same
    if (headerClicked === this.state.sort?.field) {
      prevField = this.state.sort.prevField;
      prevAscDesc = this.state.sort.prevAscDesc;
      this.setState(state => ({
        sort: {
          ...state.sort,
          field: headerClicked,
          ascDesc,
        },
      }));
    } else {
      //if switching to new column then capture state
      //of current sort column as prev
      prevField = this.state.sort?.field;
      prevAscDesc = this.state.sort?.ascDesc;
      this.setState(state => ({
        sort: {
          field: headerClicked,
          ascDesc,
          prevField: state.sort?.field,
          prevAscDesc: state.sort?.ascDesc,
        },
      }));
    }

    this.applySort(headerClicked, ascDesc, prevField, prevAscDesc);
    if (this.state.search !== '') {
      this.onSearch(this.state.search);
    }
  };

  render() {
    const {
      accounts,
      categoryGroups,
      payees,
      dateFormat,
      hideFraction,
      accountsSyncing,
      showExtraBalances,
      accountId,
      categoryId,
    } = this.props;
    const {
      transactions,
      loading,
      workingHard,
      filterId,
      isReconciling,
      transactionsFiltered,
      showBalances,
      balances,
      showCleared,
      showReconciled,
      filteredAmount,
    } = this.state;

    const account = accounts.find(account => account.id === accountId);
    const accountName = this.getAccountTitle(account, accountId);

    if (!accountName && !loading) {
      // This is probably an account that was deleted, so redirect to
      // all accounts
      return <Navigate to="/accounts" replace />;
    }

    const category = categoryGroups
      .flatMap(g => g.categories)
      .find(category => category?.id === categoryId);

    const showEmptyMessage = !loading && !accountId && accounts.length === 0;

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
            items={
              showReconciled
                ? allTransactions
                : allTransactions.filter(t => !t.reconciled)
            }
            fetchAllIds={this.fetchAllIds}
            registerDispatch={dispatch => (this.dispatchSelected = dispatch)}
          >
            <View style={styles.page}>
              <AccountHeader
                tableRef={this.table}
                isNameEditable={isNameEditable ?? false}
                workingHard={workingHard ?? false}
                accountId={accountId}
                account={account}
                filterId={filterId}
                savedFilters={this.props.savedFilters}
                accountName={accountName}
                accountsSyncing={accountsSyncing}
                accounts={accounts}
                transactions={transactions}
                showExtraBalances={showExtraBalances ?? false}
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
                onToggleExtraBalances={this.onToggleExtraBalances}
                onSaveName={this.onSaveName}
                saveNameError={this.state.nameError}
                onReconcile={this.onReconcile}
                onDoneReconciling={this.onDoneReconciling}
                onCancelReconciling={this.onCancelReconciling}
                onCreateReconciliationTransaction={
                  this.onCreateReconciliationTransaction
                }
                onSync={this.onSync}
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
                  loadMoreTransactions={this.loadMoreRows}
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
                              modal: { name: 'add-account', options: {} },
                            }),
                          )
                        }
                      />
                    ) : !loading ? (
                      <View
                        style={{
                          color: theme.tableText,
                          marginTop: 20,
                          textAlign: 'center',
                          fontStyle: 'italic',
                        }}
                      >
                        <Trans>No transactions</Trans>
                      </View>
                    ) : null
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
                  onRefetch={this.refetchTransactions}
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
  | 'queryClient'
>;

// Computes the header's balance cells and seeds the spreadsheet cache with
// them, so the header binds to real values instead of drawing 0.00 first.
// Names and queries mirror `getBalanceQuery` and the header's `Balances`.
async function prewarmHeaderBalances(
  spreadsheet: ReturnType<typeof useSpreadsheet>,
  accountId: AccountInternalProps['accountId'],
  showExtraBalances: boolean,
) {
  const name = `balance-query-${accountId}` as const;
  const query = queries.transactions(accountId).calculate({ $sum: '$amount' });
  // Today's cleared balance is always needed: the reconcile panel opens on it
  const cells: Array<{ name: string; query: Query }> = [
    { name, query },
    clearedBalanceCell({ name, query }, currentDay()),
  ];
  if (showExtraBalances) {
    cells.push(
      { name: `${name}-cleared`, query: query.filter({ cleared: true }) },
      { name: `${name}-uncleared`, query: query.filter({ cleared: false }) },
    );
  }

  await Promise.all(
    cells.map(async cell => {
      const { data } = await aqlQuery(cell.query);
      const fullName = `__global!${cell.name}`;
      spreadsheet.prewarmCache(fullName, { name: fullName, value: data });
    }),
  );
}

async function loadAccountPreload({
  spreadsheet,
  accounts,
  accountId,
  filterConditions,
  showBalances,
  showReconciled,
  showExtraBalances,
}: {
  spreadsheet: ReturnType<typeof useSpreadsheet>;
  accounts: AccountEntity[];
  accountId: AccountInternalProps['accountId'];
  filterConditions: ConditionEntity[];
  showBalances: boolean | undefined;
  showReconciled: boolean;
  showExtraBalances: boolean;
}): Promise<AccountPreload> {
  const isFiltered = filterConditions.length > 0;
  const [, filters] = await Promise.all([
    prewarmHeaderBalances(spreadsheet, accountId, showExtraBalances),
    isFiltered ? makeTransactionFilters(filterConditions) : null,
  ]);
  // A screen always opens with its conditions combined by `and`.
  const rootQuery = filters
    ? queries.transactions(accountId).filter({ $and: filters })
    : queries.transactions(accountId);

  // The query `AccountInternal` issues on mount. With no search or sort
  // applied yet, `canCalculateBalance` comes down to the account existing
  // and the screen opening unfiltered.
  const canCalculateBalance =
    !isFiltered && accounts.some(account => account.id === accountId);
  const query = selectTransactionRows(rootQuery, {
    showReconciled,
    showBalances,
    canCalculateBalance,
  });

  // Mirror `getBalanceTotal` and `getFilteredAmount`, so the balance column
  // and the filtered total draw filled in too.
  const [{ data }, total, filteredAmount] = await Promise.all([
    aqlQuery(query.limit(TRANSACTIONS_PAGE_COUNT)),
    showBalances && canCalculateBalance
      ? aqlQuery(
          query.options({ splits: 'none' }).calculate({ $sum: '$amount' }),
        ).then(({ data }: { data: number | null }) => data ?? 0)
      : null,
    isFiltered
      ? aqlQuery(query.calculate({ $sum: '$amount' })).then(
          ({ data }: { data: number }) => data,
        )
      : null,
  ]);
  const transactions = ungroupTransactions(data);

  return {
    transactions,
    balances:
      total == null
        ? null
        : calculateRunningBalancesFromTotal(transactions, total),
    filteredAmount,
  };
}

function AccountHack(props: AccountHackProps) {
  const { dispatch: splitsExpandedDispatch } = useSplitsExpanded();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
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
      queryClient={queryClient}
      {...props}
    />
  );
}

export function Account() {
  const params = useParams();
  const location = useLocation();

  // Suspend until the screen has what it needs to draw complete. Navigations
  // run in a transition, so React keeps the previous screen up meanwhile
  // instead of drawing this one empty and filling it in. Without these lists
  // rows would draw with blank payees and categories, and with no accounts
  // the screen would mistake the account for a deleted one and redirect.
  // Notes are needed so the header can link the account name on first draw.
  const [
    { data: accounts },
    { data: payees },
    {
      data: { grouped: categoryGroups },
    },
  ] = useSuspenseQueries({
    queries: [
      accountQueries.list(),
      payeeQueries.list(),
      categoryQueries.list(),
      // Only suspend on notes; the header subscribes to the one note it
      // needs, so this screen shouldn't re-render whenever any note changes.
      { ...noteQueries.list(), notifyOnChangeProps: [] },
    ],
  });
  const newTransactions = useSelector(
    state => state.transactions.newTransactions,
  );
  const matchedTransactions = useSelector(
    state => state.transactions.matchedTransactions,
  );
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const [hideFraction] = useSyncedPref('hideFraction');
  const [expandSplits] = useLocalPref('expand-splits');
  const [showNetWorthChart, setShowNetWorthChart] = useSyncedPref(
    `show-account-${params.id}-net-worth-chart`,
  );
  const [hideReconciled, setHideReconciled] = useSyncedPref(
    `hide-reconciled-${params.id}`,
  );
  const [showExtraBalances, setShowExtraBalances] = useSyncedPref(
    `show-extra-balances-${params.id || 'all-accounts'}`,
  );
  const {
    transactionColumns,
    columnOrder,
    showBalances,
    showCleared,
    showGroup,
    saveColumns,
  } = useTransactionTableColumns(params.id);

  const modalShowing = useSelector(state => state.modals.modalStack.length > 0);
  const accountsSyncing = useSelector(state => state.account.accountsSyncing);
  const filterConditions = location?.state?.filterConditions || [];

  const savedFiters = useTransactionFilters();

  const schedulesQuery = useMemo(
    () => getSchedulesQuery(params.id),
    [params.id],
  );

  const { mutate: reopenAccount } = useReopenAccountMutation();
  const onReopenAccount = (id: AccountEntity['id']) => reopenAccount({ id });

  // Settles once the change is in the cache, so the header can show the new
  // name until then. Failures are already reported by the mutation.
  const { mutateAsync: updateAccount } = useUpdateAccountMutation();
  const onUpdateAccount = (account: AccountEntity) =>
    updateAccount({ account }).catch(() => undefined);

  const { mutate: unlinkAccount } = useUnlinkAccountMutation();
  const onUnlinkAccount = (id: AccountEntity['id']) => unlinkAccount({ id });

  const { mutate: syncAndDownload } = useSyncAndDownloadMutation();
  const onSyncAndDownload = (id?: AccountEntity['id']) =>
    syncAndDownload({ id });

  const createPayee = useCreatePayeeMutation();
  const onCreatePayee = (name: PayeeEntity['name']) =>
    createPayee.mutateAsync({ name });

  const spreadsheet = useSpreadsheet();
  const showReconciled = String(hideReconciled) !== 'true';
  // Only the screen's first render reads this, so it never refetches while
  // mounted; it's dropped once the screen unmounts, so coming back loads fresh.
  // Keyed by the navigation, since a path can open with different filters.
  const { data: preload } = useSuspenseQuery({
    queryKey: ['account-screen-preload', location.key],
    queryFn: () =>
      loadAccountPreload({
        spreadsheet,
        accounts,
        accountId: params.id,
        filterConditions,
        showBalances,
        showReconciled,
        showExtraBalances: String(showExtraBalances) === 'true',
      }),
    staleTime: Infinity,
    gcTime: 0,
  });

  return (
    <ErrorBoundary FallbackComponent={FeatureErrorFallback}>
      <SchedulesProvider query={schedulesQuery}>
        <SplitsExpandedProvider
          // A filtered screen collapses splits on its first load; start it
          // that way so preloaded rows don't draw expanded first.
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
            showNetWorthChart={String(showNetWorthChart) === 'true'}
            setShowNetWorthChart={val => setShowNetWorthChart(String(val))}
            showCleared={showCleared}
            showReconciled={showReconciled}
            setShowReconciled={val => setHideReconciled(String(!val))}
            showGroup={showGroup}
            showExtraBalances={String(showExtraBalances) === 'true'}
            setShowExtraBalances={extraBalances =>
              setShowExtraBalances(String(extraBalances))
            }
            transactionColumns={transactionColumns}
            columnOrder={columnOrder}
            saveColumns={saveColumns}
            payees={payees}
            modalShowing={modalShowing}
            accountsSyncing={accountsSyncing}
            filterConditions={filterConditions}
            categoryGroups={categoryGroups}
            accountId={params.id}
            categoryId={location?.state?.categoryId}
            location={location}
            savedFilters={savedFiters}
            onReopenAccount={onReopenAccount}
            onUpdateAccount={onUpdateAccount}
            onUnlinkAccount={onUnlinkAccount}
            onSyncAndDownload={onSyncAndDownload}
            onCreatePayee={onCreatePayee}
            preload={preload}
          />
        </SplitsExpandedProvider>
      </SchedulesProvider>
    </ErrorBoundary>
  );
}
