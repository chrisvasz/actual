// @ts-strict-ignore
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  PayeeEntity,
  RecurConfig,
  ScheduleEntity,
} from '@actual-app/core/types/models';
import type { Locale } from 'date-fns';

export function getStatusLabel(status: string) {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'paid':
      return 'paid';
    case 'due':
      return 'due';
    case 'upcoming':
      return 'upcoming';
    case 'missed':
      return 'missed';
    case 'scheduled':
      return 'scheduled';
    default:
      return 'unknown';
  }
}

function makeNumberSuffix(num: number, locale: Locale) {
  // Slight abuse of date-fns to turn a number like "1" into the full
  // form "1st" but formatting a date with that number
  return monthUtils.format(new Date(2020, 0, num, 12), 'do', locale);
}

function prettyDayName(day) {
  const days = {
    SU: 'Sunday',
    MO: 'Monday',
    TU: 'Tuesday',
    WE: 'Wednesday',
    TH: 'Thursday',
    FR: 'Friday',
    SA: 'Saturday',
  };
  return days[day];
}

export function getRecurringDescription(
  config: RecurConfig,
  dateFormat: string,
  locale: Locale,
) {
  const interval = config.interval || 1;

  let endModeSuffix = '';
  switch (config.endMode) {
    case 'after_n_occurrences':
      if (config.endOccurrences === 1) {
        endModeSuffix = 'once';
      } else {
        endModeSuffix = `${config.endOccurrences} times`;
      }
      break;
    case 'on_date':
      endModeSuffix = `until ${monthUtils.format(config.endDate, dateFormat)}`;
      break;
    default:
      break;
  }

  const weekendSolveModeString = config.weekendSolveMode
    ? config.weekendSolveMode === 'after'
      ? '(after weekend)'
      : '(before weekend)'
    : '';

  const weekendSolveSuffix = config.skipWeekend ? weekendSolveModeString : '';

  let suffix = '';
  if (endModeSuffix) {
    suffix += `, ${endModeSuffix}`;
  }
  if (weekendSolveSuffix) {
    suffix += ` ${weekendSolveSuffix}`;
  }

  let desc = null;

  switch (config.frequency) {
    case 'daily':
      desc = interval !== 1 ? `Every ${interval} days` : 'Every day';
      break;
    case 'weekly':
      desc =
        interval !== 1
          ? `Every ${interval} weeks on ${monthUtils.format(config.start, 'EEEE', locale)}`
          : `Every week on ${monthUtils.format(config.start, 'EEEE', locale)}`;
      break;
    case 'monthly':
      if (config.patterns && config.patterns.length > 0) {
        // Sort the days ascending. We filter out -1 because that
        // represents "last days" and should always be last, but this
        // sort would put them first
        let patterns = [...config.patterns]
          .sort((p1, p2) => {
            const typeOrder =
              (p1.type === 'day' ? 1 : 0) - (p2.type === 'day' ? 1 : 0);
            const valOrder = p1.value - p2.value;

            if (typeOrder === 0) {
              return valOrder;
            }
            return typeOrder;
          })
          .filter(p => p.value !== -1);

        // Add on all -1 values to the end
        patterns = patterns.concat(config.patterns.filter(p => p.value === -1));

        const strs: string[] = [];

        const uniqueDays = new Set(patterns.map(p => p.type));
        const isSameDay = uniqueDays.size === 1 && !uniqueDays.has('day');
        for (const pattern of patterns) {
          if (pattern.type === 'day') {
            if (pattern.value === -1) {
              strs.push('last day');
            } else {
              // Example: 15th day
              strs.push(makeNumberSuffix(pattern.value, locale));
            }
          } else {
            const dayName = isSameDay ? '' : ' ' + prettyDayName(pattern.type);

            if (pattern.value === -1) {
              // Example: last Monday
              strs.push('last' + dayName);
            } else {
              // Example: 3rd Monday
              strs.push(makeNumberSuffix(pattern.value, locale) + dayName);
            }
          }
        }

        let range = '';
        if (strs.length > 2) {
          range += strs.slice(0, strs.length - 1).join(', ');
          range += `, ${'and'} `;
          range += strs[strs.length - 1];
        } else {
          range += strs.join(` ${'and'} `);
        }

        if (isSameDay) {
          range += ' ' + prettyDayName(patterns[0].type);
        }

        desc =
          interval !== 1
            ? `Every ${interval} months on the ${range}`
            : `Every month on the ${range}`;
      } else {
        desc =
          interval !== 1
            ? `Every ${interval} months on the ${monthUtils.format(config.start, 'do', locale)}`
            : `Every month on the ${monthUtils.format(config.start, 'do', locale)}`;
      }
      break;

    case 'yearly':
      desc =
        interval !== 1
          ? `Every ${interval} years on ${monthUtils.format(config.start, 'LLL do', locale)}`
          : `Every year on ${monthUtils.format(config.start, 'LLL do', locale)}`;
      break;

    default:
      return 'Recurring error';
  }

  return `${desc}${suffix}`.trim();
}

export function describeSchedule(
  schedule: ScheduleEntity,
  payee?: PayeeEntity,
) {
  if (payee) {
    return `${payee.name} (${schedule.next_date})`;
  } else {
    return `${'Next:'} ${schedule.next_date}`;
  }
}
