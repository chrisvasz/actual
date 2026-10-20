// @ts-strict-ignore
import React, { useState } from 'react';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useCategories } from '#hooks/useCategories';
import type { Modal as ModalType } from '#modals/modalsSlice';

type ConfirmCategoryDeleteModalProps = Extract<
  ModalType,
  { name: 'confirm-category-delete' }
>['options'];

export function ConfirmCategoryDeleteModal({
  group: groupId,
  category: categoryId,
  onDelete,
}: ConfirmCategoryDeleteModalProps) {
  const [transferCategory, setTransferCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { grouped: categoryGroups, list: categories } = useCategories();
  const group = categoryGroups.find(g => g.id === groupId);
  const category = categories.find(c => c.id === categoryId);

  const renderError = (error: string) => {
    let msg: string;

    switch (error) {
      case 'required-transfer':
        msg = 'You must select a category';
        break;
      default:
        msg = 'Something bad happened, sorry!';
    }

    return (
      <Text
        style={{
          marginTop: 15,
          color: theme.errorText,
        }}
      >
        {msg}
      </Text>
    );
  };

  const isIncome = !!(category || group).is_income;

  return (
    <Modal
      name="confirm-category-delete"
      containerProps={{ style: { width: '30vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title="Confirm Delete"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ lineHeight: 1.5 }}>
            {group ? (
              <Block>
                {!isIncome ? (
                  <>
                    Categories in the group <strong>{group.name}</strong> are
                    used by existing transactions.
                  </>
                ) : (
                  <>
                    Categories in the group <strong>{group.name}</strong> are
                    used by existing transactions or it has a positive leftover
                    balance currently.
                  </>
                )}
                <strong>Are you sure you want to delete it?</strong> If so, you
                must select another category to transfer existing transactions
                and balance to.
              </Block>
            ) : (
              <Block>
                {!isIncome ? (
                  <>
                    <strong>{category.name}</strong> is used by existing
                    transactions.
                  </>
                ) : (
                  <>
                    <strong>{category.name}</strong> is used by existing
                    transactions or it has a positive leftover balance
                    currently.
                  </>
                )}
                <strong>Are you sure you want to delete it?</strong> If so, you
                must select another category to transfer existing transactions
                and balance to.
              </Block>
            )}

            {error && renderError(error)}

            <View
              style={{
                marginTop: 20,
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
              }}
            >
              <Text>Transfer to:</Text>

              <View style={{ flex: 1, marginLeft: 10, marginRight: 30 }}>
                <CategoryAutocomplete
                  categoryGroups={
                    group
                      ? categoryGroups.filter(
                          g => g.id !== group.id && !!g.is_income === isIncome,
                        )
                      : categoryGroups
                          .filter(g => !!g.is_income === isIncome)
                          .map(g => ({
                            ...g,
                            categories: g.categories.filter(
                              c => c.id !== category.id,
                            ),
                          }))
                  }
                  value={transferCategory}
                  focused
                  inputProps={{
                    placeholder: 'Select category...',
                  }}
                  onSelect={category => setTransferCategory(category)}
                  showHiddenCategories
                />
              </View>

              <Button
                variant="primary"
                onPress={() => {
                  if (!transferCategory) {
                    setError('required-transfer');
                  } else {
                    onDelete(transferCategory);
                    state.close();
                  }
                }}
              >
                Delete
              </Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
