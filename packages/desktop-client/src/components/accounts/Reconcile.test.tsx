import React from 'react';

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

  async function enterTarget(value: string) {
    const input = screen.getByLabelText('Target');
    await userEvent.clear(input);
    await userEvent.type(input, value);
  }

  test('starts the target at zero, focused and selected', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    renderMessage();

    const input = screen.getByLabelText<HTMLInputElement>('Target');
    expect(input).toHaveValue('0.00');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('0.00'.length);
    expect(screen.getByText('-50.00')).toBeInTheDocument();
  });

  test('locks once the target matches the cleared balance', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    renderMessage({ onDone });

    await enterTarget('50');
    expect(screen.getByLabelText('Reconciled')).toBeInTheDocument();
    expect(screen.queryByText('Adjust')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Lock'));
    expect(onDone).toHaveBeenCalledWith(5000);
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
    expect(onCreateTransaction).toHaveBeenCalledWith(7000);
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
    expect(onCreateTransaction).toHaveBeenCalledWith(-2000);
  });

  test('formats the target when it loses focus', async () => {
    vi.mocked(useSheetValue).mockReturnValue(0);
    renderMessage();

    await enterTarget('40000');
    await userEvent.tab();

    expect(screen.getByLabelText('Target')).toHaveValue('40,000.00');
  });

  test('evaluates arithmetic in the bank balance', async () => {
    vi.mocked(useSheetValue).mockReturnValue(12345);
    const onCreateTransaction = vi.fn();
    renderMessage({ onCreateTransaction });

    await enterTarget('100+25.50-10');
    await userEvent.click(screen.getByText('Adjust'));

    // 100 + 25.50 - 10 = 115.50, minus the 123.45 cleared
    expect(onCreateTransaction).toHaveBeenCalledWith(-795);
  });

  test('an empty target offers only exiting', async () => {
    vi.mocked(useSheetValue).mockReturnValue(2222);
    const onCancel = vi.fn();
    renderMessage({ onCancel });

    await userEvent.clear(screen.getByLabelText('Target'));

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
    expect(onDone).toHaveBeenCalledWith(5000);
  });

  test('Enter formats the target when it does not match', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onDone = vi.fn();
    renderMessage({ onDone });

    await enterTarget('40000{Enter}');
    const input = screen.getByLabelText('Target');
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
    expect(onCreateTransaction).toHaveBeenCalledWith(4000000);
  });

  test('Escape exits', async () => {
    vi.mocked(useSheetValue).mockReturnValue(5000);
    const onCancel = vi.fn();
    renderMessage({ onCancel });

    await userEvent.type(screen.getByLabelText('Target'), '{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
