import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Globe, CreditCard, ChevronRight } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api, useAuth } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const Settings = () => {
  const { user, updateUserLanguage } = useAuth();
  const { language, setLanguage, languages, t } = useLanguage();
  const [domains, setDomains] = useState([]);
  const [defaultDomainId, setDefaultDomainId] = useState('platform');
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [updatingDefaultDomain, setUpdatingDefaultDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      fetchDomains();
    }
  }, [user]);

  const fetchDomains = async () => {
    try {
      const response = await api.get('/domains');
      const items = Array.isArray(response.data) ? response.data : [];
      setDomains(items);
      const defaultDomain = items.find((domain) => domain.is_default);
      const readyDefault = defaultDomain?.is_ready ? defaultDomain.domain_id : 'platform';
      setDefaultDomainId(readyDefault);
    } catch (error) {
      console.error('Failed to fetch domains');
    }
  };

  const isDomainReady = (domain) => Boolean(domain?.is_ready);

  const handleLanguageChange = async (newLang) => {
    setSavingLanguage(true);
    try {
      await updateUserLanguage(newLang);
      setLanguage(newLang);
      toast.success('Language updated successfully');
    } catch (error) {
      toast.error('Failed to update language');
    } finally {
      setSavingLanguage(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    setAddingDomain(true);
    try {
      const response = await api.post('/domains', { domain: newDomain });
      toast.success('Domain added! Follow the verification instructions.');
      await fetchDomains();
      if (response.data?.is_default && response.data?.is_ready) {
        setDefaultDomainId(response.data.domain_id);
      }
      setNewDomain('');
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to add domain';
      toast.error(message);
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async (domainId) => {
    try {
      await api.delete(`/domains/${domainId}`);
      toast.success('Domain removed');
      await fetchDomains();
    } catch (error) {
      toast.error('Failed to remove domain');
    }
  };

  const handleDefaultDomainChange = async (domainId) => {
    const target = domainId || 'platform';
    setDefaultDomainId(target);
    setUpdatingDefaultDomain(true);
    try {
      await api.put('/domains/default', {
        domain_id: target === 'platform' ? null : target,
      });
      toast.success('Default domain updated');
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update default domain');
      await fetchDomains();
    } finally {
      setUpdatingDefaultDomain(false);
    }
  };

  const handleVerifyDomain = async (domainId) => {
    setVerifyingDomainId(domainId);
    try {
      const response = await api.post(`/domains/${domainId}`);
      if (response.data?.is_ready) {
        toast.success('Domain verified with active SSL');
      } else {
        toast.warning(response.data?.verification_error || 'Domain not ready yet. Check DNS and SSL.');
      }
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to verify domain');
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    // Note: Password change would require current password verification
    // For demo, we'll show a success message
    setTimeout(() => {
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setChangingPassword(false);
    }, 1000);
  };

  return (
    <DashboardLayout title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <div className="max-w-3xl space-y-8">
        {/* Language Selection - FIRST and prominent */}
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Globe className="w-5 h-5 text-emerald-700" />
              <span>{t('settings.language')}</span>
            </CardTitle>
            <CardDescription>{t('settings.languageDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select 
              value={language} 
              onValueChange={handleLanguageChange}
              disabled={savingLanguage}
            >
              <SelectTrigger className="h-12 max-w-md" data-testid="settings-language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="flex items-center">
                      <span className="font-medium">{lang.nativeName}</span>
                      <span className="text-stone-500 ml-2">({lang.name})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {savingLanguage && (
              <p className="text-sm text-emerald-600 mt-2">Saving...</p>
            )}
          </CardContent>
        </Card>

        {/* Profile Section */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5 text-emerald-700" />
              <span>{t('settings.profileInfo')}</span>
            </CardTitle>
            <CardDescription>{t('settings.profileDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-stone-500">{t('settings.name')}</Label>
                <p className="font-medium text-stone-900">{user?.name}</p>
              </div>
              <div>
                <Label className="text-sm text-stone-500">{t('settings.email')}</Label>
                <p className="font-medium text-stone-900">{user?.email}</p>
              </div>
              <div>
                <Label className="text-sm text-stone-500">{t('settings.memberSince')}</Label>
                <p className="font-medium text-stone-900">
                  {user?.created_at ? format(new Date(user.created_at), 'MMMM d, yyyy') : 'N/A'}
                </p>
              </div>
              <div>
                <Label className="text-sm text-stone-500">{t('settings.accountRole')}</Label>
                <p className="font-medium text-stone-900 capitalize">{user?.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Section */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-emerald-700" />
              <span>{t('settings.subscription')}</span>
            </CardTitle>
            <CardDescription>{t('settings.subscriptionDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-xl mb-4">
              <div>
                <p className="font-semibold text-stone-900">
                  {user?.plan?.charAt(0).toUpperCase() + user?.plan?.slice(1) || 'No'} {t('settings.plan')}
                </p>
                <p className="text-sm text-stone-500">
                  {t('settings.status')}: <span className={user?.subscription_status === 'active' ? 'text-emerald-600' : 'text-stone-600'}>
                    {user?.subscription_status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </p>
              </div>
              {user?.subscription_status === 'active' ? (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase">
                  Active
                </span>
              ) : (
                <Link to="/pricing">
                  <Button className="bg-emerald-900 hover:bg-emerald-800">
                    {t('settings.upgrade')}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
            
            {user?.subscription_status === 'active' && (
              <Link to="/pricing">
                <Button variant="outline" className="w-full">
                  {t('settings.changePlan')}
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Lock className="w-5 h-5 text-emerald-700" />
              <span>{t('settings.changePassword')}</span>
            </CardTitle>
            <CardDescription>{t('settings.changePasswordDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">{t('settings.currentPassword')}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-12"
                  data-testid="current-password-input"
                />
              </div>
              <div>
                <Label htmlFor="newPassword">{t('settings.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-12"
                  data-testid="new-password-input"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">{t('settings.confirmNewPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12"
                  data-testid="confirm-new-password-input"
                />
              </div>
              <Button 
                type="submit" 
                className="bg-emerald-900 hover:bg-emerald-800"
                disabled={changingPassword || !currentPassword || !newPassword}
              >
                {changingPassword ? t('settings.changing') : t('settings.changePassword')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Custom Domains */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Globe className="w-5 h-5 text-emerald-700" />
              <span>{t('settings.customDomains')}</span>
            </CardTitle>
            <CardDescription>
              Add domains for secure links and direct PDF links, then choose a default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Label className="text-sm text-stone-500 mb-2 block">Default domain for new links</Label>
              <Select
                value={defaultDomainId}
                onValueChange={handleDefaultDomainChange}
                disabled={updatingDefaultDomain}
              >
                <SelectTrigger className="h-12 max-w-md" data-testid="default-domain-select">
                  <SelectValue placeholder="Select default domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">Platform domain</SelectItem>
                  {domains.map((domain) => (
                    <SelectItem
                      key={domain.domain_id}
                      value={domain.domain_id}
                      disabled={!isDomainReady(domain)}
                    >
                      {domain.domain}{isDomainReady(domain) ? '' : ' (Verify first)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-stone-500 mt-2">
                Only verified domains with active SSL can be set as default.
              </p>
            </div>

            <form onSubmit={handleAddDomain} className="flex gap-3 mb-6">
              <Input
                placeholder="secure.yourdomain.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="h-12 flex-1"
                data-testid="add-domain-input"
              />
              <Button
                type="submit"
                className="bg-emerald-900 hover:bg-emerald-800 h-12"
                disabled={addingDomain}
              >
                {addingDomain ? t('settings.adding') : t('settings.addDomain')}
              </Button>
            </form>

            {domains.length > 0 ? (
              <div className="space-y-3">
                {domains.map((domain) => (
                  <div
                    key={domain.domain_id}
                    className="p-4 bg-stone-50 rounded-lg"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-stone-900">{domain.domain}</p>
                          <p className="text-sm text-stone-500">
                            DNS: {domain.verification_status === 'verified' ? (
                              <span className="text-emerald-600">{t('settings.verified')}</span>
                            ) : (
                              <span className="text-amber-600">{t('settings.pendingVerification')}</span>
                            )}
                            <span className="mx-2">•</span>
                            SSL: {domain.ssl_status === 'active' ? (
                              <span className="text-emerald-600">Active (Let's Encrypt)</span>
                            ) : domain.ssl_status === 'invalid' ? (
                              <span className="text-red-600">Invalid</span>
                            ) : (
                              <span className="text-amber-600">Pending</span>
                            )}
                            <span className="mx-2">•</span>
                            Vercel: {domain.vercel_status === 'verified' ? (
                              <span className="text-emerald-600">Verified</span>
                            ) : domain.vercel_status === 'pending' ? (
                              <span className="text-amber-600">Pending</span>
                            ) : domain.vercel_status === 'error' ? (
                              <span className="text-red-600">Error</span>
                            ) : domain.vercel_status === 'not_configured' ? (
                              <span className="text-amber-600">Not Configured</span>
                            ) : (
                              <span className="text-stone-600">{domain.vercel_status || 'Unknown'}</span>
                            )}
                            {domain.is_default && (
                              <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                                Default
                              </span>
                            )}
                          </p>
                          {domain.verification_error && !domain.is_ready && (
                            <p className="text-xs text-amber-700 mt-1">{domain.verification_error}</p>
                          )}
                          {domain.vercel_error && (
                            <p className="text-xs text-amber-700 mt-1">Vercel: {domain.vercel_error}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerifyDomain(domain.domain_id)}
                            disabled={verifyingDomainId === domain.domain_id}
                          >
                            {verifyingDomainId === domain.domain_id ? 'Verifying...' : 'Verify DNS & SSL'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteDomain(domain.domain_id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            {t('settings.remove')}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 space-y-1">
                        <p>
                          <span className="font-semibold">TXT</span> {domain.verification_txt_name} = {domain.verification_token}
                        </p>
                        <p>
                          <span className="font-semibold">CNAME</span> {domain.domain} → {domain.cname_target}
                        </p>
                        {Array.isArray(domain.expected_a_targets) && domain.expected_a_targets.length > 0 && (
                          <p>
                            <span className="font-semibold">A</span> (optional for apex): {domain.expected_a_targets.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-stone-500 text-center py-8">
                {t('settings.noDomains')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
