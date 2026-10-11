import React, { useMemo } from 'react';

import { Select } from '@actual-app/components/select';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { currencies, getCurrency } from '@actual-app/core/shared/currencies';
import { css } from '@emotion/css';

import { Checkbox } from '#components/forms';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { Column, Setting } from './UI';

export function CurrencySettings() {
  const currencyNames = useMemo(
    () =>
      new Map<string, string>([
        ['', 'None'],
        ['AED', 'UAE Dirham'],
        ['ARS', 'Argentinian Peso'],
        ['AUD', 'Australian Dollar'],
        ['BRL', 'Brazilian Real'],
        ['BYN', 'Belarusian Ruble'],
        ['CAD', 'Canadian Dollar'],
        ['CHF', 'Swiss Franc'],
        ['CLP', 'Chilean Peso'],
        ['CNY', 'Yuan Renminbi'],
        ['COP', 'Colombian Peso'],
        ['CRC', 'Costa Rican Colón'],
        ['CZK', 'Czech Koruna'],
        ['DKK', 'Danish Krone'],
        ['DOP', 'Dominican Peso'],
        ['EGP', 'Egyptian Pound'],
        ['EUR', 'Euro'],
        ['GBP', 'Pound Sterling'],
        ['GTQ', 'Guatemalan Quetzal'],
        ['HKD', 'Hong Kong Dollar'],
        ['HUF', 'Hungarian Forint'],
        ['IDR', 'Indonesian Rupiah'],
        ['ILS', 'Israeli New Shekel'],
        ['INR', 'Indian Rupee'],
        ['IRR', 'Iranian Rial'],
        ['JMD', 'Jamaican Dollar'],
        ['JPY', 'Japanese Yen'],
        ['KRW', 'South Korean Won'],
        ['LKR', 'Sri Lankan Rupee'],
        ['MDL', 'Moldovan Leu'],
        ['MKD', 'Macedonian Denar'],
        ['MXN', 'Mexican Peso'],
        ['MYR', 'Malaysian Ringgit'],
        ['PEN', 'Peruvian Sol'],
        ['PHP', 'Philippine Peso'],
        ['PKR', 'Pakistani Rupee'],
        ['PLN', 'Polish Złoty'],
        ['QAR', 'Qatari Riyal'],
        ['RON', 'Romanian Leu'],
        ['RSD', 'Serbian Dinar'],
        ['RUB', 'Russian Ruble'],
        ['SAR', 'Saudi Riyal'],
        ['SEK', 'Swedish Krona'],
        ['SGD', 'Singapore Dollar'],
        ['THB', 'Thai Baht'],
        ['TRY', 'Turkish Lira'],
        ['TWD', 'New Taiwan Dollar'],
        ['UAH', 'Ukrainian Hryvnia'],
        ['USD', 'US Dollar'],
        ['UYU', 'Uruguayan Peso'],
        ['UZS', 'Uzbek Soum'],
      ]),
    [],
  );

  const [defaultCurrencyCode, setDefaultCurrencyCodePref] = useSyncedPref(
    'defaultCurrencyCode',
  );
  const selectedCurrencyCode = defaultCurrencyCode || '';

  const [symbolPosition, setSymbolPositionPref] = useSyncedPref(
    'currencySymbolPosition',
  );
  const [spaceEnabled, setSpaceEnabledPref] = useSyncedPref(
    'currencySpaceBetweenAmountAndSymbol',
  );
  const [, setNumberFormatPref] = useSyncedPref('numberFormat');
  const [, setHideFractionPref] = useSyncedPref('hideFraction');

  const selectButtonClassName = css({
    '&[data-hovered]': {
      backgroundColor: theme.buttonNormalBackgroundHover,
    },
  });

  const currencyOptions: [string, string][] = currencies.map(currency => {
    const translatedName =
      currencyNames.get(currency.code) ?? currency.name;
    if (currency.code === '') {
      return [currency.code, translatedName];
    }
    return [
      currency.code,
      `${currency.code} - ${translatedName} (${currency.symbol})`,
    ];
  });

  const handleCurrencyChange = (code: string) => {
    setDefaultCurrencyCodePref(code);
    if (code !== '') {
      const cur = getCurrency(code);
      setNumberFormatPref(cur.numberFormat);
      setHideFractionPref(cur.decimalPlaces === 0 ? 'true' : 'false');
      setSpaceEnabledPref(cur.symbolFirst ? 'false' : 'true');
      setSymbolPositionPref(cur.symbolFirst ? 'before' : 'after');
    }
  };

  const symbolPositionOptions = useMemo(() => {
    const selectedCurrency = getCurrency(selectedCurrencyCode);
    const symbol = selectedCurrency.symbol || '$';
    const space = spaceEnabled === 'true' ? ' ' : '';

    return [
      {
        value: 'before',
        label: `${'Before amount'} (${'e.g.'} ${symbol}${space}100)`,
      },
      {
        value: 'after',
        label: `${'After amount'} (${'e.g.'} 100${space}${symbol})`,
      },
    ];
  }, [selectedCurrencyCode, spaceEnabled]);

  return (
    <Setting
      primaryAction={
        <View
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5em',
            width: '100%',
          }}
        >
          <View style={{ display: 'flex', flexDirection: 'row', gap: '1.5em' }}>
            <Column title="Default Currency">
              <Select
                value={selectedCurrencyCode}
                onChange={handleCurrencyChange}
                options={currencyOptions}
                className={selectButtonClassName}
                style={{ width: '100%' }}
              />
            </Column>

            <Column
              title="Symbol Position"
              style={{
                visibility: selectedCurrencyCode === '' ? 'hidden' : 'visible',
              }}
            >
              <Select
                value={symbolPosition || 'before'}
                onChange={value => setSymbolPositionPref(value)}
                options={symbolPositionOptions.map(f => [f.value, f.label])}
                className={selectButtonClassName}
                style={{ width: '100%' }}
                disabled={selectedCurrencyCode === ''}
              />
            </Column>
          </View>

          {selectedCurrencyCode !== '' && (
            <View
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              <Checkbox
                id="settings-spaceEnabled"
                checked={spaceEnabled === 'true'}
                onChange={e =>
                  setSpaceEnabledPref(e.target.checked ? 'true' : 'false')
                }
              />
              <label
                htmlFor="settings-spaceEnabled"
                style={{ marginLeft: '0.5em' }}
              >
                Add space between amount and symbol
              </label>
            </View>
          )}
        </View>
      }
    >
      <Text>
        <strong>Currency settings</strong> affect how amounts are displayed
        throughout the application. Changing the currency will affect the number
        format, symbol position, and whether fractions are shown. These can be
        adjusted after the currency is set.
      </Text>
    </Setting>
  );
}
