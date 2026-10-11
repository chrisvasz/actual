import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import { useGlobalPref } from '#hooks/useGlobalPref';

import { AccountsSection } from './AccountsSection';
import { PrimaryNav } from './PrimaryNav';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';
import { useSidebar } from './SidebarProvider';
import { SidebarShell } from './SidebarShell';
import { ToggleButton } from './ToggleButton';

export function Sidebar() {
  const sidebar = useSidebar();
  const [isFloating = false, setFloatingSidebarPref] =
    useGlobalPref('floatingSidebar');

  const onFloat = () => {
    setFloatingSidebarPref(!isFloating);
  };

  return (
    <SidebarShell>
      <View
        role="navigation"
        aria-label="Sidebar"
        style={{ flex: 1, minHeight: 0 }}
      >
        <SidebarHeader>
          {!sidebar.alwaysFloats && (
            <ToggleButton isFloating={isFloating} onFloat={onFloat} />
          )}
        </SidebarHeader>

        <PrimaryNav />

        <View
          style={{
            height: 1,
            margin: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: theme.sidebarBorder,
            flexShrink: 0,
          }}
        />

        <AccountsSection />

        <SidebarFooter />
      </View>
    </SidebarShell>
  );
}
