// @ts-strict-ignore
import React, { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Form } from 'react-aria-components';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Paragraph } from '@actual-app/components/paragraph';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';

import { useCloseAccount } from '#accounts';
import { AccountAutocomplete } from '#components/autocomplete/AccountAutocomplete';
import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { Link } from '#components/common/Link';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { pushModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

function needsCategory(
  account: AccountEntity,
  currentTransfer: string,
  accounts: AccountEntity[],
) {
  const acct = accounts.find(a => a.id === currentTransfer);
  const isOffBudget = acct && acct.offbudget === 1;

  // The user must select a category if transferring from a budgeted
  // account to an off budget account
  return account.offbudget === 0 && isOffBudget;
}

type CloseAccountModalProps = Extract<
  ModalType,
  { name: 'close-account' }
>['options'];

export function CloseAccountModal({
  account,
  balance,
  canDelete,
}: CloseAccountModalProps) {
  const allAccounts = useAccounts();
  const accounts = allAccounts.filter(a => a.closed === 0);
  const { grouped: categoryGroups, list: categories } = useCategories();
  const [loading, setLoading] = useState(false);
  const [transferAccountId, setTransferAccountId] = useState('');
  const transferAccount = accounts.find(a => a.id === transferAccountId);
  const [categoryId, setCategoryId] = useState('');
  const category = categories.find(c => c.id === categoryId);

  const [transferError, setTransferError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const dispatch = useDispatch();
  const { isNarrowWidth } = useResponsive();

  const onSelectAccount = accId => {
    setTransferAccountId(accId);
    if (transferError && accId) {
      setTransferError(false);
    }
  };

  const onSelectCategory = catId => {
    setCategoryId(catId);
    if (categoryError && catId) {
      setCategoryError(false);
    }
  };

  const narrowStyle: CSSProperties = isNarrowWidth
    ? {
        userSelect: 'none',
        height: styles.mobileMinHeight,
        ...styles.mediumText,
      }
    : {};

  const closeAccount = useCloseAccount();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const transferError = balance !== 0 && !transferAccountId;
    setTransferError(transferError);

    const categoryError =
      needsCategory(account, transferAccountId, accounts) && !categoryId;
    setCategoryError(categoryError);

    if (transferError || categoryError) {
      return false;
    }

    setLoading(true);

    void closeAccount({
      id: account.id,
      transferAccountId: transferAccountId || null,
      categoryId: categoryId || null,
    });

    return true;
  };

  return (
    <Modal
      name="close-account"
      isLoading={loading}
      containerProps={{ style: { width: '30vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title="Close Account"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View>
            <Paragraph>
              Are you sure you want to close <strong>{account.name}</strong>?{' '}
              {canDelete ? (
                <span>
                  This account has no transactions so it will be permanently
                  deleted.
                </span>
              ) : (
                <span>
                  This account has transactions so we can't permanently delete
                  it.
                </span>
              )}
            </Paragraph>
            <Form
              onSubmit={e => {
                if (onSubmit(e)) {
                  state.close();
                }
              }}
            >
              {balance !== 0 && (
                <View>
                  <Paragraph>
                    This account has a balance of{' '}
                    <strong>{integerToCurrency(balance)}</strong>. To close this
                    account, select a different account to transfer this balance
                    to:
                  </Paragraph>

                  <View style={{ marginBottom: 15 }}>
                    <AccountAutocomplete
                      includeClosedAccounts={false}
                      hiddenAccounts={[account.id]}
                      value={transferAccountId}
                      inputProps={{
                        placeholder: 'Select account...',
                        autoFocus: true,
                        ...(isNarrowWidth && {
                          value: transferAccount?.name || '',
                          style: {
                            ...narrowStyle,
                          },
                          onClick: () => {
                            dispatch(
                              pushModal({
                                modal: {
                                  name: 'account-autocomplete',
                                  options: {
                                    includeClosedAccounts: false,
                                    hiddenAccounts: [account.id],
                                    onSelect: onSelectAccount,
                                  },
                                },
                              }),
                            );
                          },
                        }),
                      }}
                      onSelect={onSelectAccount}
                    />
                  </View>

                  {transferError && (
                    <FormError style={{ marginBottom: 15 }}>
                      Transfer is required
                    </FormError>
                  )}

                  {needsCategory(account, transferAccountId, accounts) && (
                    <View style={{ marginBottom: 15 }}>
                      <Paragraph>
                        Since you are transferring the balance from an on budget
                        account to an off budget account, this transaction must
                        be categorized. Select a category:
                      </Paragraph>

                      <CategoryAutocomplete
                        categoryGroups={categoryGroups}
                        value={categoryId}
                        inputProps={{
                          placeholder: 'Select category...',
                          ...(isNarrowWidth && {
                            value: category?.name || '',
                            style: {
                              ...narrowStyle,
                            },
                            onClick: () => {
                              dispatch(
                                pushModal({
                                  modal: {
                                    name: 'category-autocomplete',
                                    options: {
                                      categoryGroups,
                                      showHiddenCategories: true,
                                      onSelect: onSelectCategory,
                                    },
                                  },
                                }),
                              );
                            },
                          }),
                        }}
                        onSelect={onSelectCategory}
                      />

                      {categoryError && (
                        <FormError>Category is required</FormError>
                      )}
                    </View>
                  )}
                </View>
              )}

              {!canDelete && (
                <View style={{ marginBottom: 15 }}>
                  <Text style={{ fontSize: 12 }}>
                    You can also{' '}
                    <Link
                      variant="text"
                      onClick={() => {
                        setLoading(true);
                        void closeAccount({
                          id: account.id,
                          forced: true,
                        });
                        state.close();
                      }}
                      style={{ color: theme.errorText }}
                    >
                      force close
                    </Link>{' '}
                    the account which will delete it and all its transactions
                    permanently. Doing so may change your budget unexpectedly
                    since money in it may vanish.
                  </Text>
                </View>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
              >
                <Button
                  style={{
                    marginRight: 10,
                    height: isNarrowWidth ? styles.mobileMinHeight : undefined,
                  }}
                  onPress={() => state.close()}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  style={{
                    height: isNarrowWidth ? styles.mobileMinHeight : undefined,
                  }}
                >
                  Close Account
                </Button>
              </View>
            </Form>
          </View>
        </>
      )}
    </Modal>
  );
}
