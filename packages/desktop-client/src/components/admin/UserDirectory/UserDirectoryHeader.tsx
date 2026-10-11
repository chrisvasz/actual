import React from 'react';

import { Cell, SelectCell, TableHeader } from '#components/table';
import { useSelectedDispatch, useSelectedItems } from '#hooks/useSelected';

export function UserDirectoryHeader() {
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
      <Cell value="Username" width="flex" />
      <Cell value="Display Name" width={250} />
      <Cell value="Role" width={100} />
      <Cell value="Enabled" width={100} />
      <Cell value="Server Owner" width={100} />
      <Cell value="" width={80} />
    </TableHeader>
  );
}
