import React from 'react';

import { Cell, SelectCell, TableHeader } from '#components/table';
import { useSelectedDispatch, useSelectedItems } from '#hooks/useSelected';

export function RulesHeader() {
  const selectedItems = useSelectedItems();
  const dispatchSelected = useSelectedDispatch();

  return (
    <TableHeader style={{}}>
      <SelectCell
        exposed
        focused={false}
        selected={selectedItems.size > 0}
        onSelect={e =>
          dispatchSelected({ type: 'select-all', isRangeSelect: e.shiftKey })
        }
      />
      <Cell value="Stage" width={50} />
      <Cell value="Rule" width="flex" />
    </TableHeader>
  );
}
