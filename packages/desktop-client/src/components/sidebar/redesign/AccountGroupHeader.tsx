import { useContext, useState } from 'react';
import {
  Button,
  TreeItem,
  TreeItemContent,
  TreeStateContext,
} from 'react-aria-components';

import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import type {
  AccountEntity,
  AccountGroupEntity,
} from '@actual-app/core/types/models';
import { css } from '@emotion/css';

import {
  useDeleteAccountGroupMutation,
  useUpdateAccountGroupMutation,
} from '#account-groups';
import { useContextMenu } from '#hooks/useContextMenu';
import { usePendingValue } from '#hooks/usePendingValue';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import * as bindings from '#spreadsheet/bindings';

import { AccountRow } from './AccountRow';
import { CollapseChevron } from './CollapseChevron';
import { CountPill } from './CountPill';
import { DragHandle } from './DragHandle';
import { SidebarBalance } from './SidebarBalance';
import { dropZoneStyle, groupLabelStyle } from './styles';
import { treeKeys } from './treeKeys';
import { useSidebarBalanceMode } from './useSidebarBalanceMode';

type AccountGroupHeaderProps = {
  group: AccountGroupEntity;
  side: 'on' | 'off';
  accounts: AccountEntity[];
  isDropZoneActive: boolean;
};

export function AccountGroupHeader({
  group,
  side,
  accounts,
  isDropZoneActive,
}: AccountGroupHeaderProps) {
  const [balanceMode] = useSidebarBalanceMode();
  const dispatch = useDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const updateGroup = useUpdateAccountGroupMutation();
  const { valueOr: pendingNameOr, showUntil: showNameUntil } =
    usePendingValue<string>();
  const name = pendingNameOr(group.name);
  const deleteGroup = useDeleteAccountGroupMutation();

  const [rowElement, setRowElement] = useState<HTMLDivElement | null>(null);
  useContextMenu({
    triggerRef: { current: rowElement },
    items: [
      {
        name: 'account-group-rename',
        text: 'Rename group',
        onClick: () => setIsEditing(true),
      },
      {
        name: 'account-group-delete',
        text: 'Delete group',
        onClick: () =>
          dispatch(
            pushModal({
              modal: {
                name: 'confirm-delete',
                options: {
                  message: `Are you sure you want to delete the group "${group.name}"? Any accounts in it will be kept but left ungrouped.`,
                  onConfirm: () => deleteGroup.mutate({ id: group.id }),
                },
              },
            }),
          ),
      },
    ],
  });

  const treeState = useContext(TreeStateContext);
  const key = treeKeys.group(group.id);

  return (
    <TreeItem
      ref={setRowElement}
      id={key}
      textValue={name}
      onAction={() => treeState?.toggleKey(key)}
      className={css({
        outline: 'none',
        borderRadius: radius.sm,
        marginBottom: spacing.xxs,
        ...(isDropZoneActive && dropZoneStyle),
        '&[data-dragging]': { opacity: 0.5 },
      })}
    >
      <TreeItemContent>
        {({ isExpanded }) => (
          <View
            className={css({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs,
              paddingBlock: spacing.xs,
              paddingLeft: spacing.xs,
              paddingRight: spacing.sm,
              borderRadius: radius.sm,
              cursor: 'pointer',
              '[data-hovered] > &, [data-focus-visible] > &': {
                backgroundColor: theme.sidebarItemBackgroundHover,
              },
            })}
          >
            <Button
              slot="chevron"
              aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}
              className={css({
                display: 'flex',
                alignItems: 'center',
                padding: spacing.xxs,
                border: 'none',
                background: 'none',
                color: 'inherit',
                cursor: 'pointer',
                outline: 'none',
              })}
            >
              <CollapseChevron isOpen={isExpanded} />
            </Button>
            {isEditing ? (
              <InitialFocus>
                <Input
                  aria-label="Group name"
                  style={{ flex: 1, padding: 0, fontSize: 12 }}
                  defaultValue={name}
                  onKeyDown={e => e.stopPropagation()}
                  onEnter={newGroupName => {
                    if (newGroupName.trim() !== '') {
                      showNameUntil(
                        newGroupName,
                        updateGroup.mutateAsync({
                          id: group.id,
                          name: newGroupName,
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
              <>
                <Text style={{ ...groupLabelStyle, ...styles.ellipsisText }}>
                  {name}
                </Text>
                {!isExpanded && <CountPill count={accounts.length} />}
                <View style={{ flex: 1 }} />
                <SidebarBalance
                  binding={bindings.accountGroupBalanceByMode(
                    group.id,
                    side === 'off',
                    balanceMode,
                  )}
                  style={{ fontSize: 11, color: groupLabelStyle.color }}
                />
              </>
            )}
            <DragHandle />
          </View>
        )}
      </TreeItemContent>
      {accounts.map(account => (
        <AccountRow key={treeKeys.account(account.id)} account={account} />
      ))}
    </TreeItem>
  );
}
