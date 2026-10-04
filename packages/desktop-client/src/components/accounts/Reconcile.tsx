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
import { currentDay } from '@actual-app/core/shared/months';
import type { Query } from '@actual-app/core/shared/query';
import { t } from 'i18next';

import { FinancialText } from '#components/FinancialText';
import { DateSelect } from '#components/select/DateSelect';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';

type ReconcilingMessageProps = {
  balanceQuery: { name: `balance-query-${string}`; query: Query };
  onDone: (targetBalance: number, date: string) => void | Promise<void>;
  onCancel: () => void;
  onCreateTransaction: (
    targetDiff: number,
    date: string,
  ) => void | Promise<void>;
};

type ReconcilingAction = 'done' | 'create-transaction';

type BalanceQuery = ReconcilingMessageProps['balanceQuery'];

// The cleared balance as of `date`: only what Lock would lock counts
export function clearedBalanceCell(balanceQuery: BalanceQuery, date: string) {
  return {
    name: `${balanceQuery.name}-${date}-cleared`,
    query: balanceQuery.query.filter({ cleared: true, date: { $lte: date } }),
  } as const;
}

function useClearedBalance(balanceQuery: BalanceQuery, date: string) {
  return useSheetValue<'balance', `balance-query-${string}-cleared`>({
    ...clearedBalanceCell(balanceQuery, date),
    value: 0,
  });
}

/**
 * Keeps the cleared balance the reconcile panel opens with live in the
 * spreadsheet cache (the screen preload seeds it), so the panel draws the
 * current value straight away instead of waiting on its query.
 */
export function PrewarmReconcileBalance({
  balanceQuery,
}: {
  balanceQuery: BalanceQuery;
}) {
  useClearedBalance(balanceQuery, currentDay());
  return null;
}

export function ReconcilingMessage({
  balanceQuery,
  onDone,
  onCancel,
  onCreateTransaction,
}: ReconcilingMessageProps) {
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const dateInputId = useId();
  const targetInputId = useId();

  const [date, setDate] = useState(currentDay);
  const cleared = useClearedBalance(balanceQuery, date);
  const [inputValue, setInputValue] = useState('');
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

  const clearedBalance = cleared != null ? format(cleared, 'financial') : '—';

  function lock() {
    if (targetDiff === 0 && targetBalance != null && pendingAction === null) {
      void runAction('done', () => onDone(targetBalance, date));
    }
  }

  function formatTarget() {
    if (targetBalance != null) {
      setInputValue(format(targetBalance, 'financial'));
    }
  }
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
            <DateSelect
              id={dateInputId}
              value={date}
              dateFormat={dateFormat}
              onSelect={setDate}
              inputProps={{ style: dateInputStyle }}
            />
          </InitialFocus>
          <label htmlFor={dateInputId} style={formulaLabelStyle}>
            <Trans>Date</Trans>
          </label>
        </View>
        <View style={{ alignItems: 'center' }}>
          <AmountInput
            id={targetInputId}
            value={inputValue}
            minWidthText={format(10000, 'financial')}
            onChangeValue={setInputValue}
            onUpdate={formatTarget}
            onEnter={() => (targetDiff === 0 ? lock() : formatTarget())}
            onEscape={onCancel}
          />
          <label htmlFor={targetInputId} style={formulaLabelStyle}>
            <Trans>Balance</Trans>
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
          onPress={lock}
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
                onCreateTransaction(targetDiff, date),
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

// The input text the date and amount inputs share
const formulaInputTextStyle = {
  ...formulaValueTextStyle,
  fontWeight: 500,
};

// Just wide enough for the widest date format, yyyy-MM-dd (97px of text plus
// padding and border), so picking a date never shifts the formula
const dateInputStyle = {
  ...formulaInputTextStyle,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  padding: '1px 2px',
  color: 'inherit',
  width: 104,
  textAlign: 'center',
} as const;

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
  onEnter: () => void;
  onEscape: () => void;
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
  onEnter,
  onEscape,
  ref,
}: AmountInputProps) {
  const textStyle = {
    ...formulaInputTextStyle,
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
        onEnter={onEnter}
        onEscape={onEscape}
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
