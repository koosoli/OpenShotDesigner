/**
 * Minimal DE/EN chrome translation (no dependency).
 *
 * The app's domain vocabulary (shot sizes, departments, paperwork labels) is
 * hundreds of strings and stays English for now — translating the *chrome*
 * (save states, dashboard, nav) covers the daily driver for German crews
 * without a risky string-by-string migration. Every key exists in both
 * languages; `t()` falls back to English when a language or key is missing.
 */
export type AppLanguage = 'en' | 'de';

const LANG_KEY = 'openshotdesigner_lang';

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'de'];

export const detectLanguage = (): AppLanguage => {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'de' || stored === 'en') return stored;
    return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
};

export const persistLanguage = (lang: AppLanguage): void => {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Preference only — never break the app over it.
  }
};

const en = {
  'save.saving': 'Saving…',
  'save.saved': 'Saved locally',
  'save.error': 'Save failed',
  'save.retry': 'Retry',
  'nav.dashboard': 'All projects (dashboard)',
  'nav.rename': 'Click to rename project',
  'nav.language': 'Language',
  'dashboard.title': 'Projects',
  'dashboard.new': 'New project',
  'dashboard.open': 'Open',
  'dashboard.backupAvailable': 'Safety copy available',
  'dashboard.restoreBackup': 'Restore safety copy',
  'conflict.reload': 'Reload',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.save': 'Save',
} as const;

export type I18nKey = keyof typeof en;

const de: Record<I18nKey, string> = {
  'save.saving': 'Speichert…',
  'save.saved': 'Lokal gespeichert',
  'save.error': 'Speichern fehlgeschlagen',
  'save.retry': 'Erneut versuchen',
  'nav.dashboard': 'Alle Projekte (Übersicht)',
  'nav.rename': 'Klicken zum Umbenennen',
  'nav.language': 'Sprache',
  'dashboard.title': 'Projekte',
  'dashboard.new': 'Neues Projekt',
  'dashboard.open': 'Öffnen',
  'dashboard.backupAvailable': 'Sicherheitskopie vorhanden',
  'dashboard.restoreBackup': 'Sicherheitskopie wiederherstellen',
  'conflict.reload': 'Neu laden',
  'common.close': 'Schließen',
  'common.cancel': 'Abbrechen',
  'common.delete': 'Löschen',
  'common.save': 'Speichern',
};

const dictionaries: Record<AppLanguage, Record<I18nKey, string>> = { en, de };

export const translate = (lang: AppLanguage, key: I18nKey): string =>
  dictionaries[lang]?.[key] ?? en[key];
