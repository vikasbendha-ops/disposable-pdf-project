import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, Shield, Trash2, Check, X, MoreVertical, CreditCard } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
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
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
import { api } from '../App';
import { toast } from 'sonner';
import { format } from 'date-fns';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [billingTarget, setBillingTarget] = useState(null);
  const [billingDetails, setBillingDetails] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);

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
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-white border-stone-200"
            data-testid="search-users-input"
          />
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
                            </div>
                            <div className="text-right">
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
    </DashboardLayout>
  );
};

export default AdminUsers;
