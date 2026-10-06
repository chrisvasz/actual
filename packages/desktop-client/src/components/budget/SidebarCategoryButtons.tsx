import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryEntity } from '@actual-app/core/types/models/category';

import { NotesButton } from '#components/NotesButton';

import { CategoryGoalChip } from './CategoryGoalChip';

type SidebarCategoryButtonsProps = {
  category: CategoryEntity;
  dragging: boolean;
};

export const SidebarCategoryButtons = ({
  category,
  dragging,
}: SidebarCategoryButtonsProps) => {
  return (
    <>
      <View style={{ flex: 1 }} />
      {!category.is_income && <CategoryGoalChip category={category} />}
      <View style={{ flexShrink: 0 }}>
        <NotesButton
          id={category.id}
          style={dragging ? { color: 'currentColor' } : undefined}
          defaultColor={theme.pageTextLight}
        />
      </View>
    </>
  );
};
