import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, FileText, Trash2, Link2, Plus, Search, AlertCircle, 
  FolderPlus, Folder, ChevronRight, Edit2, MoreVertical, 
  Clock, Copy, Check, ExternalLink, X, FolderOpen
} from 'lucide-react';
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
import { Label } from '../components/ui/label';
import { api, useAuth, BACKEND_URL } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

const PDFManagement = () => {
  const [pdfs, setPdfs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  const fetchData = useCallback(async () => {
    try {
      const [pdfsRes, foldersRes, linksRes] = await Promise.all([
        api.get('/pdfs'),
        api.get('/folders'),
        api.get('/links')
      ]);
      setPdfs(pdfsRes.data);
      setFolders(foldersRes.data);
      setLinks(linksRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }

    if (user?.subscription_status !== 'active') {
      toast.error('Active subscription required to upload PDFs');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/pdfs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('PDF uploaded successfully');
      fetchData();
    } catch (error) {
      const message = error.response?.data?.detail || 'Upload failed';
      toast.error(message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await api.delete(`/pdfs/${deleteTarget.pdf_id}`);
      toast.success('PDF deleted successfully');
      setPdfs(pdfs.filter(p => p.pdf_id !== deleteTarget.pdf_id));
    } catch (error) {
      toast.error('Failed to delete PDF');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;

    try {
      await api.put(`/pdfs/${renameTarget.pdf_id}/rename`, { filename: newName });
      toast.success('PDF renamed successfully');
      setPdfs(pdfs.map(p => 
        p.pdf_id === renameTarget.pdf_id ? { ...p, filename: newName } : p
      ));
    } catch (error) {
      toast.error('Failed to rename PDF');
    } finally {
      setRenameTarget(null);
      setNewName('');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await api.post('/folders', { name: newFolderName });
      setFolders([...folders, response.data]);
      toast.success('Folder created');
    } catch (error) {
      toast.error('Failed to create folder');
    } finally {
      setShowNewFolder(false);
      setNewFolderName('');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await api.delete(`/folders/${folderId}`);
      setFolders(folders.filter(f => f.folder_id !== folderId));
      if (currentFolder === folderId) {
        setCurrentFolder(null);
      }
      toast.success('Folder deleted');
      fetchData(); // Refresh to get updated PDFs
    } catch (error) {
      toast.error('Failed to delete folder');
    }
  };

  const handleMovePdf = async (folderId) => {
    if (!moveTarget) return;

    try {
      await api.put(`/pdfs/${moveTarget.pdf_id}/move`, { folder: folderId });
      toast.success('PDF moved');
      fetchData();
    } catch (error) {
      toast.error('Failed to move PDF');
    } finally {
      setMoveTarget(null);
    }
  };

  const copyLink = async (token) => {
    const fullUrl = `${window.location.origin}/view/${token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedLink(token);
      toast.success('Link copied!');
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPdfLinks = (pdfId) => {
    return links.filter(l => l.pdf_id === pdfId);
  };

  const filteredPdfs = pdfs.filter(pdf => {
    const matchesSearch = pdf.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = currentFolder ? pdf.folder === currentFolder : !pdf.folder;
    return matchesSearch && matchesFolder;
  });

  const rootPdfs = pdfs.filter(p => !p.folder);
  const folderPdfs = currentFolder ? pdfs.filter(p => p.folder === currentFolder) : [];

  return (
    <DashboardLayout title={t('pdfs.title')} subtitle={t('pdfs.subtitle')}>
      {/* Header Actions */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <Input
            placeholder={t('pdfs.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-white border-stone-200"
            data-testid="search-pdfs-input"
          />
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="h-12"
            onClick={() => setShowNewFolder(true)}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".pdf"
              onChange={handleUpload}
              className="hidden"
              disabled={uploading || user?.subscription_status !== 'active'}
              data-testid="upload-pdf-input"
            />
            <Button 
              className="bg-emerald-900 hover:bg-emerald-800 h-12 px-6"
              disabled={uploading || user?.subscription_status !== 'active'}
              asChild
            >
              <span>
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                    {t('pdfs.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    {t('pdfs.uploadPdf')}
                  </>
                )}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* Breadcrumb */}
      {currentFolder && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button 
            onClick={() => setCurrentFolder(null)}
            className="text-emerald-700 hover:text-emerald-800 font-medium"
          >
            All Files
          </button>
          <ChevronRight className="w-4 h-4 text-stone-400" />
          <span className="text-stone-600">
            {folders.find(f => f.folder_id === currentFolder)?.name}
          </span>
        </div>
      )}

      {/* Subscription Warning */}
      {user?.subscription_status !== 'active' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800">
            <span className="font-semibold">{t('pdfs.subscriptionRequired')}</span>{' '}
            <Link to="/pricing" className="underline hover:text-amber-900">{t('pdfs.upgradePlan')}</Link> {t('pdfs.toUpload')}
          </p>
        </div>
      )}

      {/* Folders */}
      {!currentFolder && folders.length > 0 && !searchQuery && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">Folders</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {folders.map((folder) => (
              <div
                key={folder.folder_id}
                className="group relative bg-white rounded-xl border border-stone-200 p-4 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div 
                  onClick={() => setCurrentFolder(folder.folder_id)}
                  className="flex flex-col items-center"
                >
                  <Folder className="w-10 h-10 text-amber-500 mb-2" />
                  <span className="text-sm font-medium text-stone-700 text-center truncate w-full">
                    {folder.name}
                  </span>
                  <span className="text-xs text-stone-400">
                    {pdfs.filter(p => p.folder === folder.folder_id).length} files
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.folder_id);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-full bg-red-100 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900"></div>
        </div>
      ) : filteredPdfs.length === 0 && (currentFolder ? folderPdfs.length === 0 : rootPdfs.length === 0) ? (
        <Card className="border-stone-200">
          <CardContent className="py-16 text-center">
            <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-stone-900 mb-2">
              {searchQuery ? t('pdfs.noResults') : currentFolder ? 'Folder is empty' : t('pdfs.noPdfs')}
            </h3>
            <p className="text-stone-500 mb-6">
              {searchQuery ? t('pdfs.tryDifferent') : t('pdfs.uploadFirst')}
            </p>
            {!searchQuery && user?.subscription_status === 'active' && (
              <label className="cursor-pointer">
                <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
                <Button className="bg-emerald-900 hover:bg-emerald-800" asChild>
                  <span>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('pdfs.uploadFirstBtn')}
                  </span>
                </Button>
              </label>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
            {currentFolder ? 'Files' : 'All Files'} ({filteredPdfs.length})
          </h3>
          
          {filteredPdfs.map((pdf, i) => {
            const pdfLinks = getPdfLinks(pdf.pdf_id);
            const activeLinks = pdfLinks.filter(l => l.status === 'active');
            
            return (
              <motion.div
                key={pdf.pdf_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="border-stone-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      {/* PDF Info */}
                      <div className="flex items-start space-x-4 flex-1 min-w-0">
                        <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                          <FileText className="w-6 h-6 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-stone-900 truncate" data-testid={`pdf-name-${pdf.pdf_id}`}>
                            {pdf.filename}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-stone-500">
                            <span>{formatBytes(pdf.file_size)}</span>
                            <span className="flex items-center">
                              <Clock className="w-3 h-3 mr-1" />
                              {format(new Date(pdf.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                            <span className="text-emerald-600">
                              {activeLinks.length} active {activeLinks.length === 1 ? 'link' : 'links'}
                            </span>
                          </div>
                          
                          {/* Links for this PDF */}
                          {pdfLinks.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {pdfLinks.slice(0, 3).map((link) => (
                                <div 
                                  key={link.link_id}
                                  className="flex items-center justify-between bg-stone-50 rounded-lg px-3 py-2"
                                >
                                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      link.status === 'active' ? 'bg-emerald-500' :
                                      link.status === 'expired' ? 'bg-stone-400' : 'bg-red-500'
                                    }`} />
                                    <code className="text-xs text-stone-600 truncate">
                                      {window.location.origin}/view/{link.token.substring(0, 16)}...
                                    </code>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      link.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                      link.status === 'expired' ? 'bg-stone-100 text-stone-600' :
                                      'bg-red-100 text-red-700'
                                    }`}>
                                      {link.status}
                                    </span>
                                    <span className="text-xs text-stone-400">
                                      {link.open_count} views
                                    </span>
                                  </div>
                                  <div className="flex items-center space-x-1 ml-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => copyLink(link.token)}
                                    >
                                      {copiedLink === link.token ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </Button>
                                    {link.status === 'active' && (
                                      <a 
                                        href={`/view/${link.token}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <ExternalLink className="w-3 h-3" />
                                        </Button>
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {pdfLinks.length > 3 && (
                                <Link 
                                  to="/links" 
                                  className="text-xs text-emerald-600 hover:text-emerald-700"
                                >
                                  +{pdfLinks.length - 3} more links →
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link to={`/links/create?pdf=${pdf.pdf_id}`}>
                          <Button variant="outline" size="sm" data-testid={`create-link-btn-${pdf.pdf_id}`}>
                            <Link2 className="w-4 h-4 mr-2" />
                            {t('pdfs.createLink')}
                          </Button>
                        </Link>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameTarget(pdf);
                                setNewName(pdf.filename);
                              }}
                            >
                              <Edit2 className="w-4 h-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            {folders.length > 0 && (
                              <DropdownMenuItem
                                onClick={() => setMoveTarget(pdf)}
                              >
                                <FolderOpen className="w-4 h-4 mr-2" />
                                Move to Folder
                              </DropdownMenuItem>
                            )}
                            {pdf.folder && (
                              <DropdownMenuItem
                                onClick={() => handleMovePdf(null)}
                              >
                                <Folder className="w-4 h-4 mr-2" />
                                Move to Root
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(pdf)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('pdfs.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pdfs.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pdfs.deleteDesc').replace('{filename}', deleteTarget?.filename || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pdfs.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {t('pdfs.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename PDF</DialogTitle>
            <DialogDescription>Enter a new name for the file</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Filename</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter filename"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRename} className="bg-emerald-900 hover:bg-emerald-800">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Organize your PDFs into folders</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Folder Name</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Enter folder name"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>Cancel</Button>
            <Button onClick={handleCreateFolder} className="bg-emerald-900 hover:bg-emerald-800">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Folder Dialog */}
      <Dialog open={!!moveTarget} onOpenChange={() => setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>Select a folder for "{moveTarget?.filename}"</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <button
              onClick={() => handleMovePdf(null)}
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <Folder className="w-5 h-5 text-stone-400" />
              <span>Root (No Folder)</span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.folder_id}
                onClick={() => handleMovePdf(folder.folder_id)}
                className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <Folder className="w-5 h-5 text-amber-500" />
                <span>{folder.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PDFManagement;
