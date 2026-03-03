import React, { useState, useEffect } from 'react';
import { CreditCard, Shield, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { api } from '../App';
import { toast } from 'sonner';

const AdminSettings = () => {
  const [stripeConfig, setStripeConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveKey, setLiveKey] = useState('');
  const [sandboxKey, setSandboxKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStripeConfig();
  }, []);

  const fetchStripeConfig = async () => {
    try {
      const res = await api.get('/admin/settings/stripe');
      setStripeConfig(res.data);
    } catch (err) {
      toast.error('Failed to load Stripe settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLiveKey = async () => {
    if (!liveKey.trim()) {
      toast.error('Please enter a Stripe Live key');
      return;
    }
    if (!liveKey.startsWith('sk_live_')) {
      toast.error('Live key must start with sk_live_');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/settings/stripe', { stripe_key: liveKey, mode: 'live' });
      toast.success('Live Stripe key saved! Payments will now use live mode.');
      setLiveKey('');
      fetchStripeConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateSandbox = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings/stripe', { mode: 'sandbox' });
      toast.success('Switched back to Sandbox mode.');
      fetchStripeConfig();
    } catch (err) {
      toast.error('Failed to switch mode');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSandboxKey = async () => {
    if (!sandboxKey.trim()) {
      toast.error('Please enter a Stripe Test key');
      return;
    }
    if (!sandboxKey.startsWith('sk_test_')) {
      toast.error('Sandbox key must start with sk_test_');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/settings/stripe', { stripe_key: sandboxKey, mode: 'sandbox' });
      toast.success('Sandbox key saved! Payments will now use sandbox mode.');
      setSandboxKey('');
      fetchStripeConfig();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save sandbox key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Platform Settings">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-900" />
        </div>
      </DashboardLayout>
    );
  }

  const isLive = stripeConfig?.mode === 'live';

  return (
    <DashboardLayout title="Platform Settings" subtitle="Manage integrations and platform configuration">
      <div className="max-w-3xl space-y-6">

        {/* Stripe Integration */}
        <Card className="border-stone-200" data-testid="stripe-settings-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-indigo-700" />
                </div>
                <div>
                  <CardTitle>Stripe Payment Integration</CardTitle>
                  <CardDescription>Manage subscription payments for your users</CardDescription>
                </div>
              </div>
              <Badge
                data-testid="stripe-mode-badge"
                className={isLive
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
                }
              >
                {isLive ? 'Live Mode' : 'Sandbox Mode'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Current Status */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
              <div className="flex items-start space-x-3">
                {isLive ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-stone-900">
                    {isLive ? 'Live Payments Active' : 'Sandbox / Test Mode Active'}
                  </p>
                  <p className="text-sm text-stone-600 mt-1">
                    {isLive
                      ? 'Real money transactions are being processed. Make sure you have tested thoroughly.'
                      : 'No real money is being processed. All payments are simulated using Stripe test cards.'}
                  </p>
                  <p className="text-xs font-mono text-stone-400 mt-2">
                    Active key: {stripeConfig?.key_preview}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Key Input */}
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">Activate Live Mode</h3>
                <p className="text-sm text-stone-500">
                  Enter your Stripe Live Secret Key to start accepting real payments. 
                  You can find this in your <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">Stripe Dashboard</a>.
                </p>
              </div>
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <Input
                    data-testid="stripe-live-key-input"
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk_live_..."
                    value={liveKey}
                    onChange={(e) => setLiveKey(e.target.value)}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  data-testid="save-stripe-live-key-btn"
                  onClick={handleSaveLiveKey}
                  disabled={saving || !liveKey.trim()}
                  className="bg-emerald-900 hover:bg-emerald-800 whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save & Activate Live'}
                </Button>
              </div>
            </div>

            {/* Sandbox Key Input */}
            <div className="space-y-3 pt-2 border-t border-stone-200">
              <div>
                <h3 className="font-semibold text-stone-900 mb-1">Activate Sandbox Mode</h3>
                <p className="text-sm text-stone-500">
                  Enter your Stripe Test Secret Key to run payment flow in sandbox mode.
                </p>
              </div>
              <div className="flex space-x-2">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk_test_..."
                  value={sandboxKey}
                  onChange={(e) => setSandboxKey(e.target.value)}
                  className="font-mono text-sm"
                  data-testid="stripe-sandbox-key-input"
                />
                <Button
                  onClick={handleSaveSandboxKey}
                  disabled={saving || !sandboxKey.trim()}
                  variant="outline"
                  className="whitespace-nowrap"
                  data-testid="save-stripe-sandbox-key-btn"
                >
                  {saving ? 'Saving...' : 'Save & Activate Sandbox'}
                </Button>
              </div>
            </div>

            {/* Switch back to Sandbox */}
            {isLive && (
              <div className="pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-900">Switch to Sandbox</p>
                    <p className="text-sm text-stone-500">Revert to test mode (no real payments)</p>
                  </div>
                  <Button
                    data-testid="activate-sandbox-btn"
                    variant="outline"
                    onClick={handleActivateSandbox}
                    disabled={saving}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Activate Sandbox
                  </Button>
                </div>
              </div>
            )}

            {/* Security Notice */}
            <div className="flex items-start space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-blue-900 text-sm">Security Notice</p>
                <p className="text-xs text-blue-700 mt-1">
                  Your Stripe keys are stored securely and never exposed to end users. 
                  Rotate your keys immediately if you suspect they've been compromised.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
};

export default AdminSettings;
