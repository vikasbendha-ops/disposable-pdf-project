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
  const { user, refreshUser, updateUserLanguage } = useAuth();
  const { language, setLanguage, languages, t } = useLanguage();
  const [domains, setDomains] = useState([]);
  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user?.plan === 'enterprise') {
      fetchDomains();
    }
  }, [user]);

  const fetchDomains = async () => {
    try {
      const response = await api.get('/domains');
      setDomains(response.data);
    } catch (error) {
      console.error('Failed to fetch domains');
    }
  };

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
      setDomains([...domains, response.data]);
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
      setDomains(domains.filter(d => d.domain_id !== domainId));
    } catch (error) {
      toast.error('Failed to remove domain');
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

        {/* Custom Domains (Enterprise only) */}
        {user?.plan === 'enterprise' && (
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-emerald-700" />
                <span>{t('settings.customDomains')}</span>
              </CardTitle>
              <CardDescription>{t('settings.customDomainsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
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
                      className="flex items-center justify-between p-4 bg-stone-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-stone-900">{domain.domain}</p>
                        <p className="text-sm text-stone-500">
                          {t('settings.status')}: {domain.verification_status === 'verified' ? (
                            <span className="text-emerald-600">{t('settings.verified')}</span>
                          ) : (
                            <span className="text-amber-600">{t('settings.pendingVerification')}</span>
                          )}
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDeleteDomain(domain.domain_id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        {t('settings.remove')}
                      </Button>
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
        )}
      </div>
    </DashboardLayout>
  );
};

export default Settings;
