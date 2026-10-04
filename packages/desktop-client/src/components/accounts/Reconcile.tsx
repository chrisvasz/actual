import React, { useId, useState } from 'react';
import type { Ref } from 'react';
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
import { t } from 'i18next';

import { FinancialText } from '#components/FinancialText';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';

type ReconcilingMessageProps = {
  balanceQuery: { name: `balance-query-${string}`; query: Query };
  onDone: (targetBalance: number | null) => void | Promise<void>;
  onCancel: () => void;
  onCreateTransaction: (targetDiff: number) => void | Promise<void>;
};

type ReconcilingAction = 'done' | 'create-transaction';

type BalanceQuery = ReconcilingMessageProps['balanceQuery'];

function useClearedBalance(balanceQuery: BalanceQuery) {
  return useSheetValue<'balance', `balance-query-${string}-cleared`>({
    name: `${balanceQuery.name}-cleared`,
    value: 0,
    query: balanceQuery.query.filter({ cleared: true }),
  });
}

/**
 * Computes the cleared balance the reconcile panel opens with ahead of time,
 * so the panel can read it from the spreadsheet cache and draw it straight
 * away instead of flashing 0.00 while the query runs.
 */
export function PrewarmReconcileBalance({
  balanceQuery,
}: {
  balanceQuery: BalanceQuery;
}) {
  useClearedBalance(balanceQuery);
  return null;
}

export function ReconcilingMessage({
  balanceQuery,
  onDone,
  onCancel,
  onCreateTransaction,
}: ReconcilingMessageProps) {
  const format = useFormat();
  const targetInputId = useId();

  const cleared = useClearedBalance(balanceQuery);

  const [inputValue, setInputValue] = useState(() => format(0, 'financial'));
  const targetBalance =
    inputValue.trim() !== '' ? format.fromEdit(inputValue) : null;
  const targetDiff =
    targetBalance != null && cleared != null ? targetBalance - cleared : null;

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

  const clearedBalance = format(cleared ?? 0, 'financial');
  const difference =
    targetDiff != null
      ? (targetDiff > 0 ? '+' : '') + format(targetDiff, 'financial')
      : '—';

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
        padding: '6px 8px',
        gap: 15,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ alignItems: 'center' }}>
          <InitialFocus>
            <AmountInput
              id={targetInputId}
              value={inputValue}
              minWidthText={format(10000, 'financial')}
              onChangeValue={setInputValue}
              onUpdate={() => {
                if (targetBalance != null) {
                  setInputValue(format(targetBalance, 'financial'));
                }
              }}
            />
          </InitialFocus>
          <label htmlFor={targetInputId} style={formulaLabelStyle}>
            <Trans>Target</Trans>
          </label>
        </View>
        <FormulaOperator>−</FormulaOperator>
        <FormulaTerm label={t('Cleared')} value={clearedBalance} />
        <FormulaOperator>=</FormulaOperator>
        <FormulaTerm
          label={t('Difference')}
          value={difference}
          isEmphasized
          isReconciled={targetDiff === 0}
        />
      </View>
      {targetDiff === 0 ? (
        <ButtonWithLoading
          variant="primary"
          isLoading={pendingAction === 'done'}
          isDisabled={pendingAction !== null}
          onPress={() => void runAction('done', () => onDone(targetBalance))}
        >
          <Trans>Lock</Trans>
        </ButtonWithLoading>
      ) : (
        <ButtonWithLoading
          variant="normal"
          isLoading={pendingAction === 'create-transaction'}
          isDisabled={pendingAction !== null || targetDiff == null}
          onPress={() => {
            if (targetDiff != null) {
              void runAction('create-transaction', () =>
                onCreateTransaction(targetDiff),
              );
            }
          }}
        >
          <Trans>Adjust</Trans>
        </ButtonWithLoading>
      )}
      <Button
        variant="bare"
        aria-label={t('Exit reconciliation')}
        isDisabled={pendingAction !== null}
        onPress={onCancel}
        style={{ padding: 8, marginLeft: -6 }}
      >
        <SvgDelete style={{ width: 10, height: 10 }} />
      </Button>
    </View>
  );
}

// Numbers in the formula share one box so the editable target lines up with
// the read-only terms, labels included
const formulaValueTextStyle = {
  fontSize: 15,
  lineHeight: '20px',
  ...styles.tnum,
};

const formulaValueBoxStyle = {
  padding: '1px 0',
  border: '1px solid transparent',
};

const formulaLabelStyle = {
  fontSize: 11,
  color: theme.pageTextLight,
};

type AmountInputProps = {
  id: string;
  value: string;
  minWidthText: string;
  onChangeValue: (value: string) => void;
  onUpdate: () => void;
  ref?: Ref<HTMLInputElement>;
};

// An input exactly as wide as its value (but never narrower than
// `minWidthText`): hidden copies of the text size a grid cell the input fills
function AmountInput({
  id,
  value,
  minWidthText,
  onChangeValue,
  onUpdate,
  ref,
}: AmountInputProps) {
  const textStyle = {
    ...formulaValueTextStyle,
    fontWeight: 500,
    gridArea: '1 / 1',
  };
  // Same box as the input's (its border sits right against the digits)
  const sizerStyle = {
    ...textStyle,
    ...formulaValueBoxStyle,
    paddingLeft: 2,
    paddingRight: 2,
    visibility: 'hidden',
    whiteSpace: 'pre',
  } as const;

  return (
    <div style={{ display: 'inline-grid' }}>
      {[value, minWidthText].map((text, i) => (
        <span key={i} aria-hidden style={sizerStyle}>
          {text}
        </span>
      ))}
      <Input
        ref={ref}
        id={id}
        value={value}
        // Drop the browser's default ~20 character width so the sizers alone
        // decide how wide the input is
        size={1}
        onChangeValue={onChangeValue}
        onUpdate={onUpdate}
        // No inline border: the default input class supplies it, and its
        // focus state could not recolor an inline one
        style={{
          ...textStyle,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          padding: '0 2px',
          color: 'inherit',
          width: '100%',
          minWidth: 0,
          textAlign: 'right',
        }}
      />
    </div>
  );
}

type FormulaTermProps = {
  label: string;
  value: string;
  isEmphasized?: boolean;
  isReconciled?: boolean;
};

function FormulaTerm({
  label,
  value,
  isEmphasized,
  isReconciled,
}: FormulaTermProps) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          ...formulaValueBoxStyle,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          color: isReconciled ? theme.noticeText : undefined,
        }}
      >
        <FinancialText
          style={{
            ...formulaValueTextStyle,
            fontWeight: isEmphasized ? 700 : 500,
          }}
        >
          {value}
        </FinancialText>
        {isReconciled && (
          <SvgCheckCircle1
            aria-label={t('Reconciled')}
            style={{ width: 11, height: 11, color: 'inherit' }}
          />
        )}
      </View>
      <Text style={formulaLabelStyle}>{label}</Text>
    </View>
  );
}

function FormulaOperator({ children }: { children: string }) {
  return (
    <Text
      style={{
        ...formulaValueTextStyle,
        ...formulaValueBoxStyle,
        color: theme.pageTextLight,
      }}
    >
      {children}
    </Text>
  );
}
