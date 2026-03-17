import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth, useBranding, usePublicSite } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVerificationHelp, setShowVerificationHelp] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  
  const { login, user, resendVerificationEmail } = useAuth();
  const { branding } = useBranding();
  const { publicSite } = usePublicSite();
  const { t } = useLanguage();
  const brandName = branding?.app_name || 'Autodestroy';
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';
  const registrationPendingVerification = Boolean(location.state?.pendingVerification);

  // Redirect if already logged in
  React.useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  React.useEffect(() => {
    if (registrationPendingVerification && location.state?.registeredEmail) {
      setUnverifiedEmail(location.state.registeredEmail);
      setShowVerificationHelp(true);
    }
  }, [registrationPendingVerification, location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowVerificationHelp(false);
    setLoading(true);

    try {
      await login(email, password);
      toast.success(t('authFlow.welcomeBackToast'));
      navigate(from, { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail || 'Invalid email or password';
      setError(detail);
      const needsVerification =
        err.response?.status === 403 || /verify your email/i.test(detail);
      if (needsVerification) {
        setShowVerificationHelp(true);
        setUnverifiedEmail(email);
      }
      toast.error(t('authFlow.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) {
      toast.error(t('authFlow.enterEmailFirst'));
      return;
    }
    setResendLoading(true);
    try {
      await resendVerificationEmail(unverifiedEmail);
      toast.success(t('authFlow.resendVerificationSent'));
    } catch (err) {
      toast.error(err.response?.data?.detail || t('authFlow.resendVerification'));
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (!publicSite?.auth_portal_url) {
      toast.error('Authentication portal URL is not configured');
      return;
    }
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `${publicSite.auth_portal_url}?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-emerald-900 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 400 400" className="w-full h-full">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        
        <div className="relative z-10">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="font-heading font-bold text-2xl text-white">{brandName}</span>
          </Link>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10"
        >
          <h1 className="font-heading text-4xl font-bold text-white mb-4">
            {t('auth.welcomeBack')}
          </h1>
          <p className="text-emerald-100 text-lg leading-relaxed">
            {t('auth.welcomeDesc')}
          </p>
        </motion.div>

        <div className="relative z-10 text-emerald-200 text-sm">
          {t('auth.protectedBy')}
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-xl text-stone-900">{brandName}</span>
            </Link>
          </div>

          <h2 className="font-heading text-3xl font-bold text-stone-900 mb-2">{t('auth.signInTitle')}</h2>
          <p className="text-stone-600 mb-8">{t('auth.signInDesc')}</p>

          {registrationPendingVerification && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-emerald-800 text-sm">
                {t('authFlow.registrationPendingVerification')}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          {showVerificationHelp && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-900 text-sm mb-3">
                {t('authFlow.emailNotVerified')}
              </p>
              <Button
                type="button"
                variant="outline"
                className="border-amber-300 text-amber-900 hover:bg-amber-100"
                onClick={handleResendVerification}
                disabled={resendLoading}
              >
                {resendLoading ? t('common.loading') : t('authFlow.resendVerification')}
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-stone-700">{t('auth.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-12 h-12 bg-white border-stone-200 focus:border-emerald-600 focus:ring-emerald-600"
                  required
                  data-testid="login-email-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold text-stone-700">{t('auth.password')}</Label>
                <Link to="/forgot-password" className="text-sm text-emerald-700 hover:text-emerald-800">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.password')}
                  className="pl-12 pr-12 h-12 bg-white border-stone-200 focus:border-emerald-600 focus:ring-emerald-600"
                  required
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-emerald-900 hover:bg-emerald-800 text-white"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? t('auth.signingIn') : t('auth.signInTitle')}
            </Button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-stone-50 text-stone-500">{t('auth.orContinue')}</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full h-12 border-2 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
            onClick={handleGoogleLogin}
            data-testid="google-login-btn"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('auth.googleSignIn')}
          </Button>

          <p className="mt-8 text-center text-stone-600">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-emerald-700 hover:text-emerald-800 font-semibold">
              {t('auth.createOne')}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
