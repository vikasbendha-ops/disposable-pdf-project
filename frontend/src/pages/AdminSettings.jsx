import React, { useState, useEffect } from 'react';
import { CreditCard, Shield, CheckCircle, AlertCircle, Eye, EyeOff, Palette } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { api, DEFAULT_BRANDING, useAuth, useBranding } from '../App';
import { toast } from 'sonner';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const AdminSettings = () => {
  const { user } = useAuth();
  const { refreshBranding } = useBranding();
  const isSuperAdmin = user?.role === 'super_admin';

  const [stripeConfig, setStripeConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveKey, setLiveKey] = useState('');
  const [sandboxKey, setSandboxKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [storageConfig, setStorageConfig] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageProvider, setStorageProvider] = useState('supabase_db');
  const [wasabiEndpoint, setWasabiEndpoint] = useState('');
  const [wasabiRegion, setWasabiRegion] = useState('us-east-1');
  const [wasabiBucket, setWasabiBucket] = useState('');
  const [wasabiAccessKey, setWasabiAccessKey] = useState('');
  const [wasabiSecretKey, setWasabiSecretKey] = useState('');
  const [wasabiForcePathStyle, setWasabiForcePathStyle] = useState(true);

  const [brandingConfig, setBrandingConfig] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandName, setBrandName] = useState(DEFAULT_BRANDING.app_name);
  const [brandProductName, setBrandProductName] = useState(DEFAULT_BRANDING.product_name);
  const [brandTagline, setBrandTagline] = useState(DEFAULT_BRANDING.tagline);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(DEFAULT_BRANDING.primary_color);
  const [brandAccentColor, setBrandAccentColor] = useState(DEFAULT_BRANDING.accent_color);
  const [brandFooterText, setBrandFooterText] = useState(DEFAULT_BRANDING.footer_text);

  useEffect(() => {
    fetchStripeConfig();
    if (isSuperAdmin) {
      fetchStorageConfig();
      fetchBrandingConfig();
    }
  }, [isSuperAdmin]);

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

  const applyStorageState = (config) => {
    setStorageConfig(config);
    setStorageProvider(config?.active_provider || 'supabase_db');
    setWasabiEndpoint(config?.wasabi?.endpoint || '');
    setWasabiRegion(config?.wasabi?.region || 'us-east-1');
    setWasabiBucket(config?.wasabi?.bucket || '');
    setWasabiForcePathStyle(config?.wasabi?.force_path_style !== false);
  };

  const fetchStorageConfig = async () => {
    setStorageLoading(true);
    try {
      const res = await api.get('/admin/settings/storage');
      applyStorageState(res.data);
    } catch (err) {
      setStorageConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || 'Failed to load storage settings');
      }
    } finally {
      setStorageLoading(false);
    }
  };

  const applyBrandingState = (config) => {
    setBrandingConfig(config);
    setBrandName(config?.app_name || DEFAULT_BRANDING.app_name);
    setBrandProductName(config?.product_name || DEFAULT_BRANDING.product_name);
    setBrandTagline(config?.tagline || DEFAULT_BRANDING.tagline);
    setBrandPrimaryColor(config?.primary_color || DEFAULT_BRANDING.primary_color);
    setBrandAccentColor(config?.accent_color || DEFAULT_BRANDING.accent_color);
    setBrandFooterText(config?.footer_text || DEFAULT_BRANDING.footer_text);
  };

  const fetchBrandingConfig = async () => {
    setBrandingLoading(true);
    try {
      const res = await api.get('/admin/settings/branding');
      applyBrandingState(res.data);
    } catch (err) {
      setBrandingConfig(null);
      if (err.response?.status !== 403) {
        toast.error(err.response?.data?.detail || 'Failed to load branding settings');
      }
    } finally {
      setBrandingLoading(false);
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

  const handleSaveStorageConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update storage settings');
      return;
    }

    const payload = {
      active_provider: storageProvider,
      wasabi_endpoint: wasabiEndpoint,
      wasabi_region: wasabiRegion,
      wasabi_bucket: wasabiBucket,
      wasabi_force_path_style: wasabiForcePathStyle,
    };
    if (wasabiAccessKey.trim()) {
      payload.wasabi_access_key_id = wasabiAccessKey.trim();
    }
    if (wasabiSecretKey.trim()) {
      payload.wasabi_secret_access_key = wasabiSecretKey.trim();
    }

    setStorageSaving(true);
    try {
      const res = await api.put('/admin/settings/storage', payload);
      applyStorageState(res.data);
      setWasabiAccessKey('');
      setWasabiSecretKey('');
      toast.success('Storage settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save storage settings');
    } finally {
      setStorageSaving(false);
    }
  };

  const handleSaveBrandingConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Only super admin can update branding settings');
      return;
    }

    if (!HEX_COLOR_RE.test(brandPrimaryColor.trim())) {
      toast.error('Primary color must be a hex value like #064e3b');
      return;
    }
    if (!HEX_COLOR_RE.test(brandAccentColor.trim())) {
      toast.error('Accent color must be a hex value like #10b981');
      return;
    }

    const payload = {
      app_name: brandName.trim(),
      product_name: brandProductName.trim(),
      tagline: brandTagline.trim(),
      primary_color: brandPrimaryColor.trim(),
      accent_color: brandAccentColor.trim(),
      footer_text: brandFooterText.trim(),
    };

    setBrandingSaving(true);
    try {
      const res = await api.put('/admin/settings/branding', payload);
      applyBrandingState(res.data);
      await refreshBranding();
      toast.success('Branding settings saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save branding settings');
    } finally {
      setBrandingSaving(false);
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

        {/* Storage Provider (Super Admin only) */}
        <Card className="border-stone-200" data-testid="storage-settings-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>PDF Storage Provider</CardTitle>
                <CardDescription>
                  Select where PDFs are stored for new uploads. Existing links remain unaffected.
                </CardDescription>
              </div>
              <Badge
                className={
                  storageProvider === 'wasabi_s3'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }
              >
                {storageProvider === 'wasabi_s3' ? 'Wasabi Active' : 'Supabase Active'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isSuperAdmin ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Only super admin can change storage provider. Current role: {user?.role || 'unknown'}.
              </div>
            ) : storageLoading ? (
              <div className="text-sm text-stone-500">Loading storage settings...</div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-stone-700">Active provider</p>
                  <Select value={storageProvider} onValueChange={setStorageProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select storage provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supabase_db">Supabase (Database Storage)</SelectItem>
                      <SelectItem value="wasabi_s3">Wasabi (S3 Compatible)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 pt-3 border-t border-stone-200">
                  <p className="text-sm font-semibold text-stone-700">Wasabi Configuration</p>
                  <Input
                    placeholder="Endpoint (e.g. https://s3.ap-south-1.wasabisys.com)"
                    value={wasabiEndpoint}
                    onChange={(e) => setWasabiEndpoint(e.target.value)}
                  />
                  <Input
                    placeholder="Region (e.g. ap-south-1)"
                    value={wasabiRegion}
                    onChange={(e) => setWasabiRegion(e.target.value)}
                  />
                  <Input
                    placeholder="Bucket name"
                    value={wasabiBucket}
                    onChange={(e) => setWasabiBucket(e.target.value)}
                  />
                  <Input
                    placeholder="Access key ID (leave blank to keep current)"
                    value={wasabiAccessKey}
                    onChange={(e) => setWasabiAccessKey(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Secret access key (leave blank to keep current)"
                    value={wasabiSecretKey}
                    onChange={(e) => setWasabiSecretKey(e.target.value)}
                  />
                  <div className="flex items-center justify-between rounded-lg border border-stone-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-stone-900">Force path style</p>
                      <p className="text-xs text-stone-500">Recommended for S3-compatible providers</p>
                    </div>
                    <Switch checked={wasabiForcePathStyle} onCheckedChange={setWasabiForcePathStyle} />
                  </div>
                  <div className="text-xs text-stone-500">
                    Current key status: {storageConfig?.wasabi?.access_key_set ? 'access key set' : 'access key missing'} /{' '}
                    {storageConfig?.wasabi?.secret_key_set ? 'secret key set' : 'secret key missing'}
                  </div>
                </div>

                <Button
                  onClick={handleSaveStorageConfig}
                  disabled={storageSaving}
                  className="bg-emerald-900 hover:bg-emerald-800"
                >
                  {storageSaving ? 'Saving...' : 'Save Storage Settings'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Branding (Super Admin only) */}
        <Card className="border-stone-200" data-testid="branding-settings-card">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-violet-100">
                <Palette className="w-5 h-5 text-violet-700" />
              </div>
              <div>
                <CardTitle>Branding Settings</CardTitle>
                <CardDescription>
                  Update brand name, tagline and colors shown across the app.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isSuperAdmin ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Only super admin can update branding settings. Current role: {user?.role || 'unknown'}.
              </div>
            ) : brandingLoading ? (
              <div className="text-sm text-stone-500">Loading branding settings...</div>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-stone-700">App name</p>
                    <Input
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Autodestroy"
                      maxLength={48}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-stone-700">Product name</p>
                    <Input
                      value={brandProductName}
                      onChange={(e) => setBrandProductName(e.target.value)}
                      placeholder="Autodestroy PDF Platform"
                      maxLength={72}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-stone-700">Tagline</p>
                  <Input
                    value={brandTagline}
                    onChange={(e) => setBrandTagline(e.target.value)}
                    placeholder="Secure Document Sharing"
                    maxLength={120}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-stone-700">Primary color</p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={brandPrimaryColor}
                        onChange={(e) => setBrandPrimaryColor(e.target.value)}
                        placeholder="#064e3b"
                        className="font-mono"
                      />
                      <div
                        className="w-10 h-10 rounded border border-stone-200"
                        style={{ backgroundColor: HEX_COLOR_RE.test(brandPrimaryColor) ? brandPrimaryColor : '#ffffff' }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-stone-700">Accent color</p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={brandAccentColor}
                        onChange={(e) => setBrandAccentColor(e.target.value)}
                        placeholder="#10b981"
                        className="font-mono"
                      />
                      <div
                        className="w-10 h-10 rounded border border-stone-200"
                        style={{ backgroundColor: HEX_COLOR_RE.test(brandAccentColor) ? brandAccentColor : '#ffffff' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-stone-700">Footer text</p>
                  <Input
                    value={brandFooterText}
                    onChange={(e) => setBrandFooterText(e.target.value)}
                    placeholder="All rights reserved."
                    maxLength={160}
                  />
                </div>

                <div className="rounded-lg border border-stone-200 p-4 bg-stone-50">
                  <p className="text-xs uppercase tracking-wider text-stone-500 mb-2">Preview</p>
                  <p className="font-heading text-lg text-stone-900">{brandName || DEFAULT_BRANDING.app_name}</p>
                  <p className="text-sm text-stone-600">{brandTagline || DEFAULT_BRANDING.tagline}</p>
                  <p className="text-xs text-stone-500 mt-2">
                    {new Date().getFullYear()} {brandProductName || DEFAULT_BRANDING.product_name}. {brandFooterText || DEFAULT_BRANDING.footer_text}
                  </p>
                  {brandingConfig?.updated_at && (
                    <p className="text-[11px] text-stone-400 mt-2">Last updated: {new Date(brandingConfig.updated_at).toLocaleString()}</p>
                  )}
                </div>

                <Button
                  onClick={handleSaveBrandingConfig}
                  disabled={brandingSaving}
                  className="bg-emerald-900 hover:bg-emerald-800"
                >
                  {brandingSaving ? 'Saving...' : 'Save Branding Settings'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
};

export default AdminSettings;
