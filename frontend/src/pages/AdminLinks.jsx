import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link2, Search, Ban, Trash2, Eye, Clock, Calendar, Hand, MoreVertical } from 'lucide-react';
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
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
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

const AdminLinks = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const fetchLinks = useCallback(async () => {
    try {
      const response = await api.get('/admin/links');
      setLinks(response.data);
    } catch (error) {
      toast.error('Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await api.post(`/admin/links/${revokeTarget.link_id}/revoke`);
      toast.success('Link revoked successfully');
      setLinks(links.map(l => 
        l.link_id === revokeTarget.link_id ? { ...l, status: 'revoked' } : l
      ));
    } catch (error) {
      toast.error('Failed to revoke link');
    } finally {
      setRevokeTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/links/${deleteTarget.link_id}`);
      toast.success('Link deleted successfully');
      setLinks(links.filter(l => l.link_id !== deleteTarget.link_id));
    } catch (error) {
      toast.error('Failed to delete link');
    } finally {
      setDeleteTarget(null);
    }
  };

  const getExpiryIcon = (mode) => {
    switch (mode) {
      case 'countdown': return Clock;
      case 'fixed': return Calendar;
      default: return Hand;
    }
  };

  const filteredLinks = links.filter(link => {
    const matchesSearch = 
      link.token?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.pdf_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || link.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <DashboardLayout title="All Links" subtitle="Link Administration">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <Input
            placeholder="Search links, users, or documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-white border-stone-200"
            data-testid="search-admin-links-input"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-12">
              Filter: {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilter('all')}>All</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('active')}>Active</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('expired')}>Expired</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('revoked')}>Revoked</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Links Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      ) : (
        <Card className="border-stone-200">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Expiry Type</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-stone-500">
                      No links found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLinks.map((link) => {
                    const ExpiryIcon = getExpiryIcon(link.expiry_mode);
                    
                    return (
                      <TableRow key={link.link_id}>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                            link.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                            link.status === 'expired' ? 'bg-stone-100 text-stone-600' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {link.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-stone-900">{link.user_name}</p>
                            <p className="text-sm text-stone-500">{link.user_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-stone-900 truncate max-w-[200px]">{link.pdf_name}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <ExpiryIcon className="w-4 h-4 text-stone-400" />
                            <span className="capitalize">{link.expiry_mode}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Eye className="w-4 h-4 text-stone-400" />
                            <span>{link.open_count}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {link.created_at ? format(new Date(link.created_at), 'MMM d, yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {link.expires_at 
                            ? format(new Date(link.expires_at), 'MMM d, yyyy HH:mm') 
                            : link.expiry_mode === 'manual' ? 'Manual' : 'On first view'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {link.status === 'active' && (
                                <DropdownMenuItem
                                  onClick={() => setRevokeTarget(link)}
                                  className="text-amber-600 focus:text-amber-600"
                                >
                                  <Ban className="w-4 h-4 mr-2" />
                                  Revoke Link
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(link)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Link
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke access to this link. The viewer will see an expired message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRevoke}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this secure link. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminLinks;
