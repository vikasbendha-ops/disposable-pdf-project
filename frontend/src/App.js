import React, { Suspense, createContext, useContext, useState, useCallback, useEffect, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { LanguageProvider } from './contexts/LanguageContext';
import { buildSeoMetadata, DEFAULT_SEO_SETTINGS, normalizeSeoConfig } from '../../lib/seo';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PDFManagement = lazy(() => import('./pages/PDFManagement'));
const LinkGenerator = lazy(() => import('./pages/LinkGenerator'));
const SecureViewer = lazy(() => import('./pages/SecureViewer'));
const ExpiredPage = lazy(() => import('./pages/ExpiredPage'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminLinks = lazy(() => import('./pages/AdminLinks'));
const AdminAuditLogs = lazy(() => import('./pages/AdminAuditLogs'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));

const DEFAULT_BACKEND_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : '';
const ENV_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';
const BACKEND_URL = (DEFAULT_BACKEND_URL || ENV_BACKEND_URL).replace(/\/$/, '');
const API = `${BACKEND_URL}/api`;
const DEFAULT_BRANDING = Object.freeze({
  app_name: 'Autodestroy',
  product_name: 'Autodestroy PDF Platform',
  tagline: 'Secure Document Sharing',
  primary_color: '#064e3b',
  accent_color: '#10b981',
  footer_text: 'All rights reserved.',
});

// Auth Context
const AuthContext = createContext(null);
const BrandingContext = createContext(null);
const SeoContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding must be used within BrandingProvider');
  }
  return context;
};

export const useSeo = () => {
  const context = useContext(SeoContext);
  if (!context) {
    throw new Error('useSeo must be used within SeoProvider');
  }
  return context;
};

// API instance
export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Add auth header to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const normalizeBranding = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    app_name: String(source.app_name || DEFAULT_BRANDING.app_name),
    product_name: String(source.product_name || DEFAULT_BRANDING.product_name),
    tagline: String(source.tagline || DEFAULT_BRANDING.tagline),
    primary_color: String(source.primary_color || DEFAULT_BRANDING.primary_color),
    accent_color: String(source.accent_color || DEFAULT_BRANDING.accent_color),
    footer_text: String(source.footer_text || DEFAULT_BRANDING.footer_text),
  };
};

const applyBrandingCssVars = (branding) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--brand-primary-color', branding.primary_color);
  root.style.setProperty('--brand-accent-color', branding.accent_color);
};

const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    try {
      const response = await api.get('/branding');
      const next = normalizeBranding(response.data);
      setBranding(next);
      applyBrandingCssVars(next);
      return next;
    } catch (error) {
      const fallback = normalizeBranding(null);
      setBranding(fallback);
      applyBrandingCssVars(fallback);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  const refreshBranding = useCallback(async () => fetchBranding(), [fetchBranding]);

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

function upsertMetaByName(name, content) {
  if (typeof document === 'undefined') return;
  let tag = document.head.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content || '');
}

function upsertMetaByProperty(property, content) {
  if (typeof document === 'undefined') return;
  let tag = document.head.querySelector(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content || '');
}

function upsertLinkTag(rel, href) {
  if (typeof document === 'undefined') return;
  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href || '');
}

function removeHeadTag(selector) {
  if (typeof document === 'undefined') return;
  const tag = document.head.querySelector(selector);
  if (tag) {
    tag.remove();
  }
}

function applySeoToDocument(seoMeta) {
  if (typeof document === 'undefined' || !seoMeta) return;

  document.title = seoMeta.title || DEFAULT_SEO_SETTINGS.default_title;
  upsertMetaByName('description', seoMeta.description || '');
  upsertMetaByName('keywords', seoMeta.keywords || '');
  upsertMetaByName('robots', seoMeta.robots || 'index, follow');

  upsertMetaByProperty('og:type', 'website');
  upsertMetaByProperty('og:site_name', seoMeta.siteName || '');
  upsertMetaByProperty('og:title', seoMeta.title || '');
  upsertMetaByProperty('og:description', seoMeta.description || '');
  upsertMetaByProperty('og:image', seoMeta.ogImageUrl || '');
  if (seoMeta.ogUrl) {
    upsertMetaByProperty('og:url', seoMeta.ogUrl);
  } else {
    removeHeadTag('meta[property="og:url"]');
  }

  upsertMetaByName('twitter:card', seoMeta.twitterCard || 'summary_large_image');
  upsertMetaByName('twitter:title', seoMeta.title || '');
  upsertMetaByName('twitter:description', seoMeta.description || '');
  upsertMetaByName('twitter:image', seoMeta.ogImageUrl || '');
  if (seoMeta.twitterHandle) {
    upsertMetaByName('twitter:site', seoMeta.twitterHandle);
  } else {
    removeHeadTag('meta[name="twitter:site"]');
  }

  if (seoMeta.canonicalUrl) {
    upsertLinkTag('canonical', seoMeta.canonicalUrl);
  } else {
    removeHeadTag('link[rel="canonical"]');
  }
  if (seoMeta.faviconUrl) {
    upsertLinkTag('icon', seoMeta.faviconUrl);
    upsertLinkTag('shortcut icon', seoMeta.faviconUrl);
    upsertLinkTag('apple-touch-icon', seoMeta.faviconUrl);
  }
}

const SeoProvider = ({ children }) => {
  const location = useLocation();
  const [seoConfig, setSeoConfig] = useState(DEFAULT_SEO_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSeo = useCallback(async () => {
    try {
      const response = await api.get('/seo');
      const next = normalizeSeoConfig(response.data || {});
      setSeoConfig(next);
      return next;
    } catch {
      const fallback = normalizeSeoConfig({});
      setSeoConfig(fallback);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeo();
  }, [fetchSeo]);

  useEffect(() => {
    const seoMeta = buildSeoMetadata(location.pathname, seoConfig);
    applySeoToDocument(seoMeta);
  }, [location.pathname, seoConfig]);

  const refreshSeo = useCallback(async () => fetchSeo(), [fetchSeo]);

  return (
    <SeoContext.Provider value={{ seo: seoConfig, loading, refreshSeo }}>
      {children}
    </SeoContext.Provider>
  );
};

// Auth Provider
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      // Set language from user preference
      if (response.data?.language) {
        localStorage.setItem('preferredLanguage', response.data.language);
      }
    } catch (error) {
      setUser(null);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    if (userData?.language) {
      localStorage.setItem('preferredLanguage', userData.language);
    }
    setUser(userData);
    return userData;
  };

  const register = async (name, email, password, language = 'en') => {
    const response = await api.post('/auth/register', { name, email, password, language });
    const payload = response.data || {};
    const { access_token, user: userData } = payload;

    localStorage.setItem('preferredLanguage', language);

    if (access_token && userData) {
      localStorage.setItem('token', access_token);
      setUser(userData);
    } else {
      localStorage.removeItem('token');
      setUser(null);
    }

    return payload;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('token');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  };

  const updateUserLanguage = async (language) => {
    try {
      await api.put('/auth/language', { language });
      setUser(prev => ({ ...prev, language }));
      localStorage.setItem('preferredLanguage', language);
    } catch (error) {
      console.error('Update language error:', error);
      throw error;
    }
  };

  const requestPasswordReset = async (email) => {
    const response = await api.post('/auth/password-reset', { email });
    return response.data;
  };

  const validatePasswordResetToken = async (tokenOrPayload) => {
    const params = typeof tokenOrPayload === 'string'
      ? { token: tokenOrPayload }
      : { access_token: tokenOrPayload?.access_token || '' };
    const response = await api.get('/auth/password-reset/validate', { params });
    return response.data;
  };

  const confirmPasswordReset = async (tokenOrPayload, newPassword) => {
    const payload = typeof tokenOrPayload === 'string'
      ? { token: tokenOrPayload, new_password: newPassword }
      : {
        access_token: tokenOrPayload?.access_token || '',
        refresh_token: tokenOrPayload?.refresh_token || '',
        new_password: newPassword,
      };
    const response = await api.post('/auth/password-reset/confirm', payload);
    return response.data;
  };

  const confirmEmailVerification = async (tokenOrPayload) => {
    const payload = typeof tokenOrPayload === 'string'
      ? { token: tokenOrPayload }
      : {
        access_token: tokenOrPayload?.access_token || '',
        refresh_token: tokenOrPayload?.refresh_token || '',
        type: tokenOrPayload?.type || '',
      };
    const response = await api.post('/auth/verify-email/confirm', payload);
    const { access_token, user: userData } = response.data || {};
    if (access_token && userData) {
      localStorage.setItem('token', access_token);
      if (userData.language) {
        localStorage.setItem('preferredLanguage', userData.language);
      }
      setUser(userData);
    }
    return response.data;
  };

  const resendVerificationEmail = async (email) => {
    const response = await api.post('/auth/verify-email/resend', { email });
    return response.data;
  };

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      login,
      register,
      logout,
      loading,
      refreshUser,
      updateUserLanguage,
      requestPasswordReset,
      validatePasswordResetToken,
      confirmPasswordReset,
      confirmEmailVerification,
      resendVerificationEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-stone-50">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
  </div>
);

// App Router
function AppRouter() {
  const location = useLocation();

  // Check URL fragment for session_id (OAuth callback)
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/view/:token" element={<SecureViewer />} />
      <Route path="/expired" element={<ExpiredPage />} />
      
      {/* Protected User Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/pdfs" element={<ProtectedRoute><PDFManagement /></ProtectedRoute>} />
      <Route path="/links" element={<ProtectedRoute><Navigate to="/pdfs" replace /></ProtectedRoute>} />
      <Route path="/links/create" element={<ProtectedRoute><LinkGenerator /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/links" element={<ProtectedRoute adminOnly><AdminLinks /></ProtectedRoute>} />
      <Route path="/admin/audit-events" element={<ProtectedRoute adminOnly><AdminAuditLogs /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute adminOnly><AdminSettings /></ProtectedRoute>} />
      
      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <BrandingProvider>
            <SeoProvider>
              <div className="App">
                <div className="noise-overlay" />
                <Suspense fallback={<RouteLoader />}>
                  <AppRouter />
                </Suspense>
                <Toaster position="top-right" richColors />
              </div>
            </SeoProvider>
          </BrandingProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
export { API, BACKEND_URL, DEFAULT_BRANDING };
