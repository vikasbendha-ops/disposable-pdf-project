import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Marquee from 'react-fast-marquee';
import { Shield, Clock, Eye, Lock, FileText, Zap, ChevronRight, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../App';

const Landing = () => {
  const { user } = useAuth();

  const features = [
    { icon: Shield, title: 'Military-Grade Security', desc: 'Your PDFs are encrypted and stored in secure vaults, never accessible directly.' },
    { icon: Clock, title: 'Self-Destructing Links', desc: 'Set countdown timers, fixed expiry dates, or revoke access manually at any time.' },
    { icon: Eye, title: 'View Tracking', desc: 'Know exactly when, where, and how many times your document was accessed.' },
    { icon: Lock, title: 'Copy Protection', desc: 'Prevent downloads, copying, and printing with our secure viewer technology.' },
  ];

  const securityProtocols = [
    'AES-256 ENCRYPTION', 'ZERO KNOWLEDGE', 'GDPR COMPLIANT', 'SOC2 READY',
    'IP TRACKING', 'WATERMARKING', 'ACCESS CONTROL', 'AUDIT LOGS'
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2" data-testid="logo-link">
            <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-heading font-bold text-xl text-stone-900">Autodestroy</span>
          </Link>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/pricing" className="text-stone-600 hover:text-stone-900 transition-colors" data-testid="nav-pricing">Pricing</Link>
            <a href="#features" className="text-stone-600 hover:text-stone-900 transition-colors">Features</a>
            <a href="#how-it-works" className="text-stone-600 hover:text-stone-900 transition-colors">How It Works</a>
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <Link to="/dashboard">
                <Button className="bg-emerald-900 hover:bg-emerald-800" data-testid="nav-dashboard-btn">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" data-testid="nav-login-btn">Sign In</Button>
                </Link>
                <Link to="/register">
                  <Button className="bg-emerald-900 hover:bg-emerald-800" data-testid="nav-register-btn">
                    Get Started
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
              SECURE DOCUMENT SHARING
            </span>
            <h1 className="font-heading text-5xl md:text-7xl font-bold text-stone-900 tracking-tight leading-[0.95] mb-6">
              Your PDFs<br />
              <span className="text-emerald-900">Self-Destruct</span><br />
              On Schedule
            </h1>
            <p className="text-lg text-stone-600 leading-relaxed mb-8 max-w-lg">
              Share sensitive documents with complete control. Set expiration timers, 
              track views, and revoke access instantly. Your vault, your rules.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/register">
                <Button size="lg" className="bg-emerald-900 hover:bg-emerald-800 h-14 px-8 text-lg" data-testid="hero-cta-btn">
                  Start Free Trial
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-2 border-stone-300">
                  See How It Works
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
                <span className="text-sm font-semibold text-stone-500 uppercase tracking-wider">Self-Destruct Timer</span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase">Active</span>
              </div>
              <div className="flex items-baseline justify-center space-x-2 mb-8">
                <div className="bg-red-50 px-4 py-3 rounded-xl">
                  <span className="font-heading text-6xl font-bold text-red-700 tabular-nums">02</span>
                  <span className="block text-xs text-red-600 text-center mt-1">HOURS</span>
                </div>
                <span className="text-4xl text-red-400 font-bold">:</span>
                <div className="bg-red-50 px-4 py-3 rounded-xl">
                  <span className="font-heading text-6xl font-bold text-red-700 tabular-nums">45</span>
                  <span className="block text-xs text-red-600 text-center mt-1">MINS</span>
                </div>
                <span className="text-4xl text-red-400 font-bold">:</span>
                <div className="bg-red-50 px-4 py-3 rounded-xl">
                  <span className="font-heading text-6xl font-bold text-red-700 tabular-nums">30</span>
                  <span className="block text-xs text-red-600 text-center mt-1">SECS</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                  <span className="text-sm text-stone-600">Document</span>
                  <span className="text-sm font-medium text-stone-900">contract_v2.pdf</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                  <span className="text-sm text-stone-600">Views</span>
                  <span className="text-sm font-medium text-stone-900">3 unique viewers</span>
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
            <span className="text-sm font-semibold text-emerald-900 uppercase tracking-wider">Features</span>
            <h2 className="font-heading text-4xl md:text-5xl font-semibold text-stone-900 mt-4">
              Complete Control Over Your Documents
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
            <span className="text-sm font-semibold text-emerald-900 uppercase tracking-wider">How It Works</span>
            <h2 className="font-heading text-4xl md:text-5xl font-semibold text-stone-900 mt-4">
              Three Steps to Secure Sharing
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Upload Your PDF', desc: 'Securely upload your document to our encrypted vault.' },
              { step: '02', title: 'Set Expiration', desc: 'Choose countdown timer, fixed date, or manual control.' },
              { step: '03', title: 'Share & Track', desc: 'Send the secure link and monitor every access.' },
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
            Ready to Secure Your Documents?
          </h2>
          <p className="text-xl text-stone-600 mb-8">
            Start with a free trial. No credit card required.
          </p>
          <Link to="/register">
            <Button size="lg" className="bg-emerald-900 hover:bg-emerald-800 h-16 px-12 text-lg" data-testid="cta-register-btn">
              Get Started Free
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
                <span className="font-heading font-bold text-xl">Autodestroy</span>
              </div>
              <p className="text-stone-400">Secure document sharing with complete control.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-stone-400">
                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-stone-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-stone-400">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors">GDPR</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-stone-800 mt-12 pt-8 text-center text-stone-500">
            <p>&copy; {new Date().getFullYear()} Autodestroy PDF Platform. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
