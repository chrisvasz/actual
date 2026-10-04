import React from 'react';

import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useSheetValue } from '#hooks/useSheetValue';
import { TestProviders } from '#mocks';

import { ReconcilingMessage } from './Reconcile';

vi.mock('#hooks/useSheetValue', () => ({
  useSheetValue: vi.fn(),
}));

// Use actual arithmetic and util functions for real math behavior
// (we rely on default decimalPlaces=2 semantics for integer amounts)

describe('ReconcilingMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderMessage({
    onDone = vi.fn(),
    onCancel = vi.fn(),
    onCreateTransaction = vi.fn(),
  }: {
    onDone?: () => void;
    onCancel?: () => void;
    onCreateTransaction?: () => void;
  } = {}) {
    render(
      <TestProviders>
        <ReconcilingMessage
          balanceQuery={{
            name: 'balance-query-test',
            query: q('transactions'),
          }}
          onDone={onDone}
          onCancel={onCancel}
          onCreateTransaction={onCreateTransaction}
        />
      </TestProviders>,
    );
  }

  async function enterDate(value: string) {
    const input = screen.getByLabelText('Date');
    await userEvent.clear(input);
    await userEvent.type(input, value);
  }

  async function enterTarget(value: string) {
    const input = screen.getByLabelText('Balance');
    await userEvent.clear(input);
    await userEvent.type(input, value);
  }

  test('starts on today with an empty balance', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    renderMessage();

    const dateInput = screen.getByLabelText<HTMLInputElement>('Date');
    expect(dateInput).toHaveValue(
      monthUtils.format(monthUtils.currentDay(), 'MM/dd/yyyy'),
    );
    await waitFor(() => expect(dateInput).toHaveFocus());
    expect(screen.getByLabelText('Balance')).toHaveValue('');
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled();
  });

  test('reconciles as of the chosen date', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    const onCreateTransaction = vi.fn();
    renderMessage({ onDone, onCreateTransaction });

    await enterDate('09/15/2026');
    await enterTarget('60');

    await userEvent.click(screen.getByText('Adjust'));
    expect(onCreateTransaction).toHaveBeenCalledWith(1000, '2026-09-15');

    await enterTarget('50');
    await userEvent.click(screen.getByText('Lock'));
    expect(onDone).toHaveBeenCalledWith(5000, '2026-09-15');
  });

  test('counts only cleared transactions on or before the date', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    renderMessage();

    await enterDate('09/15/2026');
    await userEvent.tab();

    const binding = vi.mocked(useSheetValue).mock.lastCall?.[0];
    expect(binding).toMatchObject({
      name: 'balance-query-test-2026-09-15-cleared',
    });
    expect(
      typeof binding === 'object' && binding.query?.serializeAsString(),
    ).toContain('"$lte":"2026-09-15"');
  });

  test('locks once the target matches the cleared balance', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    renderMessage({ onDone });

    await enterTarget('50');
    expect(screen.getByLabelText('Reconciled')).toBeInTheDocument();
    expect(screen.queryByText('Adjust')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Lock'));
    expect(onDone).toHaveBeenCalledWith(5000, monthUtils.currentDay());
  });

  test('closing exits without locking', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    const onCancel = vi.fn();
    renderMessage({ onDone, onCancel });
    await enterTarget('50');

    await userEvent.click(
      screen.getByRole('button', { name: 'Exit reconciliation' }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  test('computes positive difference and passes correct amount', async () => {
    // cleared = 30.00, bank = 100.00 => diff = +70.00
    vi.mocked(useSheetValue).mockReturnValue(3000);
    const onCreateTransaction = vi.fn();
    renderMessage({ onCreateTransaction });

    await enterTarget('100');

    expect(screen.getByText('30.00')).toBeInTheDocument();
    expect(screen.getByText('+70.00')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Adjust'));
    expect(onCreateTransaction).toHaveBeenCalledWith(
      7000,
      monthUtils.currentDay(),
    );
  });

  test('computes negative difference and passes correct amount', async () => {
    // cleared = 120.00, bank = 100.00 => diff = -20.00
    vi.mocked(useSheetValue).mockReturnValue(12000);
    const onCreateTransaction = vi.fn();
    renderMessage({ onCreateTransaction });

    await enterTarget('100');

    expect(screen.getByText('120.00')).toBeInTheDocument();
    expect(screen.getByText('-20.00')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Adjust'));
    expect(onCreateTransaction).toHaveBeenCalledWith(
      -2000,
      monthUtils.currentDay(),
    );
  });

  test('formats the target when it loses focus', async () => {
    vi.mocked(useSheetValue).mockReturnValue(0);
    renderMessage();

    await enterTarget('40000');
    await userEvent.tab();

    expect(screen.getByLabelText('Balance')).toHaveValue('40,000.00');
  });

  test('evaluates arithmetic in the bank balance', async () => {
    vi.mocked(useSheetValue).mockReturnValue(12345);
    const onCreateTransaction = vi.fn();
    renderMessage({ onCreateTransaction });

    await enterTarget('100+25.50-10');
    await userEvent.click(screen.getByText('Adjust'));

    // 100 + 25.50 - 10 = 115.50, minus the 123.45 cleared
    expect(onCreateTransaction).toHaveBeenCalledWith(
      -795,
      monthUtils.currentDay(),
    );
  });

  test('an empty balance offers only exiting', async () => {
    vi.mocked(useSheetValue).mockReturnValue(2222);
    const onCancel = vi.fn();
    renderMessage({ onCancel });

    await enterTarget('5');
    await userEvent.clear(screen.getByLabelText('Balance'));

    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Exit reconciliation' }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('shows a dash for the cleared balance while it loads', () => {
    vi.mocked(useSheetValue).mockReturnValue(null);
    renderMessage();

    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled();
  });

  test('Enter locks once the target matches', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    renderMessage({ onDone });

    await enterTarget('50{Enter}');
    expect(onDone).toHaveBeenCalledWith(5000, monthUtils.currentDay());
  });

  test('Enter formats the target when it does not match', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    renderMessage({ onDone });

    await enterTarget('40000{Enter}');
    const input = screen.getByLabelText('Balance');
    expect(input).toHaveValue('40,000.00');
    expect(input).toHaveFocus();
    expect(onDone).not.toHaveBeenCalled();
  });

  test('a formatted target with separators still parses', async () => {
    vi.mocked(useSheetValue).mockReturnValue(0);
    const onCreateTransaction = vi.fn();
    renderMessage({ onCreateTransaction });

    await enterTarget('40000');
    await userEvent.tab();
    await userEvent.click(screen.getByText('Adjust'));
    expect(onCreateTransaction).toHaveBeenCalledWith(
      4000000,
      monthUtils.currentDay(),
    );
  });

  test('Escape exits', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onCancel = vi.fn();
    renderMessage({ onCancel });

    await userEvent.type(screen.getByLabelText('Balance'), '{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
