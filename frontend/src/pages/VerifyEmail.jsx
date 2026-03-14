import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth, useBranding } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

const VerifyEmail = () => {
  const { confirmEmailVerification } = useAuth();
  const { branding } = useBranding();
  const { t } = useLanguage();
  const brandName = branding?.app_name || 'Autodestroy';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashAccessToken = hashParams.get('access_token') || '';
  const hashRefreshToken = hashParams.get('refresh_token') || '';
  const hashType = hashParams.get('type') || '';

  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!token && !hashAccessToken) {
        setError(t('verifyEmail.missingToken'));
        setLoading(false);
        return;
      }

      try {
        if (hashAccessToken) {
          await confirmEmailVerification({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
            type: hashType,
          });
        } else {
          await confirmEmailVerification(token);
        }
        setVerified(true);
        toast.success(t('verifyEmail.successToast'));
      } catch (err) {
        setError(err.response?.data?.detail || t('verifyEmail.invalidToken'));
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [token, hashAccessToken, hashRefreshToken, hashType, confirmEmailVerification]);

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

        <h1 className="font-heading text-2xl font-bold text-stone-900 mb-4">{t('verifyEmail.title')}</h1>

        {loading ? (
          <p className="text-stone-600">{t('verifyEmail.verifying')}</p>
        ) : verified ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 mt-0.5" />
              <p className="text-sm text-emerald-800">
                {t('verifyEmail.successMessage')}
              </p>
            </div>
            <Button className="w-full bg-emerald-900 hover:bg-emerald-800" onClick={() => navigate('/dashboard')}>
              {t('verifyEmail.continueToDashboard')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-700 mt-0.5" />
              <p className="text-sm text-red-700">
                {error || t('verifyEmail.invalidToken')}
              </p>
            </div>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                {t('verifyEmail.goToLogin')}
              </Button>
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
