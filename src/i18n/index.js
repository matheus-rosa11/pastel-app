import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './resources/pt-BR';
import enUS from './resources/en-US';

const STORAGE_KEY = 'pastelapp_locale';
const DEFAULT_LANGUAGE = 'pt-BR';
const SUPPORTED_LANGUAGES = ['pt-BR', 'en-US'];

function normalizeLanguage(language) {
  if (!language) {
    return DEFAULT_LANGUAGE;
  }

  if (SUPPORTED_LANGUAGES.includes(language)) {
    return language;
  }

  if (language.toLowerCase().startsWith('pt')) {
    return 'pt-BR';
  }

  return 'en-US';
}

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const storedLanguage = window.localStorage.getItem(STORAGE_KEY);
  if (storedLanguage) {
    return normalizeLanguage(storedLanguage);
  }

  return normalizeLanguage(window.navigator.language);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': {
        translation: ptBR,
      },
      'en-US': {
        translation: enUS,
      },
    },
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false,
    },
  });

function syncLanguage(language) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, language);
  }
}

syncLanguage(i18n.resolvedLanguage || DEFAULT_LANGUAGE);
i18n.on('languageChanged', syncLanguage);

export default i18n;