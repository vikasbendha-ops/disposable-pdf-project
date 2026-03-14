import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Ban,
  Check,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid3X3,
  Link2,
  List,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { api, useAuth } from '../App';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';

const PDF_WORKER_SRC = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const MAX_INITIAL_THUMBNAILS = 8;
const MAX_IDLE_THUMBNAILS = 8;
const MAX_THUMBNAIL_CONCURRENCY = 2;
let pdfJsLibPromise = null;

async function loadPdfJsLib() {
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      return mod;
    });
  }
  return pdfJsLibPromise;
}

const PDFManagement = () => {
  const [pdfs, setPdfs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [viewMode, setViewMode] = useState('list');
  const [expandedPdfId, setExpandedPdfId] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteLinkTarget, setDeleteLinkTarget] = useState(null);
  const [revokeLinkTarget, setRevokeLinkTarget] = useState(null);

  const [copiedValue, setCopiedValue] = useState('');
  const [updatingDirect, setUpdatingDirect] = useState(null);
  const [thumbnails, setThumbnails] = useState({});
  const [thumbnailLoading, setThumbnailLoading] = useState({});
  const thumbnailsRef = useRef({});
  const thumbnailLoadingRef = useRef(new Set());
  const thumbnailQueueRef = useRef([]);
  const thumbnailQueuedRef = useRef(new Set());

  const { user } = useAuth();
  const { t } = useLanguage();

  const fetchData = useCallback(async () => {
    try {
      const [pdfsRes, foldersRes, linksRes] = await Promise.all([
        api.get('/pdfs'),
        api.get('/folders'),
        api.get('/links'),
      ]);
      setPdfs(Array.isArray(pdfsRes.data) ? pdfsRes.data : []);
      setFolders(Array.isArray(foldersRes.data) ? foldersRes.data : []);
      setLinks(Array.isArray(linksRes.data) ? linksRes.data : []);
    } catch (error) {
      toast.error('Failed to load PDFs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

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
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('PDF uploaded successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeletePdf = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/pdfs/${deleteTarget.pdf_id}`);
      setPdfs((prev) => prev.filter((item) => item.pdf_id !== deleteTarget.pdf_id));
      setLinks((prev) => prev.filter((link) => link.pdf_id !== deleteTarget.pdf_id));
      toast.success('PDF deleted');
    } catch {
      toast.error('Failed to delete PDF');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    try {
      await api.put(`/pdfs/${renameTarget.pdf_id}/rename`, { filename: newName.trim() });
      setPdfs((prev) =>
        prev.map((item) =>
          item.pdf_id === renameTarget.pdf_id
            ? { ...item, filename: newName.trim() }
            : item,
        ),
      );
      toast.success('Filename updated');
    } catch {
      toast.error('Failed to rename PDF');
    } finally {
      setRenameTarget(null);
      setNewName('');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const response = await api.post('/folders', { name: newFolderName.trim() });
      setFolders((prev) => [...prev, response.data]);
      toast.success('Folder created');
    } catch {
      toast.error('Failed to create folder');
    } finally {
      setShowNewFolder(false);
      setNewFolderName('');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await api.delete(`/folders/${folderId}`);
      setFolders((prev) => prev.filter((folder) => folder.folder_id !== folderId));
      if (folderFilter === folderId) {
        setFolderFilter('all');
      }
      await fetchData();
      toast.success('Folder deleted');
    } catch {
      toast.error('Failed to delete folder');
    }
  };

  const handleMovePdf = async (folderId) => {
    if (!moveTarget) return;
    try {
      await api.put(`/pdfs/${moveTarget.pdf_id}/move`, { folder: folderId });
      setPdfs((prev) =>
        prev.map((item) =>
          item.pdf_id === moveTarget.pdf_id
            ? { ...item, folder: folderId || null }
            : item,
        ),
      );
      toast.success('PDF moved');
    } catch {
      toast.error('Failed to move PDF');
    } finally {
      setMoveTarget(null);
    }
  };

  const handleRevokeLink = async () => {
    if (!revokeLinkTarget) return;
    try {
      await api.post(`/links/${revokeLinkTarget.link_id}/revoke`);
      setLinks((prev) =>
        prev.map((item) =>
          item.link_id === revokeLinkTarget.link_id
            ? { ...item, status: 'revoked' }
            : item,
        ),
      );
      toast.success('Link revoked');
    } catch {
      toast.error('Failed to revoke link');
    } finally {
      setRevokeLinkTarget(null);
    }
  };

  const handleDeleteLink = async () => {
    if (!deleteLinkTarget) return;
    try {
      await api.delete(`/links/${deleteLinkTarget.link_id}`);
      setLinks((prev) => prev.filter((item) => item.link_id !== deleteLinkTarget.link_id));
      toast.success('Link deleted');
    } catch {
      toast.error('Failed to delete link');
    } finally {
      setDeleteLinkTarget(null);
    }
  };

  const handleUpdateDirectAccess = async (pdf, payload) => {
    setUpdatingDirect(pdf.pdf_id);
    try {
      const response = await api.put(`/pdfs/${pdf.pdf_id}/direct-access`, payload);
      const updates = response.data || {};
      setPdfs((prev) =>
        prev.map((item) =>
          item.pdf_id === pdf.pdf_id
            ? {
                ...item,
                direct_access_enabled: updates.direct_access_enabled,
                direct_access_public: updates.direct_access_public,
                direct_access_mode: updates.direct_access_mode,
                direct_access_token: updates.direct_access_token,
                direct_access_url: updates.direct_access_url,
                direct_access_path: updates.direct_access_path,
              }
            : item,
        ),
      );
      toast.success('Direct link settings updated');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update direct link settings');
    } finally {
      setUpdatingDirect(null);
    }
  };

  const copyToClipboard = async (key, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(key);
      setTimeout(() => setCopiedValue(''), 1800);
      toast.success('Copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (value === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(value) / Math.log(k));
    return `${parseFloat((value / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getSecureLinkUrl = (link) => {
    if (link?.secure_url) return link.secure_url;
    return `${window.location.origin}/view/${link.token}`;
  };

  const getDirectUrl = (pdf) => {
    if (pdf?.direct_access_url) {
      if (pdf.direct_access_url.startsWith('http://') || pdf.direct_access_url.startsWith('https://')) {
        return pdf.direct_access_url;
      }
      return `${window.location.origin}${pdf.direct_access_url}`;
    }
    if (pdf?.direct_access_path) {
      return `${window.location.origin}${pdf.direct_access_path}`;
    }
    if (pdf?.direct_access_token) {
      return `${window.location.origin}/direct/${pdf.direct_access_token}`;
    }
    return '';
  };

  const linksByPdf = useMemo(() => {
    const map = {};
    for (const link of links) {
      if (!map[link.pdf_id]) map[link.pdf_id] = [];
      map[link.pdf_id].push(link);
    }
    for (const key of Object.keys(map)) {
      map[key] = map[key].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
    }
    return map;
  }, [links]);

  const pdfMetrics = useMemo(() => {
    const metrics = {};
    for (const pdf of pdfs) {
      const pdfLinks = linksByPdf[pdf.pdf_id] || [];
      const activeLinks = pdfLinks.filter((item) => item.status === 'active').length;
      const totalViews = pdfLinks.reduce((sum, item) => sum + Number(item.open_count || 0), 0);
      metrics[pdf.pdf_id] = {
        linkCount: pdfLinks.length,
        activeLinks,
        totalViews,
      };
    }
    return metrics;
  }, [pdfs, linksByPdf]);

  const totals = useMemo(() => ({
    pdfCount: pdfs.length,
    activeLinks: links.filter((item) => item.status === 'active').length,
    totalViews: links.reduce((sum, item) => sum + Number(item.open_count || 0), 0),
  }), [pdfs, links]);

  const filteredPdfs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const base = pdfs.filter((pdf) => {
      const matchesFolder =
        folderFilter === 'all'
          ? true
          : folderFilter === 'root'
            ? !pdf.folder
            : pdf.folder === folderFilter;

      if (!matchesFolder) return false;
      if (!query) return true;

      const filenameMatch = String(pdf.filename || '').toLowerCase().includes(query);
      if (filenameMatch) return true;

      const linkedTokens = (linksByPdf[pdf.pdf_id] || [])
        .map((item) => [item.token, item.internal_title, item.internal_note].filter(Boolean).join(' ').toLowerCase())
        .join(' ');
      return linkedTokens.includes(query);
    });

    const sorted = [...base];
    sorted.sort((left, right) => {
      const leftMetrics = pdfMetrics[left.pdf_id] || { activeLinks: 0, totalViews: 0 };
      const rightMetrics = pdfMetrics[right.pdf_id] || { activeLinks: 0, totalViews: 0 };

      if (sortBy === 'name') {
        return String(left.filename || '').localeCompare(String(right.filename || ''));
      }
      if (sortBy === 'size') {
        return Number(right.file_size || 0) - Number(left.file_size || 0);
      }
      if (sortBy === 'views') {
        return rightMetrics.totalViews - leftMetrics.totalViews;
      }
      if (sortBy === 'links') {
        return rightMetrics.activeLinks - leftMetrics.activeLinks;
      }
      if (sortBy === 'oldest') {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
    return sorted;
  }, [folderFilter, linksByPdf, pdfMetrics, pdfs, searchQuery, sortBy]);

  const generateThumbnail = useCallback(async (pdfId) => {
    if (!pdfId) return;
    if (Object.prototype.hasOwnProperty.call(thumbnailsRef.current, pdfId)) return;
    if (thumbnailLoadingRef.current.has(pdfId)) return;

    thumbnailLoadingRef.current.add(pdfId);
    setThumbnailLoading((prev) => ({ ...prev, [pdfId]: true }));
    try {
      const pdfjsLib = await loadPdfJsLib();
      const response = await api.get(`/pdfs/${pdfId}/file`, { responseType: 'arraybuffer' });
      const task = pdfjsLib.getDocument({ data: response.data });
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = 180;
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas unavailable');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setThumbnails((prev) => ({ ...prev, [pdfId]: dataUrl }));
      await doc.destroy();
    } catch {
      setThumbnails((prev) => ({ ...prev, [pdfId]: null }));
    } finally {
      thumbnailLoadingRef.current.delete(pdfId);
      setThumbnailLoading((prev) => ({ ...prev, [pdfId]: false }));
    }
  }, []);

  const pumpThumbnailQueue = useCallback(() => {
    while (
      thumbnailLoadingRef.current.size < MAX_THUMBNAIL_CONCURRENCY &&
      thumbnailQueueRef.current.length > 0
    ) {
      const nextPdfId = thumbnailQueueRef.current.shift();
      thumbnailQueuedRef.current.delete(nextPdfId);
      void generateThumbnail(nextPdfId).finally(() => {
        pumpThumbnailQueue();
      });
    }
  }, [generateThumbnail]);

  const enqueueThumbnail = useCallback((pdfId) => {
    if (!pdfId) return;
    if (Object.prototype.hasOwnProperty.call(thumbnailsRef.current, pdfId)) return;
    if (thumbnailLoadingRef.current.has(pdfId) || thumbnailQueuedRef.current.has(pdfId)) return;
    thumbnailQueuedRef.current.add(pdfId);
    thumbnailQueueRef.current.push(pdfId);
    pumpThumbnailQueue();
  }, [pumpThumbnailQueue]);

  useEffect(() => {
    const immediateTargets = filteredPdfs
      .slice(0, MAX_INITIAL_THUMBNAILS)
      .map((pdf) => pdf.pdf_id);
    for (const pdfId of immediateTargets) {
      enqueueThumbnail(pdfId);
    }

    const idleTargets = filteredPdfs
      .slice(MAX_INITIAL_THUMBNAILS, MAX_INITIAL_THUMBNAILS + MAX_IDLE_THUMBNAILS)
      .map((pdf) => pdf.pdf_id);

    if (idleTargets.length === 0) {
      return undefined;
    }

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => {
        idleTargets.forEach((pdfId) => enqueueThumbnail(pdfId));
      }, { timeout: 1200 });
      return () => window.cancelIdleCallback(handle);
    }

    const timer = setTimeout(() => {
      idleTargets.forEach((pdfId) => enqueueThumbnail(pdfId));
    }, 500);
    return () => clearTimeout(timer);
  }, [enqueueThumbnail, filteredPdfs]);

  const renderPdfPreview = (pdf, compact = false) => {
    const thumb = thumbnails[pdf.pdf_id];
    const isLoading = Boolean(thumbnailLoading[pdf.pdf_id]);
    const frameClass = compact
      ? 'w-full aspect-[3/4]'
      : 'w-28 h-36 md:w-32 md:h-40 flex-shrink-0';

    return (
      <div className={`${frameClass} overflow-hidden rounded-xl border border-stone-200 bg-stone-100`}>
        {thumb ? (
          <img src={thumb} alt={`${pdf.filename} preview`} className="w-full h-full object-cover" />
        ) : isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-stone-300 border-t-stone-600" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-stone-400">
            <FileText className="w-8 h-8 mb-2" />
            <span className="text-xs">No preview</span>
          </div>
        )}
      </div>
    );
  };

  const renderStatusBadge = (status) => {
    if (status === 'active') {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Active</span>;
    }
    if (status === 'expired') {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">Expired</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Revoked</span>;
  };

  const renderPdfLinks = (pdf) => {
    const pdfLinks = linksByPdf[pdf.pdf_id] || [];
    if (pdfLinks.length === 0) {
      return (
        <div className="mt-3 rounded-lg border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-500">
          No links created for this PDF yet.
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        {pdfLinks.map((link) => {
          const secureUrl = getSecureLinkUrl(link);
          const shortUrl = secureUrl.length > 66 ? `${secureUrl.slice(0, 66)}...` : secureUrl;
          return (
            <div
              key={link.link_id}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-xs text-stone-600 truncate">{shortUrl}</code>
                  {renderStatusBadge(link.status)}
                </div>
                {link.internal_title && (
                  <p className="text-sm font-semibold text-stone-800 mt-1 truncate">
                    {link.internal_title}
                  </p>
                )}
                {link.internal_note && (
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">
                    {link.internal_note}
                  </p>
                )}
                <div className="text-xs text-stone-500 mt-1 flex flex-wrap items-center gap-3">
                  <span>{Number(link.open_count || 0)} views</span>
                  <span>{link.expiry_mode === 'countdown' ? 'Countdown' : link.expiry_mode === 'fixed' ? 'Fixed Date' : 'Manual'}</span>
                  <span>{format(new Date(link.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => copyToClipboard(link.link_id, secureUrl)}
                >
                  {copiedValue === link.link_id ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
                {link.status === 'active' && (
                  <>
                    <a href={secureUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-amber-600 hover:text-amber-700"
                      onClick={() => setRevokeLinkTarget(link)}
                    >
                      <Ban className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700"
                  onClick={() => setDeleteLinkTarget(link)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDirectLinkPanel = (pdf) => {
    const directUrl = getDirectUrl(pdf);
    return (
      <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-900">Direct PDF Link</p>
            <p className="text-xs text-stone-500">Optional unrestricted full-view PDF link</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs ${
            pdf.direct_access_enabled
              ? pdf.direct_access_public
                ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
              : 'bg-stone-200 text-stone-600'
          }`}>
            {!pdf.direct_access_enabled ? 'Disabled' : pdf.direct_access_public ? 'Public' : 'Login only'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md bg-white border border-stone-200 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-stone-700">Enable direct link</span>
            <Switch
              checked={Boolean(pdf.direct_access_enabled)}
              disabled={updatingDirect === pdf.pdf_id}
              onCheckedChange={(checked) => handleUpdateDirectAccess(pdf, { enabled: checked })}
            />
          </div>
          <div className="rounded-md bg-white border border-stone-200 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-stone-700">Open for all</span>
            <Switch
              checked={Boolean(pdf.direct_access_public)}
              disabled={!pdf.direct_access_enabled || updatingDirect === pdf.pdf_id}
              onCheckedChange={(checked) => handleUpdateDirectAccess(pdf, { is_public: checked })}
            />
          </div>
        </div>

        {pdf.direct_access_enabled && directUrl && (
          <div className="mt-3 flex items-center gap-1">
            <code className="flex-1 rounded-md bg-white border border-stone-200 px-2 py-1 text-xs text-stone-600 truncate">
              {directUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => copyToClipboard(`direct-${pdf.pdf_id}`, directUrl)}
            >
              {copiedValue === `direct-${pdf.pdf_id}` ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <a href={directUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          </div>
        )}
      </div>
    );
  };

  const renderListCard = (pdf, index) => {
    const metrics = pdfMetrics[pdf.pdf_id] || { linkCount: 0, activeLinks: 0, totalViews: 0 };
    const isExpanded = expandedPdfId === pdf.pdf_id;

    return (
      <motion.div
        key={pdf.pdf_id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
      >
        <Card className="border-stone-200 hover:shadow-md transition-shadow">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col xl:flex-row gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                {renderPdfPreview(pdf)}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-stone-900 truncate">{pdf.filename}</h3>
                  <div className="mt-1 text-sm text-stone-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>{formatBytes(pdf.file_size)}</span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {format(new Date(pdf.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    <span className="text-stone-600">
                      Folder: {pdf.folder ? (folders.find((item) => item.folder_id === pdf.folder)?.name || 'Unknown') : 'Root'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
                      {metrics.activeLinks} active links
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      {metrics.linkCount} total links
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs bg-violet-100 text-violet-700">
                      {metrics.totalViews} views
                    </span>
                  </div>

                  {renderDirectLinkPanel(pdf)}

                  {isExpanded && renderPdfLinks(pdf)}
                </div>
              </div>

              <div className="flex xl:flex-col items-center xl:items-stretch gap-2 flex-wrap">
                <Link to={`/links/create?pdf=${pdf.pdf_id}`}>
                  <Button variant="outline" size="sm" className="w-full xl:w-auto">
                    <Link2 className="w-4 h-4 mr-2" />
                    Create Link
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full xl:w-auto"
                  onClick={() => setExpandedPdfId((prev) => (prev === pdf.pdf_id ? null : pdf.pdf_id))}
                >
                  {expandedPdfId === pdf.pdf_id ? 'Hide Links' : `Show Links (${metrics.linkCount})`}
                </Button>
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
                    <DropdownMenuItem onClick={() => setMoveTarget(pdf)}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Move
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(pdf)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const renderGridCard = (pdf, index) => {
    const metrics = pdfMetrics[pdf.pdf_id] || { linkCount: 0, activeLinks: 0, totalViews: 0 };
    const isExpanded = expandedPdfId === pdf.pdf_id;

    return (
      <motion.div
        key={pdf.pdf_id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
      >
        <Card className="border-stone-200 hover:shadow-md transition-shadow h-full">
          <CardContent className="p-4 h-full flex flex-col">
            {renderPdfPreview(pdf, true)}
            <h3 className="font-semibold text-stone-900 mt-3 truncate">{pdf.filename}</h3>
            <p className="text-xs text-stone-500 mt-1">{formatBytes(pdf.file_size)} • {format(new Date(pdf.created_at), 'MMM d, yyyy')}</p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 text-emerald-700 py-2">
                <p className="text-sm font-semibold">{metrics.activeLinks}</p>
                <p className="text-[10px] uppercase tracking-wide">Active</p>
              </div>
              <div className="rounded-lg bg-blue-50 text-blue-700 py-2">
                <p className="text-sm font-semibold">{metrics.linkCount}</p>
                <p className="text-[10px] uppercase tracking-wide">Links</p>
              </div>
              <div className="rounded-lg bg-violet-50 text-violet-700 py-2">
                <p className="text-sm font-semibold">{metrics.totalViews}</p>
                <p className="text-[10px] uppercase tracking-wide">Views</p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Link to={`/links/create?pdf=${pdf.pdf_id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <Link2 className="w-4 h-4 mr-2" />
                  Create
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setExpandedPdfId((prev) => (prev === pdf.pdf_id ? null : pdf.pdf_id))}
              >
                Links
              </Button>
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
                  <DropdownMenuItem onClick={() => setMoveTarget(pdf)}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Move
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(pdf)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {renderDirectLinkPanel(pdf)}
            {isExpanded && renderPdfLinks(pdf)}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <DashboardLayout title={t('pdfs.title')} subtitle="Unified documents and links workspace">
      {user?.subscription_status !== 'active' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800">
            <span className="font-semibold">{t('pdfs.subscriptionRequired')}</span>{' '}
            <Link to="/pricing" className="underline hover:text-amber-900">{t('pdfs.upgradePlan')}</Link> {t('pdfs.toUpload')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-stone-200">
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">My PDFs</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totals.pdfCount}</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">Active Links</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totals.activeLinks}</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">Total Views</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totals.totalViews}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              placeholder="Search PDFs or link tokens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 bg-white border-stone-200"
              data-testid="search-pdfs-input"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-12" onClick={() => setShowNewFolder(true)}>
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

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
            >
              <option value="all">All folders</option>
              <option value="root">Root only</option>
              {folders.map((folder) => (
                <option key={folder.folder_id} value={folder.folder_id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
            >
              <option value="recent">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="size">File size</option>
              <option value="views">Most views</option>
              <option value="links">Most active links</option>
            </select>
          </div>

          <div className="inline-flex items-center rounded-md border border-stone-200 bg-white p-1 lg:ml-auto">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'list' ? 'bg-emerald-900 hover:bg-emerald-800' : ''}
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4 mr-1" />
              List
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'grid' ? 'bg-emerald-900 hover:bg-emerald-800' : ''}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-4 h-4 mr-1" />
              Grid
            </Button>
          </div>
        </div>
      </div>

      {!loading && folders.length > 0 && (
        <div className="mb-5">
          <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Folders</p>
          <div className="flex flex-wrap gap-2">
            {folders.map((folder) => (
              <div key={folder.folder_id} className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700">
                <Folder className="w-3.5 h-3.5 mr-2 text-amber-500" />
                {folder.name}
                <button
                  onClick={() => handleDeleteFolder(folder.folder_id)}
                  className="ml-2 text-stone-400 hover:text-red-600"
                  title="Delete folder"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-900" />
        </div>
      ) : filteredPdfs.length === 0 ? (
        <Card className="border-stone-200">
          <CardContent className="py-16 text-center">
            <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-stone-900 mb-2">
              {searchQuery ? t('pdfs.noResults') : t('pdfs.noPdfs')}
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
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4' : 'space-y-4'}>
          {filteredPdfs.map((pdf, index) =>
            viewMode === 'grid'
              ? renderGridCard(pdf, index)
              : renderListCard(pdf, index),
          )}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete PDF</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{deleteTarget?.filename}" and revoke all associated links.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePdf} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!revokeLinkTarget} onOpenChange={() => setRevokeLinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke link</AlertDialogTitle>
            <AlertDialogDescription>
              The link will stop opening immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeLink} className="bg-amber-600 hover:bg-amber-700">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteLinkTarget} onOpenChange={() => setDeleteLinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete link</AlertDialogTitle>
            <AlertDialogDescription>
              This link will be permanently removed from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLink} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename PDF</DialogTitle>
            <DialogDescription>Enter a new file name.</DialogDescription>
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
            <Button onClick={handleRename} className="bg-emerald-900 hover:bg-emerald-800">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Use folders to organize your PDFs.</DialogDescription>
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
            <Button onClick={handleCreateFolder} className="bg-emerald-900 hover:bg-emerald-800">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveTarget} onOpenChange={() => setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move PDF</DialogTitle>
            <DialogDescription>Select destination for "{moveTarget?.filename}"</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <button
              onClick={() => handleMovePdf(null)}
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <Folder className="w-5 h-5 text-stone-400" />
              <span>Root (no folder)</span>
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
