import React from 'react';

import { Cell, SelectCell, TableHeader } from '#components/table';
import { useSelectedDispatch, useSelectedItems } from '#hooks/useSelected';

export function TagsHeader() {
  const selectedItems = useSelectedItems();
  const dispatchSelected = useSelectedDispatch();

  return (
    <TableHeader>
      <SelectCell
        exposed
        focused={false}
        selected={selectedItems.size > 0}
        onSelect={e =>
          dispatchSelected({ type: 'select-all', isRangeSelect: e.shiftKey })
        }
      />
      <Cell value="Tag" width={250} />
      <Cell value="Description" width="flex" />
    </TableHeader>
  );
}
