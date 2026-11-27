import * as monthUtils from '#shared/months';
import { getNextDateAfter } from '#shared/schedules';
import type { RecurConfig } from '#types/models';

// Bounds the work one request can do: each step builds a fresh rschedule
// Schedule, and the backend serves every other request on the same thread.
export const MAX_SCHEDULE_DATES = 1000;

export type ScheduleDatesOptions = {
  start: string;
  end?: string;
  count?: number;
};

/**
 * Expands a schedule date (a single date or a recurrence) into the dates it
 * falls on, as `YYYY-MM-DD` strings in ascending order.
 *
 * Each date is found with `getNextDateAfter`, the same step the app uses to
 * advance a schedule, so the result matches what the app shows: every
 * recurrence setting is honoured, the window applies to the dates after the
 * weekend move, and a date that several occurrences move onto (a daily
 * schedule's Saturday and Sunday both landing on Monday) is listed once.
 *
 * At least one of `end`, `count`, or an ending recurrence must bound the
 * result; an unbounded request throws, as does one that asks for or would
 * return more than `MAX_SCHEDULE_DATES` dates.
 */
export function getScheduleDates(
  date: RecurConfig | string,
  { start, end, count }: ScheduleDatesOptions,
): string[] {
  if (count === 0) {
    return [];
  }
  if (count != null && count > MAX_SCHEDULE_DATES) {
    throw new Error(`\`count\` cannot be more than ${MAX_SCHEDULE_DATES}`);
  }

  if (typeof date === 'string') {
    return isWithin(date, start, end) ? [date] : [];
  }

  const isOpenEnded = date.endMode == null || date.endMode === 'never';
  if (end == null && count == null && isOpenEnded) {
    throw new Error(
      'An open-ended recurrence needs an `end` date or a `count` to be expanded',
    );
  }

  if (date.skipWeekend && date.weekendSolveMode == null) {
    throw new Error('`weekendSolveMode` is required when `skipWeekend` is set');
  }

  const dateCond = { op: 'is', field: 'date', value: date };
  const dates: string[] = [];

  let next = getNextDateAfter(dateCond, monthUtils.subDays(start, 1));
  while (next != null && (end == null || next <= end)) {
    if (dates.length === MAX_SCHEDULE_DATES) {
      throw new Error(
        `More than ${MAX_SCHEDULE_DATES} dates fall in the window; narrow it or pass a \`count\``,
      );
    }
    dates.push(next);
    if (count != null && dates.length >= count) {
      break;
    }
    next = getNextDateAfter(dateCond, next);
  }

  return dates;
}

function isWithin(day: string, start: string, end: string | undefined) {
  return day >= start && (end == null || day <= end);
}
