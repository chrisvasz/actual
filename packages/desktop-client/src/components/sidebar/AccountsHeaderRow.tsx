import { useMatch } from 'react-router';

import {
  SvgAdd,
  SvgCheveronDownUp,
  SvgCheveronUpDown,
} from '@actual-app/components/icons/v1';
import { theme } from '@actual-app/components/theme';
import { radius, spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { Link } from '#components/common/Link';
import { replaceModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import * as bindings from '#spreadsheet/bindings';

import { BalanceModeToggle } from './BalanceModeToggle';
import { SidebarBalance } from './SidebarBalance';
import { SidebarIconButton } from './SidebarIconButton';
import { stretchedLinkStyle } from './styles';
import { useSidebarBalanceMode } from './useSidebarBalanceMode';

type AccountsHeaderRowProps = {
  allOpen: boolean;
  onToggleAll: () => void;
};

export function AccountsHeaderRow({
  allOpen,
  onToggleAll,
}: AccountsHeaderRowProps) {
  const dispatch = useDispatch();
  const [balanceMode] = useSidebarBalanceMode();
  const isActive = useMatch({ path: '/accounts', end: true }) != null;

  const onAddAccount = () => {
    dispatch(replaceModal({ modal: { name: 'add-local-account' } }));
  };

  return (
    <View
      className={css({
        [`& .${balanceToggleClassName}`]: { display: 'none' },
        [`&:hover .${balanceToggleClassName}, &:focus-within .${balanceToggleClassName}`]:
          { display: 'flex' },
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingBlock: spacing.xs,
        paddingInline: spacing.sm,
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
      <Link
        variant="internal"
        to="/accounts"
        isExactPathMatch
        style={{
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          color: theme.sidebarHeaderText,
          ...stretchedLinkStyle,
        }}
        activeStyle={{ color: theme.sidebarItemTextSelected }}
      >
        Accounts
      </Link>
      <SidebarIconButton
        Icon={allOpen ? SvgCheveronDownUp : SvgCheveronUpDown}
        label={allOpen ? 'Collapse all groups' : 'Expand all groups'}
        onPress={onToggleAll}
      />
      <SidebarIconButton
        Icon={SvgAdd}
        label="Add account"
        onPress={onAddAccount}
      />
      <View style={{ flex: 1 }} />
      <BalanceModeToggle className={balanceToggleClassName} />
      <SidebarBalance
        binding={bindings.allAccountBalanceByMode(balanceMode)}
        testId="sidebar-all-accounts-balance"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: isActive
            ? theme.sidebarItemTextSelected
            : theme.sidebarItemText,
        }}
      />
    </View>
  );
}

const balanceToggleClassName = 'sidebar-balance-mode-toggle';
