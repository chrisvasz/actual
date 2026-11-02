import { createApp } from '#server/app';
import {
  getUserPreferencesForFormulas,
  loadUserPreferencesForFormulas,
} from '#server/formulas/customFunctionsPreferences';
import { setUserPreferencesReader } from '#shared/formulas/customFunctions';

export type FormulasHandlers = {
  'formula-load-user-preferences': typeof loadUserPreferencesForFormulas;
};

export const app = createApp<FormulasHandlers>();

app.method('formula-load-user-preferences', loadUserPreferencesForFormulas);

// Formulas read the budget's preferences each time they format a value, so
// a change from anywhere (the settings, a sync, an undo) applies at once.
setUserPreferencesReader(() => getUserPreferencesForFormulas());
