import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { theme } from '@actual-app/components/theme';

import { useFormat } from '#hooks/useFormat';

import type { NetWorthData, NetWorthRow } from './netWorth';
import { NetWorthTableRow } from './NetWorthTableRow';
import { PercentChange } from './PercentChange';

const shareFormat = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 0,
});

type NetWorthTableProps = {
  data: NetWorthData;
  colors: ReadonlyMap<string, string>;
};

/** Each account group's balance, share, and change; expands to its accounts. */
export function NetWorthTable({ data, colors }: NetWorthTableProps) {
  const format = useFormat();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpanded(next);
  }

  function rowCells(
    row: NetWorthRow,
    name: ReactNode,
  ): [ReactNode, ReactNode, ReactNode, ReactNode] {
    return [
      name,
      format(row.balance, 'financial'),
      row.share == null ? '' : shareFormat.format(row.share),
      <PercentChange
        key="change"
        change={row.change}
        isGood={row.changeAmount > 0}
      />,
    ];
  }

  return (
    <table
      aria-label="Net worth by account group"
      style={{
        borderCollapse: 'collapse',
        width: '100%',
        tableLayout: 'fixed',
        fontSize: 14,
      }}
    >
      <colgroup>
        <col />
        <col style={{ width: 160 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 110 }} />
      </colgroup>
      <thead>
        <NetWorthTableRow
          isHeader
          cells={['Group', 'Balance', 'Share', 'Change']}
          style={{
            color: theme.tableHeaderText,
            fontSize: 13,
            '& > th': { height: 32 },
          }}
        />
      </thead>
      {data.groups.map(group => {
        const isExpanded = expanded.has(group.id);
        const Chevron = isExpanded ? SvgCheveronDown : SvgCheveronRight;
        return (
          <tbody key={group.id}>
            <NetWorthTableRow
              onClick={() => toggle(group.id)}
              style={{ fontWeight: 500 }}
              cells={rowCells(
                group,
                // The row takes the click; the button gives keyboard and
                // screen reader users the same toggle
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  style={{
                    all: 'unset',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    maxWidth: '100%',
                  }}
                >
                  <Chevron
                    width={10}
                    height={10}
                    style={{ flexShrink: 0, color: theme.pageTextSubdued }}
                  />
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      flexShrink: 0,
                      backgroundColor: colors.get(group.id),
                    }}
                  />
                  {group.name}
                </button>,
              )}
            />
            {isExpanded &&
              group.accounts.map(account => (
                <NetWorthTableRow
                  key={account.id}
                  style={{
                    color: theme.tableHeaderText,
                    fontSize: 13,
                    '& > td': { height: 34 },
                  }}
                  cells={rowCells(
                    account,
                    <span style={{ paddingLeft: 36 }}>{account.name}</span>,
                  )}
                />
              ))}
          </tbody>
        );
      })}
      <tfoot>
        <NetWorthTableRow
          style={{
            fontWeight: 600,
            fontSize: 15,
            '& > td': { height: 48, borderBottom: 'none' },
          }}
          cells={[
            'Net worth',
            format(data.netWorth, 'financial'),
            '',
            <PercentChange
              key="change"
              change={data.change}
              isGood={data.change != null && data.change > 0}
            />,
          ]}
        />
      </tfoot>
    </table>
  );
}
