// 0 = Sunday, 1 = Monday, ... 6 = Saturday
export function useDaysOfWeek() {
  const daysOfWeek = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
  } satisfies Record<number, string>;

  return daysOfWeek;
}
