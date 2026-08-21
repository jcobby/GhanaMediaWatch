import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';

export const resources = {
  en: { translation: en },
} as const;

export type SupportedLocale = keyof typeof resources;

export const DEFAULT_LOCALE: SupportedLocale = 'en';

function resolveDeviceLocale(): SupportedLocale {
  const codes = getLocales().map((l) => l.languageCode);
  const match = codes.find((code): code is SupportedLocale => !!code && code in resources);
  return match ?? DEFAULT_LOCALE;
}

/**
 * Every user-facing string goes through here from day one, even while English
 * is the only locale — retrofitting i18n after the fact is what makes it never
 * happen. `resources` is a closed record so a missing key is a type error.
 */
// i18next exposes `use` both as a named export and as a method on the default
// instance; the instance method is the intended API here.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLocale(),
  fallbackLng: DEFAULT_LOCALE,
  // RN has no Intl plural rules gaps worth working around, and i18next v21+
  // escapes for HTML by default — pointless and lossy in RN.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
