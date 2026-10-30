import type { ReactNode } from 'react';

import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { css } from '@emotion/css';

type NetWorthTableRowProps = {
  /** Name, balance, share, and change */
  cells: [ReactNode, ReactNode, ReactNode, ReactNode];
  isHeader?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
};

export function NetWorthTableRow({
  cells,
  isHeader = false,
  style,
  onClick,
}: NetWorthTableRowProps) {
  const Cell = isHeader ? 'th' : 'td';
  return (
    <tr
      onClick={onClick}
      className={css({
        ...(onClick && {
          cursor: 'pointer',
          ':hover > td': { backgroundColor: theme.tableRowBackgroundHover },
        }),
        '& > th, & > td': {
          height: 40,
          padding: '0 12px',
          borderBottom: `1px solid ${theme.tableBorder}`,
          fontWeight: 'inherit',
          textAlign: 'right',
          whiteSpace: 'nowrap',
          ...styles.tnum,
        },
        '& > :first-child': {
          textAlign: 'left',
          whiteSpace: 'normal',
          paddingLeft: 8,
        },
        ...style,
      })}
    >
      {cells.map((cell, i) => (
        <Cell key={i} scope={isHeader ? 'col' : undefined}>
          {cell}
        </Cell>
      ))}
    </tr>
  );
}
