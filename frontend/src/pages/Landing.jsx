import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Marquee from 'react-fast-marquee';
import { Shield, Clock, Eye, Lock, FileText, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth, useBranding, usePublicSite } from '../App';
import { useLanguage } from '../contexts/LanguageContext';

const Landing = () => {
  const { user } = useAuth();
  const { branding } = useBranding();
  const { publicSite } = usePublicSite();
  const { t } = useLanguage();
  const brandName = branding?.app_name || 'Autodestroy';
  const productName = branding?.product_name || 'Autodestroy PDF Platform';
  const tagline = branding?.tagline || 'Secure document sharing with complete control.';
  const footerText = branding?.footer_text || 'All rights reserved.';

  const features = [
    { icon: Shield, title: t('landing.feature1Title'), desc: t('landing.feature1Desc') },
    { icon: Clock, title: t('landing.feature2Title'), desc: t('landing.feature2Desc') },
    { icon: Eye, title: t('landing.feature3Title'), desc: t('landing.feature3Desc') },
    { icon: Lock, title: t('landing.feature4Title'), desc: t('landing.feature4Desc') },
  ];

  const securityProtocols = Array.isArray(t('landing.securityProtocols'))
    ? t('landing.securityProtocols')
    : [];
  const companyLinks = [
    { href: publicSite?.about_url, label: t('common.about') },
    { href: publicSite?.contact_url, label: t('common.contact') },
    { href: publicSite?.blog_url, label: t('common.blog') },
  ].filter((item) => item.href);
  const legalLinks = [
    { href: publicSite?.privacy_url, label: t('common.privacyPolicy') },
    { href: publicSite?.terms_url, label: t('common.termsOfService') },
    { href: publicSite?.gdpr_url, label: 'GDPR' },
  ].filter((item) => item.href);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2" data-testid="logo-link">
            <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-stone-900">{brandName}</span>
          </Link>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/pricing" className="text-stone-600 hover:text-stone-900 transition-colors" data-testid="nav-pricing">{t('nav.pricing')}</Link>
            <a href="#features" className="text-stone-600 hover:text-stone-900 transition-colors">{t('nav.features')}</a>
            <a href="#how-it-works" className="text-stone-600 hover:text-stone-900 transition-colors">{t('nav.howItWorks')}</a>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <Link to="/dashboard">
                <Button className="bg-emerald-900 hover:bg-emerald-800" data-testid="nav-dashboard-btn">
                  {t('nav.dashboard')}
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" data-testid="nav-login-btn">{t('nav.signIn')}</Button>
                </Link>
                <Link to="/register">
                  <Button className="bg-emerald-900 hover:bg-emerald-800" data-testid="nav-register-btn">
                    {t('nav.getStarted')}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-2 bg-emerald-100 text-emerald-900 rounded-full text-sm font-semibold mb-6">
              {t('landing.badge')}
            </span>
            <h1 className="font-heading text-5xl md:text-7xl font-bold text-stone-900 tracking-tight leading-[0.95] mb-6">
              {t('landing.heroTitle1')}<br />
              <span className="text-emerald-900">{t('landing.heroTitle2')}</span><br />
              {t('landing.heroTitle3')}
            </h1>
            <p className="text-lg text-stone-600 leading-relaxed mb-8 max-w-lg">
              {t('landing.heroDesc')}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register">
                <Button size="lg" className="bg-emerald-900 hover:bg-emerald-800 h-14 px-8 text-lg" data-testid="hero-cta-btn">
                  {t('landing.startTrial')}
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-2 border-stone-300">
                  {t('landing.seeHow')}
                </Button>
              </a>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-8 border border-stone-200">
              <div className="flex items-center justify-between mb-6">
                <span className="text-sm font-semibold text-stone-500 uppercase tracking-wider">{t('landing.timerLabel')}</span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase">{t('common.active')}</span>
              </div>
              <div className="flex items-baseline justify-center space-x-2 mb-8">
                <div className="bg-red-50 px-4 py-3 rounded-xl">
                  <span className="font-heading text-6xl font-bold text-red-700 tabular-nums">02</span>
                  <span className="block text-xs text-red-600 text-center mt-1">{String(t('linkGen.hours')).toUpperCase()}</span>
                </div>
                <span className="text-4xl text-red-400 font-bold">:</span>
                <div className="bg-red-50 px-4 py-3 rounded-xl">
                  <span className="font-heading text-6xl font-bold text-red-700 tabular-nums">45</span>
                  <span className="block text-xs text-red-600 text-center mt-1">{String(t('linkGen.minutes')).toUpperCase()}</span>
                </div>
                <span className="text-4xl text-red-400 font-bold">:</span>
                <div className="bg-red-50 px-4 py-3 rounded-xl">
                  <span className="font-heading text-6xl font-bold text-red-700 tabular-nums">30</span>
                  <span className="block text-xs text-red-600 text-center mt-1">{String(t('linkGen.seconds')).toUpperCase()}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                  <span className="text-sm text-stone-600">{t('landing.document')}</span>
                  <span className="text-sm font-medium text-stone-900">contract_v2.pdf</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                  <span className="text-sm text-stone-600">{t('landing.views')}</span>
                  <span className="text-sm font-medium text-stone-900">3 {t('landing.uniqueViewers')}</span>
                </div>
              </div>
            </div>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-emerald-900 rounded-2xl flex items-center justify-center">
              <Shield className="w-12 h-12 text-white" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Security Marquee */}
      <div className="py-4 bg-stone-100 border-y border-stone-200">
        <Marquee speed={40} gradient={false}>
          {securityProtocols.map((protocol, i) => (
            <span key={i} className="mx-8 text-sm font-semibold text-stone-400 tracking-widest">
              {protocol}
            </span>
          ))}
        </Marquee>
      </div>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-emerald-900 uppercase tracking-wider">{t('nav.features')}</span>
            <h2 className="font-heading text-4xl md:text-5xl font-semibold text-stone-900 mt-4">
              {t('landing.featuresTitle')}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-8 rounded-2xl border border-stone-200 hover:border-emerald-200 hover:shadow-lg transition-all group"
              >
                <div className="w-14 h-14 bg-stone-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-100 transition-colors">
                  <feature.icon className="w-7 h-7 text-emerald-900" />
                </div>
                <h3 className="font-heading text-xl font-semibold text-stone-900 mb-3">{feature.title}</h3>
                <p className="text-stone-600 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 bg-stone-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-emerald-900 uppercase tracking-wider">{t('nav.howItWorks')}</span>
            <h2 className="font-heading text-4xl md:text-5xl font-semibold text-stone-900 mt-4">
              {t('landing.howTitle')}
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: t('landing.step1Title'), desc: t('landing.step1Desc') },
              { step: '02', title: t('landing.step2Title'), desc: t('landing.step2Desc') },
              { step: '03', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                viewport={{ once: true }}
                className="relative"
              >
                <span className="font-heading text-8xl font-bold text-stone-200 absolute -top-8 left-0">{item.step}</span>
                <div className="relative bg-white p-8 rounded-2xl border border-stone-200 mt-12">
                  <h3 className="font-heading text-2xl font-semibold text-stone-900 mb-3">{item.title}</h3>
                  <p className="text-stone-600 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading text-4xl md:text-6xl font-bold text-stone-900 mb-6">
            {t('landing.ctaTitle')}
          </h2>
          <p className="text-xl text-stone-600 mb-8">
            {t('landing.ctaDesc')}
          </p>
          <Link to="/register">
            <Button size="lg" className="bg-emerald-900 hover:bg-emerald-800 h-16 px-12 text-lg" data-testid="cta-register-btn">
              {t('landing.getStartedFree')}
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-stone-900 text-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12">
            <div>
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="font-heading font-bold text-xl">{brandName}</span>
              </div>
              <p className="text-stone-400">{tagline}</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footerProduct')}</h4>
              <ul className="space-y-2 text-stone-400">
                <li><Link to="/pricing" className="hover:text-white transition-colors">{t('nav.pricing')}</Link></li>
                <li><a href="#features" className="hover:text-white transition-colors">{t('nav.features')}</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">{t('nav.howItWorks')}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footerCompany')}</h4>
              <ul className="space-y-2 text-stone-400">
                {companyLinks.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="hover:text-white transition-colors" target="_blank" rel="noreferrer">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">{t('landing.footerLegal')}</h4>
              <ul className="space-y-2 text-stone-400">
                {legalLinks.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="hover:text-white transition-colors" target="_blank" rel="noreferrer">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-stone-800 mt-12 pt-8 text-center text-stone-500">
            <p>&copy; {new Date().getFullYear()} {productName}. {footerText}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
