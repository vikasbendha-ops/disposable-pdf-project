import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import translations, {
  getRawTranslation,
  getSupportedLanguages,
  getTranslation,
  isSupportedLanguage,
} from '../i18n/translations';

const LanguageContext = createContext(null);

const DEFAULT_LOCALIZATION_CONFIG = Object.freeze({
  default_language: 'en',
  enabled_languages: ['en'],
  available_languages: ['en', 'es', 'fr', 'de', 'it', 'hi', 'sl'],
  automatic_detection: false,
  site_timezone: 'UTC',
  site_currency: 'EUR',
  manual_overrides: {},
});

const normalizeLocalizationConfig = (config) => {
  const source = config || {};
  const defaultLanguage = isSupportedLanguage(source.default_language)
    ? source.default_language
    : 'en';
  const enabledLanguages = Array.isArray(source.enabled_languages)
    ? source.enabled_languages.filter((code, index, array) =>
      isSupportedLanguage(code) && array.indexOf(code) === index)
    : [];
  const safeEnabledLanguages = enabledLanguages.length
    ? Array.from(new Set([defaultLanguage, ...enabledLanguages]))
    : [defaultLanguage];

  return {
    default_language: defaultLanguage,
    enabled_languages: safeEnabledLanguages,
    available_languages: Array.isArray(source.available_languages) && source.available_languages.length
      ? source.available_languages.filter((code, index, array) =>
        isSupportedLanguage(code) && array.indexOf(code) === index)
      : DEFAULT_LOCALIZATION_CONFIG.available_languages,
    automatic_detection: Boolean(source.automatic_detection),
    site_timezone: String(source.site_timezone || DEFAULT_LOCALIZATION_CONFIG.site_timezone).trim() || DEFAULT_LOCALIZATION_CONFIG.site_timezone,
    site_currency: String(source.site_currency || DEFAULT_LOCALIZATION_CONFIG.site_currency).trim().toUpperCase() || DEFAULT_LOCALIZATION_CONFIG.site_currency,
    manual_overrides: source.manual_overrides && typeof source.manual_overrides === 'object' && !Array.isArray(source.manual_overrides)
      ? source.manual_overrides
      : {},
  };
};

const buildVisibleLanguages = (enabledLanguageCodes) => {
  const allLanguages = getSupportedLanguages();
  const enabledSet = new Set(enabledLanguageCodes);
  return allLanguages.filter((language) => enabledSet.has(language.code));
};

const areLocalizationConfigsEqual = (left, right) => {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.default_language === right.default_language &&
    left.automatic_detection === right.automatic_detection &&
    left.site_timezone === right.site_timezone &&
    left.site_currency === right.site_currency &&
    JSON.stringify(left.enabled_languages || []) === JSON.stringify(right.enabled_languages || []) &&
    JSON.stringify(left.available_languages || []) === JSON.stringify(right.available_languages || []) &&
    JSON.stringify(left.manual_overrides || {}) === JSON.stringify(right.manual_overrides || {})
  );
};

const applyDocumentLanguage = (langCode) => {
  document.documentElement.lang = langCode;
  if (langCode === 'ar' || langCode === 'he') {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [localizationConfig, setLocalizationConfig] = useState(DEFAULT_LOCALIZATION_CONFIG);
  const [language, setLanguageState] = useState('en');
  const defaultLanguageRef = useRef(DEFAULT_LOCALIZATION_CONFIG.default_language);
  const enabledLanguageCodesRef = useRef(DEFAULT_LOCALIZATION_CONFIG.enabled_languages);

  const refreshLocalization = useCallback(async () => {
    const response = await fetch('/api/localization', {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error('Failed to load localization');
    }
    const payload = await response.json();
    const normalized = normalizeLocalizationConfig(payload);
    setLocalizationConfig((prev) => (areLocalizationConfigsEqual(prev, normalized) ? prev : normalized));
    return normalized;
  }, []);

  const enabledLanguageCodes = useMemo(
    () => localizationConfig.enabled_languages?.length
      ? localizationConfig.enabled_languages
      : [localizationConfig.default_language || 'en'],
    [localizationConfig],
  );

  useEffect(() => {
    defaultLanguageRef.current = localizationConfig.default_language || 'en';
    enabledLanguageCodesRef.current = enabledLanguageCodes;
  }, [enabledLanguageCodes, localizationConfig.default_language]);

  const setLanguage = useCallback((langCode) => {
    const requested = String(langCode || '').trim();
    const nextLanguage =
      isSupportedLanguage(requested) && enabledLanguageCodesRef.current.includes(requested)
        ? requested
        : defaultLanguageRef.current || 'en';

    setLanguageState((prev) => (prev === nextLanguage ? prev : nextLanguage));
    localStorage.setItem('preferredLanguage', nextLanguage);
    applyDocumentLanguage(nextLanguage);
    return nextLanguage;
  }, []);

  const resolveRuntimeTranslation = useCallback((langCode, path) => {
    const primaryLanguage = localizationConfig.default_language || 'en';
    const manualOverrides = localizationConfig.manual_overrides || {};

    const overrideFromSelectedLanguage = manualOverrides?.[langCode]?.[path];
    if (overrideFromSelectedLanguage !== undefined) {
      return overrideFromSelectedLanguage;
    }

    const ownValue = getRawTranslation(langCode, path);
    if (ownValue !== undefined) {
      return ownValue;
    }

    const overrideFromPrimaryLanguage = manualOverrides?.[primaryLanguage]?.[path];
    if (overrideFromPrimaryLanguage !== undefined) {
      return overrideFromPrimaryLanguage;
    }

    return getTranslation(langCode, path, primaryLanguage);
  }, [localizationConfig.default_language, localizationConfig.manual_overrides]);

  const t = useCallback((path, params = {}) => {
    let text = resolveRuntimeTranslation(language, path);

    if (typeof text === 'string' && params) {
      Object.keys(params).forEach((key) => {
        text = text.replace(new RegExp(`{${key}}`, 'g'), params[key]);
      });
    }

    return text;
  }, [language, resolveRuntimeTranslation]);

  const currentLanguage = translations[language] || translations[localizationConfig.default_language] || translations.en;
  const languages = useMemo(
    () => buildVisibleLanguages(enabledLanguageCodes),
    [enabledLanguageCodes],
  );
  const allLanguages = useMemo(
    () => getSupportedLanguages(),
    [],
  );

  useEffect(() => {
    let active = true;

    const bootstrapLocalization = async () => {
      const savedLanguage = localStorage.getItem('preferredLanguage');

      let config = DEFAULT_LOCALIZATION_CONFIG;
      try {
        config = await refreshLocalization();
      } catch {
        config = DEFAULT_LOCALIZATION_CONFIG;
      }

      if (!active) return;

      if (
        savedLanguage &&
        isSupportedLanguage(savedLanguage) &&
        config.enabled_languages.includes(savedLanguage)
      ) {
        setLanguage(savedLanguage);
        return;
      }

      if (config.automatic_detection) {
        const browserLanguage = navigator.language?.split('-')[0];
        if (
          browserLanguage &&
          isSupportedLanguage(browserLanguage) &&
          config.enabled_languages.includes(browserLanguage)
        ) {
          setLanguage(browserLanguage);
          return;
        }
      }

      setLanguage(config.default_language || 'en');
    };

    bootstrapLocalization();

    return () => {
      active = false;
    };
  }, [refreshLocalization, setLanguage]);

  useEffect(() => {
    const nextLanguage =
      isSupportedLanguage(language) && enabledLanguageCodes.includes(language)
        ? language
        : localizationConfig.default_language || 'en';

    if (nextLanguage !== language) {
      setLanguage(nextLanguage);
      return;
    }

    applyDocumentLanguage(nextLanguage);
  }, [enabledLanguageCodes, language, localizationConfig.default_language, setLanguage]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        currentLanguage,
        languages,
        allLanguages,
        isRTL: language === 'ar' || language === 'he',
        localizationConfig,
        refreshLocalization,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageProvider;
