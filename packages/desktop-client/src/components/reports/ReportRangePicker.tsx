import { DateRangePicker } from '@actual-app/components/date-range-picker';
import { ModeButton } from '@actual-app/components/mode-button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useLanguage } from '#hooks/useLocale';

import { REPORT_RANGE_PRESETS } from './reportRange';
import type { ReportRange } from './reportRange';

type ReportRangePickerProps = {
  range: ReportRange;
  /** The range's resolved first and last months */
  start: string;
  end: string;
  minMonth: string;
  maxMonth: string;
  onChange: (range: ReportRange) => void;
};

/** Picks the time range every report on the page shows. */
export function ReportRangePicker({
  range,
  start,
  end,
  minMonth,
  maxMonth,
  onChange,
}: ReportRangePickerProps) {
  const language = useLanguage();
  const selectedPreset = 'preset' in range ? range.preset : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <View
        role="group"
        aria-label="Time range"
        style={{
          flexDirection: 'row',
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {REPORT_RANGE_PRESETS.map(preset => (
          <ModeButton
            key={preset.key}
            selected={selectedPreset === preset.key}
            style={{ borderRadius: 0 }}
            onSelect={() => onChange({ preset: preset.key })}
          >
            {preset.label}
          </ModeButton>
        ))}
      </View>
      <DateRangePicker
        start={start}
        end={end}
        minDate={minMonth}
        maxDate={maxMonth}
        locale={language}
        labels={{
          selectBy: 'Select by',
          quickSelect: 'Quick select',
          month: 'Month',
          day: 'Day',
          previous: 'Previous',
          next: 'Next',
          previousMonth: 'Previous month',
          nextMonth: 'Next month',
          year: 'Year',
          dateRange: 'Date range',
        }}
        onChangeDates={(newStart, newEnd) =>
          onChange({ start: newStart, end: newEnd })
        }
      />
    </View>
  );
}
