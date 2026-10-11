import { SvgCog } from '@actual-app/components/icons/v1';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import { NavRow } from './NavRow';

export function SidebarFooter() {
  return (
    <View
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${theme.sidebarBorder}`,
        padding: spacing.sm,
      }}
    >
      <NavRow title="Settings" Icon={SvgCog} to="/settings" />
    </View>
  );
}
