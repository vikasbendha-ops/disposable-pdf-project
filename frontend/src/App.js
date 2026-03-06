import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { LanguageProvider } from './contexts/LanguageContext';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import PDFManagement from './pages/PDFManagement';
import LinkGenerator from './pages/LinkGenerator';
import MyLinks from './pages/MyLinks';
import SecureViewer from './pages/SecureViewer';
import ExpiredPage from './pages/ExpiredPage';
import Pricing from './pages/Pricing';
import Settings from './pages/Settings';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings from './pages/AdminSettings';
import AdminUsers from './pages/AdminUsers';
import AdminLinks from './pages/AdminLinks';
import AuthCallback from './pages/AuthCallback';

const DEFAULT_BACKEND_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : '';
const ENV_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';
const BACKEND_URL = (ENV_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
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
    const { access_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('preferredLanguage', language);
    setUser(userData);
    return userData;
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

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, loading, refreshUser, updateUserLanguage }}>
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

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

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
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/view/:token" element={<SecureViewer />} />
      <Route path="/expired" element={<ExpiredPage />} />
      
      {/* Protected User Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/pdfs" element={<ProtectedRoute><PDFManagement /></ProtectedRoute>} />
      <Route path="/links" element={<ProtectedRoute><MyLinks /></ProtectedRoute>} />
      <Route path="/links/create" element={<ProtectedRoute><LinkGenerator /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/links" element={<ProtectedRoute adminOnly><AdminLinks /></ProtectedRoute>} />
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
          <div className="App">
            <div className="noise-overlay" />
            <AppRouter />
            <Toaster position="top-right" richColors />
          </div>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
export { API, BACKEND_URL };
