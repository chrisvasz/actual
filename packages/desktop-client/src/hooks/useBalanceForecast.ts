import { send } from '@actual-app/core/platform/client/connection';
import type { RuleConditionEntity } from '@actual-app/core/types/models';
import type { ForecastResult } from '@actual-app/core/types/models/forecast';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

type UseBalanceForecastParams = {
  accountIds?: string[];
  conditions?: RuleConditionEntity[];
  conditionsOp?: 'and' | 'or';
  startDate: string;
  endDate: string;
  includeAccountlessSchedules?: boolean;
  enabled?: boolean;
};

export function buildBalanceForecastRequest({
  accountIds,
  conditions,
  conditionsOp,
  startDate,
  endDate,
  includeAccountlessSchedules,
}: UseBalanceForecastParams) {
  return Object.fromEntries(
    Object.entries({
      accountIds,
      conditions,
      conditionsOp,
      startDate,
      endDate,
      includeAccountlessSchedules,
    }).filter(([, value]) => value !== undefined),
  );
}

export function useBalanceForecast({
  accountIds,
  conditions,
  conditionsOp,
  startDate,
  endDate,
  includeAccountlessSchedules,
  enabled = true,
}: UseBalanceForecastParams) {
  return useQuery({
    queryKey: [
      'balance-forecast',
      {
        accountIds: accountIds ?? null,
        conditions: conditions ?? null,
        conditionsOp: conditionsOp ?? 'and',
        startDate,
        endDate,
        includeAccountlessSchedules: includeAccountlessSchedules ?? false,
      },
    ],
    queryFn: async (): Promise<ForecastResult> =>
      send(
        'forecast/generate',
        buildBalanceForecastRequest({
          accountIds,
          conditions,
          conditionsOp,
          startDate,
          endDate,
          includeAccountlessSchedules,
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
