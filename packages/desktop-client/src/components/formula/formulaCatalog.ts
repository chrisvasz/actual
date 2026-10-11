import type { Completion } from '@codemirror/autocomplete';

export type FormulaMode = 'query' | 'transaction';

export type FormulaFunctionCategory =
  | 'math'
  | 'logical'
  | 'text'
  | 'date'
  | 'query'
  | 'other';

export type FormulaFunctionDef = {
  name: string;
  category: FormulaFunctionCategory;
  modes: FormulaMode[];
  description: string;
  parameters: Array<{ name: string; description: string }>;
};

export const budgetQueryDimensions = [
  'budgeted',
  'spent',
  'balance_start',
  'balance_end',
] as const;

type FormulaFunctionCategoryConfig = {
  section: string;
  order: number;
  tokenClass:
    | 'keyword'
    | 'className'
    | 'namespace'
    | 'typeName'
    | 'propertyName'
    | 'function';
};

export function getFormulaFunctionCategoryConfig(): Record<
  FormulaFunctionCategory,
  FormulaFunctionCategoryConfig
> {
  return {
    query: {
      section: `🔍 ${'Query Functions'}`,
      order: 0,
      tokenClass: 'propertyName',
    },
    math: {
      section: `📊 ${'Math Functions'}`,
      order: 1,
      tokenClass: 'keyword',
    },
    logical: {
      section: `🔀 ${'Logical Functions'}`,
      order: 2,
      tokenClass: 'className',
    },
    text: {
      section: `📝 ${'Text Functions'}`,
      order: 3,
      tokenClass: 'namespace',
    },
    date: {
      section: `📅 ${'Date Functions'}`,
      order: 4,
      tokenClass: 'typeName',
    },
    other: {
      section: `⚙️ ${'Other Functions'}`,
      order: 5,
      tokenClass: 'function',
    },
  };
}

function getVariableCompletionSection(): string {
  return `🔢 ${'Variables'}`;
}

export function getFunctionSignatureCompletionSection(): string {
  return `ℹ️ ${'Function Signature'}`;
}

export function getBudgetDimensionCompletionSection(): string {
  return `💸 ${'Budget Dimensions'}`;
}

export function getBudgetCategoryCompletionSection(): string {
  return `🏷️ ${'Budget Categories'}`;
}

function getRuleFieldCompletionSection(): string {
  return `💰 ${'Transaction Fields'}`;
}

function getFormulaCompletionSectionOrder(): Record<string, number> {
  const categoryConfig = getFormulaFunctionCategoryConfig();

  return {
    [getFunctionSignatureCompletionSection()]: -2,
    [getVariableCompletionSection()]: -1,
    [categoryConfig.query.section]: categoryConfig.query.order,
    [categoryConfig.math.section]: categoryConfig.math.order,
    [categoryConfig.logical.section]: categoryConfig.logical.order,
    [categoryConfig.text.section]: categoryConfig.text.order,
    [categoryConfig.date.section]: categoryConfig.date.order,
    [categoryConfig.other.section]: categoryConfig.other.order,
    [getBudgetDimensionCompletionSection()]: 6,
    [getBudgetCategoryCompletionSection()]: 7,
    [getRuleFieldCompletionSection()]: 8,
  };
}

export function getFormulaFunctionCatalog(): Record<
  string,
  FormulaFunctionDef
> {
  return {
    SUM: {
      name: 'SUM',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Returns the sum of all numbers in a range.',
      parameters: [{ name: 'numbers', description: 'One or more numbers' }],
    },
    AVERAGE: {
      name: 'AVERAGE',
      category: 'math',
      modes: ['query'],
      description: 'Returns the average of all numbers in a range.',
      parameters: [{ name: 'numbers', description: 'One or more numbers' }],
    },
    MAX: {
      name: 'MAX',
      category: 'math',
      modes: ['query'],
      description: 'Returns the maximum value from numbers.',
      parameters: [{ name: 'numbers', description: 'One or more numbers' }],
    },
    MIN: {
      name: 'MIN',
      category: 'math',
      modes: ['query'],
      description: 'Returns the minimum value from numbers.',
      parameters: [{ name: 'numbers', description: 'One or more numbers' }],
    },
    ABS: {
      name: 'ABS',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Returns the absolute value of a number.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    ROUND: {
      name: 'ROUND',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Rounds a number to specified decimals.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'decimals', description: 'Decimals' },
      ],
    },
    ROUNDDOWN: {
      name: 'ROUNDDOWN',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Rounds down to specified decimals.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'decimals', description: 'Decimals' },
      ],
    },
    ROUNDUP: {
      name: 'ROUNDUP',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Rounds up to specified decimals.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'decimals', description: 'Decimals' },
      ],
    },
    BUDGET_QUERY: {
      name: 'BUDGET_QUERY',
      category: 'query',
      modes: ['query'],
      description:
        'Evaluate a budget query using extracted parameters. Supply dimension, categories, and timeframe explicitly.',
      parameters: [
        {
          name: 'dimension',
          description:
            'One of: budgeted, spent, balance_start, balance_end (string)',
        },
        {
          name: 'categories',
          description:
            'Categories result from QUERY_EXTRACT_CATEGORIES() (array)',
        },
        {
          name: 'timeframe_start',
          description:
            'Start month from QUERY_EXTRACT_TIMEFRAME_START() (string)',
        },
        {
          name: 'timeframe_end',
          description: 'End month from QUERY_EXTRACT_TIMEFRAME_END() (string)',
        },
      ],
    },
    QUERY_EXTRACT_CATEGORIES: {
      name: 'QUERY_EXTRACT_CATEGORIES',
      category: 'query',
      modes: ['query'],
      description: 'Extract category IDs from a named query.',
      parameters: [
        {
          name: 'queryName',
          description: 'Name of the saved query (string)',
        },
      ],
    },
    QUERY_EXTRACT_TIMEFRAME_START: {
      name: 'QUERY_EXTRACT_TIMEFRAME_START',
      category: 'query',
      modes: ['query'],
      description: 'Extract the start month from a named query timeframe.',
      parameters: [
        {
          name: 'queryName',
          description: 'Name of the saved query (string)',
        },
      ],
    },
    QUERY_EXTRACT_TIMEFRAME_END: {
      name: 'QUERY_EXTRACT_TIMEFRAME_END',
      category: 'query',
      modes: ['query'],
      description: 'Extract the end month from a named query timeframe.',
      parameters: [
        {
          name: 'queryName',
          description: 'Name of the saved query (string)',
        },
      ],
    },
    FLOOR: {
      name: 'FLOOR',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Rounds down to nearest multiple of significance.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'significance', description: 'Significance' },
      ],
    },
    CEILING: {
      name: 'CEILING',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Rounds up to nearest multiple of significance.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'significance', description: 'Significance' },
      ],
    },
    POWER: {
      name: 'POWER',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Returns base raised to the power of exponent.',
      parameters: [
        { name: 'base', description: 'Base' },
        { name: 'exponent', description: 'Exponent' },
      ],
    },
    SQRT: {
      name: 'SQRT',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Returns the square root.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    MOD: {
      name: 'MOD',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Returns the remainder of division.',
      parameters: [
        { name: 'dividend', description: 'Dividend' },
        { name: 'divisor', description: 'Divisor' },
      ],
    },
    PI: {
      name: 'PI',
      category: 'math',
      modes: ['query'],
      description: 'Returns the value of PI.',
      parameters: [],
    },
    SIN: {
      name: 'SIN',
      category: 'math',
      modes: ['query'],
      description: 'Returns the sine of an angle.',
      parameters: [{ name: 'angle', description: 'Angle' }],
    },
    COS: {
      name: 'COS',
      category: 'math',
      modes: ['query'],
      description: 'Returns the cosine of an angle.',
      parameters: [{ name: 'angle', description: 'Angle' }],
    },
    TAN: {
      name: 'TAN',
      category: 'math',
      modes: ['query'],
      description: 'Returns the tangent of an angle.',
      parameters: [{ name: 'angle', description: 'Angle' }],
    },
    LN: {
      name: 'LN',
      category: 'math',
      modes: ['query'],
      description: 'Returns the natural logarithm.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    LOG: {
      name: 'LOG',
      category: 'math',
      modes: ['query'],
      description: 'Returns the logarithm to specified base.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'base', description: 'Base' },
      ],
    },
    LOG10: {
      name: 'LOG10',
      category: 'math',
      modes: ['query'],
      description: 'Returns the base-10 logarithm.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    EXP: {
      name: 'EXP',
      category: 'math',
      modes: ['query'],
      description: 'Returns e raised to the power of number.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    PRODUCT: {
      name: 'PRODUCT',
      category: 'math',
      modes: ['query'],
      description: 'Returns the product of all numbers.',
      parameters: [{ name: 'numbers', description: 'One or more numbers' }],
    },
    IF: {
      name: 'IF',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns one value if condition is TRUE, another if FALSE.',
      parameters: [
        { name: 'condition', description: 'Condition' },
        { name: 'value_if_true', description: 'Value to return when true' },
        {
          name: 'value_if_false',
          description: 'Value to return when false',
        },
      ],
    },
    IFS: {
      name: 'IFS',
      category: 'logical',
      modes: ['query', 'transaction'],
      description:
        'Checks multiple conditions and returns corresponding values.',
      parameters: [
        { name: 'condition1', description: 'First condition' },
        { name: 'value1', description: 'First value' },
      ],
    },
    AND: {
      name: 'AND',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if all arguments are TRUE.',
      parameters: [
        {
          name: 'conditions',
          description: 'One or more conditions',
        },
      ],
    },
    OR: {
      name: 'OR',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if any argument is TRUE.',
      parameters: [
        {
          name: 'conditions',
          description: 'One or more conditions',
        },
      ],
    },
    XOR: {
      name: 'XOR',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if odd number of arguments are TRUE.',
      parameters: [
        {
          name: 'conditions',
          description: 'One or more conditions',
        },
      ],
    },
    NOT: {
      name: 'NOT',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Reverses the logical value.',
      parameters: [{ name: 'condition', description: 'Condition' }],
    },
    TRUE: {
      name: 'TRUE',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns the logical value TRUE.',
      parameters: [],
    },
    FALSE: {
      name: 'FALSE',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns the logical value FALSE.',
      parameters: [],
    },
    IFERROR: {
      name: 'IFERROR',
      category: 'logical',
      modes: ['query', 'transaction'],
      description: 'Returns value if no error, otherwise returns alternative.',
      parameters: [
        { name: 'value', description: 'Value' },
        {
          name: 'value_if_error',
          description: 'Value to return when there is an error',
        },
      ],
    },
    IFNA: {
      name: 'IFNA',
      category: 'logical',
      modes: ['query', 'transaction'],
      description:
        'Returns value if not #N/A error, otherwise returns alternative.',
      parameters: [
        { name: 'value', description: 'Value' },
        {
          name: 'value_if_na',
          description: 'Value to return for #N/A errors',
        },
      ],
    },
    SWITCH: {
      name: 'SWITCH',
      category: 'logical',
      modes: ['query', 'transaction'],
      description:
        'Matches expression against values and returns corresponding result.',
      parameters: [
        { name: 'expression', description: 'Expression' },
        { name: 'value1', description: 'First value' },
        { name: 'result1', description: 'First result' },
      ],
    },
    CONCATENATE: {
      name: 'CONCATENATE',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Combines several text strings into one.',
      parameters: [{ name: 'texts', description: 'One or more text values' }],
    },
    INTEGER_TO_AMOUNT: {
      name: 'INTEGER_TO_AMOUNT',
      category: 'other',
      modes: ['query', 'transaction'],
      description:
        'Converts integer amount to decimal amount (e.g., 1234 -> 12.34).',
      parameters: [
        { name: 'integer_amount', description: 'Integer amount in cents' },
        {
          name: 'decimal_places',
          description: 'Number of decimal places (default: 2)',
        },
      ],
    },
    UPPER: {
      name: 'UPPER',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Converts text to uppercase.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    LOWER: {
      name: 'LOWER',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Converts text to lowercase.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    PROPER: {
      name: 'PROPER',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Capitalizes first letter of each word.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    LEFT: {
      name: 'LEFT',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Returns leftmost characters from text.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'num_chars', description: 'Number of characters' },
      ],
    },
    RIGHT: {
      name: 'RIGHT',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Returns rightmost characters from text.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'num_chars', description: 'Number of characters' },
      ],
    },
    MID: {
      name: 'MID',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Returns substring from specified position.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'start_pos', description: 'Starting position' },
        { name: 'length', description: 'Length' },
      ],
    },
    LEN: {
      name: 'LEN',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Returns length of text.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    TRIM: {
      name: 'TRIM',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Removes extra spaces from text.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    SUBSTITUTE: {
      name: 'SUBSTITUTE',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Replaces occurrences of text.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'old_text', description: 'Text to replace' },
        { name: 'new_text', description: 'Replacement text' },
      ],
    },
    REPLACE: {
      name: 'REPLACE',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Replaces substring at specified position.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'start_pos', description: 'Starting position' },
        { name: 'length', description: 'Length' },
        { name: 'new_text', description: 'Replacement text' },
      ],
    },
    FIND: {
      name: 'FIND',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Finds text within text (case-sensitive).',
      parameters: [
        { name: 'find_text', description: 'Text to find' },
        { name: 'within_text', description: 'Text to search within' },
      ],
    },
    SEARCH: {
      name: 'SEARCH',
      category: 'text',
      modes: ['query', 'transaction'],
      description:
        'Finds text within text (case-insensitive, supports wildcards).',
      parameters: [
        { name: 'search_text', description: 'Text to search for' },
        { name: 'text', description: 'Text' },
      ],
    },
    TEXT: {
      name: 'TEXT',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Converts number to text with format.',
      parameters: [
        { name: 'value', description: 'Number' },
        { name: 'format', description: 'Format' },
      ],
    },
    FIXED: {
      name: 'FIXED',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Formats a number to a fixed amount of decimal places.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'decimals', description: 'Decimals' },
      ],
    },
    FORMATNUMBER: {
      name: 'FORMATNUMBER',
      category: 'text',
      modes: ['query', 'transaction'],
      description:
        'Formats a number with thousands separators. Uses your app number format settings by default.',
      parameters: [
        { name: 'value', description: 'Number to format' },
        {
          name: 'decimals',
          description: 'Decimal places (optional, uses app settings)',
        },
        {
          name: 'thousandsSeparator',
          description: 'Thousands separator (optional, uses app settings)',
        },
        {
          name: 'decimalSeparator',
          description: 'Decimal separator (optional, uses app settings)',
        },
      ],
    },
    FORMATCURRENCY: {
      name: 'FORMATCURRENCY',
      category: 'text',
      modes: ['query', 'transaction'],
      description:
        'Formats a number as currency. Uses your app currency and number format settings by default.',
      parameters: [
        { name: 'value', description: 'Number to format' },
        {
          name: 'currencySymbol',
          description: 'Currency symbol (optional, uses app settings)',
        },
        {
          name: 'decimals',
          description: 'Decimal places (optional, uses app settings)',
        },
        {
          name: 'thousandsSeparator',
          description: 'Thousands separator (optional, uses app settings)',
        },
        {
          name: 'decimalSeparator',
          description: 'Decimal separator (optional, uses app settings)',
        },
        {
          name: 'symbolPosition',
          description: '"before" or "after" (optional, uses app settings)',
        },
        {
          name: 'spaceBetweenAmountAndSymbol',
          description: 'TRUE or FALSE (optional, uses app settings)',
        },
      ],
    },
    REPT: {
      name: 'REPT',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Repeats text specified number of times.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'number', description: 'Number' },
      ],
    },
    CHAR: {
      name: 'CHAR',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Converts number to character.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    CODE: {
      name: 'CODE',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Returns numeric code for first character.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    EXACT: {
      name: 'EXACT',
      category: 'text',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if texts are exactly the same.',
      parameters: [
        { name: 'text1', description: 'First text value' },
        { name: 'text2', description: 'Second text value' },
      ],
    },
    DATE: {
      name: 'DATE',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns date as number of days since null date.',
      parameters: [
        { name: 'year', description: 'Year' },
        { name: 'month', description: 'Month' },
        { name: 'day', description: 'Day' },
      ],
    },
    TODAY: {
      name: 'TODAY',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns current date.',
      parameters: [],
    },
    NOW: {
      name: 'NOW',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns current date and time.',
      parameters: [],
    },
    YEAR: {
      name: 'YEAR',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns the year from a date.',
      parameters: [{ name: 'date', description: 'Date value' }],
    },
    MONTH: {
      name: 'MONTH',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns the month from a date.',
      parameters: [{ name: 'date', description: 'Date value' }],
    },
    DAY: {
      name: 'DAY',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns the day from a date.',
      parameters: [{ name: 'date', description: 'Date value' }],
    },
    WEEKDAY: {
      name: 'WEEKDAY',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns day of week (1-7).',
      parameters: [
        { name: 'date', description: 'Date' },
        { name: 'type', description: 'Return type' },
      ],
    },
    EDATE: {
      name: 'EDATE',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns date shifted by specified months.',
      parameters: [
        { name: 'start_date', description: 'Start date' },
        { name: 'months', description: 'Months' },
      ],
    },
    EOMONTH: {
      name: 'EOMONTH',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns last day of month after specified months.',
      parameters: [
        { name: 'start_date', description: 'Start date' },
        { name: 'months', description: 'Months' },
      ],
    },
    DAYS: {
      name: 'DAYS',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Calculates difference between dates in days.',
      parameters: [
        { name: 'end_date', description: 'End date' },
        { name: 'start_date', description: 'Start date' },
      ],
    },
    DATEDIF: {
      name: 'DATEDIF',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Calculates distance between dates.',
      parameters: [
        { name: 'start_date', description: 'Start date' },
        { name: 'end_date', description: 'End date' },
        { name: 'unit', description: 'Unit' },
      ],
    },
    NETWORKDAYS: {
      name: 'NETWORKDAYS',
      category: 'date',
      modes: ['query'],
      description: 'Returns number of working days between dates.',
      parameters: [
        { name: 'start_date', description: 'Start date' },
        { name: 'end_date', description: 'End date' },
      ],
    },
    WEEKNUM: {
      name: 'WEEKNUM',
      category: 'date',
      modes: ['query', 'transaction'],
      description: 'Returns week number of year.',
      parameters: [
        { name: 'date', description: 'Date' },
        { name: 'type', description: 'Return type' },
      ],
    },
    CHOOSE: {
      name: 'CHOOSE',
      category: 'query',
      modes: ['query'],
      description: 'Returns value from list based on index.',
      parameters: [
        { name: 'index', description: 'Index (1-based)' },
        { name: 'value1', description: 'First value' },
        { name: 'value2', description: 'Additional values' },
      ],
    },
    ISBLANK: {
      name: 'ISBLANK',
      category: 'query',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if value is blank.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    ISERROR: {
      name: 'ISERROR',
      category: 'query',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if value is any error.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    ISNA: {
      name: 'ISNA',
      category: 'query',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if value is #N/A error.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    ISNUMBER: {
      name: 'ISNUMBER',
      category: 'query',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if value is a number.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    ISTEXT: {
      name: 'ISTEXT',
      category: 'query',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if value is text.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    ISLOGICAL: {
      name: 'ISLOGICAL',
      category: 'query',
      modes: ['query', 'transaction'],
      description: 'Returns TRUE if value is logical (TRUE/FALSE).',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    ISREF: {
      name: 'ISREF',
      category: 'other',
      modes: ['query'],
      description: 'Returns TRUE if value is a reference.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    PMT: {
      name: 'PMT',
      category: 'math',
      modes: ['query'],
      description: 'Calculates payment for a loan.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pv', description: 'Present value' },
      ],
    },
    FV: {
      name: 'FV',
      category: 'math',
      modes: ['query'],
      description: 'Calculates future value of investment.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pmt', description: 'Payment amount' },
      ],
    },
    PV: {
      name: 'PV',
      category: 'math',
      modes: ['query'],
      description: 'Calculates present value of investment.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pmt', description: 'Payment amount' },
      ],
    },
    NPV: {
      name: 'NPV',
      category: 'math',
      modes: ['query'],
      description: 'Calculates net present value.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'value1', description: 'First value' },
        { name: 'value2', description: 'Second value' },
      ],
    },
    IRR: {
      name: 'IRR',
      category: 'math',
      modes: ['query'],
      description: 'Calculates internal rate of return.',
      parameters: [{ name: 'values', description: 'Values' }],
    },
    RATE: {
      name: 'RATE',
      category: 'math',
      modes: ['query'],
      description: 'Calculates interest rate per period.',
      parameters: [
        { name: 'nper', description: 'Number of periods' },
        { name: 'pmt', description: 'Payment amount' },
        { name: 'pv', description: 'Present value' },
      ],
    },
    IPMT: {
      name: 'IPMT',
      category: 'math',
      modes: ['query', 'transaction'],
      description:
        'Calculates the interest portion of a loan payment for a given period.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'period', description: 'Period to calculate (1-based)' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pv', description: 'Present value' },
      ],
    },
    PPMT: {
      name: 'PPMT',
      category: 'math',
      modes: ['query', 'transaction'],
      description:
        'Calculates the principal portion of a loan payment for a given period.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'period', description: 'Period to calculate (1-based)' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pv', description: 'Present value' },
      ],
    },
    NPER: {
      name: 'NPER',
      category: 'math',
      modes: ['query', 'transaction'],
      description:
        'Calculates the number of payment periods for a loan or investment.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'pmt', description: 'Payment amount' },
        { name: 'pv', description: 'Present value' },
      ],
    },
    CUMIPMT: {
      name: 'CUMIPMT',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Calculates cumulative interest paid between two periods.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pv', description: 'Present value' },
        { name: 'start_period', description: 'First period (1-based)' },
        { name: 'end_period', description: 'Last period (1-based)' },
        {
          name: 'type',
          description: '0 = end of period, 1 = start of period',
        },
      ],
    },
    CUMPRINC: {
      name: 'CUMPRINC',
      category: 'math',
      modes: ['query', 'transaction'],
      description: 'Calculates cumulative principal paid between two periods.',
      parameters: [
        { name: 'rate', description: 'Interest rate' },
        { name: 'nper', description: 'Number of periods' },
        { name: 'pv', description: 'Present value' },
        { name: 'start_period', description: 'First period (1-based)' },
        { name: 'end_period', description: 'Last period (1-based)' },
        {
          name: 'type',
          description: '0 = end of period, 1 = start of period',
        },
      ],
    },
    MIRR: {
      name: 'MIRR',
      category: 'math',
      modes: ['query'],
      description:
        'Calculates the modified internal rate of return for a series of cash flows.',
      parameters: [
        { name: 'values', description: 'Range of cash flow values' },
        {
          name: 'finance_rate',
          description: 'Interest rate paid on financing',
        },
        {
          name: 'reinvest_rate',
          description: 'Interest rate earned on reinvested cash flows',
        },
      ],
    },
    XNPV: {
      name: 'XNPV',
      category: 'math',
      modes: ['query'],
      description:
        'Calculates net present value for cash flows on irregular (dated) intervals.',
      parameters: [
        { name: 'rate', description: 'Discount rate' },
        { name: 'values', description: 'Range of cash flow values' },
        {
          name: 'dates',
          description: 'Range of dates matching each cash flow',
        },
      ],
    },
    FVSCHEDULE: {
      name: 'FVSCHEDULE',
      category: 'math',
      modes: ['query'],
      description:
        'Calculates future value of a principal using a schedule of varying interest rates.',
      parameters: [
        { name: 'principal', description: 'Starting principal amount' },
        {
          name: 'schedule',
          description: 'Range of interest rates to apply successively',
        },
      ],
    },
    QUERY: {
      name: 'QUERY',
      category: 'query',
      modes: ['query'],
      description: 'Execute a query and return the result.',
      parameters: [
        { name: 'queryName', description: 'Name of the query to execute' },
      ],
    },
    QUERY_COUNT: {
      name: 'QUERY_COUNT',
      category: 'query',
      modes: ['query'],
      description: 'Execute a query and return the number of matching rows.',
      parameters: [
        { name: 'queryName', description: 'Name of the query to execute' },
      ],
    },
    BALANCE_OF: {
      name: 'BALANCE_OF',
      category: 'other',
      modes: ['query', 'transaction'],
      description:
        "Balance for an account. In rule formulas, this is the running balance (in cents) at this transaction, same cutoff as balance (use the balance variable instead for the current account). In report/query formulas, this is the account's current balance (in money/display units). Use a quoted account id for a deterministic match, or a quoted account name.",
      parameters: [
        {
          name: 'account_id_or_name',
          description: 'Quoted account id or exact account name',
        },
      ],
    },
    CLEAN: {
      name: 'CLEAN',
      category: 'text',
      modes: ['transaction'],
      description: 'Removes non-printable characters from text.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    SPLIT: {
      name: 'SPLIT',
      category: 'text',
      modes: ['transaction'],
      description: 'Splits text by space and returns part at index.',
      parameters: [
        { name: 'text', description: 'Text' },
        { name: 'index', description: 'Index' },
      ],
    },
    INT: {
      name: 'INT',
      category: 'math',
      modes: ['transaction'],
      description: 'Rounds down to nearest integer.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    TRUNC: {
      name: 'TRUNC',
      category: 'math',
      modes: ['transaction'],
      description: 'Truncates number to specified decimals.',
      parameters: [
        { name: 'number', description: 'Number' },
        { name: 'decimals', description: 'Decimals' },
      ],
    },
    SIGN: {
      name: 'SIGN',
      category: 'math',
      modes: ['transaction'],
      description: 'Returns -1 for negative, 0 for zero, 1 for positive.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    DATEVALUE: {
      name: 'DATEVALUE',
      category: 'date',
      modes: ['transaction'],
      description: 'Parses a date string and returns it as a number.',
      parameters: [{ name: 'date_string', description: 'Date string' }],
    },
    ISOWEEKNUM: {
      name: 'ISOWEEKNUM',
      category: 'date',
      modes: ['transaction'],
      description: 'Returns ISO week number.',
      parameters: [{ name: 'date', description: 'Date' }],
    },
    ISEVEN: {
      name: 'ISEVEN',
      category: 'query',
      modes: ['transaction'],
      description: 'Returns TRUE if number is even.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    ISODD: {
      name: 'ISODD',
      category: 'query',
      modes: ['transaction'],
      description: 'Returns TRUE if number is odd.',
      parameters: [{ name: 'number', description: 'Number' }],
    },
    VALUE: {
      name: 'VALUE',
      category: 'text',
      modes: ['transaction'],
      description: 'Converts text to a number.',
      parameters: [{ name: 'text', description: 'Text' }],
    },
    T: {
      name: 'T',
      category: 'text',
      modes: ['transaction'],
      description: 'Returns text if value is text, empty string otherwise.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
    N: {
      name: 'N',
      category: 'text',
      modes: ['transaction'],
      description: 'Converts value to a number.',
      parameters: [{ name: 'value', description: 'Value' }],
    },
  };
}

function getCompletionSectionName(completion: Completion): string {
  const { section } = completion;
  return typeof section === 'string' ? section : section?.name || '';
}

let formulaFunctionCategoryByName: Record<
  string,
  FormulaFunctionCategory
> | null = null;

function getFormulaFunctionCategoryByName(): Record<
  string,
  FormulaFunctionCategory
> {
  formulaFunctionCategoryByName ??= Object.fromEntries(
    Object.entries(getFormulaFunctionCatalog()).map(([name, func]) => [
      name,
      func.category,
    ]),
  );

  return formulaFunctionCategoryByName;
}

export function getFormulaFunctionsByMode(): Record<FormulaMode, string[]> {
  const functionsByMode: Record<FormulaMode, string[]> = {
    query: [],
    transaction: [],
  };

  for (const [name, func] of Object.entries(getFormulaFunctionCatalog())) {
    for (const mode of func.modes) {
      functionsByMode[mode].push(name);
    }
  }

  return functionsByMode;
}

export function getFormulaFunctionsForMode(
  mode: FormulaMode,
): Record<string, FormulaFunctionDef> {
  const catalog = getFormulaFunctionCatalog();

  return Object.fromEntries(
    Object.entries(catalog).filter(([, func]) => func.modes.includes(mode)),
  );
}

export function getFormulaFunctionByName(
  name: string,
  mode?: FormulaMode,
): FormulaFunctionDef | undefined {
  const upperName = name.toUpperCase();
  const func = getFormulaFunctionCatalog()[upperName];

  if (!func || (mode && !func.modes.includes(mode))) {
    return undefined;
  }

  return func;
}

export function getFormulaCategoryForName(
  name: string,
): FormulaFunctionCategory | undefined {
  return getFormulaFunctionCategoryByName()[name.toUpperCase()];
}

export function getFunctionCompletions(mode: FormulaMode): Completion[] {
  const categoryConfig = getFormulaFunctionCategoryConfig();

  return Object.entries(getFormulaFunctionsForMode(mode)).map(
    ([name, func]) => ({
      label: name,
      type: 'function',
      section: categoryConfig[func.category].section,
      info: [
        func.description,
        '',
        `${'Parameters:'} ${func.parameters.map(p => p.name).join(', ')}`,
        '',
        func.parameters.map(p => `- ${p.name}: ${p.description}`).join('\n'),
      ].join('\n'),
      apply: `${name}()`,
      boost: 10,
    }),
  );
}

export function getRuleFieldCompletions(): Completion[] {
  const ruleFieldSection = getRuleFieldCompletionSection();

  return [
    {
      label: 'amount',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Transaction amount in cents. Use for calculations and comparisons.\n\nExample: =amount / 100 to get dollar value',
    },
    {
      label: 'date',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Transaction date in YYYY-MM-DD format. Use with date functions.\n\nExample: =TEXT(date, "MMMM") to get month name',
    },
    {
      label: 'notes',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Transaction notes/memo text. Use for string operations.\n\nExample: =UPPER(notes) to convert to uppercase',
    },
    {
      label: 'imported_payee',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Original imported payee name from bank import. Contains the raw text before matching.\n\nExample: =LEFT(imported_payee, 10) to get first 10 characters',
    },
    {
      label: 'payee',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Payee ID (string). The ID of the payee.\n\nExample: =CONCATENATE("Payment to ", payee)',
    },
    {
      label: 'payee_name',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Payee name (string). The human-readable name of the payee.\n\nExample: =UPPER(payee_name) or =CONCATENATE("Payment to ", payee_name)',
    },
    {
      label: 'account',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Account ID (string). The ID of the account.\n\nExample: =CONCATENATE("Paid from ", account)',
    },
    {
      label: 'account_name',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Account name (string). The human-readable name of the account.\n\nExample: =CONCATENATE("Paid from ", account_name)',
    },
    {
      label: 'category',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Category ID (string). The ID of the category.\n\nExample: =IF(category="Groceries", "Food", "Other")',
    },
    {
      label: 'category_name',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Category Name (string). The human-readable name of the category.\n\nExample: =IF(category_name="Groceries", "Food", "Other")',
    },
    {
      label: 'cleared',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Boolean cleared status. TRUE if transaction is cleared, FALSE otherwise.\n\nExample: =IF(cleared, "Cleared", "Pending")',
    },
    {
      label: 'reconciled',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Boolean reconciled status. TRUE if transaction is reconciled, FALSE otherwise.',
    },
    {
      label: 'balance',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Account balance as of the date of the transaction, excluding the transaction amount. Use for calculations and comparisons.\n\nExample: =IF(balance < 0, "Negative Balance", "Positive Balance")',
    },
    {
      label: 'parent_amount',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'The amount of the parent transaction in cents in split transactions.\n\nExample: =(parent_amount / 100) * .05',
    },
    {
      label: 'parent_notes',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Notes of the parent transaction in split rules. Empty when absent.',
    },
    {
      label: 'parent_imported_payee',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Imported payee text of the parent transaction in split rules. Empty when absent.',
    },
    {
      label: 'parent_payee',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Payee ID of the parent transaction in split rules. Empty when absent.',
    },
    {
      label: 'parent_account',
      type: 'variable',
      section: ruleFieldSection,
      boost: 5,
      info: 'Account ID of the parent transaction in split rules. Empty when absent.',
    },
  ];
}

export function getDynamicReportQueryCompletions(
  queries?: Record<string, unknown>,
): Completion[] {
  if (!queries) {
    return [];
  }

  const queryFunctionSection = getFormulaFunctionCategoryConfig().query.section;

  return Object.keys(queries).flatMap(queryName => [
    {
      label: `QUERY("${queryName}")`,
      type: 'function',
      section: queryFunctionSection,
      info: `Execute the ${queryName} query and return the result.`,
      apply: `QUERY("${queryName}")`,
      boost: 15,
    },
    {
      label: `QUERY_COUNT("${queryName}")`,
      type: 'function',
      section: queryFunctionSection,
      info: `Execute the ${queryName} query and return the number of matching rows.`,
      apply: `QUERY_COUNT("${queryName}")`,
      boost: 14,
    },
    {
      label: `BUDGET_QUERY("budgeted", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      type: 'function',
      section: queryFunctionSection,
      info: `Sum of budgeted amounts with extracted parameters from ${queryName}.`,
      apply: `BUDGET_QUERY("budgeted", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      boost: 13,
    },
    {
      label: `BUDGET_QUERY("spent", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      type: 'function',
      section: queryFunctionSection,
      info: `Sum of spending with extracted parameters from ${queryName}.`,
      apply: `BUDGET_QUERY("spent", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      boost: 13,
    },
    {
      label: `BUDGET_QUERY("balance_start", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      type: 'function',
      section: queryFunctionSection,
      info: `Opening balance with extracted parameters from ${queryName}.`,
      apply: `BUDGET_QUERY("balance_start", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      boost: 13,
    },
    {
      label: `BUDGET_QUERY("balance_end", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      type: 'function',
      section: queryFunctionSection,
      info: `Closing balance with extracted parameters from ${queryName}.`,
      apply: `BUDGET_QUERY("balance_end", QUERY_EXTRACT_CATEGORIES("${queryName}"), QUERY_EXTRACT_TIMEFRAME_START("${queryName}"), QUERY_EXTRACT_TIMEFRAME_END("${queryName}"))`,
      boost: 13,
    },
  ]);
}

export function getNamedVariableCompletions(
  variables?: Record<string, number | string>,
): Completion[] {
  if (!variables) {
    return [];
  }

  const variableSection = getVariableCompletionSection();

  return Object.entries(variables).map(([varName, value]) => ({
    label: varName,
    type: 'variable',
    section: variableSection,
    info: `Variable with value: ${String(value)}`,
    boost: 20,
  }));
}

export function sortFormulaCompletions(
  completions: Completion[],
): Completion[] {
  const sectionOrder = getFormulaCompletionSectionOrder();

  return [...completions].sort((a, b) => {
    const sectionA = getCompletionSectionName(a);
    const sectionB = getCompletionSectionName(b);
    const orderA = sectionOrder[sectionA] ?? 999;
    const orderB = sectionOrder[sectionB] ?? 999;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const boostA = a.boost || 0;
    const boostB = b.boost || 0;
    if (boostA !== boostB) {
      return boostB - boostA;
    }

    return a.label.localeCompare(b.label);
  });
}
