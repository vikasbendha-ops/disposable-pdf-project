import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Link2, Copy, Trash2, Ban, Plus, Search, Eye, Clock, Calendar, Hand, ExternalLink, Check } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { api } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

const MyLinks = () => {
  const [links, setLinks] = useState([]);
  const { t } = useLanguage();
  const [pdfs, setPdfs] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [linksRes, pdfsRes] = await Promise.all([
        api.get('/links'),
        api.get('/pdfs')
      ]);
      setLinks(linksRes.data);
      
      // Create PDF lookup
      const pdfLookup = {};
      pdfsRes.data.forEach(pdf => {
        pdfLookup[pdf.pdf_id] = pdf;
      });
      setPdfs(pdfLookup);
    } catch (error) {
      toast.error('Failed to load links');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/links/${deleteTarget.link_id}`);
      toast.success('Link deleted successfully');
      setLinks(links.filter(l => l.link_id !== deleteTarget.link_id));
    } catch (error) {
      toast.error('Failed to delete link');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await api.post(`/links/${revokeTarget.link_id}/revoke`);
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

  const copyToClipboard = async (link) => {
    const fullUrl = `${window.location.origin}/view/${link.token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(link.link_id);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const getExpiryIcon = (mode) => {
    switch (mode) {
      case 'countdown': return Clock;
      case 'fixed': return Calendar;
      default: return Hand;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider">Active</span>;
      case 'expired':
        return <span className="px-3 py-1 bg-stone-100 text-stone-600 rounded-full text-xs font-bold uppercase tracking-wider line-through">Expired</span>;
      case 'revoked':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold uppercase tracking-wider">Revoked</span>;
      default:
        return null;
    }
  };

  const filteredLinks = links.filter(link => {
    const matchesSearch = link.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pdfs[link.pdf_id]?.filename?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || link.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <DashboardLayout title={t('links.title')} subtitle={t('links.subtitle')}>
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <Input
            placeholder="Search links..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-white border-stone-200"
            data-testid="search-links-input"
          />
        </div>
        
        <div className="flex gap-2">
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
          
          <Link to="/links/create">
            <Button className="bg-emerald-900 hover:bg-emerald-800 h-12 px-6" data-testid="create-new-link-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Link
            </Button>
          </Link>
        </div>
      </div>

      {/* Links List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      ) : filteredLinks.length === 0 ? (
        <Card className="border-stone-200">
          <CardContent className="py-16 text-center">
            <Link2 className="w-16 h-16 text-stone-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-stone-900 mb-2">
              {searchQuery || filter !== 'all' ? 'No links found' : 'No links created yet'}
            </h3>
            <p className="text-stone-500 mb-6">
              {searchQuery || filter !== 'all' ? 'Try adjusting your search or filter' : 'Create your first secure link to get started'}
            </p>
            {!searchQuery && filter === 'all' && (
              <Link to="/links/create">
                <Button className="bg-emerald-900 hover:bg-emerald-800">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Link
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredLinks.map((link, i) => {
            const ExpiryIcon = getExpiryIcon(link.expiry_mode);
            const pdf = pdfs[link.pdf_id];
            
            return (
              <motion.div
                key={link.link_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-stone-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Link Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className={`w-3 h-3 rounded-full ${
                            link.status === 'active' ? 'bg-emerald-500 status-active' : 
                            link.status === 'expired' ? 'bg-stone-400' : 'bg-red-500'
                          }`} />
                          <h3 className="font-mono text-sm text-stone-700 truncate">
                            {`${window.location.origin}/view/${link.token.substring(0, 24)}...`}
                          </h3>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm text-stone-500">
                          <span className="flex items-center">
                            <ExpiryIcon className="w-4 h-4 mr-1" />
                            {link.expiry_mode === 'countdown' ? 'Countdown' : 
                             link.expiry_mode === 'fixed' ? 'Fixed Date' : 'Manual'}
                          </span>
                          <span className="flex items-center">
                            <Eye className="w-4 h-4 mr-1" />
                            {link.open_count} views
                          </span>
                          {pdf && (
                            <span className="truncate">
                              Doc: {pdf.filename}
                            </span>
                          )}
                          <span>
                            Created: {format(new Date(link.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>

                      {/* Status & Actions */}
                      <div className="flex items-center gap-3">
                        {getStatusBadge(link.status)}
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(link)}
                            className="flex-shrink-0"
                            data-testid={`copy-link-btn-${link.link_id}`}
                          >
                            {copiedId === link.link_id ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          
                          {link.status === 'active' && (
                            <a 
                              href={`/view/${link.token}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              <Button variant="outline" size="icon" className="flex-shrink-0">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </a>
                          )}
                          
                          {link.status === 'active' && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setRevokeTarget(link)}
                              className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 flex-shrink-0"
                              data-testid={`revoke-link-btn-${link.link_id}`}
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setDeleteTarget(link)}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 flex-shrink-0"
                            data-testid={`delete-link-btn-${link.link_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

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

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke access to this link. Anyone trying to view the document will see an expired message.
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
    </DashboardLayout>
  );
};

export default MyLinks;
