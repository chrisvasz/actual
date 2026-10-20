import React from 'react';

import { styles } from '@actual-app/components/styles';
import {
  format as formatMonth,
  prevMonth,
  sheetForMonth,
} from '@actual-app/core/shared/months';

import { ToBudgetAmount } from '#components/budget/envelope/budgetsummary/ToBudgetAmount';
import { TotalsList } from '#components/budget/envelope/budgetsummary/TotalsList';
import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useCategoriesById } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useUndo } from '#hooks/useUndo';
import { collapseModals, pushModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import { envelopeBudget } from '#spreadsheet/bindings';

type EnvelopeBudgetSummaryModalProps = Extract<
  ModalType,
  { name: 'envelope-budget-summary' }
>['options'];

export function EnvelopeBudgetSummaryModal({
  month,
  onBudgetAction,
}: EnvelopeBudgetSummaryModalProps) {
  const format = useFormat();

  const locale = useLocale();
  const dispatch = useDispatch();
  const prevMonthName = formatMonth(prevMonth(month), 'MMM', locale);
  const sheetValue =
    useEnvelopeSheetValue({
      name: envelopeBudget.toBudget,
      value: 0,
    }) ?? 0;

  const { showUndoNotification } = useUndo();
  const { list: categoriesById } = useCategoriesById();

  const openTransferAvailableModal = () => {
    dispatch(
      pushModal({
        modal: {
          name: 'transfer',
          options: {
            title: 'Transfer to category',
            month,
            amount: sheetValue,
            onSubmit: (amount, toCategoryId) => {
              void onBudgetAction(month, 'transfer-available', {
                amount,
                month,
                category: toCategoryId,
              });
              dispatch(collapseModals({ rootModalName: 'transfer' }));
              showUndoNotification({
                message: `Transferred ${format(amount, 'financial')} to ${categoriesById[toCategoryId].name}`,
              });
            },
          },
        },
      }),
    );
  };

  const openCoverOverbudgetedModal = () => {
    dispatch(
      pushModal({
        modal: {
          name: 'cover',
          options: {
            title: 'Cover overbudgeted',
            month,
            showToBeBudgeted: false,
            amount: sheetValue,
            onSubmit: (amount, categoryId) => {
              void onBudgetAction(month, 'cover-overbudgeted', {
                category: categoryId,
                amount,
              });
              dispatch(collapseModals({ rootModalName: 'cover' }));
              showUndoNotification({
                message: `Covered overbudgeted from ${categoriesById[categoryId].name}`,
              });
            },
          },
        },
      }),
    );
  };

  const onHoldBuffer = () => {
    dispatch(
      pushModal({
        modal: {
          name: 'hold-buffer',
          options: {
            month,
            onSubmit: amount => {
              void onBudgetAction(month, 'hold', { amount });
              dispatch(collapseModals({ rootModalName: 'hold-buffer' }));
            },
          },
        },
      }),
    );
  };

  const onResetHoldBuffer = () => {
    void onBudgetAction(month, 'reset-hold');
  };

  const onClick = ({ close }: { close: () => void }) => {
    dispatch(
      pushModal({
        modal: {
          name: 'envelope-summary-to-budget-menu',
          options: {
            month,
            onTransfer: openTransferAvailableModal,
            onCover: openCoverOverbudgetedModal,
            onResetHoldBuffer: () => {
              onResetHoldBuffer();
              close();
            },
            onHoldBuffer,
            onBudgetAction,
          },
        },
      }),
    );
  };

  return (
    <Modal name="envelope-budget-summary">
      {({ state }) => (
        <>
          <ModalHeader
            title="Budget Summary"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <SheetNameProvider name={sheetForMonth(month)}>
            <TotalsList
              prevMonthName={prevMonthName}
              style={{
                ...styles.mediumText,
              }}
            />
            <ToBudgetAmount
              prevMonthName={prevMonthName}
              style={{
                ...styles.mediumText,
                marginTop: 15,
              }}
              amountStyle={{
                ...styles.underlinedText,
              }}
              onClick={() => onClick({ close: () => state.close() })}
              isTotalsListTooltipDisabled
            />
          </SheetNameProvider>
        </>
      )}
    </Modal>
  );
}
