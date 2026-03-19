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
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
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

const PDF_WORKER_SRC = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const MAX_INITIAL_THUMBNAILS = 8;
const MAX_IDLE_THUMBNAILS = 8;
const MAX_THUMBNAIL_CONCURRENCY = 2;
let pdfJsLibPromise = null;

const formatLocalizedDate = (value, formatter) => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatter.format(parsed);
};

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
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderTarget, setRenameFolderTarget] = useState(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
  const [deleteLinkTarget, setDeleteLinkTarget] = useState(null);
  const [revokeLinkTarget, setRevokeLinkTarget] = useState(null);
  const [editLinkTarget, setEditLinkTarget] = useState(null);
  const [savingLinkSettings, setSavingLinkSettings] = useState(false);
  const [editLinkForm, setEditLinkForm] = useState({
    internal_title: '',
    internal_note: '',
    custom_expired_url: '',
    custom_expired_message: '',
    focus_lock_enabled: true,
    idle_timeout_seconds: 0,
    nda_required: false,
    nda_title: 'Confidentiality agreement',
    nda_text: 'This document contains confidential information. By continuing, you agree not to copy, share, capture, or distribute any part of this material without authorization.',
    nda_accept_label: 'I agree and continue',
    lock_to_first_ip: false,
    restrict_to_specific_ips: false,
    allowed_ip_addresses: '',
  });

  const [copiedValue, setCopiedValue] = useState('');
  const [updatingDirect, setUpdatingDirect] = useState(null);
  const [selectedPdfIds, setSelectedPdfIds] = useState([]);
  const [draggedPdfIds, setDraggedPdfIds] = useState([]);
  const [folderDropTarget, setFolderDropTarget] = useState(null);
  const [thumbnails, setThumbnails] = useState({});
  const [thumbnailLoading, setThumbnailLoading] = useState({});
  const thumbnailsRef = useRef({});
  const thumbnailLoadingRef = useRef(new Set());
  const thumbnailQueueRef = useRef([]);
  const thumbnailQueuedRef = useRef(new Set());

  const { user } = useAuth();
  const { t, language } = useLanguage();

  const shortDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium' }),
    [language],
  );
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(language || 'en', { dateStyle: 'medium', timeStyle: 'short' }),
    [language],
  );

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
      toast.error(t('pdfManagement.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

  const openEditLinkDialog = (link) => {
    const security = link?.security_options || {};
    const allowedIps = Array.isArray(security.allowed_ip_addresses) ? security.allowed_ip_addresses : [];
    setEditLinkTarget(link);
    setEditLinkForm({
      internal_title: link?.internal_title || '',
      internal_note: link?.internal_note || '',
      custom_expired_url: link?.custom_expired_url || '',
      custom_expired_message: link?.custom_expired_message || '',
      focus_lock_enabled: security.focus_lock_enabled !== false,
      idle_timeout_seconds: Number(security.idle_timeout_seconds || 0) || 0,
      nda_required: Boolean(security.nda_required),
      nda_title: security.nda_title || t('pdfManagement.defaultNdaTitle'),
      nda_text: security.nda_text || t('pdfManagement.defaultNdaText'),
      nda_accept_label: security.nda_accept_label || t('pdfManagement.defaultNdaAccept'),
      lock_to_first_ip: Boolean(security.lock_to_first_ip),
      restrict_to_specific_ips: allowedIps.length > 0,
      allowed_ip_addresses: allowedIps.join(', '),
    });
  };

  const updateEditLinkField = (field, value) => {
    setEditLinkForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveLinkSettings = async () => {
    if (!editLinkTarget) return;
    if ((editLinkForm.idle_timeout_seconds || 0) > 0 && editLinkForm.idle_timeout_seconds < 15) {
      toast.error(t('pdfManagement.idleTimeoutMin'));
      return;
    }
    if ((editLinkForm.internal_title || '').trim().length > 140) {
      toast.error(t('pdfManagement.linkTitleLimit'));
      return;
    }
    if ((editLinkForm.internal_note || '').trim().length > 400) {
      toast.error(t('pdfManagement.internalNoteLimit'));
      return;
    }
    if ((editLinkForm.nda_title || '').trim().length > 120) {
      toast.error(t('pdfManagement.ndaTitleLimit'));
      return;
    }
    if ((editLinkForm.nda_text || '').trim().length > 4000) {
      toast.error(t('pdfManagement.ndaTextLimit'));
      return;
    }
    if ((editLinkForm.nda_accept_label || '').trim().length > 60) {
      toast.error(t('pdfManagement.ndaButtonLimit'));
      return;
    }

    setSavingLinkSettings(true);
    try {
      const response = await api.put(`/links/${editLinkTarget.link_id}`, {
        internal_title: editLinkForm.internal_title || null,
        internal_note: editLinkForm.internal_note || null,
        custom_expired_url: editLinkForm.custom_expired_url || null,
        custom_expired_message: editLinkForm.custom_expired_message || null,
        security_options: {
          focus_lock_enabled: editLinkForm.focus_lock_enabled,
          idle_timeout_seconds: editLinkForm.idle_timeout_seconds > 0 ? editLinkForm.idle_timeout_seconds : null,
          nda_required: editLinkForm.nda_required,
          nda_title: editLinkForm.nda_title || null,
          nda_text: editLinkForm.nda_text || null,
          nda_accept_label: editLinkForm.nda_accept_label || null,
          lock_to_first_ip: editLinkForm.lock_to_first_ip,
          allowed_ip_addresses: editLinkForm.restrict_to_specific_ips ? editLinkForm.allowed_ip_addresses : [],
        },
      });
      const updatedLink = response.data || null;
      if (updatedLink?.link_id) {
        setLinks((prev) => prev.map((item) => (item.link_id === updatedLink.link_id ? { ...item, ...updatedLink } : item)));
      }
      toast.success(t('pdfManagement.linkSettingsUpdated'));
      setEditLinkTarget(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('pdfManagement.linkSettingsUpdateFailed'));
    } finally {
      setSavingLinkSettings(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error(t('pdfManagement.onlyPdfAllowed'));
      return;
    }

    if (user?.subscription_status !== 'active') {
      toast.error(t('pdfManagement.activeSubscriptionRequired'));
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/pdfs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(t('pdfManagement.pdfUploadSuccess'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('pdfManagement.uploadFailed'));
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
      toast.success(t('pdfManagement.pdfDeleted'));
    } catch {
      toast.error(t('pdfManagement.pdfDeleteFailed'));
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
      toast.success(t('pdfManagement.filenameUpdated'));
    } catch {
      toast.error(t('pdfManagement.renamePdfFailed'));
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
      toast.success(t('pdfManagement.folderCreated'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('pdfManagement.folderCreateFailed'));
    } finally {
      setShowNewFolder(false);
      setNewFolderName('');
    }
  };

  const openRenameFolderDialog = (folder) => {
    setRenameFolderTarget(folder);
    setRenameFolderName(folder?.name || '');
  };

  const handleRenameFolder = async () => {
    if (!renameFolderTarget || !renameFolderName.trim()) return;
    const nextName = renameFolderName.trim();
    if (nextName === renameFolderTarget.name) {
      setRenameFolderTarget(null);
      setRenameFolderName('');
      return;
    }

    try {
      const response = await api.put(`/folders/${renameFolderTarget.folder_id}`, { name: nextName });
      const updatedFolder = response.data || { ...renameFolderTarget, name: nextName };
      setFolders((prev) =>
        prev.map((folder) =>
          folder.folder_id === renameFolderTarget.folder_id
            ? { ...folder, ...updatedFolder }
            : folder,
        ),
      );
      toast.success(t('pdfManagement.folderRenamed'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('pdfManagement.folderRenameFailed'));
    } finally {
      setRenameFolderTarget(null);
      setRenameFolderName('');
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    const folderId = deleteFolderTarget.folder_id;
    const movedCount = pdfs.filter((item) => item.folder === folderId).length;

    try {
      await api.delete(`/folders/${folderId}`);
      setFolders((prev) => prev.filter((folder) => folder.folder_id !== folderId));
      setPdfs((prev) =>
        prev.map((item) =>
          item.folder === folderId
            ? { ...item, folder: null }
            : item,
        ),
      );
      if (folderFilter === folderId) {
        setFolderFilter('all');
      }
      toast.success(
        movedCount > 0
          ? t('pdfManagement.folderDeletedMoved', { count: movedCount })
          : t('pdfManagement.folderDeleted'),
      );
    } catch (error) {
      toast.error(error.response?.data?.detail || t('pdfManagement.folderDeleteFailed'));
    } finally {
      setDeleteFolderTarget(null);
    }
  };

  const toggleSelectedPdf = (pdfId, checked) => {
    setSelectedPdfIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(pdfId);
      } else {
        next.delete(pdfId);
      }
      return Array.from(next);
    });
  };

  const clearSelectedPdfs = () => {
    setSelectedPdfIds([]);
  };

  const handleSelectAllVisible = () => {
    setSelectedPdfIds((prev) => Array.from(new Set([...prev, ...filteredPdfs.map((pdf) => pdf.pdf_id)])));
  };

  const handleMoveMultiplePdfs = async (pdfIds, folderId, successMessage = t('pdfManagement.pdfsMovedDefault')) => {
    const normalizedTargetFolder = folderId || null;
    const moveIds = (Array.isArray(pdfIds) ? pdfIds : []).filter((pdfId) => {
      const pdf = pdfs.find((item) => item.pdf_id === pdfId);
      return pdf && (pdf.folder || null) !== normalizedTargetFolder;
    });

    if (moveIds.length === 0) {
      setBulkMoveOpen(false);
      setMoveTarget(null);
      setDraggedPdfIds([]);
      setFolderDropTarget(null);
      return;
    }

    try {
      await Promise.all(moveIds.map((pdfId) => api.put(`/pdfs/${pdfId}/move`, { folder: normalizedTargetFolder })));
      setPdfs((prev) =>
        prev.map((item) =>
          moveIds.includes(item.pdf_id)
            ? { ...item, folder: normalizedTargetFolder }
            : item,
        ),
      );
      setSelectedPdfIds((prev) => prev.filter((pdfId) => !moveIds.includes(pdfId)));
      toast.success(successMessage);
    } catch {
      toast.error(t('pdfManagement.moveFailed'));
    } finally {
      setBulkMoveOpen(false);
      setMoveTarget(null);
      setDraggedPdfIds([]);
      setFolderDropTarget(null);
    }
  };

  const handleMovePdf = async (folderId) => {
    if (!moveTarget) return;
    void handleMoveMultiplePdfs([moveTarget.pdf_id], folderId, t('pdfManagement.pdfMoved'));
  };

  const handleBulkMove = (folderId) => {
    void handleMoveMultiplePdfs(
      selectedPdfIds,
      folderId,
      t('pdfManagement.pdfsMovedCount', { count: selectedPdfIds.length }),
    );
  };

  const handlePdfDragStart = (pdfId, event) => {
    const dragIds = selectedPdfIds.includes(pdfId) ? selectedPdfIds : [pdfId];
    setDraggedPdfIds(dragIds);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragIds.join(','));
  };

  const handleFolderDrop = (folderId) => {
    if (!draggedPdfIds.length) return;
    void handleMoveMultiplePdfs(
      draggedPdfIds,
      folderId,
      t('pdfManagement.pdfsMovedCount', { count: draggedPdfIds.length }),
    );
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
      toast.success(t('adminLinks.revokeSuccess'));
    } catch {
      toast.error(t('adminLinks.revokeFailed'));
    } finally {
      setRevokeLinkTarget(null);
    }
  };

  const handleDeleteLink = async () => {
    if (!deleteLinkTarget) return;
    try {
      await api.delete(`/links/${deleteLinkTarget.link_id}`);
      setLinks((prev) => prev.filter((item) => item.link_id !== deleteLinkTarget.link_id));
      toast.success(t('adminLinks.deleteSuccess'));
    } catch {
      toast.error(t('adminLinks.deleteFailed'));
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
      toast.success(t('pdfManagement.directLinkUpdated'));
    } catch (error) {
      toast.error(error.response?.data?.detail || t('pdfManagement.directLinkUpdateFailed'));
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
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('pdfManagement.copyFailed'));
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

  const sortedFolders = useMemo(
    () => [...folders].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))),
    [folders],
  );

  const folderLookup = useMemo(
    () => Object.fromEntries(folders.map((folder) => [folder.folder_id, folder])),
    [folders],
  );

  const folderStats = useMemo(() => {
    const byFolder = {};
    for (const folder of folders) {
      byFolder[folder.folder_id] = {
        pdfCount: 0,
        activeLinks: 0,
        totalViews: 0,
      };
    }

    const root = {
      pdfCount: 0,
      activeLinks: 0,
      totalViews: 0,
    };

    for (const pdf of pdfs) {
      const metrics = pdfMetrics[pdf.pdf_id] || { activeLinks: 0, totalViews: 0 };
      const bucket = pdf.folder ? (byFolder[pdf.folder] ||= { pdfCount: 0, activeLinks: 0, totalViews: 0 }) : root;
      bucket.pdfCount += 1;
      bucket.activeLinks += metrics.activeLinks;
      bucket.totalViews += metrics.totalViews;
    }

    return {
      all: {
        pdfCount: pdfs.length,
        activeLinks: totals.activeLinks,
        totalViews: totals.totalViews,
      },
      root,
      byFolder,
    };
  }, [folders, pdfMetrics, pdfs, totals.activeLinks, totals.totalViews]);

  const getFolderName = (folderId) =>
    folderId ? (folderLookup[folderId]?.name || t('pdfManagement.unknownFolder')) : t('pdfManagement.root');

  const getExpiryModeLabel = (expiryMode) => {
    if (expiryMode === 'countdown') return t('pdfManagement.expiryCountdown');
    if (expiryMode === 'fixed') return t('pdfManagement.expiryFixed');
    return t('pdfManagement.expiryManual');
  };

  const folderFilterMeta = useMemo(() => {
    if (folderFilter === 'all') {
      return {
        title: t('pdfManagement.allPdfs'),
        description: t('pdfManagement.filterSummaryAll', { count: folderStats.all.pdfCount }),
      };
    }
    if (folderFilter === 'root') {
      return {
        title: t('pdfManagement.root'),
        description: t('pdfManagement.filterSummaryRoot', { count: folderStats.root.pdfCount }),
      };
    }
    const folder = folderLookup[folderFilter];
    const stats = folderStats.byFolder[folderFilter] || { pdfCount: 0 };
    return {
      title: folder?.name || t('pdfManagement.folderFallbackTitle'),
      description: t('pdfManagement.filterSummaryFolder', { count: stats.pdfCount }),
    };
  }, [folderFilter, folderLookup, folderStats, t]);

  useEffect(() => {
    setSelectedPdfIds((prev) => prev.filter((pdfId) => pdfs.some((pdf) => pdf.pdf_id === pdfId)));
  }, [pdfs]);

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

  const allVisibleSelected =
    filteredPdfs.length > 0 &&
    filteredPdfs.every((pdf) => selectedPdfIds.includes(pdf.pdf_id));

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
            <span className="text-xs">{t('pdfManagement.noPreview')}</span>
          </div>
        )}
      </div>
    );
  };

  const renderStatusBadge = (status) => {
    if (status === 'active') {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">{t('links.active')}</span>;
    }
    if (status === 'expired') {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">{t('links.expired')}</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">{t('links.revoked')}</span>;
  };

  const renderPdfLinks = (pdf) => {
    const pdfLinks = linksByPdf[pdf.pdf_id] || [];
    if (pdfLinks.length === 0) {
      return (
        <div className="mt-3 rounded-lg border border-dashed border-stone-300 px-3 py-3 text-sm text-stone-500">
          {t('pdfManagement.noLinksForPdf')}
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
                  <span>{t('pdfManagement.linkViews', { count: Number(link.open_count || 0) })}</span>
                  <span>{getExpiryModeLabel(link.expiry_mode)}</span>
                  <span>{formatLocalizedDate(link.created_at, shortDateFormatter)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditLinkDialog(link)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
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
            <p className="text-sm font-semibold text-stone-900">{t('pdfManagement.directLinkTitle')}</p>
            <p className="text-xs text-stone-500">{t('pdfManagement.directLinkDescription')}</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs ${
            pdf.direct_access_enabled
              ? pdf.direct_access_public
                ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
              : 'bg-stone-200 text-stone-600'
          }`}>
            {!pdf.direct_access_enabled
              ? t('pdfManagement.statusDisabled')
              : pdf.direct_access_public
                ? t('pdfManagement.statusPublic')
                : t('pdfManagement.statusLoginOnly')}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md bg-white border border-stone-200 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-stone-700">{t('pdfManagement.enableDirectLink')}</span>
            <Switch
              checked={Boolean(pdf.direct_access_enabled)}
              disabled={updatingDirect === pdf.pdf_id}
              onCheckedChange={(checked) => handleUpdateDirectAccess(pdf, { enabled: checked })}
            />
          </div>
          <div className="rounded-md bg-white border border-stone-200 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-stone-700">{t('pdfManagement.openForAll')}</span>
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
        draggable
        onDragStart={(event) => handlePdfDragStart(pdf.pdf_id, event)}
        onDragEnd={() => {
          setDraggedPdfIds([]);
          setFolderDropTarget(null);
        }}
      >
        <Card className="border-stone-200 hover:shadow-md transition-shadow">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col xl:flex-row gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="pt-1">
                  <Checkbox
                    checked={selectedPdfIds.includes(pdf.pdf_id)}
                    onCheckedChange={(checked) => toggleSelectedPdf(pdf.pdf_id, Boolean(checked))}
                  />
                </div>
                {renderPdfPreview(pdf)}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-stone-900 truncate">{pdf.filename}</h3>
                  <div className="mt-1 text-sm text-stone-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>{formatBytes(pdf.file_size)}</span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatLocalizedDate(pdf.created_at, dateTimeFormatter)}
                    </span>
                    <span className="text-stone-600">
                      {t('pdfManagement.folderLabel')}: {getFolderName(pdf.folder)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
                      {t('pdfManagement.activeLinksCount', { count: metrics.activeLinks })}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                      {t('pdfManagement.totalLinksCount', { count: metrics.linkCount })}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs bg-violet-100 text-violet-700">
                      {t('pdfManagement.totalViewsCount', { count: metrics.totalViews })}
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
                    {t('pdfs.createLink')}
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full xl:w-auto"
                  onClick={() => setExpandedPdfId((prev) => (prev === pdf.pdf_id ? null : pdf.pdf_id))}
                >
                  {expandedPdfId === pdf.pdf_id
                    ? t('pdfManagement.hideLinks')
                    : t('pdfManagement.showLinks', { count: metrics.linkCount })}
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
                      {t('pdfManagement.renamePdfAction')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMoveTarget(pdf)}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      {t('pdfManagement.moveAction')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(pdf)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('common.delete')}
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
        draggable
        onDragStart={(event) => handlePdfDragStart(pdf.pdf_id, event)}
        onDragEnd={() => {
          setDraggedPdfIds([]);
          setFolderDropTarget(null);
        }}
      >
        <Card className="border-stone-200 hover:shadow-md transition-shadow h-full">
          <CardContent className="p-4 h-full flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <Checkbox
                checked={selectedPdfIds.includes(pdf.pdf_id)}
                onCheckedChange={(checked) => toggleSelectedPdf(pdf.pdf_id, Boolean(checked))}
              />
              <span className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                {t('pdfManagement.dragToFolder')}
              </span>
            </div>
            {renderPdfPreview(pdf, true)}
            <h3 className="font-semibold text-stone-900 mt-3 truncate">{pdf.filename}</h3>
            <p className="text-xs text-stone-500 mt-1">
              {formatBytes(pdf.file_size)} • {formatLocalizedDate(pdf.created_at, shortDateFormatter)} • {getFolderName(pdf.folder)}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 text-emerald-700 py-2">
                <p className="text-sm font-semibold">{metrics.activeLinks}</p>
                <p className="text-[10px] uppercase tracking-wide">{t('pdfManagement.activeShort')}</p>
              </div>
              <div className="rounded-lg bg-blue-50 text-blue-700 py-2">
                <p className="text-sm font-semibold">{metrics.linkCount}</p>
                <p className="text-[10px] uppercase tracking-wide">{t('pdfManagement.linksShort')}</p>
              </div>
              <div className="rounded-lg bg-violet-50 text-violet-700 py-2">
                <p className="text-sm font-semibold">{metrics.totalViews}</p>
                <p className="text-[10px] uppercase tracking-wide">{t('pdfManagement.viewsShort')}</p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Link to={`/links/create?pdf=${pdf.pdf_id}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <Link2 className="w-4 h-4 mr-2" />
                  {t('pdfManagement.createShort')}
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setExpandedPdfId((prev) => (prev === pdf.pdf_id ? null : pdf.pdf_id))}
              >
                {t('pdfManagement.linksShort')}
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
                    {t('pdfManagement.renamePdfAction')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMoveTarget(pdf)}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    {t('pdfManagement.moveAction')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(pdf)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('common.delete')}
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
    <DashboardLayout title={t('pdfs.title')} subtitle={t('pdfManagement.subtitle')}>
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
            <p className="text-sm text-stone-500">{t('pdfManagement.statsPdfs')}</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totals.pdfCount}</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">{t('pdfManagement.statsActiveLinks')}</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totals.activeLinks}</p>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">{t('pdfManagement.statsViews')}</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totals.totalViews}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <Input
              placeholder={t('pdfManagement.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 bg-white border-stone-200"
              data-testid="search-pdfs-input"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-12" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="w-4 h-4 mr-2" />
              {t('pdfManagement.newFolder')}
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
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700"
            >
              <option value="recent">{t('pdfManagement.sortNewest')}</option>
              <option value="oldest">{t('pdfManagement.sortOldest')}</option>
              <option value="name">{t('pdfManagement.sortName')}</option>
              <option value="size">{t('pdfManagement.sortSize')}</option>
              <option value="views">{t('pdfManagement.sortViews')}</option>
              <option value="links">{t('pdfManagement.sortLinks')}</option>
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
              {t('pdfManagement.listView')}
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'grid' ? 'bg-emerald-900 hover:bg-emerald-800' : ''}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-4 h-4 mr-1" />
              {t('pdfManagement.gridView')}
            </Button>
          </div>
        </div>
      </div>

      {!loading && (
        <Card className="mb-6 border-stone-200 bg-gradient-to-br from-white via-stone-50 to-emerald-50/40">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{t('pdfManagement.foldersEyebrow')}</p>
                  <h2 className="mt-1 text-lg font-semibold text-stone-900">{t('pdfManagement.foldersTitle')}</h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {t('pdfManagement.foldersDescription')}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 text-sm text-stone-600">
                  <span className="font-semibold text-stone-900">{folderFilterMeta.title}</span>
                  <span className="mx-2 text-stone-300">•</span>
                  <span>{folderFilterMeta.description}</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setFolderFilter('all')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setFolderFilter('all');
                    }
                  }}
                  className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                    folderFilter === 'all'
                      ? 'border-emerald-900 bg-emerald-900 text-white shadow-md'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${folderFilter === 'all' ? 'text-emerald-50' : 'text-stone-900'}`}>{t('pdfManagement.allPdfs')}</p>
                      <p className={`mt-1 text-xs ${folderFilter === 'all' ? 'text-emerald-100/80' : 'text-stone-500'}`}>
                        {t('pdfManagement.allPdfsDescription')}
                      </p>
                    </div>
                    <FolderOpen className={`h-5 w-5 ${folderFilter === 'all' ? 'text-emerald-100' : 'text-emerald-700'}`} />
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className={`text-2xl font-semibold ${folderFilter === 'all' ? 'text-white' : 'text-stone-900'}`}>{folderStats.all.pdfCount}</p>
                      <p className={`text-xs ${folderFilter === 'all' ? 'text-emerald-100/80' : 'text-stone-500'}`}>{t('pdfManagement.pdfsCountLabel')}</p>
                    </div>
                    <div className={`text-right text-xs ${folderFilter === 'all' ? 'text-emerald-100/80' : 'text-stone-500'}`}>
                      <p>{t('pdfManagement.activeLinksCount', { count: folderStats.all.activeLinks })}</p>
                      <p>{t('pdfManagement.totalViewsCount', { count: folderStats.all.totalViews })}</p>
                    </div>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setFolderFilter('root')}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setFolderDropTarget('root');
                  }}
                  onDragLeave={() => setFolderDropTarget((prev) => (prev === 'root' ? null : prev))}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFolderDrop(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setFolderFilter('root');
                    }
                  }}
                  className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                    folderFilter === 'root'
                      ? 'border-emerald-900 bg-emerald-900 text-white shadow-md'
                      : folderDropTarget === 'root'
                        ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                        : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${folderFilter === 'root' ? 'text-emerald-50' : 'text-stone-900'}`}>{t('pdfManagement.root')}</p>
                      <p className={`mt-1 text-xs ${folderFilter === 'root' ? 'text-emerald-100/80' : 'text-stone-500'}`}>
                        {t('pdfManagement.rootDescription')}
                      </p>
                    </div>
                    <Folder className={`h-5 w-5 ${folderFilter === 'root' ? 'text-emerald-100' : 'text-amber-600'}`} />
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className={`text-2xl font-semibold ${folderFilter === 'root' ? 'text-white' : 'text-stone-900'}`}>{folderStats.root.pdfCount}</p>
                      <p className={`text-xs ${folderFilter === 'root' ? 'text-emerald-100/80' : 'text-stone-500'}`}>{t('pdfManagement.pdfsCountLabel')}</p>
                    </div>
                    <div className={`text-right text-xs ${folderFilter === 'root' ? 'text-emerald-100/80' : 'text-stone-500'}`}>
                      <p>{t('pdfManagement.activeLinksCount', { count: folderStats.root.activeLinks })}</p>
                      <p>{t('pdfManagement.totalViewsCount', { count: folderStats.root.totalViews })}</p>
                    </div>
                  </div>
                </div>

                {sortedFolders.map((folder) => {
                  const stats = folderStats.byFolder[folder.folder_id] || { pdfCount: 0, activeLinks: 0, totalViews: 0 };
                  const isActive = folderFilter === folder.folder_id;
                  return (
                    <div
                      key={folder.folder_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setFolderFilter(folder.folder_id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setFolderDropTarget(folder.folder_id);
                      }}
                      onDragLeave={() => setFolderDropTarget((prev) => (prev === folder.folder_id ? null : prev))}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleFolderDrop(folder.folder_id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setFolderFilter(folder.folder_id);
                        }
                      }}
                      className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                        isActive
                          ? 'border-emerald-900 bg-emerald-900 text-white shadow-md'
                          : folderDropTarget === folder.folder_id
                            ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                            : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-semibold ${isActive ? 'text-emerald-50' : 'text-stone-900'}`}>{folder.name}</p>
                          <p className={`mt-1 text-xs ${isActive ? 'text-emerald-100/80' : 'text-stone-500'}`}>
                            {t('pdfManagement.managedFolder')}
                          </p>
                        </div>
                        <div className="flex items-start gap-1">
                          <Folder className={`mt-0.5 h-5 w-5 flex-shrink-0 ${isActive ? 'text-emerald-100' : 'text-amber-600'}`} />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${isActive ? 'text-emerald-100 hover:bg-emerald-800 hover:text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openRenameFolderDialog(folder)}
                              >
                                <Edit2 className="mr-2 h-4 w-4" />
                                {t('pdfManagement.renameFolderAction')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteFolderTarget(folder)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('pdfManagement.deleteFolderAction')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div>
                          <p className={`text-2xl font-semibold ${isActive ? 'text-white' : 'text-stone-900'}`}>{stats.pdfCount}</p>
                          <p className={`text-xs ${isActive ? 'text-emerald-100/80' : 'text-stone-500'}`}>{t('pdfManagement.pdfsCountLabel')}</p>
                        </div>
                        <div className={`text-right text-xs ${isActive ? 'text-emerald-100/80' : 'text-stone-500'}`}>
                          <p>{t('pdfManagement.activeLinksCount', { count: stats.activeLinks })}</p>
                          <p>{t('pdfManagement.totalViewsCount', { count: stats.totalViews })}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-stone-500">
                {t('pdfManagement.dragHint')}
              </p>
            </div>
          </CardContent>
        </Card>
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
        <>
          {selectedPdfIds.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {t('pdfManagement.selectedCount', { count: selectedPdfIds.length })}
                </p>
                <p className="text-sm text-stone-600">
                  {t('pdfManagement.selectedDescription')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!allVisibleSelected && filteredPdfs.length > 0 && (
                  <Button variant="outline" onClick={handleSelectAllVisible}>
                    {t('pdfManagement.selectVisible')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setBulkMoveOpen(true)}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {t('pdfManagement.moveSelected')}
                </Button>
                <Button variant="ghost" onClick={clearSelectedPdfs}>
                  {t('pdfManagement.clearSelection')}
                </Button>
              </div>
            </div>
          )}

          {folderFilter !== 'all' && (
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900">{folderFilterMeta.title}</p>
                <p className="text-sm text-stone-500">
                  {t('pdfManagement.showingCount', { count: filteredPdfs.length })}
                </p>
              </div>
              <Button variant="outline" onClick={() => setFolderFilter('all')}>
                {t('pdfManagement.showAllPdfs')}
              </Button>
            </div>
          )}

          <div className={viewMode === 'grid' ? 'grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4' : 'space-y-4'}>
            {filteredPdfs.map((pdf, index) =>
              viewMode === 'grid'
                ? renderGridCard(pdf, index)
                : renderListCard(pdf, index),
            )}
          </div>
        </>
      )}

      <Dialog open={!!editLinkTarget} onOpenChange={() => setEditLinkTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('pdfManagement.editLinkSettingsTitle')}</DialogTitle>
            <DialogDescription>
              {t('pdfManagement.editLinkSettingsDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="space-y-4 rounded-xl border border-stone-200 p-4">
              <div>
                <Label className="mb-2 block">{t('pdfManagement.linkTitle')}</Label>
                <Input
                  value={editLinkForm.internal_title}
                  onChange={(e) => updateEditLinkField('internal_title', e.target.value)}
                  maxLength={140}
                />
              </div>
              <div>
                <Label className="mb-2 block">{t('pdfManagement.internalNote')}</Label>
                <Textarea
                  value={editLinkForm.internal_note}
                  onChange={(e) => updateEditLinkField('internal_note', e.target.value)}
                  maxLength={400}
                  className="min-h-[90px]"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-stone-200 p-4">
              <div>
                <Label className="mb-2 block">{t('pdfManagement.customExpiredUrl')}</Label>
                <Input
                  value={editLinkForm.custom_expired_url}
                  onChange={(e) => updateEditLinkField('custom_expired_url', e.target.value)}
                  placeholder="https://yourwebsite.com/expired"
                />
              </div>
              <div>
                <Label className="mb-2 block">{t('pdfManagement.customExpiredMessage')}</Label>
                <Textarea
                  value={editLinkForm.custom_expired_message}
                  onChange={(e) => updateEditLinkField('custom_expired_message', e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
                <div>
                  <p className="font-semibold text-stone-900">{t('pdfManagement.focusLockTitle')}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {t('pdfManagement.focusLockDescription')}
                  </p>
                </div>
                <Switch
                  checked={editLinkForm.focus_lock_enabled}
                  onCheckedChange={(checked) => updateEditLinkField('focus_lock_enabled', checked)}
                />
              </div>

              <div>
                <Label className="mb-2 block">{t('pdfManagement.idleTimeout')}</Label>
                <Input
                  type="number"
                  min="0"
                  max="86400"
                  value={editLinkForm.idle_timeout_seconds}
                  onChange={(e) => updateEditLinkField('idle_timeout_seconds', Number.parseInt(e.target.value || '0', 10) || 0)}
                />
                <p className="mt-2 text-xs text-stone-500">{t('pdfManagement.idleTimeoutHelp')}</p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
                <div>
                  <p className="font-semibold text-stone-900">{t('pdfManagement.ndaRequiredTitle')}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {t('pdfManagement.ndaRequiredDescription')}
                  </p>
                </div>
                <Switch
                  checked={editLinkForm.nda_required}
                  onCheckedChange={(checked) => updateEditLinkField('nda_required', checked)}
                />
              </div>

                {editLinkForm.nda_required && (
                <div className="grid gap-4">
                  <div>
                    <Label className="mb-2 block">{t('pdfManagement.ndaTitle')}</Label>
                    <Input
                      value={editLinkForm.nda_title}
                      onChange={(e) => updateEditLinkField('nda_title', e.target.value)}
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">{t('pdfManagement.ndaText')}</Label>
                    <Textarea
                      value={editLinkForm.nda_text}
                      onChange={(e) => updateEditLinkField('nda_text', e.target.value)}
                      maxLength={4000}
                      className="min-h-[150px]"
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">{t('pdfManagement.ndaAcceptLabel')}</Label>
                    <Input
                      value={editLinkForm.nda_accept_label}
                      onChange={(e) => updateEditLinkField('nda_accept_label', e.target.value)}
                      maxLength={60}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 p-4">
                <div>
                  <p className="font-semibold text-stone-900">{t('pdfManagement.lockToFirstIpTitle')}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {t('pdfManagement.lockToFirstIpDescription')}
                  </p>
                </div>
                <Switch
                  checked={editLinkForm.lock_to_first_ip}
                  onCheckedChange={(checked) => updateEditLinkField('lock_to_first_ip', checked)}
                />
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-stone-900">{t('pdfManagement.restrictIpsTitle')}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {t('pdfManagement.restrictIpsDescription')}
                    </p>
                  </div>
                  <Switch
                    checked={editLinkForm.restrict_to_specific_ips}
                    onCheckedChange={(checked) => {
                      updateEditLinkField('restrict_to_specific_ips', checked);
                      if (!checked) {
                        updateEditLinkField('allowed_ip_addresses', '');
                      }
                    }}
                  />
                </div>

                {editLinkForm.restrict_to_specific_ips && (
                  <div className="mt-4">
                    <Label className="mb-2 block">{t('pdfManagement.allowedIps')}</Label>
                    <Textarea
                      value={editLinkForm.allowed_ip_addresses}
                      onChange={(e) => updateEditLinkField('allowed_ip_addresses', e.target.value)}
                      placeholder={'203.0.113.10\n198.51.100.24'}
                      className="min-h-[100px]"
                    />
                    <p className="mt-2 text-xs text-stone-500">
                      {t('pdfManagement.allowedIpsHelp')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLinkTarget(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleSaveLinkSettings} className="bg-emerald-900 hover:bg-emerald-800" disabled={savingLinkSettings}>
              {savingLinkSettings ? t('adminSettingsPlans.saving') : t('pdfManagement.saveLinkSettings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pdfs.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pdfs.deleteDesc', { filename: deleteTarget?.filename || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePdf} className="bg-red-600 hover:bg-red-700">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!revokeLinkTarget} onOpenChange={() => setRevokeLinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('links.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('links.revokeDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeLink} className="bg-amber-600 hover:bg-amber-700">
              {t('links.revokeAccess')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteLinkTarget} onOpenChange={() => setDeleteLinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('links.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('links.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLink} className="bg-red-600 hover:bg-red-700">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFolderTarget} onOpenChange={() => setDeleteFolderTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pdfManagement.deleteFolderTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pdfManagement.deleteFolderDescription', {
                name: deleteFolderTarget?.name || '',
                count: deleteFolderTarget ? (folderStats.byFolder[deleteFolderTarget.folder_id]?.pdfCount || 0) : 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder} className="bg-red-600 hover:bg-red-700">
              {t('pdfManagement.deleteFolderAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pdfManagement.renamePdfTitle')}</DialogTitle>
            <DialogDescription>{t('pdfManagement.renamePdfDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{t('pdfManagement.filename')}</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('pdfManagement.filenamePlaceholder')}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>{t('common.cancel')}</Button>
            <Button onClick={handleRename} className="bg-emerald-900 hover:bg-emerald-800">{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameFolderTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameFolderTarget(null);
            setRenameFolderName('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pdfManagement.renameFolderTitle')}</DialogTitle>
            <DialogDescription>{t('pdfManagement.renameFolderDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{t('pdfManagement.folderName')}</Label>
            <Input
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              placeholder={t('pdfManagement.folderNamePlaceholder')}
              className="mt-2"
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameFolderTarget(null);
                setRenameFolderName('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRenameFolder} className="bg-emerald-900 hover:bg-emerald-800">{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pdfManagement.createFolderTitle')}</DialogTitle>
            <DialogDescription>{t('pdfManagement.createFolderDescription')}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>{t('pdfManagement.folderName')}</Label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t('pdfManagement.folderNamePlaceholder')}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolder(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateFolder} className="bg-emerald-900 hover:bg-emerald-800">{t('pdfManagement.createFolderAction')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveTarget} onOpenChange={() => setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pdfManagement.movePdfTitle')}</DialogTitle>
            <DialogDescription>{t('pdfManagement.movePdfDescription', { name: moveTarget?.filename || '' })}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <button
              onClick={() => handleMovePdf(null)}
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <Folder className="w-5 h-5 text-stone-400" />
              <span>{t('pdfManagement.rootNoFolder')}</span>
            </button>
            {sortedFolders.map((folder) => (
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

      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pdfManagement.moveSelectedPdfsTitle')}</DialogTitle>
            <DialogDescription>
              {t('pdfManagement.moveSelectedPdfsDescription', { count: selectedPdfIds.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <button
              onClick={() => handleBulkMove(null)}
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <Folder className="w-5 h-5 text-stone-400" />
              <span>{t('pdfManagement.rootNoFolder')}</span>
            </button>
            {sortedFolders.map((folder) => (
              <button
                key={folder.folder_id}
                onClick={() => handleBulkMove(folder.folder_id)}
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
