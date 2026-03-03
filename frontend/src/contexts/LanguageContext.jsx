import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations, { getPrimaryLanguages, getTranslation } from '../i18n/translations';

const LanguageContext = createContext(null);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    // Try to get from localStorage first
    const saved = localStorage.getItem('preferredLanguage');
    if (saved && translations[saved]) {
      return saved;
    }
    // Try browser language
    const browserLang = navigator.language?.split('-')[0];
    if (browserLang && translations[browserLang]) {
      return browserLang;
    }
    return 'en';
  });

  const setLanguage = useCallback((langCode) => {
    if (translations[langCode]) {
      setLanguageState(langCode);
      localStorage.setItem('preferredLanguage', langCode);
      document.documentElement.lang = langCode;
      // Set RTL for Arabic and Hebrew
      if (langCode === 'ar' || langCode === 'he') {
        document.documentElement.dir = 'rtl';
      } else {
        document.documentElement.dir = 'ltr';
      }
    }
  }, []);

  // Translation function
  const t = useCallback((path, params = {}) => {
    let text = getTranslation(language, path);
    
    // Replace params like {name} with actual values
    if (typeof text === 'string' && params) {
      Object.keys(params).forEach(key => {
        text = text.replace(new RegExp(`{${key}}`, 'g'), params[key]);
      });
    }
    
    return text;
  }, [language]);

  // Get current language info
  const currentLanguage = translations[language] || translations.en;
  const languages = getPrimaryLanguages();

  useEffect(() => {
    document.documentElement.lang = language;
    if (language === 'ar' || language === 'he') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  }, [language]);

  return (
    <LanguageContext.Provider value={{ 
      language, 
      setLanguage, 
      t, 
      currentLanguage,
      languages,
      isRTL: language === 'ar' || language === 'he'
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageProvider;
