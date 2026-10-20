import type { MenuItemObject } from '@actual-app/components/menu';
import type { TagEntity } from '@actual-app/core/types/models';

import { SelectedItemsButton } from '#components/table';
import { useHotkeys } from '#hooks/useHotkeys';
import { useSelectedDispatch, useSelectedItems } from '#hooks/useSelected';
import { useDeleteTags, useHideTags, useUnhideTags } from '#tags';

type Actions = 'rename-tag' | 'delete-tags' | 'hide-tags' | 'unhide-tags';

type SelectedTagsButtonProps = {
  onRename: (id: TagEntity['id']) => void;
};

export function SelectedTagsButton({ onRename }: SelectedTagsButtonProps) {
  const dispatch = useSelectedDispatch();
  const selectedItems = useSelectedItems();
  const deleteTags = useDeleteTags();
  const hideTags = useHideTags();
  const unhideTags = useUnhideTags();

  async function handleDelete(tagIds: string[]) {
    if ((await deleteTags({ ids: tagIds })) !== undefined) {
      dispatch({ type: 'select-none' });
    }
  }

  // The closing menu restores focus to its trigger, so clear the selection
  // (which unmounts this button) and open the editor once that has settled
  function startRename(id: TagEntity['id']) {
    dispatch({ type: 'select-none' });
    requestAnimationFrame(() => onRename(id));
  }

  function handleSelect(name: Actions, tagIds: string[]) {
    if (name === 'rename-tag') {
      startRename(tagIds[0]);
    } else if (name === 'delete-tags') {
      void handleDelete(tagIds);
    } else if (name === 'hide-tags') {
      void hideTags({ ids: [...tagIds] });
    } else if (name === 'unhide-tags') {
      void unhideTags({ ids: [...tagIds] });
    } else {
      console.error('Unhandled action', name);
    }
  }

  const enabled = !!selectedItems.size;
  // Renaming edits a single row, so it is only offered for one selected tag
  const isSingleSelection = selectedItems.size === 1;
  useHotkeys('r', () => startRename([...selectedItems][0]), {
    enabled: isSingleSelection,
  });
  useHotkeys('d', () => handleDelete([...selectedItems]), { enabled });
  useHotkeys('h', () => hideTags({ ids: [...selectedItems] }), { enabled });
  useHotkeys('u', () => unhideTags({ ids: [...selectedItems] }), { enabled });

  return (
    <SelectedItemsButton<Actions>
      id="selected-tags"
      name={c => `${c} Tags`}
      items={[
        ...(isSingleSelection
          ? [
              {
                name: 'rename-tag',
                text: 'Rename',
                key: 'R',
              } satisfies MenuItemObject<Actions>,
            ]
          : []),
        { name: 'delete-tags', text: 'Delete', key: 'D' },
        { name: 'hide-tags', text: 'Hide', key: 'H' },
        { name: 'unhide-tags', text: 'Unhide', key: 'U' },
      ]}
      onSelect={handleSelect}
    />
  );
}
