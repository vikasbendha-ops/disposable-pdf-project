import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuth } from '../App';
import { toast } from 'sonner';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      // Extract session_id from URL hash
      const hash = window.location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (!sessionIdMatch) {
        toast.error('Invalid authentication callback');
        navigate('/login', { replace: true });
        return;
      }

      const sessionId = sessionIdMatch[1];

      try {
        // Exchange session_id for user data
        const response = await api.post('/auth/google/session', { session_id: sessionId });
        const userData = response.data.user;
        
        setUser(userData);
        toast.success(`Welcome, ${userData.name}!`);
        
        // Clear the hash and navigate to dashboard
        window.history.replaceState(null, '', window.location.pathname);
        navigate('/dashboard', { replace: true, state: { user: userData } });
      } catch (error) {
        console.error('Auth callback error:', error);
        toast.error('Authentication failed. Please try again.');
        navigate('/login', { replace: true });
      }
    };

    processCallback();
  }, [navigate, setUser]);

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
