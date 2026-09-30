// @ts-strict-ignore
import type {
  ComponentProps,
  Dispatch,
  ReactNode,
  SetStateAction,
} from 'react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { ParseFileOptions } from '@actual-app/core/server/transactions/import/parse-file';
import * as monthUtils from '@actual-app/core/shared/months';
import { amountToInteger } from '@actual-app/core/shared/util';
import { useQueryClient } from '@tanstack/react-query';

import {
  useImportPreviewTransactionsMutation,
  useImportTransactionsMutation,
} from '#accounts';
import { Modal, ModalCloseButton } from '#components/common/Modal';
import { LabeledCheckbox } from '#components/forms/LabeledCheckbox';
import { TableHeader, TableWithNavigator } from '#components/table';
import { useAccount } from '#hooks/useAccount';
import { useCategories } from '#hooks/useCategories';
import { useDateFormat } from '#hooks/useDateFormat';
import { useSyncedPrefs } from '#hooks/useSyncedPrefs';
import { payeeQueries } from '#payees';

import { FieldMappings } from './FieldMappings';
import { Transaction } from './Transaction';
import type { DateFormat, FieldMapping, ImportTransaction } from './utils';
import {
  applyFieldMappings,
  dateFormats,
  filterByStartDate,
  formatDate,
  isDateFormat,
  parseAmountFields,
  parseCategoryFields,
  parseDate,
  stripCsvImportTransaction,
} from './utils';

function CheckboxToggle({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: Dispatch<SetStateAction<boolean>>;
  children: ReactNode;
}) {
  return (
    <LabeledCheckbox
      id={id}
      checked={checked}
      onChange={() => onChange(prev => !prev)}
    >
      {children}
    </LabeledCheckbox>
  );
}

function getFileType(filepath: string): string {
  const m = filepath.match(/\.([^.]*)$/);
  if (!m) return 'ofx';
  const rawType = m[1].toLowerCase();
  if (rawType === 'tsv') return 'csv';
  return rawType;
}

function getInitialDateFormat(transactions, mappings) {
  if (transactions.length === 0 || mappings.date == null) {
    return 'yyyy mm dd';
  }

  const transaction = transactions[0];
  const date = transaction[mappings.date];

  const found =
    date == null
      ? null
      : dateFormats.find(f => parseDate(date, f.format) != null);
  return found ? found.format : 'mm dd yyyy';
}

function getInitialMappings(transactions) {
  if (transactions.length === 0) {
    return {};
  }

  const transaction = stripCsvImportTransaction(transactions[0]);
  const fields = Object.entries(transaction);

  function key(entry) {
    return entry ? entry[0] : null;
  }

  const dateField = key(
    fields.find(([name]) => name.toLowerCase().includes('date')) ||
      fields.find(([, value]) => String(value)?.match(/^\d+[-/]\d+[-/]\d+$/)),
  );

  const amountField = key(
    fields.find(([name]) => name.toLowerCase().includes('amount')) ||
      fields.find(([, value]) => String(value)?.match(/^-?[.,\d]+$/)),
  );

  const categoryField = key(
    fields.find(([name]) => name.toLowerCase().includes('category')),
  );

  const payeeField = key(
    fields.find(([name]) => name.toLowerCase().includes('payee')) ||
      fields.find(
        ([name]) =>
          name !== dateField && name !== amountField && name !== categoryField,
      ),
  );

  const notesField = key(
    fields.find(([name]) => name.toLowerCase().includes('notes')) ||
      fields.find(
        ([name]) =>
          name !== dateField &&
          name !== amountField &&
          name !== categoryField &&
          name !== payeeField,
      ),
  );

  const inOutField = key(
    fields.find(
      ([name]) =>
        name !== dateField &&
        name !== amountField &&
        name !== payeeField &&
        name !== notesField,
    ),
  );

  return {
    date: dateField,
    amount: amountField,
    payee: payeeField,
    notes: notesField,
    inOut: inOutField,
    category: categoryField,
  };
}

type LastParse = {
  filename: string;
  fileType: string;
  options: ParseFileOptions;
};

const parseOptionKeys = [
  'hasHeaderRow',
  'delimiter',
  'encoding',
  'fallbackMissingPayeeToMemo',
  'swapPayeeAndMemo',
  'skipStartLines',
  'skipEndLines',
  'importNotes',
] satisfies Array<keyof ParseFileOptions>;

function shouldPreserveImportSettingsForParse(
  lastParse: LastParse | null,
  filename: string,
  fileType: string,
  options: ParseFileOptions,
) {
  return (
    fileType === 'csv' &&
    lastParse?.filename === filename &&
    lastParse.fileType === fileType &&
    parseOptionKeys.every(key =>
      key === 'skipEndLines'
        ? lastParse.options[key] !== options[key]
        : lastParse.options[key] === options[key],
    )
  );
}

export function ImportTransactionsModal({
  filename: originalFileName,
  accountId,
  onImported,
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dateFormat = useDateFormat() || ('MM/dd/yyyy' as const);
  const [prefs, savePrefs] = useSyncedPrefs();
  const { data: { list: categories } = { list: [] } } = useCategories();

  const [multiplierAmount, setMultiplierAmount] = useState('');
  const [loadingState, setLoadingState] = useState<
    null | 'parsing' | 'importing'
  >('parsing');
  const [error, setError] = useState<{
    parsed: boolean;
    message: string;
  } | null>(null);
  const [filename, setFilename] = useState(originalFileName);
  const [transactions, setTransactions] = useState<ImportTransaction[]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<
    ImportTransaction[]
  >([]);
  const [filetype, setFileType] = useState('unknown');
  const [fieldMappings, setFieldMappings] = useState<FieldMapping | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [flipAmount, setFlipAmount] = useState(false);
  const [reconcile, setReconcile] = useState(
    String(prefs[`import-merge-${accountId}`]) !== 'false',
  );
  const [importNotes, setImportNotes] = useState(
    String(
      prefs[`import-notes-${accountId}-${getFileType(originalFileName)}`],
    ) !== 'false',
  );

  // This cannot be set after parsing the file, because changing it
  // requires re-parsing the file. This is different from the other
  // options which are simple post-processing. That means if you
  // parsed different files without closing the modal, it wouldn't
  // re-read this.
  const [delimiter, setDelimiter] = useState(
    prefs[`csv-delimiter-${accountId}`] ||
      (filename.endsWith('.tsv') ? '\t' : ','),
  );
  const [csvEncoding, setCsvEncoding] = useState(
    prefs[`csv-encoding-${accountId}`] || 'auto',
  );
  const [skipStartLines, setSkipStartLines] = useState(
    parseInt(prefs[`csv-skip-start-lines-${accountId}`], 10) || 0,
  );
  const [skipEndLines, setSkipEndLines] = useState(
    parseInt(prefs[`csv-skip-end-lines-${accountId}`], 10) || 0,
  );
  const [inOutMode, setInOutMode] = useState(
    String(prefs[`csv-in-out-mode-${accountId}`]) === 'true',
  );
  const [outValue, setOutValue] = useState(
    prefs[`csv-out-value-${accountId}`] ?? '',
  );
  const [hasHeaderRow, setHasHeaderRow] = useState(
    String(prefs[`csv-has-header-${accountId}`]) !== 'false',
  );
  const [fallbackMissingPayeeToMemo, setFallbackMissingPayeeToMemo] = useState(
    String(prefs[`ofx-fallback-missing-payee-${accountId}`]) !== 'false',
  );
  const [ofxSwapPayeeAndMemo, setOfxSwapPayeeAndMemo] = useState(
    String(prefs[`ofx-swap-payee-memo-${accountId}`]) === 'true',
  );
  const [qifSwapPayeeAndMemo, setQifSwapPayeeAndMemo] = useState(
    String(prefs[`qif-swap-payee-memo-${accountId}`]) === 'true',
  );
  const [camtSwapPayeeAndMemo, setCamtSwapPayeeAndMemo] = useState(
    String(prefs[`camt-swap-payee-memo-${accountId}`]) === 'true',
  );
  const [reimportDeleted, setReimportDeleted] = useState(
    String(prefs[`import-reimport-deleted-${accountId}`]) === 'true',
  );

  const [parseDateFormat, setParseDateFormat] = useState<DateFormat | null>(
    null,
  );

  const [clearOnImport, setClearOnImport] = useState(
    String(prefs[`import-clear-${accountId}`]) !== 'false',
  );
  const [showFileOptions, setShowFileOptions] = useState(false);
  // Default to the last reconciliation, since anything before it should
  // already be in the account. Derived rather than stored so it still applies
  // if the account loads after the modal opens.
  const account = useAccount(accountId);
  const [startDateOverride, setStartDate] = useState<string | null>(null);
  const startDate =
    startDateOverride ??
    (account?.last_reconciled
      ? monthUtils.dayFromDate(new Date(parseInt(account.last_reconciled, 10)))
      : '');
  const lastParseRef = useRef<LastParse | null>(null);

  const getImportPreview = useCallback(
    async (
      transactions: ImportTransaction[],
      filetype: string,
      flipAmount: boolean,
      fieldMappings: FieldMapping | null,
      splitMode: boolean,
      parseDateFormat: DateFormat,
      inOutMode: boolean,
      outValue: string,
      multiplierAmount: string,
    ) => {
      const previewTransactions = [];
      const inOutModeEnabled = isOfxFile(filetype) ? false : inOutMode;
      const getTransDate: (trans: ImportTransaction) => string | null =
        isOfxFile(filetype)
          ? trans => trans.date ?? null
          : trans => parseDate(trans.date, parseDateFormat);

      // Note that the sort will behave unpredictably if any date fails to parse.
      transactions.sort((a, b) => {
        const aDate = getTransDate(a);
        const bDate = getTransDate(b);

        return aDate < bDate ? 1 : aDate === bDate ? 0 : -1;
      });

      for (let trans of transactions) {
        if (trans.isMatchedTransaction) {
          // skip transactions that are matched transaction (existing transaction added to show update changes)
          continue;
        }

        trans = fieldMappings
          ? applyFieldMappings(trans, fieldMappings)
          : trans;

        const date = getTransDate(trans);
        if (date == null) {
          console.log(
            `Unable to parse date ${
              trans.date || '(empty)'
            } with given date format`,
          );
          break;
        }
        if (trans.payee_name == null || typeof trans.payee_name !== 'string') {
          console.log(`Unable·to·parse·payee·${trans.payee_name || '(empty)'}`);
          break;
        }

        const { amount } = parseAmountFields(
          trans,
          splitMode,
          inOutModeEnabled,
          outValue,
          flipAmount,
          multiplierAmount,
        );
        if (amount == null) {
          console.log(`Transaction on ${trans.date} has no amount`);
          break;
        }

        const category_id = parseCategoryFields(trans, categories);
        trans.category = category_id;

        const {
          inflow: _inflow,
          outflow: _outflow,
          inOut: _inOut,
          existing: _existing,
          ignored: _ignored,
          selected: _selected,
          selected_merge: _selected_merge,
          tombstone: _tombstone,
          ...finalTransaction
        } = trans;
        previewTransactions.push({
          ...finalTransaction,
          date,
          amount: amountToInteger(amount),
          cleared: clearOnImport,
        });
      }

      return previewTransactions;
    },
    [categories, clearOnImport],
  );

  const parse = useCallback(
    async (
      filename: string,
      options: ParseFileOptions,
      { preserveImportSettings = false } = {},
    ) => {
      setLoadingState('parsing');

      const filetype = getFileType(filename);
      setFilename(filename);
      setFileType(filetype);

      const { errors, transactions: parsedTransactions = [] } = await send(
        'transactions-parse-file',
        {
          filepath: filename,
          options,
        },
      );

      let index = 0;
      const transactions = parsedTransactions.map(trans => {
        // Add a transient transaction id to match preview with imported transactions
        // @ts-expect-error - trans is unknown type, adding properties dynamically
        trans.trx_id = String(index++);
        // Select all parsed transactions before first preview run
        // @ts-expect-error - trans is unknown type, adding properties dynamically
        trans.selected = true;
        return trans;
      });

      setError(null);

      /// Do fine grained reporting between the old and new OFX importers.
      if (errors.length > 0) {
        setError({
          parsed: true,
          message: errors[0].message || 'Internal error',
        });
      } else {
        if (
          !preserveImportSettings &&
          (filetype === 'csv' || filetype === 'qif')
        ) {
          const flipAmount =
            String(prefs[`flip-amount-${accountId}-${filetype}`]) === 'true';
          setFlipAmount(flipAmount);
        }

        if (filetype === 'csv') {
          if (!preserveImportSettings) {
            let mappings = prefs[`csv-mappings-${accountId}`];
            mappings = mappings
              ? JSON.parse(mappings)
              : getInitialMappings(transactions);

            // @ts-expect-error - mappings might not have outflow/inflow properties
            setFieldMappings(mappings);

            // Set initial split mode based on any saved mapping. In/Out mode
            // reads from the amount column, so it takes precedence.
            const splitMode =
              // @ts-expect-error - mappings might not have outflow/inflow properties
              !!(mappings.outflow || mappings.inflow) &&
              String(prefs[`csv-in-out-mode-${accountId}`]) !== 'true';
            setSplitMode(splitMode);

            const parseDateFormat =
              prefs[`parse-date-${accountId}-${filetype}`] ||
              getInitialDateFormat(transactions, mappings);
            setParseDateFormat(
              isDateFormat(parseDateFormat) ? parseDateFormat : null,
            );
          }
        } else if (filetype === 'qif') {
          if (!preserveImportSettings) {
            const parseDateFormat =
              prefs[`parse-date-${accountId}-${filetype}`] ||
              getInitialDateFormat(transactions, { date: 'date' });
            setParseDateFormat(
              isDateFormat(parseDateFormat) ? parseDateFormat : null,
            );
          }
        } else {
          setFieldMappings(null);
          setParseDateFormat(null);
        }

        setParsedTransactions(transactions as ImportTransaction[]);
      }

      setLoadingState(null);
    },
    // We use some state variables from the component, but do not want to re-parse when they change
    [accountId, prefs],
  );

  function onMultiplierChange(e) {
    const amt = e;
    if (!amt || amt.match(/^\d{1,}(\.\d{0,4})?$/)) {
      setMultiplierAmount(amt);
    }
  }

  useEffect(() => {
    const fileType = getFileType(originalFileName);
    const parseOptions = getParseOptions(fileType, {
      delimiter,
      encoding: csvEncoding,
      hasHeaderRow,
      skipStartLines,
      skipEndLines,
      fallbackMissingPayeeToMemo,
      importNotes,
      swapPayeeAndMemo: getSwapOption(
        fileType,
        ofxSwapPayeeAndMemo,
        qifSwapPayeeAndMemo,
        camtSwapPayeeAndMemo,
      ),
    });
    const lastParse = lastParseRef.current;
    const shouldPreserveImportSettings = shouldPreserveImportSettingsForParse(
      lastParse,
      originalFileName,
      fileType,
      parseOptions,
    );

    lastParseRef.current = {
      filename: originalFileName,
      fileType,
      options: parseOptions,
    };

    void parse(originalFileName, parseOptions, {
      preserveImportSettings: shouldPreserveImportSettings,
    });
  }, [
    originalFileName,
    delimiter,
    csvEncoding,
    hasHeaderRow,
    skipStartLines,
    skipEndLines,
    fallbackMissingPayeeToMemo,
    importNotes,
    ofxSwapPayeeAndMemo,
    qifSwapPayeeAndMemo,
    camtSwapPayeeAndMemo,
    parse,
  ]);

  function onSplitMode() {
    if (fieldMappings == null) {
      return;
    }

    const isSplit = !splitMode;
    setSplitMode(isSplit);

    // Run auto-detection on the fields to try to detect the fields
    // automatically
    const mappings = getInitialMappings(transactions);

    const newFieldMappings = isSplit
      ? {
          amount: null,
          outflow: mappings.amount,
          inflow: null,
        }
      : {
          amount: mappings.amount,
          outflow: null,
          inflow: null,
        };
    setFieldMappings({ ...fieldMappings, ...newFieldMappings });
  }

  async function onNewFile() {
    const res = await window.Actual.openFileDialog({
      filters: [
        {
          name: 'Financial Files',
          extensions: ['qif', 'ofx', 'qfx', 'csv', 'tsv', 'xml'],
        },
      ],
    });

    const fileType = getFileType(res[0]);
    const parseOptions = getParseOptions(fileType, {
      delimiter,
      encoding: csvEncoding,
      hasHeaderRow,
      skipStartLines,
      skipEndLines,
      fallbackMissingPayeeToMemo,
      importNotes,
      swapPayeeAndMemo: getSwapOption(
        fileType,
        ofxSwapPayeeAndMemo,
        qifSwapPayeeAndMemo,
        camtSwapPayeeAndMemo,
      ),
    });

    void parse(res[0], parseOptions);
  }

  function onUpdateFields(field, name) {
    const newFieldMappings = {
      ...fieldMappings,
      [field]: name === '' ? null : name,
    };
    setFieldMappings(newFieldMappings);
  }

  function onCheckTransaction(trx_id: string) {
    const newTransactions = transactions.map(trans => {
      if (trans.trx_id === trx_id) {
        if (trans.existing) {
          // 3-states management for transactions with existing (merged transactions)
          // flow of states:
          // (selected true && selected_merge true)
          //   => (selected true && selected_merge false)
          //     => (selected false)
          //       => back to (selected true && selected_merge true)
          if (!trans.selected) {
            return {
              ...trans,
              selected: true,
              selected_merge: true,
            };
          } else if (trans.selected_merge) {
            return {
              ...trans,
              selected: true,
              selected_merge: false,
            };
          } else {
            return {
              ...trans,
              selected: false,
              selected_merge: false,
            };
          }
        } else {
          return {
            ...trans,
            selected: !trans.selected,
          };
        }
      }
      return trans;
    });

    setTransactions(newTransactions);
  }

  const importTransactions = useImportTransactionsMutation();

  async function onImport(close) {
    setLoadingState('importing');

    const finalTransactions = [];
    let errorMessage;

    for (let trans of transactions) {
      if (
        trans.isMatchedTransaction ||
        (reconcile && !trans.selected && !trans.ignored)
      ) {
        // skip transactions that are
        // - matched transaction (existing transaction added to show update changes)
        // - unselected transactions that are not ignored by the reconcilation algorithm (only when reconcilation is enabled)
        continue;
      }

      trans = fieldMappings ? applyFieldMappings(trans, fieldMappings) : trans;

      const date =
        isOfxFile(filetype) || isCamtFile(filetype)
          ? trans.date
          : parseDate(trans.date, parseDateFormat);
      if (date == null) {
        errorMessage = t(
          'Unable to parse date {{date}} with given date format',
          { date: trans.date || t('(empty)') },
        );
        break;
      }

      const { amount } = parseAmountFields(
        trans,
        splitMode,
        isOfxFile(filetype) ? false : inOutMode,
        outValue,
        flipAmount,
        multiplierAmount,
      );
      if (amount == null) {
        errorMessage = t('Transaction on {{date}} has no amount', {
          date: trans.date,
        });
        break;
      }

      const category_id = parseCategoryFields(trans, categories);
      trans.category = category_id;

      const {
        inflow: _inflow,
        outflow: _outflow,
        inOut: _inOut,
        existing: _existing,
        ignored: _ignored,
        selected: _selected,
        selected_merge: _selected_merge,
        trx_id: _trx_id,
        ...finalTransaction
      } = trans;

      if (
        reconcile &&
        ((trans.ignored && trans.selected) ||
          (trans.existing && trans.selected && !trans.selected_merge))
      ) {
        // in reconcile mode, force transaction add for
        // - ignored transactions (aleardy existing) that are checked
        // - transactions with existing (merged transactions) that are not selected_merge
        finalTransaction.forceAddTransaction = true;
      }

      finalTransactions.push({
        ...finalTransaction,
        date,
        amount: amountToInteger(amount),
        cleared: clearOnImport,
        // CSV notes come from the column mapping, not this option
        notes:
          importNotes || filetype === 'csv' ? finalTransaction.notes : null,
      });
    }

    if (errorMessage) {
      setLoadingState(null);
      setError({ parsed: false, message: errorMessage });
      return;
    }

    if (!isOfxFile(filetype) && !isCamtFile(filetype)) {
      const key = `parse-date-${accountId}-${filetype}`;
      savePrefs({ [key]: parseDateFormat });
    }

    if (isOfxFile(filetype)) {
      savePrefs({
        [`ofx-fallback-missing-payee-${accountId}`]: String(
          fallbackMissingPayeeToMemo,
        ),
        [`ofx-swap-payee-memo-${accountId}`]: String(ofxSwapPayeeAndMemo),
      });
    }

    if (filetype === 'csv') {
      savePrefs({
        [`csv-mappings-${accountId}`]: JSON.stringify(fieldMappings),
      });
      savePrefs({ [`csv-delimiter-${accountId}`]: delimiter });
      savePrefs({ [`csv-encoding-${accountId}`]: csvEncoding });
      savePrefs({ [`csv-has-header-${accountId}`]: String(hasHeaderRow) });
      savePrefs({
        [`csv-skip-start-lines-${accountId}`]: String(skipStartLines),
      });
      savePrefs({ [`csv-skip-end-lines-${accountId}`]: String(skipEndLines) });
      savePrefs({ [`csv-in-out-mode-${accountId}`]: String(inOutMode) });
      savePrefs({ [`csv-out-value-${accountId}`]: String(outValue) });
    }

    if (filetype === 'csv' || filetype === 'qif') {
      savePrefs({
        [`flip-amount-${accountId}-${filetype}`]: String(flipAmount),
      });
    }

    if (filetype !== 'csv') {
      savePrefs({
        [`import-notes-${accountId}-${filetype}`]: String(importNotes),
      });
    }

    if (filetype === 'qif') {
      savePrefs({
        [`qif-swap-payee-memo-${accountId}`]: String(qifSwapPayeeAndMemo),
      });
    }

    if (isCamtFile(filetype)) {
      savePrefs({
        [`camt-swap-payee-memo-${accountId}`]: String(camtSwapPayeeAndMemo),
      });
    }

    savePrefs({
      [`import-reimport-deleted-${accountId}`]: String(reimportDeleted),
      [`import-clear-${accountId}`]: String(clearOnImport),
    });

    savePrefs({ [`import-merge-${accountId}`]: String(reconcile) });

    importTransactions.mutate(
      {
        accountId,
        transactions: finalTransactions,
        reconcile,
        reimportDeleted,
      },
      {
        onSuccess: async didChange => {
          if (didChange) {
            void queryClient.invalidateQueries(payeeQueries.list());
          }

          if (onImported) {
            onImported(didChange);
          }

          close();
        },
      },
    );
  }

  const importPreviewTransactions = useImportPreviewTransactionsMutation();

  const onImportPreview = useEffectEvent(async () => {
    // Filter by start date before preview and deduplication
    const isPreParsed = isOfxFile(filetype) || isCamtFile(filetype);
    const filteredTransactions = filterByStartDate(
      parsedTransactions,
      startDate,
      isPreParsed,
      fieldMappings,
      parseDateFormat,
    );

    // always start from the original parsed transactions, not the previewed ones to ensure rules run
    const previewTransactionsToImport = await getImportPreview(
      filteredTransactions,
      filetype,
      flipAmount,
      fieldMappings,
      splitMode,
      parseDateFormat,
      inOutMode,
      outValue,
      multiplierAmount,
    );

    // Retreive the transactions that would be updated (along with the existing trx)
    importPreviewTransactions.mutate(
      {
        accountId,
        transactions: previewTransactionsToImport,
        reimportDeleted,
      },
      {
        onSuccess: previewTrx => {
          const matchedUpdateMap = previewTrx.reduce((map, entry) => {
            // @ts-expect-error - entry.transaction might not have trx_id property
            map[entry.transaction.trx_id] = entry;
            return map;
          }, {});

          const previewTransactions = filteredTransactions
            .filter(trans => !trans.isMatchedTransaction)
            .reduce((previous, currentTrx) => {
              let next = previous;
              const entry = matchedUpdateMap[currentTrx.trx_id];
              const existingTrx = entry?.existing;

              // if the transaction is matched with an existing one for update
              currentTrx.existing = !!existingTrx;
              // if the transaction is an update that will be ignored
              // (reconciled transactions or no change detected)
              currentTrx.ignored = entry?.ignored || false;

              currentTrx.tombstone = entry?.tombstone || false;

              currentTrx.selected = !currentTrx.ignored;
              currentTrx.selected_merge = currentTrx.existing;

              next = next.concat({ ...currentTrx });

              if (existingTrx) {
                // add the updated existing transaction in the list, with the
                // isMatchedTransaction flag to identify it in display and not send it again
                existingTrx.isMatchedTransaction = true;
                existingTrx.category = categories.find(
                  cat => cat.id === existingTrx.category,
                )?.name;
                // add parent transaction attribute to mimic behaviour
                existingTrx.trx_id = currentTrx.trx_id;
                existingTrx.existing = currentTrx.existing;
                existingTrx.selected = currentTrx.selected;
                existingTrx.selected_merge = currentTrx.selected_merge;

                next = next.concat({ ...existingTrx });
              }

              return next;
            }, []);

          setTransactions(previewTransactions);
        },
      },
    );
  });

  useEffect(() => {
    if (parsedTransactions.length === 0 || loadingState === 'parsing') {
      return;
    }

    void onImportPreview();
  }, [
    loadingState,
    parsedTransactions.length,
    startDate,
    fieldMappings,
    parseDateFormat,
    reimportDeleted,
  ]);

  const headers: ComponentProps<typeof TableHeader>['headers'] = [
    { name: t('Date'), width: 200 },
    { name: t('Payee'), width: 'flex' },
    { name: t('Notes'), width: 'flex' },
    { name: t('Category'), width: 'flex' },
  ];

  if (reconcile) {
    headers.unshift({ name: ' ', width: 31 });
  }
  if (inOutMode) {
    headers.push({
      name: t('In/Out'),
      width: 90,
      style: { textAlign: 'left' },
    });
  }
  if (splitMode) {
    headers.push({
      name: t('Outflow'),
      width: 90,
      style: { textAlign: 'right' },
    });
    headers.push({
      name: t('Inflow'),
      width: 90,
      style: { textAlign: 'right' },
    });
  } else {
    headers.push({
      name: t('Amount'),
      width: 90,
      style: { textAlign: 'right' },
    });
  }

  const importCount = transactions.filter(
    trans => !trans.isMatchedTransaction && trans.selected && !trans.tombstone,
  ).length;
  const sinceDate = formatDate(startDate, dateFormat);
  // File format options are remembered per account, so keep them out of the
  // way unless the file didn't parse
  const fileOptionsOpen =
    showFileOptions ||
    !!error?.parsed ||
    (loadingState === null && parsedTransactions.length === 0);
  const delimiterNames = {
    ',': t('Comma'),
    ';': t('Semicolon'),
    '|': t('Pipe'),
    '\t': t('Tab'),
    '~': t('Tilde'),
  };
  const fileFormatSummary = [
    delimiterNames[delimiter] ?? delimiter,
    hasHeaderRow ? t('header row') : t('no header row'),
    csvEncoding === 'auto' ? null : csvEncoding.toUpperCase(),
    skipStartLines + skipEndLines > 0
      ? t('skip {{start}} start, {{end}} end lines', {
          start: skipStartLines,
          end: skipEndLines,
        })
      : null,
  ]
    .filter(Boolean)
    .join(', ');
  const swapPayeeAndMemo = isOfxFile(filetype)
    ? { checked: ofxSwapPayeeAndMemo, onChange: setOfxSwapPayeeAndMemo }
    : filetype === 'qif'
      ? { checked: qifSwapPayeeAndMemo, onChange: setQifSwapPayeeAndMemo }
      : isCamtFile(filetype)
        ? { checked: camtSwapPayeeAndMemo, onChange: setCamtSwapPayeeAndMemo }
        : null;

  return (
    <Modal
      name="import-transactions"
      isLoading={loadingState === 'parsing'}
      containerProps={{
        style: {
          width: 900,
          height: 'calc(var(--visual-viewport-height) * 0.9)',
        },
      }}
    >
      {({ state }) => (
        <>
          {/* Sticky so the import button stays reachable on short screens */}
          <View
            style={{
              position: 'sticky',
              top: -10,
              zIndex: 300,
              flexShrink: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              margin: '-10px -10px 0',
              padding: 10,
              backgroundColor: theme.modalBackground,
            }}
          >
            <ModalCloseButton onPress={() => state.close()} />
            <h1
              style={{
                flex: 1,
                margin: 0,
                fontSize: 25,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <Trans>Import transactions</Trans>
            </h1>
            <ButtonWithLoading
              variant="primary"
              autoFocus
              isDisabled={importCount === 0}
              isLoading={loadingState === 'importing'}
              onPress={() => {
                void onImport(() => state.close());
              }}
            >
              <Trans count={importCount}>
                Import {{ count: importCount }} transactions
              </Trans>
            </ButtonWithLoading>
          </View>
          {error && !error.parsed && (
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ marginRight: 10, color: theme.errorText }}>
                <strong>
                  <Trans>Error:</Trans>
                </strong>{' '}
                {error.message}
              </Text>
            </View>
          )}
          {(!error || !error.parsed) && (
            <View
              style={{
                ...styles.tableContainer,
                flex: '1 1 0',
                minHeight: 200,
              }}
            >
              <TableHeader headers={headers} />
              {(filetype === 'csv' || filetype === 'qif') && (
                <FieldMappings
                  transactions={parsedTransactions}
                  mappings={filetype === 'csv' ? fieldMappings : null}
                  onChange={onUpdateFields}
                  parseDateFormat={parseDateFormat}
                  onChangeDateFormat={value => {
                    setParseDateFormat(isDateFormat(value) ? value : null);
                  }}
                  splitMode={splitMode}
                  inOutMode={inOutMode}
                  hasHeaderRow={hasHeaderRow}
                  reconcile={reconcile}
                />
              )}

              {/* @ts-expect-error - ImportTransaction is not a TableItem */}
              <TableWithNavigator<ImportTransaction>
                items={transactions.filter(
                  trans =>
                    !trans.isMatchedTransaction ||
                    (trans.isMatchedTransaction && reconcile),
                )}
                fields={['payee', 'category', 'amount']}
                style={{ backgroundColor: theme.tableHeaderBackground }}
                getItemKey={index => String(index)}
                renderEmpty={() => {
                  return (
                    <View
                      style={{
                        textAlign: 'center',
                        marginTop: 25,
                        color: theme.tableHeaderText,
                        fontStyle: 'italic',
                      }}
                    >
                      {startDate && parsedTransactions.length > 0 ? (
                        <Trans>
                          No transactions found since {{ sinceDate }}
                        </Trans>
                      ) : (
                        <Trans>No transactions found</Trans>
                      )}
                    </View>
                  );
                }}
                renderItem={({ item, index }) => (
                  <View>
                    <Transaction
                      transaction={item}
                      index={index}
                      showParsed={filetype === 'csv' || filetype === 'qif'}
                      parseDateFormat={parseDateFormat}
                      dateFormat={dateFormat}
                      fieldMappings={fieldMappings}
                      splitMode={splitMode}
                      inOutMode={inOutMode}
                      outValue={outValue}
                      flipAmount={flipAmount}
                      multiplierAmount={multiplierAmount}
                      categories={categories}
                      onCheckTransaction={onCheckTransaction}
                      reconcile={reconcile}
                    />
                  </View>
                )}
              />
            </View>
          )}
          {error && error.parsed && (
            <View
              style={{
                color: theme.errorText,
                alignItems: 'center',
                marginTop: 10,
              }}
            >
              <Text style={{ maxWidth: 450, marginBottom: 15 }}>
                <strong>Error:</strong> {error.message}
              </Text>
              {error.parsed && (
                <Button onPress={() => onNewFile()}>
                  <Trans>Select new file...</Trans>
                </Button>
              )}
            </View>
          )}

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '10px 20px',
              marginTop: 10,
              flexShrink: 0,
            }}
          >
            <OptionGroup title={t('Import options')}>
              <InlineLabel htmlFor="start-date-filter">
                <Trans>Only import since:</Trans>
                <Input
                  id="start-date-filter"
                  type="date"
                  value={startDate}
                  onChangeValue={value => setStartDate(value)}
                  style={{ width: 130 }}
                />
                {startDate && (
                  <Button variant="bare" onPress={() => setStartDate('')}>
                    <Trans>Clear</Trans>
                  </Button>
                )}
              </InlineLabel>
              <CheckboxToggle
                id="form_dont_reconcile"
                checked={reconcile}
                onChange={setReconcile}
              >
                <Trans>Merge with existing transactions</Trans>
              </CheckboxToggle>
              {reconcile && (
                <CheckboxToggle
                  id="form_reimport_deleted"
                  checked={reimportDeleted}
                  onChange={setReimportDeleted}
                >
                  <Trans>Reimport deleted transactions</Trans>
                </CheckboxToggle>
              )}
              <CheckboxToggle
                id="clear_on_import"
                checked={clearOnImport}
                onChange={setClearOnImport}
              >
                <Trans>Clear transactions on import</Trans>
              </CheckboxToggle>
              {filetype !== 'csv' && (
                <CheckboxToggle
                  id="import_notes"
                  checked={importNotes}
                  onChange={setImportNotes}
                >
                  <Trans>Import notes from file</Trans>
                </CheckboxToggle>
              )}
              {swapPayeeAndMemo && (
                <CheckboxToggle
                  id="form_swap_payee_memo"
                  checked={swapPayeeAndMemo.checked}
                  onChange={swapPayeeAndMemo.onChange}
                >
                  <Trans>Swap Payee and Memo</Trans>
                </CheckboxToggle>
              )}
              {isOfxFile(filetype) && (
                <CheckboxToggle
                  id="form_fallback_missing_payee"
                  checked={fallbackMissingPayeeToMemo}
                  onChange={setFallbackMissingPayeeToMemo}
                >
                  <Trans>Use Memo as a fallback for empty Payees</Trans>
                </CheckboxToggle>
              )}
            </OptionGroup>

            {(filetype === 'qif' || filetype === 'csv') && (
              <OptionGroup title={t('Amount options')}>
                <CheckboxToggle
                  id="form_flip"
                  checked={flipAmount}
                  onChange={setFlipAmount}
                >
                  <Trans>Flip amount</Trans>
                </CheckboxToggle>
                <InlineLabel htmlFor="multiply-amount">
                  <Trans>Multiply by:</Trans>
                  <Input
                    id="multiply-amount"
                    value={multiplierAmount}
                    placeholder="1"
                    onChangeValue={onMultiplierChange}
                    style={{ width: 70 }}
                  />
                </InlineLabel>
                {filetype === 'csv' && (
                  <>
                    <InlineLabel htmlFor="csv-amount-format">
                      <Trans>Amounts:</Trans>
                      <Select
                        id="csv-amount-format"
                        options={[
                          ['amount', t('One column')],
                          ['split', t('Outflow + inflow columns')],
                          ['inOut', t('Amount + in/out column')],
                        ]}
                        value={
                          splitMode ? 'split' : inOutMode ? 'inOut' : 'amount'
                        }
                        onChange={value => {
                          setInOutMode(value === 'inOut');
                          if ((value === 'split') !== splitMode) {
                            onSplitMode();
                          }
                        }}
                      />
                    </InlineLabel>
                    {inOutMode && (
                      <InlineLabel htmlFor="csv-out-value">
                        <Trans>Outflow value:</Trans>
                        <Input
                          id="csv-out-value"
                          value={outValue}
                          onChangeValue={setOutValue}
                          placeholder={t('e.g. Debit')}
                          style={{ width: 100 }}
                        />
                      </InlineLabel>
                    )}
                  </>
                )}
              </OptionGroup>
            )}

            {filetype === 'csv' && (
              <OptionGroup title={t('File format')}>
                {fileOptionsOpen ? (
                  <>
                    <CheckboxToggle
                      id="form_has_header"
                      checked={hasHeaderRow}
                      onChange={setHasHeaderRow}
                    >
                      <Trans>File has header row</Trans>
                    </CheckboxToggle>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <InlineLabel htmlFor="csv-delimiter-select">
                        <Trans>Delimiter:</Trans>
                        <Select
                          id="csv-delimiter-select"
                          options={[
                            [',', ','],
                            [';', ';'],
                            ['|', '|'],
                            ['\t', 'tab'],
                            ['~', '~'],
                          ]}
                          value={delimiter}
                          onChange={value => {
                            setDelimiter(value);
                          }}
                          style={{ width: 50 }}
                        />
                      </InlineLabel>
                      <InlineLabel htmlFor="csv-encoding-select">
                        <Trans>Encoding:</Trans>
                        <Select
                          id="csv-encoding-select"
                          options={[
                            ['auto', t('Auto (detect)')],
                            ['utf-8', t('UTF-8')],
                            ['utf-16le', t('UTF-16 LE')],
                            ['utf-16be', t('UTF-16 BE')],
                            ['windows-1252', t('Windows-1252')],
                            ['windows-1250', t('Windows-1250')],
                            ['iso-8859-2', t('ISO-8859-2')],
                          ]}
                          value={csvEncoding}
                          onChange={value => {
                            setCsvEncoding(value);
                          }}
                          style={{ width: 110 }}
                        />
                      </InlineLabel>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <InlineLabel htmlFor="csv-skip-start-lines">
                        <Trans>Skip start lines:</Trans>
                        <Input
                          id="csv-skip-start-lines"
                          type="number"
                          value={skipStartLines}
                          min="0"
                          step="1"
                          onChangeValue={value => {
                            setSkipStartLines(
                              Math.abs(parseInt(value, 10) || 0),
                            );
                          }}
                          style={{ width: 45 }}
                        />
                      </InlineLabel>
                      <InlineLabel htmlFor="csv-skip-end-lines">
                        <Trans>end lines:</Trans>
                        <Input
                          id="csv-skip-end-lines"
                          type="number"
                          value={skipEndLines}
                          min="0"
                          step="1"
                          onChangeValue={value => {
                            setSkipEndLines(Math.abs(parseInt(value, 10) || 0));
                          }}
                          style={{ width: 45 }}
                        />
                      </InlineLabel>
                    </View>
                  </>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Text style={{ color: theme.pageTextSubdued }}>
                      {fileFormatSummary}
                    </Text>
                    <Button
                      variant="bare"
                      onPress={() => setShowFileOptions(true)}
                    >
                      <Trans>Change</Trans>
                    </Button>
                  </View>
                )}
              </OptionGroup>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}

function OptionGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontWeight: 600 }}>{title}</Text>
      {children}
    </View>
  );
}

function InlineLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 5,
        alignItems: 'center',
      }}
    >
      {children}
    </label>
  );
}

function getParseOptions(fileType: string, options: ParseFileOptions = {}) {
  if (fileType === 'csv') {
    const { delimiter, encoding, hasHeaderRow, skipStartLines, skipEndLines } =
      options;
    return { delimiter, encoding, hasHeaderRow, skipStartLines, skipEndLines };
  }
  if (isOfxFile(fileType)) {
    const { fallbackMissingPayeeToMemo, importNotes, swapPayeeAndMemo } =
      options;
    return { fallbackMissingPayeeToMemo, importNotes, swapPayeeAndMemo };
  }
  if (fileType === 'qif') {
    const { importNotes, swapPayeeAndMemo } = options;
    return { importNotes, swapPayeeAndMemo };
  }
  if (isCamtFile(fileType)) {
    const { importNotes, swapPayeeAndMemo } = options;
    return { importNotes, swapPayeeAndMemo };
  }
  const { importNotes } = options;
  return { importNotes };
}

function getSwapOption(
  fileType: string,
  ofxSwapPayeeAndMemo: boolean,
  qifSwapPayeeAndMemo: boolean,
  camtSwapPayeeAndMemo: boolean,
) {
  if (isOfxFile(fileType)) {
    return ofxSwapPayeeAndMemo;
  }

  if (fileType === 'qif') {
    return qifSwapPayeeAndMemo;
  }

  if (isCamtFile(fileType)) {
    return camtSwapPayeeAndMemo;
  }

  return false;
}

function isOfxFile(fileType: string) {
  return fileType === 'ofx' || fileType === 'qfx';
}

function isCamtFile(fileType: string) {
  return fileType === 'xml';
}
