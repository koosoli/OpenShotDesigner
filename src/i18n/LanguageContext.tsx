import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import {
  detectLanguage,
  persistLanguage,
  translate,
  type AppLanguage,
  type I18nKey,
} from './dictionary';

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: (key: I18nKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => translate('en', key),
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => detectLanguage());
  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
    persistLanguage(next);
  }, []);
  const t = useCallback((key: I18nKey) => translate(lang, key), [lang]);
  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextValue => useContext(LanguageContext);
