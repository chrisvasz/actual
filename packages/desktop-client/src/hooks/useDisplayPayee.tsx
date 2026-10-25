import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import type {
  AccountEntity,
  PayeeEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { useAccounts } from './useAccounts';
import { usePayeesById } from './usePayees';

type DisplayPayeeContextValue = {
  getDisplayPayee: (transaction: TransactionEntity) => string;
};

const DisplayPayeeContext = createContext<DisplayPayeeContextValue | null>(
  null,
);

type DisplayPayeeProviderProps = {
  /** The rows shown, each split's children among them */
  transactions: readonly TransactionEntity[];
  children: ReactNode;
};

export function DisplayPayeeProvider({
  transactions,
  children,
}: DisplayPayeeProviderProps) {
  const accounts = useAccounts();
  const payeesById = usePayeesById();

  // A fresh context value re-renders every consumer (one per row shown), so
  // keep its identity tied to what it reads
  const value = useMemo(
    () => createDisplayPayees(transactions, payeesById, accounts),
    [transactions, payeesById, accounts],
  );

  return (
    <DisplayPayeeContext.Provider value={value}>
      {children}
    </DisplayPayeeContext.Provider>
  );
}

// Each row's payee is worked out when the row first asks: a register can
// have many more rows than show. Built outside the component so its cache is
// new with each set of rows (the compiler keeps a `new Map()` in a component
// body for the component's life).
function createDisplayPayees(
  transactions: readonly TransactionEntity[],
  payeesById: Record<PayeeEntity['id'], PayeeEntity>,
  accounts: readonly AccountEntity[],
): DisplayPayeeContextValue {
  const accountsById = new Map(accounts.map(a => [a.id, a]));
  const childrenByParent = new Map<
    TransactionEntity['id'],
    TransactionEntity[]
  >();
  for (const transaction of transactions) {
    if (transaction.is_child && transaction.parent_id) {
      const siblings = childrenByParent.get(transaction.parent_id);
      if (siblings) {
        siblings.push(transaction);
      } else {
        childrenByParent.set(transaction.parent_id, [transaction]);
      }
    }
  }
  const displayPayees = new Map<TransactionEntity['id'], string>();

  const transferAccount = (payee: PayeeEntity | undefined) =>
    payee?.transfer_acct ? accountsById.get(payee.transfer_acct) : undefined;

  return {
    getDisplayPayee(transaction) {
      let displayPayee = displayPayees.get(transaction.id);
      if (displayPayee == null) {
        displayPayee = getSplitPayee(
          transaction,
          childrenByParent.get(transaction.id) ?? [],
          payeesById,
          transferAccount,
        );
        displayPayees.set(transaction.id, displayPayee);
      }
      return displayPayee;
    },
  };
}

// A split shows its most common payee, and how many others it has
function getSplitPayee(
  transaction: TransactionEntity,
  subtransactions: readonly TransactionEntity[],
  payeesById: Record<PayeeEntity['id'], PayeeEntity>,
  transferAccount: (
    payee: PayeeEntity | undefined,
  ) => AccountEntity | undefined,
) {
  if (subtransactions.length === 0) {
    const payee = payeesById[transaction?.payee || ''];
    return getPrettyPayee({
      transaction,
      payee,
      transferAccount: transferAccount(payee),
    });
  }

  const { counts, mostCommonPayeeTransaction } = subtransactions.reduce(
    ({ counts, ...result }, sub) => {
      if (sub.payee) {
        counts[sub.payee] = (counts[sub.payee] || 0) + 1;
        if (counts[sub.payee] > result.maxCount) {
          return {
            counts,
            maxCount: counts[sub.payee],
            mostCommonPayeeTransaction: sub,
          };
        }
      }
      return { counts, ...result };
    },
    {
      counts: {},
      maxCount: 0,
      mostCommonPayeeTransaction: null,
    } as Counts,
  );

  if (!mostCommonPayeeTransaction) {
    return 'Split (no payee)';
  }

  const mostCommonPayee = payeesById[mostCommonPayeeTransaction.payee || ''];

  if (!mostCommonPayee) {
    return 'Split (no payee)';
  }

  const numDistinctPayees = Object.keys(counts).length;

  return getPrettyPayee({
    transaction: mostCommonPayeeTransaction,
    payee: mostCommonPayee,
    transferAccount: transferAccount(mostCommonPayee),
    numHiddenPayees: numDistinctPayees - 1,
  });
}

type Counts = {
  counts: Record<PayeeEntity['id'], number>;
  maxCount: number;
  mostCommonPayeeTransaction: TransactionEntity | null;
};

type UseDisplayPayeeProps = {
  transaction?: TransactionEntity | undefined;
};

export function useDisplayPayee({ transaction }: UseDisplayPayeeProps) {
  const context = useContext(DisplayPayeeContext);
  if (!context) {
    throw new Error(
      'useDisplayPayee must be used within a DisplayPayeeContextProvider.',
    );
  }
  return transaction ? context.getDisplayPayee(transaction) : '';
}

type GetPrettyPayeeProps = {
  transaction?: TransactionEntity | undefined;
  payee?: PayeeEntity | undefined;
  transferAccount?: AccountEntity | undefined;
  numHiddenPayees?: number | undefined;
};

function getPrettyPayee({
  transaction,
  payee,
  transferAccount,
  numHiddenPayees = 0,
}: GetPrettyPayeeProps) {
  if (!transaction) {
    return '';
  }

  const formatPayeeName = (payeeName: string) =>
    numHiddenPayees > 0
      ? `${payeeName} ${`(+${numHiddenPayees} more)`}`
      : payeeName;

  const { payee: payeeId } = transaction;

  if (transferAccount) {
    return formatPayeeName(transferAccount.name);
  } else if (payee) {
    return formatPayeeName(payee.name);
  } else if (payeeId && payeeId.startsWith('new:')) {
    return formatPayeeName(payeeId.slice('new:'.length));
  }

  return '';
}
