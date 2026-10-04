// @ts-strict-ignore
import React, { useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheveronDown } from '@actual-app/components/icons/v1';
import { TextOneLine } from '@actual-app/components/text-one-line';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { InputCell } from '#components/table';
import { useContextMenu } from '#hooks/useContextMenu';

import { SidebarCategoryButtons } from './SidebarCategoryButtons';
import { CATEGORY_COLUMN_WIDTH } from './util';

type SidebarCategoryProps = {
  innerRef: Ref<HTMLDivElement>;
  category: CategoryEntity;
  categoryGroup?: CategoryGroupEntity;
  dragPreview?: boolean;
  dragging?: boolean;
  goalsShown?: boolean;
  style?: CSSProperties;
  borderColor?: string;
  isLast?: boolean;
  onEditName: (id: CategoryEntity['id']) => void;
  onSave: (category: CategoryEntity) => Promise<void>;
  onHideNewCategory?: () => void;
} & (
  | {
      editing: true;
      onDelete?: never;
    }
  | {
      editing: boolean;
      onDelete: (id: CategoryEntity['id']) => void;
    }
);

export function SidebarCategory({
  innerRef,
  category,
  categoryGroup,
  dragPreview,
  dragging,
  editing,
  goalsShown = false,
  style,
  isLast,
  onEditName,
  onSave,
  onDelete,
  onHideNewCategory,
}: SidebarCategoryProps) {
  const { t } = useTranslation();

  const temporary = category.id === 'new';
  // The name just submitted, shown until the save lands in the cache so the
  // old name doesn't flash back when the input closes.
  const [pendingName, setPendingName] = useState<string | null>(null);
  const name = pendingName ?? category.name;
  const triggerRef = useRef(null);
  const { handleContextMenu } = useContextMenu({
    triggerRef,
    items: [
      {
        name: 'rename',
        text: t('Rename'),
        onClick: () => onEditName(category.id),
      },
      !categoryGroup?.hidden && {
        name: 'toggle-visibility',
        text: category.hidden ? t('Show') : t('Hide'),
        onClick: () => void onSave({ ...category, hidden: !category.hidden }),
      },
      {
        name: 'delete',
        text: t('Delete'),
        onClick: () => onDelete(category.id),
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
        opacity: category.hidden || categoryGroup?.hidden ? 0.33 : undefined,
        backgroundColor: 'transparent',
        height: 20,
      }}
      ref={triggerRef}
    >
      <TextOneLine data-testid="category-name">{name}</TextOneLine>
      <View style={{ flexShrink: 0, marginLeft: 5 }}>
        <Button
          variant="bare"
          className="hover-visible"
          style={{ color: 'currentColor', padding: 3 }}
          onPress={handleContextMenu}
        >
          <SvgCheveronDown
            width={14}
            height={14}
            style={{ color: 'currentColor' }}
          />
        </Button>
      </View>
      <SidebarCategoryButtons
        category={category}
        dragging={dragging}
        goalsShown={goalsShown}
      />
    </View>
  );

  return (
    <View
      innerRef={innerRef}
      style={{
        width: CATEGORY_COLUMN_WIDTH,
        overflow: 'hidden',
        '& .hover-visible': {
          display: 'none',
        },
        ...(!dragging &&
          !dragPreview && {
            '&:hover .hover-visible': {
              display: 'flex',
            },
          }),
        ...(dragging && { color: theme.pageTextSubdued }), //always visible color
        // The zIndex here forces the the view on top of a row below
        // it that may be "collapsed" and show a border on top
        ...(dragPreview && {
          backgroundColor: theme.budgetCurrentMonth,
          zIndex: 10000,
          borderRadius: 6,
          overflow: 'hidden',
        }),
        ...style,
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onEditName(null);
          e.stopPropagation();
        }
      }}
    >
      <InputCell
        value={name}
        formatter={() => displayed}
        width="flex"
        exposed={editing || temporary}
        onUpdate={value => {
          if (temporary) {
            if (value === '') {
              onHideNewCategory();
            } else if (value !== '') {
              void onSave({ ...category, name: value });
            }
          } else {
            if (value !== name) {
              setPendingName(value);
              void onSave({ ...category, name: value }).finally(() =>
                setPendingName(null),
              );
            }
          }
        }}
        onBlur={() => onEditName(null)}
        style={{ paddingLeft: 13, ...(isLast && { borderBottomWidth: 0 }) }}
        inputProps={{
          placeholder: temporary ? t('New category name') : '',
        }}
      />
    </View>
  );
}
