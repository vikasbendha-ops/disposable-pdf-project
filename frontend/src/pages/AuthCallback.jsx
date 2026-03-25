import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, useAuth } from '../App';
import { toast } from 'sonner';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [searchParams] = useSearchParams();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      const sessionId = hashParams.get('session_id') || '';
      const supabaseAccessToken = hashParams.get('access_token') || '';
      const nextPath = searchParams.get('next') || '/dashboard';

      try {
        let response;
        if (supabaseAccessToken) {
          response = await api.post('/auth/google/exchange', {
            access_token: supabaseAccessToken,
            refresh_token: hashParams.get('refresh_token') || '',
          });
        } else if (sessionId) {
          response = await api.post('/auth/google/session', { session_id: sessionId });
        } else {
          toast.error('Invalid authentication callback');
          navigate('/login', { replace: true });
          return;
        }

        if (response.data?.requires_2fa) {
          localStorage.removeItem('token');
          setUser(null);
          window.history.replaceState(null, '', window.location.pathname);
          navigate('/login', {
            replace: true,
            state: {
              from: { pathname: nextPath.startsWith('/') ? nextPath : '/dashboard' },
              twoFactorPending: response.data,
              prefilledEmail: response.data?.email || '',
            },
          });
          return;
        }

        const userData = response.data.user;
        const localAccessToken = response.data.access_token;
        
        setUser(userData);
        if (localAccessToken) {
          localStorage.setItem('token', localAccessToken);
        }
        if (userData?.language) {
          localStorage.setItem('preferredLanguage', userData.language);
        }
        toast.success(`Welcome, ${userData.name}!`);
        
        window.history.replaceState(null, '', window.location.pathname);
        navigate(nextPath.startsWith('/') ? nextPath : '/dashboard', { replace: true, state: { user: userData } });
      } catch (error) {
        console.error('Auth callback error:', error);
        toast.error('Authentication failed. Please try again.');
        navigate('/login', { replace: true });
      }
    };

    processCallback();
  }, [navigate, searchParams, setUser]);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900 mx-auto mb-4"></div>
        <p className="text-stone-600">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
