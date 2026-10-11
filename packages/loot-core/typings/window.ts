export {};

declare global {
  var IS_TESTING: boolean;

  var currentMonth: string | null;

  var emptyDatabase: (avoidUpdate?: boolean) => () => Promise<void>;
}
