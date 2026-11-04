import es from './es.json';
import en from './en.json';
import ru from './ru.json';
import ko from './ko.json';
import zh from './zh.json';
import { IdiomaCodigo } from '../types';

export const DICTIONARIES = {
  es,
  en,
  ru,
  ko,
  zh,
} as const;

export type TranslationNamespace = keyof typeof es;

export function getDictionary(lang: IdiomaCodigo) {
  return (DICTIONARIES as Record<string, any>)[lang] || DICTIONARIES.es;
}

export { es, en, ru, ko, zh };
