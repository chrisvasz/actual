import { memoizeOne } from '@actual-app/core/shared/memoize';
import { groupById } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

import { resetApp } from '#app/appSlice';

const sliceName = 'account';

type AccountState = {
  updatedAccounts: Array<AccountEntity['id']>;
};

const initialState: AccountState = {
  updatedAccounts: [],
};

type MarkUpdatedAccountsPayload = {
  ids: AccountState['updatedAccounts'];
};

type MarkAccountReadPayload = {
  id: AccountEntity['id'];
};

const accountsSlice = createSlice({
  name: sliceName,
  initialState,
  reducers: {
    markUpdatedAccounts(
      state,
      action: PayloadAction<MarkUpdatedAccountsPayload>,
    ) {
      state.updatedAccounts = action.payload.ids
        ? [...state.updatedAccounts, ...action.payload.ids]
        : state.updatedAccounts;
    },
    markAccountRead(state, action: PayloadAction<MarkAccountReadPayload>) {
      state.updatedAccounts = state.updatedAccounts.filter(
        id => id !== action.payload.id,
      );
    },
  },
  extraReducers: builder => {
    builder.addCase(resetApp, () => initialState);
  },
});

export const getAccountsById = memoizeOne(
  (accounts: AccountEntity[] | null | undefined) => groupById(accounts),
);

export const { name, reducer, getInitialState } = accountsSlice;
export const actions = {
  ...accountsSlice.actions,
};

export const { markAccountRead, markUpdatedAccounts } = accountsSlice.actions;
