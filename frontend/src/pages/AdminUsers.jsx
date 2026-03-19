import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, Shield, Trash2, X, MoreVertical, CreditCard } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { api, useAuth, useSubscriptionPlans } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

const EMPTY_BILLING_PROFILE = {
  full_name: '',
  company_name: '',
  email: '',
  phone: '',
  tax_label: 'Tax ID',
  tax_id: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
};

const EMPTY_CREATE_USER = {
  name: '',
  email: '',
  password: '',
  role: 'user',
  plan: 'none',
  free_access_days: '30',
};

const AdminUsers = () => {
  const { user: currentUser } = useAuth();
  const { plans } = useSubscriptionPlans();
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [billingTarget, setBillingTarget] = useState(null);
  const [billingDetails, setBillingDetails] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_USER);
  const [creatingUser, setCreatingUser] = useState(false);
  const [billingProfileForm, setBillingProfileForm] = useState(EMPTY_BILLING_PROFILE);
  const [savingBillingProfile, setSavingBillingProfile] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState({
    plan: 'none',
    free_access_days: '0',
  });
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [invoiceEditTarget, setInvoiceEditTarget] = useState(null);
  const [invoiceCustomerForm, setInvoiceCustomerForm] = useState(EMPTY_BILLING_PROFILE);
  const [savingInvoice, setSavingInvoice] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data);
    } catch (error) {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!billingDetails?.user) return;
    setBillingProfileForm({
      ...EMPTY_BILLING_PROFILE,
      ...(billingDetails.user.billing_profile || {}),
      full_name:
        billingDetails.user.billing_profile?.full_name ||
        billingDetails.user.name ||
        '',
      email:
        billingDetails.user.billing_profile?.email ||
        billingDetails.user.email ||
        '',
    });
    setSubscriptionForm({
      plan: billingDetails.user.plan || 'none',
      free_access_days:
        billingDetails.subscription?.next_renewal_at && billingDetails.user.plan !== 'none'
          ? '30'
          : billingDetails.user.plan === 'none'
            ? '0'
            : '30',
    });
  }, [billingDetails]);

  const handleUpdateUser = async (userId, updates) => {
    try {
      await api.put(`/admin/users/${userId}`, updates);
      toast.success(t('common.success'));
      fetchUsers();
    } catch (error) {
      toast.error(t('common.error'));
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/users/${deleteTarget.user_id}`);
      toast.success(t('common.success'));
      setUsers(users.filter(u => u.user_id !== deleteTarget.user_id));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setDeleteTarget(null);
    }
  };

  const updateCreateField = (field, value) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateBillingProfileField = (field, value) => {
    setBillingProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateSubscriptionField = (field, value) => {
    setSubscriptionForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateInvoiceCustomerField = (field, value) => {
    setInvoiceCustomerForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await api.post('/admin/users', {
        ...createForm,
        free_access_days:
          createForm.plan === 'none'
            ? 0
          : Number.parseInt(createForm.free_access_days || '0', 10),
      });
      toast.success(t('common.success'));
      setCreateForm(EMPTY_CREATE_USER);
      setCreateOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSaveSubscriptionAccess = async () => {
    if (!billingTarget) return;
    if (subscriptionForm.plan === 'none' && billingDetails?.user?.subscription_status !== 'active') {
      toast.error(t('adminUsers.selectSubscriptionType'));
      return;
    }
    setSavingSubscription(true);
    try {
      await api.put(`/admin/users/${billingTarget.user_id}`, {
        plan: subscriptionForm.plan,
        free_access_days:
          subscriptionForm.plan === 'none'
            ? 0
          : Number.parseInt(subscriptionForm.free_access_days || '0', 10),
      });
      toast.success(t('common.success'));
      await handleOpenBilling(billingTarget);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSavingSubscription(false);
    }
  };

  const formatAmount = (amount, currency = 'eur') => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: String(currency || 'eur').toUpperCase(),
      }).format(Number(amount || 0));
    } catch {
      return `${Number(amount || 0).toFixed(2)} ${String(currency || 'eur').toUpperCase()}`;
    }
  };

  const handleOpenBilling = async (user) => {
    setBillingTarget(user);
    setBillingLoading(true);
    setBillingDetails(null);
    try {
      const response = await api.get(`/admin/billing/customers/${user.user_id}`);
      setBillingDetails(response.data || null);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setBillingLoading(false);
    }
  };

  const handleSaveBillingProfile = async () => {
    if (!billingTarget) return;
    setSavingBillingProfile(true);
    try {
      await api.put(`/admin/users/${billingTarget.user_id}`, {
        billing_profile: billingProfileForm,
      });
      toast.success(t('common.success'));
      await handleOpenBilling(billingTarget);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSavingBillingProfile(false);
    }
  };

  const handleAdminInvoiceDownload = async (payment) => {
    if (!payment?.transaction_id) return;
    try {
      const response = await api.get(`/admin/invoices/${payment.transaction_id}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${payment.invoice_number || `invoice-${payment.transaction_id}`}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    }
  };

  const openInvoiceEditor = (payment) => {
    setInvoiceEditTarget(payment);
    setInvoiceCustomerForm({
      ...EMPTY_BILLING_PROFILE,
      ...(payment?.invoice_snapshot?.customer || {}),
    });
  };

  const handleSaveInvoice = async () => {
    if (!invoiceEditTarget?.transaction_id) return;
    setSavingInvoice(true);
    try {
      const response = await api.put(`/admin/invoices/${invoiceEditTarget.transaction_id}`, {
        customer: invoiceCustomerForm,
      });
      const updatedPayment = response.data?.payment;
      if (updatedPayment) {
        setBillingDetails((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            payments: (prev.payments || []).map((payment) =>
              payment.transaction_id === updatedPayment.transaction_id ? updatedPayment : payment,
            ),
          };
        });
      }
      toast.success(t('common.success'));
      setInvoiceEditTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSavingInvoice(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPlanLabel = (plan) => {
    if (plan && plans?.[plan]?.name) return plans[plan].name;
    return t('adminUsers.noSubscription');
  };

  const managedPlanIds = ['basic', 'pro', 'enterprise'].filter((planId) => plans?.[planId]);
  const subscriptionOptions = [
    { value: 'none', label: getPlanLabel('none') },
    ...managedPlanIds.map((planId) => ({
      value: planId,
      label: getPlanLabel(planId),
    })),
  ];

  return (
    <DashboardLayout title={t('adminUsers.title')} subtitle={t('adminUsers.subtitle')}>
      {/* Search */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              placeholder={t('admin.searchUsers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 bg-white border-stone-200"
              data-testid="search-users-input"
            />
          </div>
          <Button
            className="bg-emerald-900 hover:bg-emerald-800"
            onClick={() => setCreateOpen(true)}
          >
            <Users className="w-4 h-4 mr-2" />
            {t('adminUsers.newUser')}
          </Button>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      ) : (
        <Card className="border-stone-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.user')}</TableHead>
                  <TableHead>{t('admin.role')}</TableHead>
                  <TableHead>{t('adminUsers.subscription')}</TableHead>
                  <TableHead>{t('adminUsers.plan')}</TableHead>
                  <TableHead>{t('adminUsers.storage')}</TableHead>
                  <TableHead>PDFs</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead>{t('adminUsers.payments')}</TableHead>
                  <TableHead>{t('adminUsers.totalPaid')}</TableHead>
                  <TableHead>{t('adminUsers.nextRenewal')}</TableHead>
                  <TableHead>{t('admin.joined')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-stone-500">
                      {t('adminUsers.noUsersFound')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-stone-900">{user.name}</p>
                          <p className="text-sm text-stone-500">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'super_admin'
                            ? 'bg-red-100 text-red-800'
                            : user.role === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-stone-100 text-stone-600'
                        }`}>
                          {user.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.subscription_status === 'active' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-stone-100 text-stone-600'
                        }`}>
                          {user.subscription_status}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize">{getPlanLabel(user.plan || 'none')}</TableCell>
                      <TableCell>{formatBytes(user.storage_used || 0)}</TableCell>
                      <TableCell>{user.pdf_count || 0}</TableCell>
                      <TableCell>{user.link_count || 0}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium text-stone-900">{user.successful_payments || 0}</p>
                          <p className="text-stone-500">{t('adminUsers.failedCount', { count: user.failed_payments || 0 })}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatAmount(user.total_paid || 0, user.payment_currency || 'eur')}
                      </TableCell>
                      <TableCell>
                        {user.next_renewal_at ? format(new Date(user.next_renewal_at), 'MMM d, yyyy') : t('common.na')}
                      </TableCell>
                      <TableCell>
                        {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : t('common.na')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.subscription_status !== 'active' ? (
                              <DropdownMenuItem
                                onClick={() => handleOpenBilling(user)}
                              >
                                <CreditCard className="w-4 h-4 mr-2 text-emerald-600" />
                                {t('admin.activateSubscription')}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleUpdateUser(user.user_id, { subscription_status: 'inactive' })}
                              >
                                <X className="w-4 h-4 mr-2 text-amber-600" />
                                {t('admin.deactivateSubscription')}
                              </DropdownMenuItem>
                            )}
                            {user.role === 'super_admin' ? (
                              <DropdownMenuItem disabled>
                                <Shield className="w-4 h-4 mr-2 text-red-600" />
                                {t('adminUsers.superAdminProtected')}
                              </DropdownMenuItem>
                            ) : user.role !== 'admin' ? (
                                <DropdownMenuItem
                                  onClick={() => handleUpdateUser(user.user_id, { role: 'admin' })}
                                >
                                  <Shield className="w-4 h-4 mr-2 text-purple-600" />
                                  {t('admin.makeAdmin')}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => handleUpdateUser(user.user_id, { role: 'user' })}
                                >
                                  <Users className="w-4 h-4 mr-2" />
                                  {t('admin.removeAdmin')}
                                </DropdownMenuItem>
                              )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(user)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('admin.deleteUser')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenBilling(user)}
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              {t('adminUsers.billingDetails')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('adminUsers.deleteUserQuestion')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.deleteUserDesc', { name: deleteTarget?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('adminUsers.createUser')}</DialogTitle>
            <DialogDescription>
              {t('adminUsers.createUserDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-name">{t('adminUsers.fullName')}</Label>
                <Input
                  id="create-name"
                  value={createForm.name}
                  onChange={(e) => updateCreateField('name', e.target.value)}
                  className="h-12 mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="create-email">{t('settings.email')}</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => updateCreateField('email', e.target.value)}
                  className="h-12 mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="create-password">{t('adminUsers.temporaryPassword')}</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => updateCreateField('password', e.target.value)}
                  className="h-12 mt-1"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <Label>{t('admin.role')}</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(value) => updateCreateField('role', value)}
                >
                  <SelectTrigger className="h-12 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">{t('admin.user')}</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    {currentUser?.role === 'super_admin' && (
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_0.8fr] gap-4">
                <div>
                  <Label>{t('adminUsers.subscriptionType')}</Label>
                  <Select
                    value={createForm.plan}
                    onValueChange={(value) => {
                      updateCreateField('plan', value);
                      if (value === 'none') {
                        updateCreateField('free_access_days', '0');
                      } else if (!Number.parseInt(createForm.free_access_days || '0', 10)) {
                        updateCreateField('free_access_days', '30');
                      }
                    }}
                  >
                    <SelectTrigger className="h-12 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subscriptionOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="create-free-access-days">{t('adminUsers.freeAccessDays')}</Label>
                  <Input
                    id="create-free-access-days"
                    type="number"
                    min="0"
                    max="3650"
                    value={createForm.free_access_days}
                    onChange={(e) => updateCreateField('free_access_days', e.target.value)}
                    className="h-12 mt-1"
                    disabled={createForm.plan === 'none'}
                  />
                </div>
              </div>
              <p className="text-xs text-stone-600 mt-3">
                {t('adminUsers.subscriptionGrantHelp')}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-emerald-900 hover:bg-emerald-800"
                disabled={creatingUser}
              >
                {creatingUser ? t('adminUsers.creating') : t('adminUsers.createUser')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!billingTarget} onOpenChange={(open) => {
        if (!open) {
          setBillingTarget(null);
          setBillingDetails(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('adminUsers.billingDetails')}</DialogTitle>
            <DialogDescription>
              {billingTarget?.name} ({billingTarget?.email})
            </DialogDescription>
          </DialogHeader>

          {billingLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-900" />
            </div>
          ) : !billingDetails ? (
            <p className="text-sm text-stone-500">{t('adminUsers.billingDataMissing')}</p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="border-stone-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase text-stone-500">{t('adminUsers.overviewSubscription')}</p>
                    <p className="text-lg font-semibold capitalize">{billingDetails.subscription?.status || 'inactive'}</p>
                    <p className="text-sm text-stone-500 capitalize">{getPlanLabel(billingDetails.subscription?.plan || 'none')}</p>
                  </CardContent>
                </Card>
                <Card className="border-stone-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase text-stone-500">{t('adminUsers.totalPaid')}</p>
                    <p className="text-lg font-semibold">
                      {formatAmount(billingDetails.payment_summary?.total_paid || 0, billingDetails.payment_summary?.currency || 'eur')}
                    </p>
                    <p className="text-sm text-stone-500">
                      {t('adminUsers.successfulPayments', {
                        count: billingDetails.payment_summary?.successful_payments || 0,
                      })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-stone-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase text-stone-500">{t('adminUsers.nextRenewal')}</p>
                    <p className="text-lg font-semibold">
                      {billingDetails.payment_summary?.next_renewal_at
                        ? format(new Date(billingDetails.payment_summary.next_renewal_at), 'MMM d, yyyy HH:mm')
                        : t('common.na')}
                    </p>
                    <p className="text-sm text-stone-500">
                      {t('adminUsers.stripeStatus')}: {billingDetails.subscription?.stripe_subscription_status || 'n/a'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-stone-200">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-stone-900 mb-3">{t('adminUsers.payments')}</h3>
                  {Array.isArray(billingDetails.payments) && billingDetails.payments.length > 0 ? (
                    <div className="space-y-2">
                      {billingDetails.payments.slice(0, 30).map((payment) => (
                        <div key={payment.transaction_id} className="rounded-lg border border-stone-200 p-3">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                              <p className="font-medium text-stone-900">
                                {payment.invoice_number || payment.transaction_id}
                              </p>
                              <p className="text-xs text-stone-500 capitalize">
                                {getPlanLabel(payment.plan || 'none')} • {payment.payment_status}
                              </p>
                              <p className="text-xs text-stone-500">
                                {t('adminUsers.paymentPeriod')}: {payment.period_start && payment.period_end
                                  ? `${format(new Date(payment.period_start), 'MMM d, yyyy')} - ${format(new Date(payment.period_end), 'MMM d, yyyy')}`
                                  : t('adminUsers.notAvailable')}
                              </p>
                            </div>
                            <div className="flex flex-col items-start md:items-end gap-2">
                              <div className="text-left md:text-right">
                                <p className="font-semibold text-stone-900">
                                  {formatAmount(payment.amount || 0, payment.currency || 'eur')}
                                </p>
                                <p className="text-xs text-stone-500">
                                  {payment.paid_at
                                    ? format(new Date(payment.paid_at), 'MMM d, yyyy HH:mm')
                                    : payment.created_at
                                      ? format(new Date(payment.created_at), 'MMM d, yyyy HH:mm')
                                      : t('common.na')}
                                </p>
                              </div>
                              {payment.payment_status === 'completed' ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAdminInvoiceDownload(payment)}
                                  >
                                    {t('adminUsers.downloadPdf')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-900 hover:bg-emerald-800"
                                    onClick={() => openInvoiceEditor(payment)}
                                  >
                                    {t('adminUsers.editInvoiceInfo')}
                                  </Button>
                                </div>
                              ) : (
                                <p className="text-xs text-stone-500">
                                  {t('adminUsers.invoiceAvailableAfterPayment')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">{t('adminUsers.noPayments')}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-900">{t('adminUsers.subscriptionAccess')}</h3>
                      <p className="text-sm text-stone-500">
                        {t('adminUsers.subscriptionAccessDescription')}
                      </p>
                    </div>
                    <Button
                      className="bg-emerald-900 hover:bg-emerald-800"
                      onClick={handleSaveSubscriptionAccess}
                      disabled={savingSubscription}
                    >
                      {savingSubscription ? t('adminUsers.saving') : t('adminUsers.saveAccess')}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-4">
                    <div>
                      <Label>{t('adminUsers.subscriptionType')}</Label>
                      <Select
                        value={subscriptionForm.plan}
                        onValueChange={(value) => {
                          updateSubscriptionField('plan', value);
                          if (value === 'none') {
                            updateSubscriptionField('free_access_days', '0');
                          } else if (!Number.parseInt(subscriptionForm.free_access_days || '0', 10)) {
                            updateSubscriptionField('free_access_days', '30');
                          }
                        }}
                      >
                        <SelectTrigger className="h-12 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {subscriptionOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="billing-free-access-days">{t('adminUsers.freeAccessDays')}</Label>
                      <Input
                        id="billing-free-access-days"
                        type="number"
                        min="0"
                        max="3650"
                        value={subscriptionForm.free_access_days}
                        onChange={(e) => updateSubscriptionField('free_access_days', e.target.value)}
                        className="h-12 mt-1"
                        disabled={subscriptionForm.plan === 'none'}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-900">{t('adminUsers.customerBillingProfile')}</h3>
                      <p className="text-sm text-stone-500">
                        {t('adminUsers.customerBillingProfileDescription')}
                      </p>
                    </div>
                    <Button
                      className="bg-emerald-900 hover:bg-emerald-800"
                      onClick={handleSaveBillingProfile}
                      disabled={savingBillingProfile}
                    >
                      {savingBillingProfile ? t('adminUsers.saving') : t('adminUsers.saveBillingProfile')}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>{t('billingFields.invoiceFullName')}</Label>
                      <Input
                        value={billingProfileForm.full_name}
                        onChange={(e) => updateBillingProfileField('full_name', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.companyName')}</Label>
                      <Input
                        value={billingProfileForm.company_name}
                        onChange={(e) => updateBillingProfileField('company_name', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.billingEmail')}</Label>
                      <Input
                        value={billingProfileForm.email}
                        onChange={(e) => updateBillingProfileField('email', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.phone')}</Label>
                      <Input
                        value={billingProfileForm.phone}
                        onChange={(e) => updateBillingProfileField('phone', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.taxLabel')}</Label>
                      <Input
                        value={billingProfileForm.tax_label}
                        onChange={(e) => updateBillingProfileField('tax_label', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.taxId')}</Label>
                      <Input
                        value={billingProfileForm.tax_id}
                        onChange={(e) => updateBillingProfileField('tax_id', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>{t('billingFields.addressLine1')}</Label>
                      <Input
                        value={billingProfileForm.address_line_1}
                        onChange={(e) => updateBillingProfileField('address_line_1', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>{t('billingFields.addressLine2')}</Label>
                      <Input
                        value={billingProfileForm.address_line_2}
                        onChange={(e) => updateBillingProfileField('address_line_2', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.city')}</Label>
                      <Input
                        value={billingProfileForm.city}
                        onChange={(e) => updateBillingProfileField('city', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.state')}</Label>
                      <Input
                        value={billingProfileForm.state}
                        onChange={(e) => updateBillingProfileField('state', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.postalCode')}</Label>
                      <Input
                        value={billingProfileForm.postal_code}
                        onChange={(e) => updateBillingProfileField('postal_code', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('billingFields.country')}</Label>
                      <Input
                        value={billingProfileForm.country}
                        onChange={(e) => updateBillingProfileField('country', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-stone-900 mb-3">{t('adminUsers.subscriptionLogs')}</h3>
                  {Array.isArray(billingDetails.audit_log) && billingDetails.audit_log.length > 0 ? (
                    <div className="space-y-2">
                      {billingDetails.audit_log.slice(0, 30).map((event) => (
                        <div key={event.event_id} className="rounded-lg border border-stone-200 p-3">
                          <p className="font-medium text-stone-900">{event.event_type}</p>
                          <p className="text-xs text-stone-500 mt-1">
                            {event.message || t('adminUsers.noMessage')} • {event.created_at ? format(new Date(event.created_at), 'MMM d, yyyy HH:mm') : t('common.na')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">{t('adminUsers.noSubscriptionLogs')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoiceEditTarget} onOpenChange={(open) => {
        if (!open) {
          setInvoiceEditTarget(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('adminUsers.editInvoiceCustomer')}</DialogTitle>
            <DialogDescription>
              {t('adminUsers.editInvoiceCustomerDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 mb-4">
            <p className="text-sm font-medium text-stone-900">
              {invoiceEditTarget?.invoice_number || invoiceEditTarget?.transaction_id}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {invoiceEditTarget?.paid_at
                ? t('adminUsers.paidOn', { date: format(new Date(invoiceEditTarget.paid_at), 'MMM d, yyyy HH:mm') })
                : t('adminUsers.paidInvoice')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t('billingFields.invoiceFullName')}</Label>
              <Input
                value={invoiceCustomerForm.full_name}
                onChange={(e) => updateInvoiceCustomerField('full_name', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.companyName')}</Label>
              <Input
                value={invoiceCustomerForm.company_name}
                onChange={(e) => updateInvoiceCustomerField('company_name', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.billingEmail')}</Label>
              <Input
                value={invoiceCustomerForm.email}
                onChange={(e) => updateInvoiceCustomerField('email', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.phone')}</Label>
              <Input
                value={invoiceCustomerForm.phone}
                onChange={(e) => updateInvoiceCustomerField('phone', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.taxLabel')}</Label>
              <Input
                value={invoiceCustomerForm.tax_label}
                onChange={(e) => updateInvoiceCustomerField('tax_label', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.taxId')}</Label>
              <Input
                value={invoiceCustomerForm.tax_id}
                onChange={(e) => updateInvoiceCustomerField('tax_id', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t('billingFields.addressLine1')}</Label>
              <Input
                value={invoiceCustomerForm.address_line_1}
                onChange={(e) => updateInvoiceCustomerField('address_line_1', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label>{t('billingFields.addressLine2')}</Label>
              <Input
                value={invoiceCustomerForm.address_line_2}
                onChange={(e) => updateInvoiceCustomerField('address_line_2', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.city')}</Label>
              <Input
                value={invoiceCustomerForm.city}
                onChange={(e) => updateInvoiceCustomerField('city', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.state')}</Label>
              <Input
                value={invoiceCustomerForm.state}
                onChange={(e) => updateInvoiceCustomerField('state', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.postalCode')}</Label>
              <Input
                value={invoiceCustomerForm.postal_code}
                onChange={(e) => updateInvoiceCustomerField('postal_code', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>{t('billingFields.country')}</Label>
              <Input
                value={invoiceCustomerForm.country}
                onChange={(e) => updateInvoiceCustomerField('country', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setInvoiceEditTarget(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-emerald-900 hover:bg-emerald-800"
              onClick={handleSaveInvoice}
              disabled={savingInvoice}
            >
              {savingInvoice ? t('adminUsers.saving') : t('adminUsers.updateInvoicePdf')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminUsers;
