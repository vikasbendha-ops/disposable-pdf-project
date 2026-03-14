import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, Shield, Trash2, Check, X, MoreVertical, CreditCard } from 'lucide-react';
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
import { api, useAuth } from '../App';
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

const SUBSCRIPTION_OPTIONS = [
  { value: 'none', label: 'No Subscription' },
  { value: 'basic', label: 'Basic' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const AdminUsers = () => {
  const { user: currentUser } = useAuth();
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
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success('User updated successfully');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/users/${deleteTarget.user_id}`);
      toast.success('User deleted successfully');
      setUsers(users.filter(u => u.user_id !== deleteTarget.user_id));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
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
      toast.success('User created successfully');
      setCreateForm(EMPTY_CREATE_USER);
      setCreateOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSaveSubscriptionAccess = async () => {
    if (!billingTarget) return;
    setSavingSubscription(true);
    try {
      await api.put(`/admin/users/${billingTarget.user_id}`, {
        plan: subscriptionForm.plan,
        free_access_days:
          subscriptionForm.plan === 'none'
            ? 0
            : Number.parseInt(subscriptionForm.free_access_days || '0', 10),
      });
      toast.success('Subscription access updated');
      await handleOpenBilling(billingTarget);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update subscription access');
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
      toast.error(error.response?.data?.detail || 'Failed to load billing details');
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
      toast.success('Customer billing profile updated');
      await handleOpenBilling(billingTarget);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update billing profile');
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
      toast.error(error.response?.data?.detail || 'Failed to download invoice');
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
      toast.success('Invoice info updated');
      setInvoiceEditTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update invoice');
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

  return (
    <DashboardLayout title="Manage Users" subtitle="User Administration">
      {/* Search */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              placeholder="Search users..."
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
            New User
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
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>PDFs</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead>Payments</TableHead>
                  <TableHead>Total Paid</TableHead>
                  <TableHead>Next Renewal</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-stone-500">
                      No users found
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
                      <TableCell className="capitalize">{user.plan || 'none'}</TableCell>
                      <TableCell>{formatBytes(user.storage_used || 0)}</TableCell>
                      <TableCell>{user.pdf_count || 0}</TableCell>
                      <TableCell>{user.link_count || 0}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium text-stone-900">{user.successful_payments || 0}</p>
                          <p className="text-stone-500">{user.failed_payments || 0} failed</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatAmount(user.total_paid || 0, user.payment_currency || 'eur')}
                      </TableCell>
                      <TableCell>
                        {user.next_renewal_at ? format(new Date(user.next_renewal_at), 'MMM d, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : 'N/A'}
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
                                onClick={() => handleUpdateUser(user.user_id, { subscription_status: 'active' })}
                              >
                                <Check className="w-4 h-4 mr-2 text-emerald-600" />
                                Activate Subscription
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleUpdateUser(user.user_id, { subscription_status: 'inactive' })}
                              >
                                <X className="w-4 h-4 mr-2 text-amber-600" />
                                Deactivate Subscription
                              </DropdownMenuItem>
                            )}
                            {user.role === 'super_admin' ? (
                              <DropdownMenuItem disabled>
                                <Shield className="w-4 h-4 mr-2 text-red-600" />
                                Super Admin (Protected)
                              </DropdownMenuItem>
                            ) : user.role !== 'admin' ? (
                                <DropdownMenuItem
                                  onClick={() => handleUpdateUser(user.user_id, { role: 'admin' })}
                                >
                                  <Shield className="w-4 h-4 mr-2 text-purple-600" />
                                  Make Admin
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => handleUpdateUser(user.user_id, { role: 'user' })}
                                >
                                  <Users className="w-4 h-4 mr-2" />
                                  Remove Admin
                                </DropdownMenuItem>
                              )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(user)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleOpenBilling(user)}
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              Billing Details
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
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all their PDFs and links. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Add an account and optionally grant a subscription plan for a fixed free-access period.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-name">Full Name</Label>
                <Input
                  id="create-name"
                  value={createForm.name}
                  onChange={(e) => updateCreateField('name', e.target.value)}
                  className="h-12 mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="create-email">Email</Label>
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
                <Label htmlFor="create-password">Temporary Password</Label>
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
                <Label>Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(value) => updateCreateField('role', value)}
                >
                  <SelectTrigger className="h-12 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
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
                  <Label>Subscription Type</Label>
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
                      {SUBSCRIPTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="create-free-access-days">Free Access (Days)</Label>
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
                If a subscription type is selected, the platform grants access immediately and expires it after the free-access period.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-900 hover:bg-emerald-800"
                disabled={creatingUser}
              >
                {creatingUser ? 'Creating...' : 'Create User'}
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
            <DialogTitle>Billing Details</DialogTitle>
            <DialogDescription>
              {billingTarget?.name} ({billingTarget?.email})
            </DialogDescription>
          </DialogHeader>

          {billingLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-900" />
            </div>
          ) : !billingDetails ? (
            <p className="text-sm text-stone-500">No billing data found.</p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="border-stone-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase text-stone-500">Subscription</p>
                    <p className="text-lg font-semibold capitalize">{billingDetails.subscription?.status || 'inactive'}</p>
                    <p className="text-sm text-stone-500 capitalize">{billingDetails.subscription?.plan || 'none'}</p>
                  </CardContent>
                </Card>
                <Card className="border-stone-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase text-stone-500">Total Paid</p>
                    <p className="text-lg font-semibold">
                      {formatAmount(billingDetails.payment_summary?.total_paid || 0, billingDetails.payment_summary?.currency || 'eur')}
                    </p>
                    <p className="text-sm text-stone-500">
                      {billingDetails.payment_summary?.successful_payments || 0} successful payments
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-stone-200">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase text-stone-500">Next Renewal</p>
                    <p className="text-lg font-semibold">
                      {billingDetails.payment_summary?.next_renewal_at
                        ? format(new Date(billingDetails.payment_summary.next_renewal_at), 'MMM d, yyyy HH:mm')
                        : 'N/A'}
                    </p>
                    <p className="text-sm text-stone-500">
                      Stripe: {billingDetails.subscription?.stripe_subscription_status || 'n/a'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-stone-200">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-stone-900 mb-3">Payments</h3>
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
                                {payment.plan || 'plan'} • {payment.payment_status}
                              </p>
                              <p className="text-xs text-stone-500">
                                Billing period: {payment.period_start && payment.period_end
                                  ? `${format(new Date(payment.period_start), 'MMM d, yyyy')} - ${format(new Date(payment.period_end), 'MMM d, yyyy')}`
                                  : 'Not available'}
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
                                      : 'N/A'}
                                </p>
                              </div>
                              {payment.payment_status === 'completed' ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleAdminInvoiceDownload(payment)}
                                  >
                                    Download PDF
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-900 hover:bg-emerald-800"
                                    onClick={() => openInvoiceEditor(payment)}
                                  >
                                    Edit Invoice Info
                                  </Button>
                                </div>
                              ) : (
                                <p className="text-xs text-stone-500">
                                  Invoice PDF becomes available only after successful payment.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">No payment transactions yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-stone-900">Subscription Access</h3>
                      <p className="text-sm text-stone-500">
                        Grant a plan and free-access period. Saving starts a new manual access window from now.
                      </p>
                    </div>
                    <Button
                      className="bg-emerald-900 hover:bg-emerald-800"
                      onClick={handleSaveSubscriptionAccess}
                      disabled={savingSubscription}
                    >
                      {savingSubscription ? 'Saving...' : 'Save Access'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-4">
                    <div>
                      <Label>Subscription Type</Label>
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
                          {SUBSCRIPTION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="billing-free-access-days">Free Access (Days)</Label>
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
                      <h3 className="font-semibold text-stone-900">Customer Billing Profile</h3>
                      <p className="text-sm text-stone-500">
                        These details are used for future invoices. Paid invoices remain fixed unless you edit the invoice snapshot below.
                      </p>
                    </div>
                    <Button
                      className="bg-emerald-900 hover:bg-emerald-800"
                      onClick={handleSaveBillingProfile}
                      disabled={savingBillingProfile}
                    >
                      {savingBillingProfile ? 'Saving...' : 'Save Billing Profile'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Invoice Full Name</Label>
                      <Input
                        value={billingProfileForm.full_name}
                        onChange={(e) => updateBillingProfileField('full_name', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Company Name</Label>
                      <Input
                        value={billingProfileForm.company_name}
                        onChange={(e) => updateBillingProfileField('company_name', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Billing Email</Label>
                      <Input
                        value={billingProfileForm.email}
                        onChange={(e) => updateBillingProfileField('email', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={billingProfileForm.phone}
                        onChange={(e) => updateBillingProfileField('phone', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Tax Label</Label>
                      <Input
                        value={billingProfileForm.tax_label}
                        onChange={(e) => updateBillingProfileField('tax_label', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Tax ID / VAT / GST</Label>
                      <Input
                        value={billingProfileForm.tax_id}
                        onChange={(e) => updateBillingProfileField('tax_id', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Address Line 1</Label>
                      <Input
                        value={billingProfileForm.address_line_1}
                        onChange={(e) => updateBillingProfileField('address_line_1', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Address Line 2</Label>
                      <Input
                        value={billingProfileForm.address_line_2}
                        onChange={(e) => updateBillingProfileField('address_line_2', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input
                        value={billingProfileForm.city}
                        onChange={(e) => updateBillingProfileField('city', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>State</Label>
                      <Input
                        value={billingProfileForm.state}
                        onChange={(e) => updateBillingProfileField('state', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Postal Code</Label>
                      <Input
                        value={billingProfileForm.postal_code}
                        onChange={(e) => updateBillingProfileField('postal_code', e.target.value)}
                        className="h-12 mt-1"
                      />
                    </div>
                    <div>
                      <Label>Country</Label>
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
                  <h3 className="font-semibold text-stone-900 mb-3">Subscription Logs</h3>
                  {Array.isArray(billingDetails.audit_log) && billingDetails.audit_log.length > 0 ? (
                    <div className="space-y-2">
                      {billingDetails.audit_log.slice(0, 30).map((event) => (
                        <div key={event.event_id} className="rounded-lg border border-stone-200 p-3">
                          <p className="font-medium text-stone-900">{event.event_type}</p>
                          <p className="text-xs text-stone-500 mt-1">
                            {event.message || 'No message'} • {event.created_at ? format(new Date(event.created_at), 'MMM d, yyyy HH:mm') : 'N/A'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500">No subscription logs found.</p>
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
            <DialogTitle>Edit Invoice Customer Details</DialogTitle>
            <DialogDescription>
              This updates a locked PDF invoice snapshot for one paid transaction only.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 mb-4">
            <p className="text-sm font-medium text-stone-900">
              {invoiceEditTarget?.invoice_number || invoiceEditTarget?.transaction_id}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {invoiceEditTarget?.paid_at
                ? `Paid ${format(new Date(invoiceEditTarget.paid_at), 'MMM d, yyyy HH:mm')}`
                : 'Paid invoice'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Invoice Full Name</Label>
              <Input
                value={invoiceCustomerForm.full_name}
                onChange={(e) => updateInvoiceCustomerField('full_name', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Company Name</Label>
              <Input
                value={invoiceCustomerForm.company_name}
                onChange={(e) => updateInvoiceCustomerField('company_name', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Billing Email</Label>
              <Input
                value={invoiceCustomerForm.email}
                onChange={(e) => updateInvoiceCustomerField('email', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={invoiceCustomerForm.phone}
                onChange={(e) => updateInvoiceCustomerField('phone', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Tax Label</Label>
              <Input
                value={invoiceCustomerForm.tax_label}
                onChange={(e) => updateInvoiceCustomerField('tax_label', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Tax ID / VAT / GST</Label>
              <Input
                value={invoiceCustomerForm.tax_id}
                onChange={(e) => updateInvoiceCustomerField('tax_id', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Address Line 1</Label>
              <Input
                value={invoiceCustomerForm.address_line_1}
                onChange={(e) => updateInvoiceCustomerField('address_line_1', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Address Line 2</Label>
              <Input
                value={invoiceCustomerForm.address_line_2}
                onChange={(e) => updateInvoiceCustomerField('address_line_2', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>City</Label>
              <Input
                value={invoiceCustomerForm.city}
                onChange={(e) => updateInvoiceCustomerField('city', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                value={invoiceCustomerForm.state}
                onChange={(e) => updateInvoiceCustomerField('state', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Postal Code</Label>
              <Input
                value={invoiceCustomerForm.postal_code}
                onChange={(e) => updateInvoiceCustomerField('postal_code', e.target.value)}
                className="h-12 mt-1"
              />
            </div>
            <div>
              <Label>Country</Label>
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
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-emerald-900 hover:bg-emerald-800"
              onClick={handleSaveInvoice}
              disabled={savingInvoice}
            >
              {savingInvoice ? 'Saving...' : 'Update Invoice PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminUsers;
