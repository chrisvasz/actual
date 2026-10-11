import { useMatch } from 'react-router';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { Link } from '#components/common/Link';
import * as bindings from '#spreadsheet/bindings';

import { AccountTree } from './AccountTree';
import { CollapseChevron } from './CollapseChevron';
import { CountPill } from './CountPill';
import { SidebarBalance } from './SidebarBalance';
import {
  aboveStretchedLinkStyle,
  sectionLabelStyle,
  stretchedLinkStyle,
} from './styles';
import type { GroupBucket, SidebarAccountSide } from './useSidebarAccountTree';
import { useSidebarBalanceMode } from './useSidebarBalanceMode';

type SideGroupProps = {
  label: string;
  side: 'on' | 'off';
  sideData: SidebarAccountSide;
  balanceTestId: string;
  isOpen: boolean;
  onToggle: () => void;
  isBucketOpen: (bucket: GroupBucket) => boolean;
  onToggleBucket: (bucket: GroupBucket) => void;
};

export function SideGroup({
  label,
  side,
  sideData,
  balanceTestId,
  isOpen,
  onToggle,
  isBucketOpen,
  onToggleBucket,
}: SideGroupProps) {
  const [balanceMode] = useSidebarBalanceMode();
  const to = side === 'on' ? '/accounts/onbudget' : '/accounts/offbudget';
  const isActive = useMatch({ path: to, end: true }) != null;

  return (
    <View style={{ marginTop: spacing.xxs }}>
      <View
        className={css({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          paddingBlock: spacing.xs,
          paddingLeft: spacing.xs,
          paddingRight: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: isActive
            ? theme.sidebarItemBackgroundSelected
            : undefined,
          '&:hover': {
            backgroundColor: isActive
              ? theme.sidebarItemBackgroundSelected
              : theme.sidebarItemBackgroundHover,
          },
        })}
      >
        <Button
          variant="bare"
          aria-expanded={isOpen}
          aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
          onPress={onToggle}
          className={css({
            ...aboveStretchedLinkStyle,
            color: theme.sidebarTextSubdued,
            '&[data-hovered], &[data-focus-visible]': {
              backgroundColor: 'transparent',
              color: theme.sidebarItemTextSelected,
            },
            '&[data-focus-visible]': {
              boxShadow: `inset 0 0 0 1px ${theme.sidebarItemAccentSelected}`,
            },
          })}
          style={{
            padding: spacing.xxs,
            flexShrink: 0,
            borderRadius: radius.sm,
          }}
        >
          <CollapseChevron isOpen={isOpen} color="currentColor" />
        </Button>
        <Link
          variant="internal"
          to={to}
          isExactPathMatch
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            flex: 1,
            minWidth: 0,
            textDecoration: 'none',
            color: theme.sidebarItemText,
            ...stretchedLinkStyle,
          }}
          activeStyle={{ color: theme.sidebarItemTextSelected }}
        >
          <Text style={sectionLabelStyle}>{label}</Text>
          {!isOpen && (
            <CountPill count={sideData.accountCount} isSelected={isActive} />
          )}
          <View style={{ flex: 1 }} />
          <SidebarBalance
            binding={
              side === 'on'
                ? bindings.onBudgetAccountBalanceByMode(balanceMode)
                : bindings.offBudgetAccountBalanceByMode(balanceMode)
            }
            testId={balanceTestId}
            style={{ fontSize: 12, fontWeight: 600, color: 'inherit' }}
          />
        </Link>
      </View>
      {isOpen && (
        <AccountTree
          label={label}
          side={side}
          buckets={sideData.buckets}
          isBucketOpen={isBucketOpen}
          onToggleBucket={onToggleBucket}
        />
      )}
    </View>
  );
}
