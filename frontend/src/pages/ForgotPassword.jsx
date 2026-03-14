import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth, useBranding } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const ForgotPassword = () => {
  const { requestPasswordReset, user } = useAuth();
  const { branding } = useBranding();
  const { t } = useLanguage();
  const brandName = branding?.app_name || 'Autodestroy';
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
      toast.success(t('forgotPassword.requestSentToast'));
    } catch (err) {
      setError(err.response?.data?.detail || t('common.error'));
      toast.error(t('common.error'));
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

        <h1 className="font-heading text-2xl font-bold text-stone-900 mb-2">{t('forgotPassword.title')}</h1>
        <p className="text-stone-600 mb-6">
          {t('forgotPassword.description')}
        </p>

        {sent && (
          <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" />
            <p className="text-sm text-emerald-800">
              {t('forgotPassword.requestReceived')}
            </p>
          </div>
        )}

        {error && (
          <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-stone-700">{t('auth.email')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="pl-11 h-11"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-emerald-900 hover:bg-emerald-800"
            disabled={loading}
          >
            {loading ? t('forgotPassword.sendingLink') : t('forgotPassword.sendLink')}
          </Button>
        </form>

        <Link to="/login" className="mt-6 inline-flex items-center text-sm text-emerald-700 hover:text-emerald-800">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {t('forgotPassword.backToLogin')}
        </Link>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
