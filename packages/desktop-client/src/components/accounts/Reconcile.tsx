import React, { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { SvgDelete } from '@actual-app/components/icons/v0';
import { SvgCheckCircle1 } from '@actual-app/components/icons/v2';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { Query } from '@actual-app/core/shared/query';
import { tsToRelativeTime } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { format as formatDate } from 'date-fns';
import { t } from 'i18next';

import { FinancialText } from '#components/FinancialText';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

type ReconcilingMessageProps = {
  balanceQuery: { name: `balance-query-${string}`; query: Query };
  targetBalance: number;
  onDone: () => void | Promise<void>;
  onCreateTransaction: (targetDiff: number) => void | Promise<void>;
};

type ReconcilingAction = 'done' | 'create-transaction';

export function ReconcilingMessage({
  balanceQuery,
  targetBalance,
  onDone,
  onCreateTransaction,
}: ReconcilingMessageProps) {
  const cleared =
    useSheetValue<'balance', `balance-query-${string}-cleared`>({
      name: (balanceQuery.name +
        '-cleared') as `balance-query-${string}-cleared`,
      value: 0,
      query: balanceQuery.query.filter({ cleared: true }),
    }) ?? 0;
  const format = useFormat();
  const targetDiff = targetBalance - cleared;

  const [pendingAction, setPendingAction] = useState<ReconcilingAction | null>(
    null,
  );

  async function runAction(
    action: ReconcilingAction,
    perform: () => void | Promise<void>,
  ) {
    setPendingAction(action);
    try {
      await perform();
    } finally {
      setPendingAction(null);
    }
  }

  const clearedBalance = format(cleared, 'financial');
  const bankBalance = format(targetBalance, 'financial');
  const difference =
    (targetDiff > 0 ? '+' : '') + format(targetDiff, 'financial');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: theme.tableBackground,
        ...styles.shadow,
        borderRadius: 4,
        marginTop: 5,
        marginBottom: 15,
        padding: '8px 10px',
        gap: 15,
      }}
    >
      {targetDiff === 0 ? (
        <View
          style={{
            color: theme.noticeTextLight,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <SvgCheckCircle1
            style={{
              width: 13,
              height: 13,
              color: 'inherit',
              marginRight: 3,
            }}
          />
          <Trans>All reconciled!</Trans>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            color: theme.tableText,
          }}
        >
          <FormulaTerm label={t('Target')} value={bankBalance} />
          <FormulaOperator>−</FormulaOperator>
          <FormulaTerm label={t('Cleared')} value={clearedBalance} />
          <FormulaOperator>=</FormulaOperator>
          <FormulaTerm
            label={t('Difference')}
            value={difference}
            isEmphasized
          />
        </View>
      )}
      {targetDiff === 0 ? (
        <ButtonWithLoading
          variant="primary"
          isLoading={pendingAction === 'done'}
          isDisabled={pendingAction !== null}
          onPress={() => void runAction('done', onDone)}
        >
          <Trans>Lock transactions</Trans>
        </ButtonWithLoading>
      ) : (
        <>
          <ButtonWithLoading
            variant="primary"
            isLoading={pendingAction === 'create-transaction'}
            isDisabled={pendingAction !== null}
            onPress={() =>
              void runAction('create-transaction', () =>
                onCreateTransaction(targetDiff),
              )
            }
          >
            <Trans>Adjust</Trans>
          </ButtonWithLoading>
          <ButtonWithLoading
            variant="bare"
            aria-label={t('Exit reconciliation')}
            isLoading={pendingAction === 'done'}
            isDisabled={pendingAction !== null}
            onPress={() => void runAction('done', onDone)}
            style={{ padding: 8, marginLeft: -6 }}
          >
            <SvgDelete style={{ width: 10, height: 10 }} />
          </ButtonWithLoading>
        </>
      )}
    </View>
  );
}

type FormulaTermProps = {
  label: string;
  value: string;
  isEmphasized?: boolean;
};

function FormulaTerm({ label, value, isEmphasized }: FormulaTermProps) {
  return (
    <View style={{ alignItems: 'center' }}>
      <FinancialText
        style={{
          fontSize: 15,
          fontWeight: isEmphasized ? 700 : 500,
        }}
      >
        {value}
      </FinancialText>
      <Text style={{ fontSize: 11, color: theme.pageTextLight }}>{label}</Text>
    </View>
  );
}

function FormulaOperator({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 15, color: theme.pageTextLight }}>{children}</Text>
  );
}

type ReconcileMenuProps = {
  account: AccountEntity;
  onReconcile: (amount: number | null) => void;
  onClose: () => void;
};

export function ReconcileMenu({
  account,
  onReconcile,
  onClose,
}: ReconcileMenuProps) {
  const balanceQuery = bindings.accountBalance(account.id);
  const clearedBalance = useSheetValue<'account', `balance-${string}-cleared`>({
    name: (balanceQuery.name + '-cleared') as `balance-${string}-cleared`,
    value: null,
    query: balanceQuery.query.filter({ cleared: true }),
  });
  const lastSyncedBalance = account.balance_current;
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();

  const [inputValue, setInputValue] = useState<string | null>();
  // useEffect is needed here. clearedBalance does not work as a default value for inputValue and
  // to use a button to update inputValue we can't use defaultValue in the input form below
  useEffect(() => {
    if (clearedBalance != null) {
      setInputValue(format(clearedBalance, 'financial'));
    }
  }, [clearedBalance, format]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (inputValue === '') {
      return;
    }

    const amount =
      inputValue != null
        ? format.fromEdit(inputValue, clearedBalance)
        : clearedBalance;

    onReconcile(amount);
    onClose();
  }

  return (
    <Form onSubmit={onSubmit}>
      <View style={{ padding: '5px 8px' }}>
        <Text style={{ fontWeight: 700 }}>
          <Trans>Target balance</Trans>
        </Text>
        {inputValue != null && (
          <InitialFocus>
            <Input
              value={inputValue}
              onChangeValue={setInputValue}
              style={{ margin: '7px 0', textAlign: 'right' }}
            />
          </InitialFocus>
        )}
        {lastSyncedBalance != null && (
          <View>
            <Text style={{ margin: '0 6px 8px 0', textAlign: 'right' }}>
              <Trans>Last Balance from Bank: </Trans>
              {format(lastSyncedBalance, 'financial')}
            </Text>
            <Button
              onPress={() =>
                setInputValue(format(lastSyncedBalance, 'financial'))
              }
              style={{ marginBottom: 7 }}
            >
              <Trans>Use last synced total</Trans>
            </Button>
          </View>
        )}
        <Button type="submit" variant="primary">
          <Trans>Reconcile</Trans>
        </Button>
        <Text
          style={{
            color: theme.pageTextLight,
            marginTop: '8px',
            textAlign: 'center',
          }}
        >
          {account?.last_reconciled
            ? t('Reconciled {{ relativeTimeAgo }} ({{ absoluteDate }})', {
                relativeTimeAgo: tsToRelativeTime(
                  account.last_reconciled,
                  locale,
                ),
                absoluteDate: formatDate(
                  new Date(parseInt(account.last_reconciled ?? '0', 10)),
                  dateFormat,
                  { locale },
                ),
              })
            : t('Not yet reconciled')}
        </Text>
      </View>
    </Form>
  );
}
