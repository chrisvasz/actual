import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { theme } from '@actual-app/components/theme';

import { useFormat } from '#hooks/useFormat';

import { ColorSwatch } from './ColorSwatch';
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

/**
 * Each account group's starting balance, balance, share, and change; expands
 * to its accounts.
 */
export function NetWorthTable({ data, colors }: NetWorthTableProps) {
  const format = useFormat();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(expanded);
    if (!next.delete(id)) {
      next.add(id);
    }
    setExpanded(next);
  }

  function cells(
    row: NetWorthRow,
    name: ReactNode,
  ): [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode] {
    return [
      name,
      format(row.balance - row.changeAmount, 'financial'),
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
        <col style={{ width: 130 }} />
        <col style={{ width: 130 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 110 }} />
      </colgroup>
      <thead>
        <NetWorthTableRow
          isHeader
          cells={['Group', 'Starting balance', 'Balance', 'Share', 'Change']}
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
              cells={cells(
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
                  <ColorSwatch color={colors.get(group.id)} />
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
                  cells={cells(
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
          cells={cells(data.total, data.total.name)}
        />
      </tfoot>
    </table>
  );
}
