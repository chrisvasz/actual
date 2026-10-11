import React from 'react';

import { Cell, TableHeader } from '#components/table';

type AccountsHeaderProps = {
  unlinked: boolean;
};

export function AccountsHeader({ unlinked }: AccountsHeaderProps) {
  return (
    <TableHeader>
      <Cell
        value="Account"
        width={!unlinked ? 250 : 'flex'}
        style={{ paddingLeft: '10px' }}
      />
      {!unlinked && (
        <>
          <Cell value="Bank" width="flex" style={{ paddingLeft: '10px' }} />
          <Cell value="Last sync" width={160} style={{ paddingLeft: '10px' }} />
          <Cell value="" width={100} style={{ paddingLeft: '10px' }} />
        </>
      )}
    </TableHeader>
  );
}
