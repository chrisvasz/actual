import { captureException } from '#platform/exceptions';
import { handleBudgetImport } from '#server/importers';
import { handlers } from '#server/main';

vi.mock('#platform/exceptions', () => ({
  captureException: vi.fn(),
  captureBreadcrumb: vi.fn(),
}));
vi.mock('#server/importers', () => ({ handleBudgetImport: vi.fn() }));

describe('import-budget', () => {
  it('captures errors whose message is getter-only', async () => {
    // Like a DOMException (e.g. QuotaExceededError), `message` can't be set
    const original = new Error();
    Object.defineProperty(original, 'message', {
      get: () => 'The quota has been exceeded.',
    });
    vi.mocked(handleBudgetImport).mockRejectedValue(original);
    const capture = vi.mocked(captureException);
    capture.mockClear();

    const result = await handlers['import-budget']({
      type: 'actual',
      buffer: new ArrayBuffer(3),
    });

    expect(result).toEqual({ error: 'internal-error' });
    expect(capture).toHaveBeenCalledTimes(1);
    const captured = capture.mock.calls[0][0];
    expect(captured.message).toBe(
      'Error importing budget: The quota has been exceeded.',
    );
    expect(captured.cause).toBe(original);
  });
});
