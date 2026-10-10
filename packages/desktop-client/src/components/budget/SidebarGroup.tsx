// @ts-strict-ignore
import React, { useRef } from 'react';
import type { CSSProperties, RefCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgAdd, SvgExpandArrow } from '@actual-app/components/icons/v0';
import { Menu } from '@actual-app/components/menu';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';
import { css, cx } from '@emotion/css';

import { NotesButton } from '#components/NotesButton';
import { InputCell } from '#components/table';
import { useContextMenu } from '#hooks/useContextMenu';
import { usePendingValue } from '#hooks/usePendingValue';

import { CATEGORY_COLUMN_CLASS } from './categoryColumnStyles';

type SidebarGroupProps = {
  group: CategoryGroupEntity;
  editing?: boolean;
  collapsed: boolean;
  dragPreview?: boolean;
  innerRef?: RefCallback<HTMLDivElement>;
  style?: CSSProperties;
  onEdit?: (id: CategoryGroupEntity['id']) => void;
  onSave?: (group: CategoryGroupEntity) => Promise<void>;
  onDelete?: (id: CategoryGroupEntity['id']) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onShowNewCategory?: (groupId: CategoryGroupEntity['id']) => void;
  onHideNewGroup?: () => void;
  onToggleCollapse?: (id: CategoryGroupEntity['id']) => void;
};

export function SidebarGroup({
  group,
  editing,
  collapsed,
  dragPreview,
  innerRef,
  style,
  onEdit,
  onSave,
  onDelete,
  onSortCategories,
  onShowNewCategory,
  onHideNewGroup,
  onToggleCollapse,
}: SidebarGroupProps) {
  const { t } = useTranslation();

  const temporary = group.id === 'new';
  const { valueOr: pendingNameOr, showUntil: showNameUntil } =
    usePendingValue<string>();
  const name = pendingNameOr(group.name);
  const canSortCategories =
    !!onSortCategories && (group.categories?.length ?? 0) > 1;
  const triggerRef = useRef(null);
  const { handleContextMenu } = useContextMenu({
    triggerRef,
    items: [
      onEdit && {
        name: 'rename',
        text: t('Rename'),
        onClick: () => onEdit(group.id),
      },
      onSave && {
        name: 'toggle-visibility',
        text: group.hidden ? t('Show') : t('Hide'),
        // Send the displayed name so a rename still saving isn't reverted
        onClick: () => void onSave({ ...group, name, hidden: !group.hidden }),
        hidden: group.is_income,
      },
      onDelete && {
        name: 'delete',
        text: t('Delete'),
        onClick: () => onDelete(group.id),
      },
      canSortCategories && Menu.line,
      canSortCategories && {
        name: 'sort-asc',
        text: t('Sort A to Z'),
        onClick: () => onSortCategories(group.id, 'asc'),
      },
      canSortCategories && {
        name: 'sort-desc',
        text: t('Sort Z to A'),
        onClick: () => onSortCategories(group.id, 'desc'),
      },
    ],
  });

  const displayed = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        height: 20,
      }}
      ref={triggerRef}
    >
      {!dragPreview && (
        <Button
          variant="bare"
          aria-label={collapsed ? t('Expand group') : t('Collapse group')}
          style={{ flexShrink: 0, padding: '6px 5px', color: 'currentColor' }}
          onPress={() => onToggleCollapse?.(group.id)}
        >
          <SvgExpandArrow
            width={8}
            height={8}
            style={{
              transition: 'transform .1s',
              transform: collapsed ? 'rotate(-90deg)' : '',
            }}
          />
        </Button>
      )}
      <Text
        data-testid="category-group-name"
        onClick={dragPreview ? undefined : handleContextMenu}
        style={{
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          minWidth: 0,
          ...(!dragPreview && {
            cursor: 'pointer',
            ':hover': { textDecoration: 'underline' },
          }),
        }}
      >
        {dragPreview && <Text style={{ fontWeight: 500 }}>Group: </Text>}
        {name}
      </Text>
      {!dragPreview && (
        <>
          <View style={{ marginLeft: 5, flexShrink: 0 }}>
            <NotesButton id={group.id} defaultColor={theme.pageTextLight} />
          </View>
          <View style={{ flex: 1 }} />
          <View
            style={{
              flexShrink: 0,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Tooltip content={t('Add category')} disablePointerEvents>
              <Button
                variant="bare"
                aria-label={t('Add category')}
                className={cx(
                  css({
                    color: theme.pageTextLight,
                  }),
                  'hover-visible',
                )}
                onPress={() => {
                  onShowNewCategory?.(group.id);
                }}
              >
                <SvgAdd style={{ width: 10, height: 10, flexShrink: 0 }} />
              </Button>
            </Tooltip>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View
      innerRef={innerRef}
      className={CATEGORY_COLUMN_CLASS}
      style={{
        ...style,
        backgroundColor: theme.budgetHeaderCurrentMonth,
        overflow: 'hidden',
        '& .hover-visible': {
          display: 'none',
        },
        ...(!dragPreview && {
          '&:hover .hover-visible': {
            display: 'flex',
          },
        }),
        ...(dragPreview && {
          paddingLeft: 10,
          zIndex: 10000,
          borderRadius: 6,
          overflow: 'hidden',
        }),
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onEdit(null);
          e.stopPropagation();
        }
      }}
    >
      <InputCell
        value={name}
        formatter={() => displayed}
        width="flex"
        exposed={editing}
        onUpdate={value => {
          if (temporary) {
            if (value === '') {
              onHideNewGroup();
            } else if (value !== '') {
              void onSave({ id: group.id, name: value });
            }
          } else {
            showNameUntil(value, onSave({ id: group.id, name: value }));
          }
        }}
        onBlur={() => onEdit(null)}
        style={{ fontWeight: 600 }}
        inputProps={{
          style: { marginLeft: 20 },
          placeholder: temporary ? t('New group name') : '',
        }}
      />
    </View>
  );
}
