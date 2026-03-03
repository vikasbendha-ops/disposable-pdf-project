import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, FileText, ChevronRight, Zap, Shield, Clock, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { api, useAuth } from '../App';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

const Pricing = () => {
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetchPlans();
    
    // Check for cancelled payment
    if (searchParams.get('payment') === 'cancelled') {
      toast.info('Payment cancelled');
    }
  }, [searchParams]);

  const fetchPlans = async () => {
    try {
      const response = await api.get('/subscription/plans');
      setPlans(response.data);
    } catch (error) {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId) => {
    if (!user) {
      navigate('/register');
      return;
    }

    setProcessingPlan(planId);

    try {
      const response = await api.post('/subscription/checkout', {
        plan: planId,
        origin_url: window.location.origin
      });

      // Redirect to Stripe
      window.location.href = response.data.url;
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to start checkout';
      toast.error(message);
    } finally {
      setProcessingPlan(null);
    }
  };

  const planFeatures = {
    basic: [
      '500 MB storage',
      '50 links per month',
      'All expiry modes',
      'View tracking',
      'Watermarking',
      'Email support'
    ],
    pro: [
      '2 GB storage',
      '200 links per month',
      'All expiry modes',
      'Advanced analytics',
      'Priority support',
      'Custom branding'
    ],
    enterprise: [
      '10 GB storage',
      '1000 links per month',
      'All expiry modes',
      'Custom domains',
      'API access',
      'Dedicated support',
      'SLA guarantee'
    ]
  };

  const planIcons = {
    basic: Zap,
    pro: Shield,
    enterprise: Users
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-stone-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-stone-900">Autodestroy</span>
          </Link>
          
          {user ? (
            <Link to="/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
          ) : (
            <div className="flex items-center space-x-4">
              <Link to="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link to="/register">
                <Button className="bg-emerald-900 hover:bg-emerald-800">Get Started</Button>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Header */}
      <section className="py-16 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="inline-block px-4 py-2 bg-emerald-100 text-emerald-900 rounded-full text-sm font-semibold mb-6">
            PRICING
          </span>
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-stone-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-stone-600 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include our core security features.
          </p>
        </motion.div>
      </section>

      {/* Plans */}
      <section className="pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              {plans && Object.entries(plans).map(([planId, plan], i) => {
                const Icon = planIcons[planId];
                const features = planFeatures[planId] || [];
                const isPopular = planId === 'pro';
                const isCurrentPlan = user?.plan === planId && user?.subscription_status === 'active';

                return (
                  <motion.div
                    key={planId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card className={cn(
                      "relative h-full border-2 transition-all",
                      isPopular ? "border-emerald-600 shadow-xl scale-105" : "border-stone-200"
                    )}>
                      {isPopular && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <span className="bg-emerald-900 text-white px-4 py-1 rounded-full text-sm font-semibold">
                            Most Popular
                          </span>
                        </div>
                      )}
                      
                      <CardHeader className="text-center pb-2">
                        <div className={cn(
                          "w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4",
                          isPopular ? "bg-emerald-100" : "bg-stone-100"
                        )}>
                          <Icon className={cn(
                            "w-7 h-7",
                            isPopular ? "text-emerald-700" : "text-stone-600"
                          )} />
                        </div>
                        <CardTitle className="font-heading text-2xl">{plan.name}</CardTitle>
                        <CardDescription>
                          {planId === 'basic' && 'Perfect for individuals'}
                          {planId === 'pro' && 'For growing teams'}
                          {planId === 'enterprise' && 'For large organizations'}
                        </CardDescription>
                      </CardHeader>
                      
                      <CardContent className="pt-4">
                        <div className="text-center mb-6">
                          <span className="font-heading text-5xl font-bold text-stone-900">
                            €{plan.price}
                          </span>
                          <span className="text-stone-500">/month</span>
                        </div>

                        <ul className="space-y-3 mb-8">
                          {features.map((feature, j) => (
                            <li key={j} className="flex items-center text-stone-600">
                              <Check className="w-5 h-5 text-emerald-600 mr-3 flex-shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>

                        <Button
                          className={cn(
                            "w-full h-12",
                            isPopular 
                              ? "bg-emerald-900 hover:bg-emerald-800" 
                              : "bg-stone-900 hover:bg-stone-800"
                          )}
                          onClick={() => handleSubscribe(planId)}
                          disabled={isCurrentPlan || processingPlan === planId}
                          data-testid={`subscribe-${planId}-btn`}
                        >
                          {processingPlan === planId ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                              Processing...
                            </>
                          ) : isCurrentPlan ? (
                            'Current Plan'
                          ) : (
                            <>
                              Get Started
                              <ChevronRight className="w-4 h-4 ml-2" />
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

      {/* FAQ */}
      <section className="py-16 px-6 bg-white border-t border-stone-200">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-heading text-3xl font-bold text-stone-900 text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="grid gap-6">
            {[
              {
                q: 'Can I upgrade or downgrade my plan?',
                a: 'Yes, you can change your plan at any time. Changes take effect on your next billing cycle.'
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards through our secure Stripe integration.'
              },
              {
                q: 'Is there a free trial?',
                a: 'We offer a 14-day money-back guarantee on all plans. Try risk-free!'
              },
              {
                q: 'What happens when my storage is full?',
                a: 'You\'ll need to delete some files or upgrade your plan to upload more PDFs.'
              }
            ].map((faq, i) => (
              <div key={i} className="bg-stone-50 rounded-xl p-6">
                <h3 className="font-semibold text-stone-900 mb-2">{faq.q}</h3>
                <p className="text-stone-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-900 text-white py-8 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-stone-400">
            &copy; {new Date().getFullYear()} Autodestroy PDF Platform. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
