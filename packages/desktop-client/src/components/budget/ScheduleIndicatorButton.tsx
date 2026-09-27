import { Button } from '@actual-app/components/button';
import {
  SvgArrowsSynchronize,
  SvgCalendar3,
} from '@actual-app/components/icons/v2';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { ScheduleStatusType } from '@actual-app/core/shared/schedules';
import type { ScheduleEntity } from '@actual-app/core/types/models';

import { useNavigate } from '#hooks/useNavigate';

type ScheduleIndicatorButtonProps = {
  schedule: ScheduleEntity;
  scheduleStatus: ScheduleStatusType;
  isScheduleRecurring: boolean;
  description: string;
};

/**
 * Its own component so that only categories showing a schedule call
 * `useNavigate`, which subscribes to the location. In every category cell it
 * re-rendered the whole budget table on each navigation.
 */
export function ScheduleIndicatorButton({
  schedule,
  scheduleStatus,
  isScheduleRecurring,
  description,
}: ScheduleIndicatorButtonProps) {
  const navigate = useNavigate();

  return (
    <View title={description}>
      <Button
        variant="bare"
        style={{
          color:
            scheduleStatus === 'missed'
              ? theme.budgetNumberNegative
              : scheduleStatus === 'due'
                ? theme.templateNumberUnderFunded
                : theme.upcomingText,
        }}
        onPress={() =>
          schedule._account
            ? navigate(`/accounts/${schedule._account}`)
            : navigate('/accounts')
        }
      >
        {isScheduleRecurring ? (
          <SvgArrowsSynchronize style={{ width: 12, height: 12 }} />
        ) : (
          <SvgCalendar3 style={{ width: 12, height: 12 }} />
        )}
      </Button>
    </View>
  );
}
