import {
  SvgReports,
  SvgTag,
  SvgTuning,
  SvgUserGroup,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar3 } from '@actual-app/components/icons/v2';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import { NavRow } from './NavRow';

export function PrimaryNav() {
  return (
    <View
      data-testid="sidebar-primary-buttons"
      style={{
        flexShrink: 0,
        padding: `${spacing.xs}px ${spacing.sm}px 0`,
      }}
    >
      <NavRow title="Budget" Icon={SvgWallet} to="/budget" />
      <NavRow title="Reports" Icon={SvgReports} to="/reports" />
      <NavRow title="Schedules" Icon={SvgCalendar3} to="/schedules" />
      <NavRow title="Payees" Icon={SvgUserGroup} to="/payees" />
      <NavRow title="Rules" Icon={SvgTuning} to="/rules" />
      <NavRow title="Tags" Icon={SvgTag} to="/tags" />
    </View>
  );
}
