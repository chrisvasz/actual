import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronDown,
  SvgCheveronUp,
} from '@actual-app/components/icons/v1';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { amountToInteger, integerToAmount } from '@actual-app/core/shared/util';

import { AmountInput } from '#components/amount/AmountInput';
import { BudgetMenu } from '#components/budget/tracking/BudgetMenu';
import { useTrackingSheetValue } from '#components/budget/tracking/TrackingBudgetComponents';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { useCategory } from '#hooks/useCategory';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { trackingBudget } from '#spreadsheet/bindings';

type TrackingBudgetMenuModalProps = Extract<
  ModalType,
  { name: 'tracking-budget-menu' }
>['options'];

export function TrackingBudgetMenuModal({
  categoryId,
  onUpdateBudget,
  onCopyLastMonthAverage,
  onSetMonthsAverage,
  onApplyBudgetTemplate,
  onCopyUntilYearEnd,
}: TrackingBudgetMenuModalProps) {
  const defaultMenuItemStyle: CSSProperties = {
    ...styles.mobileMenuItem,
    color: theme.menuItemText,
    borderRadius: 0,
    borderTop: `1px solid ${theme.pillBorder}`,
  };

  const buttonStyle: CSSProperties = {
    ...styles.mediumText,
    height: styles.mobileMinHeight,
    color: theme.formLabelText,
    // Adjust based on desired number of buttons per row.
    flexBasis: '100%',
  };
  const budgeted = useTrackingSheetValue(
    trackingBudget.catBudgeted(categoryId),
  );
  const { data: category } = useCategory(categoryId);
  const mobileCalculatorEnabled = useFeatureFlag('mobileCalculator');

  const _onUpdateBudget = (amount: number) => {
    onUpdateBudget?.(amountToInteger(amount));
  };

  const [showMore, setShowMore] = useState(false);

  const onShowMore = () => {
    setShowMore(!showMore);
  };

  if (!category) {
    return null;
  }

  return (
    <Modal
      name="tracking-budget-menu"
      wrapperProps={{
        style: mobileCalculatorEnabled ? { paddingBottom: '30vh' } : undefined,
      }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={<ModalTitle title={category.name} shrinkOnOverflow />}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: 400,
              }}
            >
              <Trans>Budgeted</Trans>
            </Text>
            <AmountInput
              value={integerToAmount(budgeted || 0)}
              onEnter={() => state.close()}
              onChange={_onUpdateBudget}
              data-testid="budget-amount"
              autoFocus
              autoFocusDelay={150}
              variant="large"
            />
          </View>
          <View>
            <Button variant="bare" style={buttonStyle} onPress={onShowMore}>
              {!showMore ? (
                <SvgCheveronUp
                  width={30}
                  height={30}
                  style={{ paddingRight: 5 }}
                />
              ) : (
                <SvgCheveronDown
                  width={30}
                  height={30}
                  style={{ paddingRight: 5 }}
                />
              )}
              <Trans>Actions</Trans>
            </Button>
          </View>
          {showMore && (
            <BudgetMenu
              getItemStyle={() => defaultMenuItemStyle}
              onCopyLastMonthAverage={onCopyLastMonthAverage}
              onSetMonthsAverage={onSetMonthsAverage}
              onApplyBudgetTemplate={onApplyBudgetTemplate}
              onCopyUntilYearEnd={onCopyUntilYearEnd}
            />
          )}
        </>
      )}
    </Modal>
  );
}
