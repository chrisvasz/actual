import { formatTargetMonth, getRequiredBudget } from './goalProgress';

describe('getRequiredBudget', () => {
  const base = { goal: 120000, month: '2026-10', targetMonth: '2027-01' };

  it('spreads what is left over the remaining months, target included', () => {
    // 1,200 left over Oct, Nov, Dec, Jan
    expect(getRequiredBudget({ ...base, balance: 0, budgeted: 0 })).toBe(30000);
  });

  it("ignores this month's budget so the amount holds steady", () => {
    expect(
      getRequiredBudget({ ...base, balance: 30000, budgeted: 30000 }),
    ).toBe(30000);
  });

  it('counts carryover and rises with spending', () => {
    // 400 carried in, 100 spent this month: 900 left over 4 months
    expect(getRequiredBudget({ ...base, balance: 30000, budgeted: 0 })).toBe(
      22500,
    );
    expect(getRequiredBudget({ ...base, balance: -10000, budgeted: 0 })).toBe(
      32500,
    );
  });

  it('asks for everything left in the target month', () => {
    expect(
      getRequiredBudget({
        ...base,
        month: '2027-01',
        balance: 100000,
        budgeted: 0,
      }),
    ).toBe(20000);
  });

  it('rounds to the cent', () => {
    expect(
      getRequiredBudget({ ...base, goal: 100000, balance: 0, budgeted: 0 }),
    ).toBe(25000);
    expect(
      getRequiredBudget({
        goal: 100000,
        month: '2026-10',
        targetMonth: '2026-12',
        balance: 0,
        budgeted: 0,
      }),
    ).toBe(33333);
  });

  it('needs nothing once the goal is reached', () => {
    expect(getRequiredBudget({ ...base, balance: 150000, budgeted: 0 })).toBe(
      0,
    );
  });

  it('has no requirement after the target month', () => {
    expect(
      getRequiredBudget({ ...base, month: '2027-02', balance: 0, budgeted: 0 }),
    ).toBeNull();
  });
});

describe('formatTargetMonth', () => {
  // currentMonth() reads this while testing
  beforeEach(() => {
    global.currentMonth = '2026-10';
  });
  afterEach(() => {
    global.currentMonth = null;
  });

  it('shows just the month within the next 11 months', () => {
    expect(formatTargetMonth('2026-10')).toBe('Oct');
    expect(formatTargetMonth('2027-09')).toBe('Sep');
  });

  it('adds the year further out or in the past', () => {
    expect(formatTargetMonth('2027-10')).toBe("Oct '27");
    expect(formatTargetMonth('2030-01')).toBe("Jan '30");
    expect(formatTargetMonth('2026-09')).toBe("Sep '26");
  });
});
