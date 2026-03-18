import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth, useBranding } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const ResetPassword = () => {
  const { validatePasswordResetToken, confirmPasswordReset, user } = useAuth();
  const { branding } = useBranding();
  const { t } = useLanguage();
  const brandName = branding?.app_name || 'Autodestroy';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashAccessToken = hashParams.get('access_token') || '';
  const hashRefreshToken = hashParams.get('refresh_token') || '';
  const hasResetCredentials = Boolean(token || hashAccessToken);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user && !hasResetCredentials) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const validate = async () => {
      if (!token && !hashAccessToken) {
        setError(t('resetPassword.missingToken'));
        setTokenValid(false);
        setValidating(false);
        return;
      }
      try {
        const result = hashAccessToken
          ? await validatePasswordResetToken({ access_token: hashAccessToken })
          : await validatePasswordResetToken(token);
        setTokenValid(Boolean(result?.valid));
        if (!result?.valid) {
          setError(result?.detail || t('resetPassword.invalidToken'));
        }
      } catch (err) {
        setTokenValid(false);
        setError(err.response?.data?.detail || t('resetPassword.invalidToken'));
      } finally {
        setValidating(false);
      }
    };

    validate();
  }, [token, hashAccessToken, validatePasswordResetToken, navigate, user, hasResetCredentials]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('resetPassword.passwordMin'));
      return;
    }

    setLoading(true);
    try {
      if (hashAccessToken) {
        await confirmPasswordReset(
          { access_token: hashAccessToken, refresh_token: hashRefreshToken },
          password,
        );
      } else {
        await confirmPasswordReset(token, password);
      }
      setSuccess(true);
      toast.success(t('resetPassword.resetSuccessToast'));
    } catch (err) {
      setError(err.response?.data?.detail || t('resetPassword.resetFailedToast'));
      toast.error(t('resetPassword.resetFailedToast'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-stone-200 rounded-2xl p-8 shadow-sm"
      >
        <Link to="/" className="inline-flex items-center space-x-2 mb-6">
          <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="font-heading font-bold text-xl text-stone-900">{brandName}</span>
        </Link>

        <h1 className="font-heading text-2xl font-bold text-stone-900 mb-2">{t('resetPassword.title')}</h1>

        {validating ? (
          <p className="text-stone-600">{t('resetPassword.validating')}</p>
        ) : success ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" />
              <p className="text-sm text-emerald-800">{t('resetPassword.successMessage')}</p>
            </div>
            <Button className="w-full bg-emerald-900 hover:bg-emerald-800" onClick={() => navigate('/login')}>
              {t('resetPassword.goToLogin')}
            </Button>
          </div>
        ) : !tokenValid ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-700 mt-0.5" />
              <p className="text-sm text-red-700">{error || t('resetPassword.invalidToken')}</p>
            </div>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">{t('resetPassword.requestNewLink')}</Button>
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-stone-700">{t('resetPassword.newPassword')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 h-11"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold text-stone-700">{t('resetPassword.confirmPassword')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-11 h-11"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 bg-emerald-900 hover:bg-emerald-800" disabled={loading}>
                {loading ? t('resetPassword.resetting') : t('resetPassword.resetPassword')}
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default ResetPassword;
