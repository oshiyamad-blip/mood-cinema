import { createContext, useContext } from 'react';
import { ja } from './ja';
import { en } from './en';

export type Lang = 'ja' | 'en';
export type Translations = typeof ja;

export const translations: Record<Lang, Translations> = { ja, en };

export interface I18nContextValue {
  lang: Lang;
  t: Translations;
  prefix: string; // '' for ja, '/en' for en
}

export const I18nContext = createContext<I18nContextValue>({
  lang: 'ja',
  t: ja,
  prefix: '',
});

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
