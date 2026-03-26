import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Calendar, Hand, FileText, ChevronRight, AlertCircle, Copy, Check, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Calendar as CalendarPicker } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { api, useAuth } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const LinkGenerator = () => {
  const [pdfs, setPdfs] = useState([]);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, activeWorkspace, activeWorkspaceId } = useAuth();
  const { t } = useLanguage();
  const workspaceSubscriptionStatus = activeWorkspace?.subscription_status || user?.subscription_status || 'inactive';

  // Form state
  const [selectedPdf, setSelectedPdf] = useState('');
  const [expiryMode, setExpiryMode] = useState('countdown');
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [fixedDate, setFixedDate] = useState(null);
  const [fixedTime, setFixedTime] = useState('12:00');
  const [customExpiredUrl, setCustomExpiredUrl] = useState('');
  const [customExpiredMessage, setCustomExpiredMessage] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState('platform');
  const [internalTitle, setInternalTitle] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [advancedSecurityOpen, setAdvancedSecurityOpen] = useState(false);
  const [focusLockEnabled, setFocusLockEnabled] = useState(true);
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = useState(0);
  const [strictSecurityMode, setStrictSecurityMode] = useState(false);
  const [requireFullscreen, setRequireFullscreen] = useState(false);
  const [enhancedWatermark, setEnhancedWatermark] = useState(false);
  const [singleViewerSession, setSingleViewerSession] = useState(false);
  const [ndaRequired, setNdaRequired] = useState(false);
  const [ndaTitle, setNdaTitle] = useState('Confidentiality agreement');
  const [ndaText, setNdaText] = useState('This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.');
  const [ndaAcceptLabel, setNdaAcceptLabel] = useState('I agree and continue');
  const [lockToFirstIp, setLockToFirstIp] = useState(false);
  const [restrictToSpecificIps, setRestrictToSpecificIps] = useState(false);
  const [allowedIpAddresses, setAllowedIpAddresses] = useState('');
  
  // Generated link
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchData();

    // Pre-select PDF from query params
    const pdfId = searchParams.get('pdf');
    if (pdfId) {
      setSelectedPdf(pdfId);
    }
  }, [activeWorkspaceId, searchParams]);

  useEffect(() => {
    if (!user) return;
    setFocusLockEnabled(user?.secure_link_defaults?.focus_lock_enabled !== false);
    setIdleTimeoutSeconds(Number(user?.secure_link_defaults?.idle_timeout_seconds || 0) || 0);
    setStrictSecurityMode(Boolean(user?.secure_link_defaults?.strict_security_mode));
    setRequireFullscreen(Boolean(user?.secure_link_defaults?.require_fullscreen));
    setEnhancedWatermark(Boolean(user?.secure_link_defaults?.enhanced_watermark));
    setSingleViewerSession(Boolean(user?.secure_link_defaults?.single_viewer_session));
    setNdaRequired(Boolean(user?.secure_link_defaults?.nda_required));
    setNdaTitle(user?.secure_link_defaults?.nda_title || 'Confidentiality agreement');
    setNdaText(user?.secure_link_defaults?.nda_text || 'This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.');
    setNdaAcceptLabel(user?.secure_link_defaults?.nda_accept_label || 'I agree and continue');
    setLockToFirstIp(Boolean(user?.secure_link_defaults?.lock_to_first_ip));
    const defaultAllowedIps = Array.isArray(user?.secure_link_defaults?.allowed_ip_addresses)
      ? user.secure_link_defaults.allowed_ip_addresses
      : [];
    setRestrictToSpecificIps(defaultAllowedIps.length > 0);
    setAllowedIpAddresses(defaultAllowedIps.join(', '));
  }, [user?.user_id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pdfResponse, domainResponse] = await Promise.all([
        api.get('/pdfs'),
        api.get('/domains'),
      ]);
      const pdfData = Array.isArray(pdfResponse.data) ? pdfResponse.data : [];
      const domainData = Array.isArray(domainResponse.data) ? domainResponse.data : [];

      setPdfs(pdfData);
      setDomains(domainData);
      const defaultDomain = domainData.find((domain) => domain.is_default && domain.is_ready);
      setSelectedDomainId(defaultDomain?.domain_id || 'platform');

      if (pdfData.length > 0 && !searchParams.get('pdf')) {
        setSelectedPdf(pdfData[0].pdf_id);
      }
    } catch (error) {
      toast.error('Failed to load setup data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedPdf) {
      toast.error('Please select a PDF');
      return;
    }

    if (workspaceSubscriptionStatus !== 'active') {
      toast.error('Active subscription required');
      return;
    }

    if (expiryMode === 'countdown') {
      const totalSeconds =
        (days * 86400) +
        (hours * 3600) +
        (minutes * 60) +
        seconds;
      if (totalSeconds <= 0) {
        toast.error('Countdown duration must be greater than 0');
        return;
      }
    }
    if (internalTitle.trim().length > 140) {
      toast.error('Link title must be 140 characters or less');
      return;
    }
    if (internalNote.trim().length > 400) {
      toast.error('Internal note must be 400 characters or less');
      return;
    }
    if (idleTimeoutSeconds && idleTimeoutSeconds < 15) {
      toast.error('Idle timeout must be at least 15 seconds');
      return;
    }
    if (ndaTitle.trim().length > 120) {
      toast.error('NDA title must be 120 characters or less');
      return;
    }
    if (ndaText.trim().length > 4000) {
      toast.error('NDA text must be 4000 characters or less');
      return;
    }
    if (ndaAcceptLabel.trim().length > 60) {
      toast.error('NDA button label must be 60 characters or less');
      return;
    }

    setCreating(true);

    try {
      let expiryFixedDatetime = null;
      
      if (expiryMode === 'fixed' && fixedDate) {
        const [h, m] = fixedTime.split(':');
        const dateWithTime = new Date(fixedDate);
        dateWithTime.setHours(parseInt(h), parseInt(m), 0, 0);
        expiryFixedDatetime = dateWithTime.toISOString();
      }

      const response = await api.post('/links', {
        pdf_id: selectedPdf,
        custom_domain_id: selectedDomainId === 'platform' ? null : selectedDomainId,
        expiry_mode: expiryMode,
        expiry_days: expiryMode === 'countdown' ? days : 0,
        expiry_hours: expiryMode === 'countdown' ? hours : 0,
        expiry_minutes: expiryMode === 'countdown' ? minutes : 0,
        expiry_seconds: expiryMode === 'countdown' ? seconds : 0,
        expiry_fixed_datetime: expiryFixedDatetime,
        custom_expired_url: customExpiredUrl || null,
        custom_expired_message: customExpiredMessage || null,
        internal_title: internalTitle || null,
        internal_note: internalNote || null,
        security_options: {
          focus_lock_enabled: focusLockEnabled,
          idle_timeout_seconds: idleTimeoutSeconds > 0 ? idleTimeoutSeconds : null,
          strict_security_mode: strictSecurityMode,
          require_fullscreen: requireFullscreen,
          enhanced_watermark: enhancedWatermark,
          single_viewer_session: singleViewerSession,
          nda_required: ndaRequired,
          nda_title: ndaTitle || null,
          nda_text: ndaText || null,
          nda_accept_label: ndaAcceptLabel || null,
          lock_to_first_ip: lockToFirstIp,
          allowed_ip_addresses: restrictToSpecificIps ? allowedIpAddresses : [],
        },
      });

      const fullUrl = response.data?.secure_url || `${window.location.origin}/view/${response.data.token}`;
      setGeneratedLink({ ...response.data, full_url: fullUrl });
      toast.success('Secure link created successfully!');
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to create link';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedLink) return;
    
    try {
      await navigator.clipboard.writeText(generatedLink.full_url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const expiryModes = [
    { value: 'countdown', icon: Clock, title: 'Countdown Timer', desc: 'Expires X time after first open' },
    { value: 'fixed', icon: Calendar, title: 'Fixed Date & Time', desc: 'Expires at a specific datetime' },
    { value: 'manual', icon: Hand, title: 'Manual Only', desc: 'Only expires when you revoke it' }
  ];

  if (generatedLink) {
    return (
      <DashboardLayout title={t('linkGen.linkReady')} subtitle={t('linkGen.linkReadyDesc')}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl mx-auto"
        >
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-emerald-700" />
              </div>
              
              <h2 className="font-heading text-2xl font-bold text-stone-900 mb-2">
                Secure Link Ready
              </h2>
              <p className="text-stone-600 mb-6">
                Share this link with your recipient. They will be able to view the document until it expires.
              </p>

              <div className="bg-white rounded-xl p-4 mb-6 border border-stone-200">
                <p className="text-sm text-stone-500 mb-2">Your secure link:</p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 bg-stone-50 px-4 py-3 rounded-lg text-sm text-stone-700 break-all text-left">
                    {generatedLink.full_url}
                  </code>
                  <Button
                    onClick={copyToClipboard}
                    className="bg-emerald-900 hover:bg-emerald-800 flex-shrink-0"
                    data-testid="copy-link-btn"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                <div className="bg-white rounded-lg p-4 border border-stone-200">
                  <span className="text-sm text-stone-500">Expiry Mode</span>
                  <p className="font-semibold text-stone-900 capitalize">{generatedLink.expiry_mode}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-stone-200">
                  <span className="text-sm text-stone-500">Status</span>
                  <p className="font-semibold text-emerald-700">Active</p>
                </div>
              </div>

              {generatedLink.internal_title && (
                <div className="mb-8 bg-white rounded-lg p-4 border border-stone-200 text-left">
                  <p className="text-sm text-stone-500">Internal title</p>
                  <p className="font-semibold text-stone-900">{generatedLink.internal_title}</p>
                  {generatedLink.internal_note && (
                    <p className="text-sm text-stone-600 mt-2">{generatedLink.internal_note}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  variant="outline" 
                  onClick={() => setGeneratedLink(null)}
                  className="h-12"
                >
                  Create Another Link
                </Button>
                <Button 
                  className="bg-emerald-900 hover:bg-emerald-800 h-12"
                  onClick={() => navigate('/links')}
                >
                  View All Links
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={t('linkGen.title')} subtitle={t('linkGen.subtitle')}>
      {/* Subscription Warning */}
      {workspaceSubscriptionStatus !== 'active' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800">
            <span className="font-semibold">Subscription required.</span>{' '}
            Active subscription needed to create secure links.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      ) : pdfs.length === 0 ? (
        <Card className="border-stone-200 max-w-xl mx-auto">
          <CardContent className="py-16 text-center">
            <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-stone-900 mb-2">No PDFs Available</h3>
            <p className="text-stone-500 mb-6">Upload a PDF first to create a secure link</p>
            <Button 
              className="bg-emerald-900 hover:bg-emerald-800"
              onClick={() => navigate('/pdfs')}
            >
              Upload PDF
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8">
          {/* PDF Selection */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Select Document</CardTitle>
              <CardDescription>Choose the PDF you want to create a secure link for</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedPdf} onValueChange={setSelectedPdf}>
                <SelectTrigger className="h-12" data-testid="pdf-select-trigger">
                  <SelectValue placeholder="Select a PDF" />
                </SelectTrigger>
                <SelectContent>
                  {pdfs.map((pdf) => (
                    <SelectItem key={pdf.pdf_id} value={pdf.pdf_id}>
                      <div className="flex items-center space-x-3">
                        <FileText className="w-4 h-4 text-red-600" />
                        <span>{pdf.filename}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Domain Selection */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Link Domain</CardTitle>
              <CardDescription>
                Select which domain should be used for this secure link
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
                <SelectTrigger className="h-12" data-testid="link-domain-select">
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">Platform domain ({window.location.host})</SelectItem>
                  {domains.map((domain) => (
                    <SelectItem
                      key={domain.domain_id}
                      value={domain.domain_id}
                      disabled={!domain.is_ready}
                    >
                      {domain.domain}{domain.is_default ? ' (Default)' : ''}{domain.is_ready ? '' : ' (Verify first)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-stone-500 mt-2">
                Only DNS-verified domains with active SSL can be selected.
              </p>
            </CardContent>
          </Card>

          {/* Internal Link Tracking */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Internal Link Label</CardTitle>
              <CardDescription>
                Optional internal title and note to help your team identify this link in dashboard lists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-semibold text-stone-700 mb-2 block">Link title</Label>
                <Input
                  placeholder="Example: NDA for Vendor A - March"
                  value={internalTitle}
                  onChange={(e) => setInternalTitle(e.target.value)}
                  maxLength={140}
                  className="h-12"
                  data-testid="internal-link-title-input"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-stone-700 mb-2 block">Internal note (optional)</Label>
                <Textarea
                  placeholder="Context for your team..."
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  maxLength={400}
                  className="min-h-[90px]"
                  data-testid="internal-link-note-input"
                />
              </div>
            </CardContent>
          </Card>

          {/* Expiry Mode */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Expiration Mode</CardTitle>
              <CardDescription>Choose how this link should expire</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {expiryModes.map((mode) => (
                  <div
                    key={mode.value}
                    onClick={() => setExpiryMode(mode.value)}
                    className={cn(
                      "cursor-pointer p-4 rounded-xl border-2 transition-all",
                      expiryMode === mode.value
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-stone-200 hover:border-stone-300"
                    )}
                    data-testid={`expiry-mode-${mode.value}`}
                  >
                    <mode.icon className={cn(
                      "w-6 h-6 mb-3",
                      expiryMode === mode.value ? "text-emerald-700" : "text-stone-400"
                    )} />
                    <h4 className="font-semibold text-stone-900">{mode.title}</h4>
                    <p className="text-sm text-stone-500">{mode.desc}</p>
                  </div>
                ))}
              </div>

              {/* Countdown Settings */}
              {expiryMode === 'countdown' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-4 border-t border-stone-200"
                >
                  <Label className="mb-3 block">Set countdown duration (starts after first open)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs text-stone-500">Days</Label>
                      <Input
                        type="number"
                        min="0"
                        max="3650"
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value) || 0)}
                        className="h-12"
                        data-testid="countdown-days-input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Hours</Label>
                      <Input
                        type="number"
                        min="0"
                        max="999"
                        value={hours}
                        onChange={(e) => setHours(parseInt(e.target.value) || 0)}
                        className="h-12"
                        data-testid="countdown-hours-input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Minutes</Label>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={minutes}
                        onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
                        className="h-12"
                        data-testid="countdown-minutes-input"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500">Seconds</Label>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={seconds}
                        onChange={(e) => setSeconds(parseInt(e.target.value) || 0)}
                        className="h-12"
                        data-testid="countdown-seconds-input"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Fixed Date Settings */}
              {expiryMode === 'fixed' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-4 border-t border-stone-200"
                >
                  <Label className="mb-3 block">Set expiration date and time</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-stone-500 mb-2 block">Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal h-12",
                              !fixedDate && "text-muted-foreground"
                            )}
                            data-testid="fixed-date-picker"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {fixedDate ? format(fixedDate, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={fixedDate}
                            onSelect={setFixedDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-xs text-stone-500 mb-2 block">Time</Label>
                      <Input
                        type="time"
                        value={fixedTime}
                        onChange={(e) => setFixedTime(e.target.value)}
                        className="h-12"
                        data-testid="fixed-time-input"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Custom Expiry Settings */}
          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Expired Page Settings</CardTitle>
              <CardDescription>Customize what viewers see when the link expires (optional)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-semibold text-stone-700 mb-2 block">Custom Redirect URL</Label>
                <Input
                  type="url"
                  placeholder="https://yourwebsite.com/expired"
                  value={customExpiredUrl}
                  onChange={(e) => setCustomExpiredUrl(e.target.value)}
                  className="h-12"
                  data-testid="custom-expired-url-input"
                />
                <p className="text-xs text-stone-500 mt-1">Leave empty to show default expired page</p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-stone-700 mb-2 block">Custom Expiry Message</Label>
                <Textarea
                  placeholder="This document is no longer available..."
                  value={customExpiredMessage}
                  onChange={(e) => setCustomExpiredMessage(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="custom-expired-message-input"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200">
            <CardHeader>
              <button
                type="button"
                onClick={() => setAdvancedSecurityOpen((prev) => !prev)}
                className="flex w-full items-start justify-between gap-4 text-left"
                data-testid="advanced-security-toggle"
              >
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-700" />
                    <span>Advanced Security</span>
                  </CardTitle>
                  <CardDescription>
                    Optional NDA, focus lock, inactivity pause, and IP-based access rules for this link.
                  </CardDescription>
                </div>
                <div className="mt-1 rounded-full border border-stone-200 p-2 text-stone-500">
                  {advancedSecurityOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>
            </CardHeader>
            {advancedSecurityOpen && (
              <CardContent className="space-y-6">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">Strict security mode</p>
                      <p className="mt-1 text-sm text-stone-600">
                        Adds fullscreen enforcement, stronger watermarks, and single-session locking on top of the existing secure viewer protections.
                      </p>
                    </div>
                    <Switch checked={strictSecurityMode} onCheckedChange={setStrictSecurityMode} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-stone-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-900">Focus lock on tab change</p>
                        <p className="mt-1 text-sm text-stone-500">
                          Black out the PDF area when the viewer loses focus. The recipient must resume manually.
                        </p>
                      </div>
                      <Switch checked={focusLockEnabled} onCheckedChange={setFocusLockEnabled} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-stone-200 p-4">
                    <Label className="text-sm font-semibold text-stone-900">Idle timeout (seconds)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="86400"
                      value={idleTimeoutSeconds}
                      onChange={(e) => setIdleTimeoutSeconds(Number.parseInt(e.target.value || '0', 10) || 0)}
                      className="mt-3 h-12"
                      data-testid="advanced-idle-timeout-input"
                    />
                    <p className="mt-2 text-sm text-stone-500">
                      Use `0` to disable. When enabled, the viewer pauses after inactivity and needs a manual resume.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-stone-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-900">Require fullscreen</p>
                        <p className="mt-1 text-sm text-stone-500">
                          Force the viewer back into fullscreen before the PDF becomes visible again.
                        </p>
                      </div>
                      <Switch checked={requireFullscreen} onCheckedChange={setRequireFullscreen} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-stone-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-900">Enhanced watermark</p>
                        <p className="mt-1 text-sm text-stone-500">
                          Increase repeated watermark coverage with session, IP, host, and timestamp details.
                        </p>
                      </div>
                      <Switch checked={enhancedWatermark} onCheckedChange={setEnhancedWatermark} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-stone-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-900">Single active viewer session</p>
                        <p className="mt-1 text-sm text-stone-500">
                          Allow only one active secure viewer session for this link at a time.
                        </p>
                      </div>
                      <Switch checked={singleViewerSession} onCheckedChange={setSingleViewerSession} />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">Require NDA acknowledgement</p>
                      <p className="mt-1 text-sm text-stone-500">
                        Show a confidentiality screen before the document becomes visible.
                      </p>
                    </div>
                    <Switch checked={ndaRequired} onCheckedChange={setNdaRequired} />
                  </div>

                  {ndaRequired && (
                    <div className="mt-5 grid gap-4">
                      <div>
                        <Label className="text-sm font-semibold text-stone-700 mb-2 block">NDA title</Label>
                        <Input
                          value={ndaTitle}
                          onChange={(e) => setNdaTitle(e.target.value)}
                          maxLength={120}
                          className="h-12"
                          data-testid="advanced-nda-title-input"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-stone-700 mb-2 block">NDA text</Label>
                        <Textarea
                          value={ndaText}
                          onChange={(e) => setNdaText(e.target.value)}
                          maxLength={4000}
                          className="min-h-[160px]"
                          data-testid="advanced-nda-text-input"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-semibold text-stone-700 mb-2 block">Accept button label</Label>
                        <Input
                          value={ndaAcceptLabel}
                          onChange={(e) => setNdaAcceptLabel(e.target.value)}
                          maxLength={60}
                          className="h-12"
                          data-testid="advanced-nda-accept-label-input"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-stone-200 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">Lock to first approved IP</p>
                      <p className="mt-1 text-sm text-stone-500">
                        Once the first approved viewer opens the link, the secure session is tied to that IP. Use this when you do not know the recipient IP in advance.
                      </p>
                    </div>
                    <Switch checked={lockToFirstIp} onCheckedChange={setLockToFirstIp} />
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-900">Restrict to specific IP addresses</p>
                        <p className="mt-1 text-sm text-stone-500">
                          Only use this when the recipient has a fixed office or server IP. Most home and mobile networks change often.
                        </p>
                      </div>
                      <Switch
                        checked={restrictToSpecificIps}
                        onCheckedChange={(checked) => {
                          setRestrictToSpecificIps(checked);
                          if (!checked) {
                            setAllowedIpAddresses('');
                          }
                        }}
                      />
                    </div>

                    {restrictToSpecificIps && (
                      <div className="mt-4">
                        <Label className="text-sm font-semibold text-stone-700 mb-2 block">Allowed IP addresses</Label>
                        <Textarea
                          placeholder={'203.0.113.10\n198.51.100.24'}
                          value={allowedIpAddresses}
                          onChange={(e) => setAllowedIpAddresses(e.target.value)}
                          className="min-h-[100px]"
                          data-testid="advanced-allowed-ip-input"
                        />
                        <p className="mt-2 text-sm text-stone-500">
                          Enter exact IPv4 or IPv6 addresses, one per line or separated by commas.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Submit */}
          <Button 
            type="submit" 
            className="w-full h-14 bg-emerald-900 hover:bg-emerald-800 text-lg"
            disabled={creating || !selectedPdf || workspaceSubscriptionStatus !== 'active'}
            data-testid="create-link-submit-btn"
          >
            {creating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                Creating Secure Link...
              </>
            ) : (
              <>
                Generate Secure Link
                <ChevronRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </form>
      )}
    </DashboardLayout>
  );
};

export default LinkGenerator;
