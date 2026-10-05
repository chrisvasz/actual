import type { CategoryGroupEntity } from './category-group';

export type CategoryEntity = {
  id: string;
  name: string;
  is_income?: boolean;
  group: CategoryGroupEntity['id'];
  goal_def?: string;
  cleanup_def?: string;
  goal_amount?: number | null;
  // Which column the goal measures; null means 'balance'
  goal_type?: CategoryGoalType | null;
  // For balance goals: the month (YYYY-MM) to reach the goal by
  goal_target_month?: string | null;
  template_settings?: { source: 'notes' | 'ui' };
  sort_order?: number;
  tombstone?: boolean;
  hidden?: boolean;
};

export type CategoryGoalType = 'budgeted' | 'balance';
