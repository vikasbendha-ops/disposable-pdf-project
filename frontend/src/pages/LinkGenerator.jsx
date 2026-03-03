import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Calendar, Hand, FileText, ChevronRight, AlertCircle, Copy, Check } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar as CalendarPicker } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { api, useAuth, BACKEND_URL } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const LinkGenerator = () => {
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();

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
  
  // Generated link
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPdfs();
    
    // Pre-select PDF from query params
    const pdfId = searchParams.get('pdf');
    if (pdfId) {
      setSelectedPdf(pdfId);
    }
  }, [searchParams]);

  const fetchPdfs = async () => {
    try {
      const response = await api.get('/pdfs');
      setPdfs(response.data);
      
      // Auto-select first PDF if no query param
      if (response.data.length > 0 && !searchParams.get('pdf')) {
        setSelectedPdf(response.data[0].pdf_id);
      }
    } catch (error) {
      toast.error('Failed to load PDFs');
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

    if (user?.subscription_status !== 'active') {
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
        expiry_mode: expiryMode,
        expiry_days: expiryMode === 'countdown' ? days : 0,
        expiry_hours: expiryMode === 'countdown' ? hours : 0,
        expiry_minutes: expiryMode === 'countdown' ? minutes : 0,
        expiry_seconds: expiryMode === 'countdown' ? seconds : 0,
        expiry_fixed_datetime: expiryFixedDatetime,
        custom_expired_url: customExpiredUrl || null,
        custom_expired_message: customExpiredMessage || null
      });

      const fullUrl = `${window.location.origin}/view/${response.data.token}`;
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
      {user?.subscription_status !== 'active' && (
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

          {/* Submit */}
          <Button 
            type="submit" 
            className="w-full h-14 bg-emerald-900 hover:bg-emerald-800 text-lg"
            disabled={creating || !selectedPdf || user?.subscription_status !== 'active'}
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
