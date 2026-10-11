import { useState } from 'react';
import { TreeItem, TreeItemContent } from 'react-aria-components';
import { useLocation } from 'react-router';

import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import { useReopenAccountMutation, useUpdateAccountMutation } from '#accounts';
import { useContextMenu } from '#hooks/useContextMenu';
import { usePendingValue } from '#hooks/usePendingValue';
import { useUpdatedAccounts } from '#hooks/useUpdatedAccounts';
import { openAccountCloseModal, pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import * as bindings from '#spreadsheet/bindings';
import { isTouchDevice } from '#util/isTouchDevice';

import { DragHandle } from './DragHandle';
import { SidebarBalance } from './SidebarBalance';
import { treeKeys } from './treeKeys';
import { useSidebarBalanceMode } from './useSidebarBalanceMode';

type AccountRowProps = {
  account: AccountEntity;
  isClosed?: boolean;
};

export function AccountRow({ account, isClosed }: AccountRowProps) {
  const [balanceMode] = useSidebarBalanceMode();
  const dispatch = useDispatch();
  const location = useLocation();
  const updatedAccounts = useUpdatedAccounts();
  const isUpdated = !isClosed && updatedAccounts.includes(account.id);
  const [isEditing, setIsEditing] = useState(false);
  const href = `/accounts/${account.id}`;
  const isActive = location.pathname === href;

  const reopenAccount = useReopenAccountMutation();
  const updateAccount = useUpdateAccountMutation();
  const { valueOr: pendingNameOr, showUntil: showNameUntil } =
    usePendingValue<string>();
  const name = pendingNameOr(account.name);

  const [rowElement, setRowElement] = useState<HTMLDivElement | null>(null);
  useContextMenu({
    triggerRef: { current: rowElement },
    enabled: !isTouchDevice(),
    items: [
      {
        name: 'account-rename',
        text: 'Rename',
        onClick: () => setIsEditing(true),
      },
      isClosed
        ? {
            name: 'account-reopen',
            text: 'Reopen',
            onClick: () => reopenAccount.mutate({ id: account.id }),
          }
        : {
            name: 'account-close',
            text: 'Close',
            onClick: () =>
              dispatch(openAccountCloseModal({ accountId: account.id })),
          },
      {
        name: 'account-group',
        text: 'Set account group',
        onClick: () =>
          dispatch(
            pushModal({
              modal: {
                name: 'account-groups',
                options: { accountId: account.id },
              },
            }),
          ),
      },
    ],
  });

  return (
    <TreeItem
      ref={setRowElement}
      id={treeKeys.account(account.id)}
      textValue={name}
      href={isEditing ? undefined : href}
      onAuxClick={e => {
        if (e.button === 1 && !isEditing) {
          window.open(href, '_blank');
        }
      }}
      className={css({
        outline: 'none',
        borderRadius: radius.sm,
        cursor: 'pointer',
        color: isClosed ? theme.sidebarTextMuted : theme.sidebarItemText,
        ...(isUpdated && {
          fontWeight: 700,
          color: theme.sidebarItemTextUpdated,
        }),
        ...(isActive && {
          backgroundColor: theme.sidebarItemBackgroundSelected,
          color: theme.sidebarItemTextSelected,
          fontWeight: 'normal',
        }),
        '&[data-hovered], &[data-focus-visible]': {
          backgroundColor: isActive
            ? theme.sidebarItemBackgroundSelected
            : theme.sidebarItemBackgroundHover,
        },
        '&[data-dragging]': { opacity: 0.5 },
      })}
    >
      <TreeItemContent>
        {({ level }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingBlock: spacing.xs,
              paddingRight: spacing.sm,
              paddingLeft: level > 1 ? spacing.xs + spacing.sm : spacing.xs,
              fontSize: 13,
              textDecoration: isClosed ? 'line-through' : 'none',
            }}
          >
            <View style={{ width: spacing.lg, flexShrink: 0 }} />
            {isEditing ? (
              <InitialFocus>
                <Input
                  aria-label="Account name"
                  style={{ flex: 1, padding: 0, fontSize: 13 }}
                  defaultValue={name}
                  onKeyDown={e => e.stopPropagation()}
                  onEnter={newAccountName => {
                    if (newAccountName.trim() !== '') {
                      showNameUntil(
                        newAccountName,
                        updateAccount.mutateAsync({
                          account: { id: account.id, name: newAccountName },
                        }),
                      );
                    }
                    setIsEditing(false);
                  }}
                  onEscape={() => setIsEditing(false)}
                  onBlur={() => setIsEditing(false)}
                />
              </InitialFocus>
            ) : (
              <Text style={{ flex: 1, ...styles.ellipsisText }}>{name}</Text>
            )}
            <SidebarBalance
              binding={bindings.accountBalanceByMode(account.id, balanceMode)}
              style={{
                fontSize: 12,
                color: 'inherit',
                marginLeft: spacing.xs,
              }}
            />
            <DragHandle />
          </View>
        )}
      </TreeItemContent>
    </TreeItem>
  );
}
