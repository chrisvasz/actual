import React, { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Dialog, DialogTrigger } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import {
  SvgAdd,
  SvgDotsHorizontalTriple,
} from '@actual-app/components/icons/v1';
import {
  SvgArrowsExpand3,
  SvgArrowsShrink3,
  SvgDownloadThickBottom,
  SvgExternalLink,
  SvgLockClosed,
  SvgPencil1,
} from '@actual-app/components/icons/v2';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  AccountEntity,
  RuleConditionEntity,
  TransactionEntity,
  TransactionFilterEntity,
} from '@actual-app/core/types/models';
import { css } from '@emotion/css';
import { differenceInCalendarDays } from 'date-fns';
import type { TFunction } from 'i18next';

import { isAccountFailedSync } from '#accounts/syncStatus';
import { AnimatedRefresh } from '#components/AnimatedRefresh';
import { Link } from '#components/common/Link';
import { Search } from '#components/common/Search';
import { FilterButton } from '#components/filters/FiltersMenu';
import { FiltersStack } from '#components/filters/FiltersStack';
import type { SavedFilter } from '#components/filters/SavedFilterMenuButton';
import { NotesButton } from '#components/NotesButton';
import { SelectedTransactionsButton } from '#components/transactions/SelectedTransactionsButton';
import { UncategorizedChip } from '#components/UncategorizedChip';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useHotkeys } from '#hooks/useHotkeys';
import { useLocalPref } from '#hooks/useLocalPref';
import { useNotes } from '#hooks/useNotes';
import { useSplitsExpanded } from '#hooks/useSplitsExpanded';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useSyncServerStatus } from '#hooks/useSyncServerStatus';
import { normalizeUrl } from '#notes/linkParser';

import type { TableRef } from './Account';
import { AccountSyncCheck } from './AccountSyncCheck';
import { Balances } from './Balance';
import { BalanceHistoryGraph } from './BalanceHistoryGraph';
import { PrewarmReconcileBalance, ReconcilingMessage } from './Reconcile';

type AccountHeaderProps = {
  tableRef: TableRef;
  isNameEditable: boolean;
  workingHard: boolean;
  accountName: string;
  accountId?: string;
  account?: AccountEntity;
  filterId?: SavedFilter;
  savedFilters: TransactionFilterEntity[];
  accountsSyncing: string[];
  accounts: AccountEntity[];
  transactions: TransactionEntity[];
  showExtraBalances: boolean;
  showReconciled: boolean;
  showEmptyMessage: boolean;
  balanceQuery: ComponentProps<typeof ReconcilingMessage>['balanceQuery'];
  isReconciling: boolean;
  isFiltered: boolean;
  filteredAmount?: number | null;
  isSorted: boolean;
  search: string;
  filterConditions: RuleConditionEntity[];
  filterConditionsOp: 'and' | 'or';
  onSearch: (newSearch: string) => void;
  onAddTransaction: () => void;
  onShowTransactions: ComponentProps<
    typeof SelectedTransactionsButton
  >['onShow'];
  onDoneReconciling: ComponentProps<typeof ReconcilingMessage>['onDone'];
  onCancelReconciling: ComponentProps<typeof ReconcilingMessage>['onCancel'];
  onCreateReconciliationTransaction: ComponentProps<
    typeof ReconcilingMessage
  >['onCreateTransaction'];
  onToggleExtraBalances: ComponentProps<
    typeof Balances
  >['onToggleExtraBalances'];
  onSaveName: AccountNameFieldProps['onSaveName'];
  saveNameError: AccountNameFieldProps['saveNameError'];
  onSync: () => void;
  onImport: () => void;
  onMenuSelect: AccountMenuProps['onMenuSelect'];
  onReconcile: () => void;
  onBatchEdit: ComponentProps<typeof SelectedTransactionsButton>['onEdit'];
  onRunRules: ComponentProps<typeof SelectedTransactionsButton>['onRunRules'];
  onBatchDelete: ComponentProps<typeof SelectedTransactionsButton>['onDelete'];
  onBatchDuplicate: ComponentProps<
    typeof SelectedTransactionsButton
  >['onDuplicate'];
  onBatchLinkSchedule: ComponentProps<
    typeof SelectedTransactionsButton
  >['onLinkSchedule'];
  onBatchUnlinkSchedule: ComponentProps<
    typeof SelectedTransactionsButton
  >['onUnlinkSchedule'];
  onApplyFilter: (filter: RuleConditionEntity) => void;
} & Pick<
  ComponentProps<typeof SelectedTransactionsButton>,
  | 'onCreateRule'
  | 'onScheduleAction'
  | 'onSetTransfer'
  | 'onMakeAsSplitTransaction'
  | 'onMakeAsNonSplitTransactions'
  | 'onMergeTransactions'
> &
  Pick<
    ComponentProps<typeof FiltersStack>,
    | 'onUpdateFilter'
    | 'onDeleteFilter'
    | 'onConditionsOpChange'
    | 'onClearFilters'
    | 'onReloadSavedFilter'
  >;

export function AccountHeader({
  tableRef,
  isNameEditable,
  workingHard,
  accountName,
  accountId,
  account,
  filterId,
  savedFilters,
  accountsSyncing,
  accounts,
  transactions,
  showExtraBalances,
  showReconciled,
  showEmptyMessage,
  balanceQuery,
  isReconciling,
  isFiltered,
  filteredAmount,
  isSorted,
  search,
  filterConditions,
  filterConditionsOp,
  onSearch,
  onAddTransaction,
  onShowTransactions,
  onDoneReconciling,
  onCancelReconciling,
  onCreateReconciliationTransaction,
  onToggleExtraBalances,
  onSaveName,
  saveNameError,
  onSync,
  onImport,
  onMenuSelect,
  onReconcile,
  onBatchDelete,
  onBatchDuplicate,
  onBatchEdit,
  onBatchLinkSchedule,
  onBatchUnlinkSchedule,
  onCreateRule,
  onApplyFilter,
  onUpdateFilter,
  onClearFilters,
  onReloadSavedFilter,
  onConditionsOpChange,
  onDeleteFilter,
  onScheduleAction,
  onSetTransfer,
  onRunRules,
  onMakeAsSplitTransaction,
  onMakeAsNonSplitTransactions,
  onMergeTransactions,
}: AccountHeaderProps) {
  const { t } = useTranslation();

  const searchInput = useRef<HTMLInputElement>(null);
  const reconcileButton = useRef<HTMLButtonElement>(null);
  const wasReconciling = useRef(isReconciling);
  // Closing the reconcile panel unmounts whatever had focus inside it; hand
  // focus back to the button that opened it instead of dropping it on the page
  useEffect(() => {
    if (
      wasReconciling.current &&
      !isReconciling &&
      (document.activeElement == null ||
        document.activeElement === document.body)
    ) {
      reconcileButton.current?.focus();
    }
    wasReconciling.current = isReconciling;
  }, [isReconciling]);
  const splitsExpanded = useSplitsExpanded();
  const syncServerStatus = useSyncServerStatus();
  const isUsingServer = syncServerStatus !== 'no-server';
  const isServerOffline = syncServerStatus === 'offline';
  const [_, setExpandSplitsPref] = useLocalPref('expand-splits');
  const [showNetWorthChartPref, _setShowNetWorthChartPref] = useSyncedPref(
    `show-account-${accountId}-net-worth-chart`,
  );
  const showNetWorthChart = showNetWorthChartPref === 'true';

  let canSync = !!(account?.account_id && isUsingServer);
  if (!account) {
    // All accounts - check for any syncable account
    canSync = !!accounts.find(account => !!account.account_id) && isUsingServer;
  }

  // Only show the ability to make linked transfers on multi-account views.
  const showMakeTransfer = !account;

  function onToggleSplits() {
    if (tableRef.current) {
      splitsExpanded.dispatch({
        type: 'switch-mode',
        id: tableRef.current.getScrolledItem(),
      });

      setExpandSplitsPref(!(splitsExpanded.state.mode === 'expand'));
    }
  }

  const graphRef = useRef<HTMLDivElement>(null);

  useHotkeys(
    'ctrl+f, cmd+f, meta+f',
    e => {
      if (searchInput.current) {
        // Trigger browser-native find if user pressed search twice in a row
        if (document.activeElement === searchInput.current) {
          searchInput.current.blur();
        } else {
          e.preventDefault();
          searchInput.current.focus();
        }
      }
    },
    {
      enableOnFormTags: true,
      preventDefault: false,
      scopes: ['app'],
    },
    [searchInput],
  );
  useHotkeys(
    't',
    () => onAddTransaction(),
    {
      preventDefault: true,
      scopes: ['app'],
    },
    [onAddTransaction],
  );
  useHotkeys(
    'ctrl+i, cmd+i, meta+i',
    () => onImport(),
    {
      scopes: ['app'],
    },
    [onImport],
  );
  useHotkeys(
    'ctrl+b, cmd+b, meta+b',
    () => onSync(),
    {
      enabled: canSync && !isServerOffline,
      preventDefault: true,
      scopes: ['app'],
    },
    [onSync],
  );

  return (
    <>
      <View style={{ ...styles.pageContent, paddingBottom: 10, flexShrink: 0 }}>
        <View
          style={{
            flexDirection: 'column',
            marginTop: 2,
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View
            style={{
              flexGrow: 1,
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
              }}
            >
              {!!account?.bank && (
                <AccountSyncSidebar
                  account={account}
                  accountsSyncing={accountsSyncing}
                />
              )}
              <AccountNameField
                account={account}
                accountName={accountName}
                isNameEditable={isNameEditable}
                saveNameError={saveNameError}
                onSaveName={onSaveName}
              />
              <View style={{ marginLeft: 7, flexDirection: 'row', gap: 7 }}>
                <AccountSyncCheck />
                <UncategorizedChip />
              </View>
            </View>

            <Balances
              balanceQuery={balanceQuery}
              showExtraBalances={showExtraBalances}
              onToggleExtraBalances={onToggleExtraBalances}
              account={account}
              isFiltered={isFiltered}
              filteredAmount={filteredAmount}
            />
          </View>

          <BalanceHistoryGraph
            ref={graphRef}
            accountId={accountId}
            style={{
              height: 'calc(5vh + 5vw)',
              margin: 0,
              display: showNetWorthChart ? 'flex' : 'none',
            }}
          />
        </View>
        <SpaceBetween gap={10} style={{ marginTop: 12 }}>
          {canSync && (
            <Button
              variant="bare"
              onPress={onSync}
              isDisabled={isServerOffline}
            >
              <AnimatedRefresh
                width={13}
                height={13}
                animating={
                  account
                    ? accountsSyncing.includes(account.id)
                    : accountsSyncing.length > 0
                }
              />{' '}
              {isServerOffline ? t('Bank Sync Offline') : t('Bank Sync')}
            </Button>
          )}

          {account && !account.closed && (
            <Button variant="bare" onPress={onImport}>
              <SvgDownloadThickBottom
                width={13}
                height={13}
                style={{ marginRight: 4 }}
              />{' '}
              <Trans>Import</Trans>
            </Button>
          )}

          {!showEmptyMessage && (
            <Button variant="bare" onPress={onAddTransaction}>
              <SvgAdd width={10} height={10} style={{ marginRight: 3 }} />
              <Trans>Add New</Trans>
            </Button>
          )}
          <View style={{ flexShrink: 0 }}>
            {/* @ts-expect-error fix me */}
            <FilterButton onApply={onApplyFilter} />
          </View>
          {account && (
            <View
              style={{
                flexShrink: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Button
                ref={reconcileButton}
                variant="bare"
                onPress={onReconcile}
              >
                <SvgLockClosed
                  width={13}
                  height={13}
                  style={{ marginRight: 4 }}
                />{' '}
                <Trans>Reconcile</Trans>
              </Button>
              {account.last_reconciled && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.pageTextLight,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatDaysSinceReconciled(account.last_reconciled, t)}
                </Text>
              )}
            </View>
          )}
          <View style={{ flex: 1 }} />

          <Search
            placeholder={t('Search')}
            value={search}
            onChange={onSearch}
            ref={searchInput}
          />
          {workingHard ? (
            <View>
              <AnimatedLoading style={{ width: 16, height: 16 }} />
            </View>
          ) : (
            <SelectedTransactionsButton
              getTransaction={id => transactions.find(t => t.id === id)}
              onShow={onShowTransactions}
              onDuplicate={onBatchDuplicate}
              onDelete={onBatchDelete}
              onEdit={onBatchEdit}
              onRunRules={onRunRules}
              onLinkSchedule={onBatchLinkSchedule}
              onUnlinkSchedule={onBatchUnlinkSchedule}
              onCreateRule={onCreateRule}
              onSetTransfer={onSetTransfer}
              onScheduleAction={onScheduleAction}
              showMakeTransfer={showMakeTransfer}
              onMakeAsSplitTransaction={onMakeAsSplitTransaction}
              onMakeAsNonSplitTransactions={onMakeAsNonSplitTransactions}
              onMergeTransactions={onMergeTransactions}
            />
          )}
          <Button
            variant="bare"
            aria-label={
              splitsExpanded.state.mode === 'collapse'
                ? t('Collapse split transactions')
                : t('Expand split transactions')
            }
            style={{ padding: 6 }}
            onPress={onToggleSplits}
          >
            <View
              title={
                splitsExpanded.state.mode === 'collapse'
                  ? t('Collapse split transactions')
                  : t('Expand split transactions')
              }
            >
              {splitsExpanded.state.mode === 'collapse' ? (
                <SvgArrowsShrink3 style={{ width: 14, height: 14 }} />
              ) : (
                <SvgArrowsExpand3 style={{ width: 14, height: 14 }} />
              )}
            </View>
          </Button>
          {account ? (
            <View style={{ flex: '0 0 auto' }}>
              <DialogTrigger>
                <Button variant="bare" aria-label={t('Account menu')}>
                  <SvgDotsHorizontalTriple
                    width={15}
                    height={15}
                    style={{ transform: 'rotateZ(90deg)' }}
                  />
                </Button>

                <Popover style={{ minWidth: 275 }}>
                  <Dialog>
                    <AccountMenu
                      account={account}
                      canSync={canSync}
                      showNetWorthChart={showNetWorthChart}
                      isSorted={isSorted}
                      showReconciled={showReconciled}
                      onMenuSelect={onMenuSelect}
                    />
                  </Dialog>
                </Popover>
              </DialogTrigger>
            </View>
          ) : (
            <View style={{ flex: '0 0 auto' }}>
              <DialogTrigger>
                <Button variant="bare" aria-label={t('Account menu')}>
                  <SvgDotsHorizontalTriple
                    width={15}
                    height={15}
                    style={{ transform: 'rotateZ(90deg)' }}
                  />
                </Button>

                <Popover>
                  <Dialog>
                    <Menu
                      slot="close"
                      onMenuSelect={onMenuSelect}
                      items={[
                        ...(isSorted
                          ? [
                              {
                                name: 'remove-sorting',
                                text: t('Remove all sorting'),
                              } as const,
                            ]
                          : []),
                        { name: 'export', text: t('Export') },
                        {
                          name: 'toggle-net-worth-chart',
                          text: showNetWorthChart
                            ? t('Hide balance chart')
                            : t('Show balance chart'),
                        },
                        {
                          name: 'manage-columns',
                          text: t('Manage table columns'),
                        },
                      ]}
                    />
                  </Dialog>
                </Popover>
              </DialogTrigger>
            </View>
          )}
        </SpaceBetween>
        {filterConditions?.length > 0 && (
          <FiltersStack
            conditions={filterConditions}
            conditionsOp={filterConditionsOp}
            onUpdateFilter={onUpdateFilter}
            onDeleteFilter={onDeleteFilter}
            onClearFilters={onClearFilters}
            onReloadSavedFilter={onReloadSavedFilter}
            filterId={filterId}
            savedFilters={savedFilters}
            onConditionsOpChange={onConditionsOpChange}
          />
        )}
      </View>
      {account && <PrewarmReconcileBalance balanceQuery={balanceQuery} />}
      {account && isReconciling && (
        <ReconcilingMessage
          balanceQuery={balanceQuery}
          onDone={onDoneReconciling}
          onCancel={onCancelReconciling}
          onCreateTransaction={onCreateReconciliationTransaction}
        />
      )}
    </>
  );
}

type AccountSyncSidebarProps = {
  account: AccountEntity;
  accountsSyncing: string[];
};

function AccountSyncSidebar({
  account,
  accountsSyncing,
}: AccountSyncSidebarProps) {
  return (
    <View
      style={{
        backgroundColor: accountsSyncing.includes(account.id)
          ? theme.sidebarItemBackgroundPending
          : isAccountFailedSync(account)
            ? theme.sidebarItemBackgroundFailed
            : theme.sidebarItemBackgroundPositive,
        marginRight: '4px',
        width: 8,
        height: 8,
        borderRadius: 8,
      }}
    />
  );
}

type AccountNameFieldProps = {
  account?: AccountEntity;
  accountName: string;
  isNameEditable: boolean;
  saveNameError?: ReactNode;
  onSaveName: (newName: string) => void;
};

function AccountNameField({
  account,
  accountName,
  isNameEditable,
  saveNameError,
  onSaveName,
}: AccountNameFieldProps) {
  const { t } = useTranslation();
  const [editingName, setEditingName] = useState(false);
  const notes = useNotes(account ? `account-${account.id}` : '');
  const noteUrl = getNoteUrl(notes);

  const handleSave = (newName: string) => {
    onSaveName(newName);
    setEditingName(false);
  };

  const displayName =
    account && account.closed
      ? t('Closed: {{ accountName }}', { accountName })
      : accountName;

  return (
    <View style={{ flexShrink: 0, alignItems: 'center' }}>
      {editingName ? (
        <>
          <InitialFocus>
            <Input
              defaultValue={accountName}
              onEnter={handleSave}
              onUpdate={handleSave}
              onEscape={() => setEditingName(false)}
              style={{
                fontSize: 25,
                fontWeight: 500,
                marginTop: -3,
                marginBottom: -4,
                marginLeft: -6,
                paddingTop: 2,
                paddingBottom: 2,
                width: Math.max(20, accountName.length) + 'ch',
              }}
            />
          </InitialFocus>
          {saveNameError && (
            <View style={{ color: theme.warningText }}>{saveNameError}</View>
          )}
        </>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            gap: 3,
            '& .hover-visible': {
              opacity: 0,
              transition: 'opacity .25s',
            },
            '&:hover .hover-visible': {
              opacity: 1,
            },
          }}
        >
          <View
            style={{
              fontSize: 25,
              fontWeight: 500,
              marginRight: 5,
              marginBottom: -1,
            }}
            data-testid="account-name"
          >
            {noteUrl ? (
              <Link
                variant="external"
                to={noteUrl}
                linkColor="blue"
                className={css({
                  textDecoration: 'underline',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                })}
              >
                {displayName}
                <SvgExternalLink
                  aria-label={t('Opens in a new tab')}
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                />
              </Link>
            ) : (
              displayName
            )}
          </View>

          <View style={{ flexDirection: 'row', width: 50 }}>
            {isNameEditable && account && (
              <NotesButton
                id={`account-${account.id}`}
                defaultColor={theme.pageTextSubdued}
              />
            )}
            {isNameEditable && (
              <Button
                variant="bare"
                aria-label={t('Edit account name')}
                className="hover-visible"
                onPress={() => setEditingName(true)}
              >
                <SvgPencil1
                  style={{
                    width: 11,
                    height: 11,
                    color: theme.pageTextSubdued,
                  }}
                />
              </Button>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// A note counts as a link when it starts with a web URL; any text after the
// first whitespace is ignored.
function getNoteUrl(notes: string | null) {
  const match = notes?.trim().match(/^(?:https?:\/\/|www\.)\S+/i);
  if (!match) {
    return null;
  }
  // Drop trailing punctuation, e.g. "https://example.com, my bank".
  return normalizeUrl(match[0].replace(/[.,;:!?)\]"']+$/, ''));
}

type AccountMenuProps = {
  account: AccountEntity;
  canSync: boolean;
  showNetWorthChart: boolean;
  showReconciled: boolean;
  isSorted: boolean;
  onMenuSelect: (
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
  ) => void;
};

function AccountMenu({
  account,
  canSync,
  showNetWorthChart,
  showReconciled,
  isSorted,
  onMenuSelect,
}: AccountMenuProps) {
  const { t } = useTranslation();
  const syncServerStatus = useSyncServerStatus();
  const newSidebarUIEnabled = useFeatureFlag('newSidebarUI');

  return (
    <Menu
      slot="close"
      onMenuSelect={item => {
        onMenuSelect(item);
      }}
      items={[
        ...(isSorted
          ? [
              {
                name: 'remove-sorting',
                text: t('Remove all sorting'),
              } as const,
            ]
          : []),
        {
          name: 'toggle-net-worth-chart',
          text: showNetWorthChart
            ? t('Hide balance chart')
            : t('Show balance chart'),
        },
        {
          name: 'manage-columns',
          text: t('Manage table columns'),
        },
        ...(newSidebarUIEnabled
          ? [
              {
                name: 'account-group',
                text: t('Set account group'),
              } as const,
            ]
          : []),
        {
          name: 'toggle-reconciled',
          text: showReconciled
            ? t('Hide reconciled transactions')
            : t('Show reconciled transactions'),
        },
        { name: 'export', text: t('Export') },
        ...(account && !account.closed
          ? canSync
            ? [
                {
                  name: 'unlink',
                  text: t('Unlink account'),
                } as const,
              ]
            : syncServerStatus === 'online'
              ? [
                  {
                    name: 'link',
                    text: t('Link account'),
                  } as const,
                ]
              : []
          : []),

        ...(account.closed
          ? [{ name: 'reopen', text: t('Reopen account') } as const]
          : [{ name: 'close', text: t('Close account') } as const]),
      ]}
    />
  );
}

function formatDaysSinceReconciled(lastReconciled: string, t: TFunction) {
  const days = Math.max(
    0,
    differenceInCalendarDays(
      new Date(),
      new Date(parseInt(lastReconciled, 10)),
    ),
  );
  if (days === 0) {
    return t('Today');
  }
  return t('{{count}} days ago', {
    count: days,
    defaultValue_one: '{{count}} day ago',
    defaultValue_other: '{{count}} days ago',
  });
}
