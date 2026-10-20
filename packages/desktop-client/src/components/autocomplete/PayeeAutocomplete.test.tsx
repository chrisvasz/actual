import { generateAccount } from '@actual-app/core/mocks';
import type { AccountEntity, PayeeEntity } from '@actual-app/core/types/models';
import { render, screen } from '@testing-library/react';
import type { Screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { TestProviders } from '#mocks';

import { PayeeAutocomplete } from './PayeeAutocomplete';
import type { PayeeAutocompleteProps } from './PayeeAutocomplete';

const PAYEE_SELECTOR = '[data-testid][role=option]';
const PAYEE_SECTION_SELECTOR = '[data-testid$="-item-group"]';
const ALL_PAYEE_ITEMS_SELECTOR = '[data-testid$="-payee-item"]';

const payees = [
  makePayee('Bob', { favorite: true }),
  makePayee('Alice', { favorite: true }),
  makePayee('This guy on the side of the road'),
];

const accounts: AccountEntity[] = [generateAccount('Bank of Montreal')];
const defaultProps = {
  value: null,
  embedded: true,
  payees,
  accounts,
};

function makePayee(name: string, options?: { favorite: boolean }): PayeeEntity {
  return {
    id: name.toLowerCase() + '-id',
    name,
    favorite: options?.favorite ? true : false,
    transfer_acct: undefined,
  };
}

function extractPayeesAndHeaderNames(
  screen: Screen,
  itemSelector: string = PAYEE_SELECTOR,
) {
  const autocompleteElement = screen.getByTestId('autocomplete');

  // Get all elements that match either selector, but query them separately
  // and then sort by their position in the DOM to maintain document order
  const headers = [
    ...autocompleteElement.querySelectorAll(PAYEE_SECTION_SELECTOR),
  ];
  const items = [...autocompleteElement.querySelectorAll(itemSelector)];

  // Combine all elements and sort by their position in the DOM
  const allElements = [...headers, ...items];
  allElements.sort((a, b) => {
    // Compare document position to maintain DOM order
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;
  });

  return allElements
    .map(e => e.getAttribute('data-testid'))
    .map(firstOrIncorrect);
}

// Not good, see `Autocomplete.js` for details
function waitForAutocomplete() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function clickAutocomplete(autocomplete: HTMLElement) {
  const input = autocomplete.querySelector(`input`);
  if (input != null) {
    await userEvent.click(input);
  }
  await waitForAutocomplete();
}

function firstOrIncorrect(id: string | null): string {
  return id?.split('-', 1)[0] || 'incorrect';
}

describe('PayeeAutocomplete.getPayeeSuggestions', () => {
  function renderPayeeAutocomplete(
    props?: Partial<PayeeAutocompleteProps>,
  ): HTMLElement {
    const autocompleteProps = {
      ...defaultProps,
      ...props,
    };

    render(
      <TestProviders>
        <div data-testid="autocomplete-test">
          <PayeeAutocomplete
            {...autocompleteProps}
            onSelect={vi.fn()}
            type="single"
            value={null}
            embedded={false}
          />
        </div>
      </TestProviders>,
    );
    return screen.getByTestId('autocomplete-test');
  }

  test('favorites get sorted alphabetically', async () => {
    const autocomplete = renderPayeeAutocomplete();
    await clickAutocomplete(autocomplete);

    expect(
      [
        ...screen.getByTestId('autocomplete').querySelectorAll(PAYEE_SELECTOR),
      ].map(e => e.getAttribute('data-testid')),
    ).toStrictEqual([
      'Alice-payee-item',
      'Bob-payee-item',
      'This guy on the side of the road-payee-item',
    ]);
  });

  test('favorites are listed in their own section above other payees', async () => {
    //Note that the payees list assumes the payees are already sorted
    const payees = [
      makePayee('Alice', { favorite: true }),
      makePayee('Bob'),
      makePayee('Eve', { favorite: true }),
      makePayee('Bruce', { favorite: true }),
      makePayee('Carol'),
    ];
    const autocomplete = renderPayeeAutocomplete({ payees });
    await clickAutocomplete(autocomplete);

    expect(extractPayeesAndHeaderNames(screen)).toStrictEqual([
      'Favorite Payees',
      'Alice',
      'Bruce',
      'Eve',
      'Payees',
      'Bob',
      'Carol',
    ]);
  });

  test('list with no favorites shows just the payees list', async () => {
    //Note that the payees list assumes the payees are already sorted
    const payees = [
      makePayee('Alice'),
      makePayee('Bob'),
      makePayee('Eve'),
      makePayee('Natasha'),
      makePayee('Steve'),
    ];
    const expectedPayeeOrder = ['Alice', 'Bob', 'Eve', 'Natasha', 'Steve'];
    const autocomplete = renderPayeeAutocomplete({ payees });
    await clickAutocomplete(autocomplete);

    expect(
      [
        ...screen
          .getByTestId('autocomplete')
          .querySelectorAll('[data-testid][role=option]'),
      ]
        .map(e => e.getAttribute('data-testid'))
        .flatMap(firstOrIncorrect),
    ).toStrictEqual(expectedPayeeOrder);
    expect(
      [
        ...screen
          .getByTestId('autocomplete')
          .querySelectorAll('[data-testid$="-item-group"]'),
      ]
        .map(e => e.getAttribute('data-testid'))
        .flatMap(firstOrIncorrect),
    ).toStrictEqual(['Payees']);
  });

  test('ranks an exact payee match above a longer tied substring match', async () => {
    // Payees are already alpha-sorted, so 'AAA Google' is listed first;
    // a stable sort on a tied fzf score would otherwise leave it ahead of
    // the exact 'Google' match.
    const payees = [makePayee('AAA Google'), makePayee('Google')];
    const autocomplete = renderPayeeAutocomplete({ payees });
    await clickAutocomplete(autocomplete);

    const input = autocomplete.querySelector('input')!;
    await userEvent.type(input, 'Google');
    await waitForAutocomplete();

    expect(
      [
        ...screen
          .getByTestId('autocomplete')
          .querySelectorAll(ALL_PAYEE_ITEMS_SELECTOR),
      ]
        .map(e => e.getAttribute('data-testid'))
        .flatMap(firstOrIncorrect),
    ).toStrictEqual(['Google', 'AAA Google']);
  });
});
