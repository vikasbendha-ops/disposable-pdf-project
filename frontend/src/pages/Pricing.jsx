import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, FileText, ChevronRight, Zap, Shield, Clock, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { api, getOrderedPlanEntries, useAuth, useBranding, useSubscriptionPlans } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const PLAN_ICON_MAP = {
  basic: Zap,
  pro: Shield,
  enterprise: Users,
};

const Pricing = () => {
  const [processingPlan, setProcessingPlan] = useState(null);
  const { user } = useAuth();
  const { branding } = useBranding();
  const { plans, loading } = useSubscriptionPlans();
  const { t } = useLanguage();
  const brandName = branding?.app_name || 'Autodestroy';
  const productName = branding?.product_name || 'Autodestroy PDF Platform';
  const footerText = branding?.footer_text || 'All rights reserved.';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPlanId = String(searchParams.get('plan') || '').trim();

  useEffect(() => {
    if (searchParams.get('payment') === 'cancelled') {
      toast.info(t('pricingPage.paymentCancelled'));
    }
  }, [searchParams, t]);

  const orderedPlans = useMemo(
    () => getOrderedPlanEntries(plans).filter(([, plan]) => plan && plan.active !== false),
    [plans],
  );

  const requestedPlanEntry = requestedPlanId
    ? orderedPlans.find(([planId]) => planId === requestedPlanId)
    : null;
  const isDirectPlanView = Boolean(requestedPlanEntry);
  const visiblePlans = isDirectPlanView
    ? [requestedPlanEntry]
    : orderedPlans.filter(([, plan]) => plan.public_visible !== false);

  const handleSubscribe = async (planId) => {
    if (!user) {
      navigate(`/register?plan=${encodeURIComponent(planId)}`);
      return;
    }

    setProcessingPlan(planId);

    try {
      const response = await api.post('/subscription/checkout', {
        plan: planId,
        origin_url: window.location.origin,
      });
      window.location.href = response.data.url;
    } catch (error) {
      const message = error.response?.data?.detail || t('pricingPage.checkoutFailed');
      toast.error(message);
    } finally {
      setProcessingPlan(null);
    }
  };

  const formatPrice = (amount, currency) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'eur').toUpperCase(),
        minimumFractionDigits: Number.isInteger(Number(amount || 0)) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(Number(amount || 0));
    } catch {
      return `${Number(amount || 0).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-900">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <span className="font-heading text-xl font-bold text-stone-900">{brandName}</span>
          </Link>

          {user ? (
            <Link to="/dashboard">
              <Button variant="outline">{t('pricingPage.dashboard')}</Button>
            </Link>
          ) : (
            <div className="flex items-center space-x-4">
              <Link to="/login">
                <Button variant="ghost">{t('pricingPage.signIn')}</Button>
              </Link>
              <Link to="/register">
                <Button className="bg-emerald-900 hover:bg-emerald-800">{t('pricingPage.getStarted')}</Button>
              </Link>
            </div>
          )}
        </div>
      </nav>

      <section className="px-6 py-16 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <span className="mb-6 inline-block rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">
            {isDirectPlanView ? t('pricingPage.directPlanBadge') : t('pricingPage.badge')}
          </span>
          <h1 className="font-heading mb-4 text-4xl font-bold text-stone-900 md:text-5xl">
            {isDirectPlanView ? t('pricingPage.directTitle') : t('pricingPage.title')}
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-stone-600">
            {isDirectPlanView ? t('pricingPage.directSubtitle') : t('pricingPage.subtitle')}
          </p>
          {isDirectPlanView && (
            <div className="mt-6">
              <Link to="/pricing">
                <Button variant="outline">{t('pricingPage.viewAllPlans')}</Button>
              </Link>
            </div>
          )}
        </motion.div>
      </section>

      <section className="px-6 pb-24">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-900" />
            </div>
          ) : visiblePlans.length === 0 ? (
            <Card className="border-stone-200">
              <CardContent className="py-16 text-center">
                <Clock className="mx-auto mb-4 h-12 w-12 text-stone-300" />
                <h2 className="text-xl font-semibold text-stone-900">{t('pricingPage.noPlansTitle')}</h2>
                <p className="mt-2 text-stone-500">{t('pricingPage.noPlansDescription')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className={cn('grid gap-8', visiblePlans.length === 1 ? 'mx-auto max-w-xl' : 'md:grid-cols-2 xl:grid-cols-3')}>
              {visiblePlans.map(([planId, plan], index) => {
                const Icon = PLAN_ICON_MAP[planId] || Shield;
                const features = Array.isArray(plan?.features) ? plan.features : [];
                const isPopular = Boolean(plan?.featured);
                const isCurrentPlan = user?.plan === planId && user?.subscription_status === 'active';

                return (
                  <motion.div
                    key={planId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                  >
                    <Card
                      className={cn(
                        'relative h-full border-2 transition-all',
                        isPopular ? 'scale-[1.02] border-emerald-600 shadow-xl' : 'border-stone-200',
                      )}
                    >
                      {isPopular && plan?.badge && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <span className="rounded-full bg-emerald-900 px-4 py-1 text-sm font-semibold text-white">
                            {plan.badge}
                          </span>
                        </div>
                      )}

                      <CardHeader className="pb-2 text-center">
                        <div
                          className={cn(
                            'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl',
                            isPopular ? 'bg-emerald-100' : 'bg-stone-100',
                          )}
                        >
                          <Icon className={cn('h-7 w-7', isPopular ? 'text-emerald-700' : 'text-stone-600')} />
                        </div>
                        <CardTitle className="font-heading text-2xl">{plan.name}</CardTitle>
                        <CardDescription>{plan.description}</CardDescription>
                      </CardHeader>

                      <CardContent className="pt-4">
                        <div className="mb-6 text-center">
                          <span className="font-heading text-5xl font-bold text-stone-900">
                            {formatPrice(plan.price, plan.currency)}
                          </span>
                          <span className="text-stone-500">
                            /{plan.interval === 'year' ? t('pricingPage.intervalYear') : t('pricingPage.intervalMonth')}
                          </span>
                        </div>

                        <ul className="mb-8 space-y-3">
                          {features.map((feature, featureIndex) => (
                            <li key={featureIndex} className="flex items-center text-stone-600">
                              <Check className="mr-3 h-5 w-5 flex-shrink-0 text-emerald-600" />
                              {feature}
                            </li>
                          ))}
                        </ul>

                        <Button
                          className={cn(
                            'h-12 w-full',
                            isPopular ? 'bg-emerald-900 hover:bg-emerald-800' : 'bg-stone-900 hover:bg-stone-800',
                          )}
                          onClick={() => handleSubscribe(planId)}
                          disabled={isCurrentPlan || processingPlan === planId}
                          data-testid={`subscribe-${planId}-btn`}
                        >
                          {processingPlan === planId ? (
                            <>
                              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-white" />
                              {t('pricingPage.processing')}
                            </>
                          ) : isCurrentPlan ? (
                            t('pricingPage.currentPlan')
                          ) : (
                            <>
                              {t('pricingPage.cta')}
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-heading mb-12 text-center text-3xl font-bold text-stone-900">
            {t('pricingPage.faqTitle')}
          </h2>
          <div className="grid gap-6">
            {['upgrade', 'payments', 'trial', 'storage'].map((faqKey) => (
              <div key={faqKey} className="rounded-xl bg-stone-50 p-6">
                <h3 className="mb-2 font-semibold text-stone-900">{t(`pricingPage.faq.${faqKey}.q`)}</h3>
                <p className="text-stone-600">{t(`pricingPage.faq.${faqKey}.a`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-stone-900 px-6 py-8 text-white">
        <div className="mx-auto max-w-7xl text-center">
          <p className="text-stone-400">
            &copy; {new Date().getFullYear()} {productName}. {footerText}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
