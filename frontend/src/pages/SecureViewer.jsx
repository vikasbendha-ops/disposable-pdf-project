import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Clock, AlertTriangle, Lock, FileText, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Button } from '../components/ui/button';

const DEFAULT_BACKEND_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : '';
const ENV_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || '';
const BACKEND_URL = (DEFAULT_BACKEND_URL || ENV_BACKEND_URL).replace(/\/$/, '');
const API = `${BACKEND_URL}/api`;
const VIEWER_HEARTBEAT_INTERVAL_MS = 20000;

// Use a CDN worker so the migration does not depend on legacy CRA public asset placement.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const isSafeAnnotationUrl = (value) => {
  if (!value) return false;
  return !/^javascript:/i.test(String(value).trim());
};

const createViewerSessionId = (token) => {
  if (typeof window === 'undefined') return null;
  const storageKey = `securepdf-viewer-session:${token}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing && /^[a-zA-Z0-9_-]{8,120}$/.test(existing)) {
    return existing;
  }
  const generated = window.crypto?.randomUUID
    ? window.crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
};

const isFullscreenActive = () =>
  Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);

const SecureViewer = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState(null);
  const [error, setError] = useState(null);
  const [remainingTime, setRemainingTime] = useState(null);
  const [watermarks, setWatermarks] = useState([]);
  const [zoom, setZoom] = useState(100);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [renderingPdf, setRenderingPdf] = useState(false);
  const [pageLinks, setPageLinks] = useState([]);
  const [captureShieldActive, setCaptureShieldActive] = useState(false);
  const [viewerLock, setViewerLock] = useState(null);
  const [acceptingNda, setAcceptingNda] = useState(false);
  const [printShieldActive, setPrintShieldActive] = useState(false);
  const timerRef = useRef(null);
  const shieldTimeoutRef = useRef(null);
  const idleTimeoutRef = useRef(null);
  const heartbeatRef = useRef(null);
  const canvasRefs = useRef([]);
  const fetchedRef = useRef(false);
  const viewerRootRef = useRef(null);
  const viewerSessionIdRef = useRef(null);

  const pdfUrl = linkData?.pdf_url ? `${BACKEND_URL}${linkData.pdf_url}` : null;
  const securityOptions = linkData?.security_options || {};
  const focusLockEnabled =
    securityOptions.focus_lock_enabled !== false || Boolean(securityOptions.strict_security_mode);
  const requireFullscreen =
    Boolean(securityOptions.require_fullscreen) || Boolean(securityOptions.strict_security_mode);
  const enhancedWatermark =
    Boolean(securityOptions.enhanced_watermark) || Boolean(securityOptions.strict_security_mode);
  const singleViewerSession =
    Boolean(securityOptions.single_viewer_session) || Boolean(securityOptions.strict_security_mode);

  const ensureViewerSessionId = useCallback(() => {
    if (!viewerSessionIdRef.current) {
      viewerSessionIdRef.current = createViewerSessionId(token);
    }
    return viewerSessionIdRef.current;
  }, [token]);

  const getViewerRequestHeaders = useCallback(() => {
    const viewerSessionId = ensureViewerSessionId();
    return viewerSessionId ? { 'X-Viewer-Session': viewerSessionId } : {};
  }, [ensureViewerSessionId]);

  const requestFullscreen = useCallback(async () => {
    const element = viewerRootRef.current;
    if (!element) return false;
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
        return true;
      }
      if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
        return true;
      }
      if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
        return true;
      }
    } catch (error) {
      console.error('Fullscreen request failed', error);
    }
    return false;
  }, []);

  const canRequestFullscreen = useCallback(() => {
    const element = viewerRootRef.current;
    return Boolean(
      element && (element.requestFullscreen || element.webkitRequestFullscreen || element.msRequestFullscreen),
    );
  }, []);

  const triggerCaptureShield = useCallback((durationMs = 1800) => {
    setCaptureShieldActive(true);
    if (shieldTimeoutRef.current) {
      clearTimeout(shieldTimeoutRef.current);
    }
    shieldTimeoutRef.current = setTimeout(() => {
      setCaptureShieldActive(false);
    }, durationMs);
  }, []);

  const generateWatermarks = useCallback((data) => {
    const positions = [];
    const basicWatermarkText = [
      `Host ${window.location.host}`,
      `IP ${data.ip}`,
      `Link ${String(data.link_id || '').slice(-10)}`,
      `Viewer ${String(data.viewer_session_id || '').slice(0, 12)}`,
      new Date(data.timestamp).toLocaleString(),
    ]
      .filter(Boolean)
      .join(' • ');
    const mode = data?.mode === 'logo' && data?.logo_url
      ? 'logo'
      : data?.mode === 'text' && String(data?.text || '').trim()
        ? 'text'
        : 'basic';
    const watermarkText = mode === 'text' ? String(data.text || '').trim() : basicWatermarkText;
    const rowCount = data.enhanced ? 5 : 4;
    const colCount = data.enhanced ? 4 : 3;
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < colCount; col++) {
        positions.push({
          id: row * colCount + col,
          top: `${10 + row * (data.enhanced ? 18 : 22)}%`,
          left: `${5 + col * (data.enhanced ? 28 : 40)}%`,
          opacity: mode === 'logo' ? (data.enhanced ? 0.14 : 0.1) : (data.enhanced ? 0.18 : 0.14),
          kind: mode,
          text: watermarkText,
          src: data?.logo_url || '',
        });
      }
    }
    setWatermarks(positions);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const activateViewerLock = useCallback((reason, detail = null) => {
    setViewerLock((current) => {
      if (current?.reason === reason) {
        return current;
      }
      if (reason === 'fullscreen') {
        return {
          reason,
          title: 'Fullscreen required',
          message:
            detail || 'This protected link requires fullscreen mode. Re-enter fullscreen to continue viewing.',
          actionLabel: 'Enter fullscreen',
        };
      }
      if (reason === 'print') {
        return {
          reason,
          title: 'Printing blocked',
          message:
            detail || 'Printing is disabled for this protected document. Continue inside the secure viewer only.',
          actionLabel: 'Continue viewing',
        };
      }
      if (reason === 'idle') {
        return {
          reason,
          title: 'Viewer paused',
          message: detail || 'The secure viewer paused after inactivity. Resume to continue reading.',
          actionLabel: 'Resume viewing',
        };
      }
      return {
        reason,
        title: 'Viewer focus required',
        message: detail || 'The secure viewer was hidden when the tab or window lost focus. Resume when you are ready to continue.',
        actionLabel: 'Resume viewing',
      };
    });
  }, []);

  const scheduleIdleTimer = useCallback((overrideSeconds = null) => {
    clearIdleTimer();
    const idleSeconds = Number((overrideSeconds ?? securityOptions.idle_timeout_seconds) || 0);
    if (linkData?.status !== 'active' || !idleSeconds) {
      return;
    }
    idleTimeoutRef.current = setTimeout(() => {
      activateViewerLock('idle', `The secure viewer paused after ${idleSeconds} seconds of inactivity.`);
    }, idleSeconds * 1000);
  }, [activateViewerLock, clearIdleTimer, linkData?.status, securityOptions.idle_timeout_seconds]);

  const fetchLinkData = useCallback(async ({ force = false } = {}) => {
    if (fetchedRef.current && !force) return;
    fetchedRef.current = true;

    try {
      ensureViewerSessionId();
      const response = await axios.get(`${API}/view/${token}`, {
        headers: getViewerRequestHeaders(),
        withCredentials: true,
      });
      const data = response.data;
      
      if (data.status === 'expired' || data.status === 'revoked') {
        if (data.custom_expired_url) {
          window.location.href = data.custom_expired_url;
        } else {
          navigate('/expired', { 
            state: { 
              message: data.custom_expired_message || 'This link has expired',
              status: data.status
            },
            replace: true
          });
        }
        return;
      }

      if (data.status === 'blocked') {
        setError(data.custom_expired_message || 'Access to this document is blocked');
        setLinkData(null);
        setRemainingTime(null);
        setWatermarks([]);
        clearIdleTimer();
        return;
      }

      setError(null);
      setLinkData(data);
      if (data.remaining_seconds !== null && data.remaining_seconds !== undefined) {
        setRemainingTime(data.remaining_seconds);
      } else {
        setRemainingTime(null);
      }
      
      // Generate watermarks
      if (data.status === 'active' && data.watermark_data) {
        generateWatermarks(data.watermark_data);
      } else {
        setWatermarks([]);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Link not found');
      } else if (err.response?.status === 410) {
        navigate('/expired', { replace: true });
      } else {
        setError('Failed to load document');
      }
    } finally {
      setLoading(false);
    }
  }, [clearIdleTimer, ensureViewerSessionId, generateWatermarks, getViewerRequestHeaders, token, navigate]);

  const handleResumeViewer = useCallback(async () => {
    if (viewerLock?.reason === 'fullscreen') {
      const enteredFullscreen = await requestFullscreen();
      if (!enteredFullscreen) {
        activateViewerLock(
          'fullscreen',
          'This browser could not enter fullscreen mode. Open the link in a modern desktop browser or turn off fullscreen for this link.',
        );
        return;
      }
    }
    setViewerLock(null);
    setPrintShieldActive(false);
    scheduleIdleTimer();
  }, [activateViewerLock, requestFullscreen, scheduleIdleTimer, viewerLock?.reason]);

  const handleAcceptNda = useCallback(async () => {
    setAcceptingNda(true);
    try {
      await axios.post(
        `${API}/view/${token}/nda-accept`,
        {},
        {
          headers: getViewerRequestHeaders(),
          withCredentials: true,
        },
      );
      await fetchLinkData({ force: true });
      setViewerLock(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to accept confidentiality acknowledgement');
    } finally {
      setAcceptingNda(false);
    }
  }, [fetchLinkData, getViewerRequestHeaders, token]);

  const sendViewerHeartbeat = useCallback(async ({ silent = false } = {}) => {
    if (!singleViewerSession || !token) return;
    try {
      await axios.post(
        `${API}/view/${token}/heartbeat`,
        {},
        {
          headers: getViewerRequestHeaders(),
          withCredentials: true,
        },
      );
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.detail || 'The secure viewing session is no longer available';
      if ([403, 404, 409, 410].includes(status)) {
        setError(message);
        return;
      }
      if (!silent) {
        console.error('Viewer heartbeat failed', err);
      }
    }
  }, [getViewerRequestHeaders, singleViewerSession, token]);

  useEffect(() => {
    ensureViewerSessionId();
    fetchLinkData();
    
    // Prevent right-click
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);
    
    // Prevent keyboard shortcuts
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 's' || key === 'c' || key === 'p' || key === 'a')) {
        e.preventDefault();
        if (key === 'p') {
          setPrintShieldActive(true);
          activateViewerLock('print');
        }
      }
      const isScreenshotShortcut =
        e.key === 'PrintScreen' ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's'].includes(key));

      if (isScreenshotShortcut) {
        e.preventDefault();
        triggerCaptureShield();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Prevent copy/cut/selection from top document.
    const preventEvent = (e) => e.preventDefault();
    document.addEventListener('copy', preventEvent);
    document.addEventListener('cut', preventEvent);
    document.addEventListener('selectstart', preventEvent);
    document.addEventListener('dragstart', preventEvent);

    // Prevent print dialog for this page.
    const handleBeforePrint = () => {
      setPrintShieldActive(true);
      activateViewerLock('print');
      triggerCaptureShield(2500);
    };
    const handleAfterPrint = () => {
      setPrintShieldActive(false);
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', preventEvent);
      document.removeEventListener('cut', preventEvent);
      document.removeEventListener('selectstart', preventEvent);
      document.removeEventListener('dragstart', preventEvent);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (shieldTimeoutRef.current) {
        clearTimeout(shieldTimeoutRef.current);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      clearIdleTimer();
    };
  }, [activateViewerLock, clearIdleTimer, ensureViewerSessionId, fetchLinkData, triggerCaptureShield]);

  useEffect(() => {
    if (linkData?.status !== 'active') {
      clearIdleTimer();
      return undefined;
    }

    const idleSeconds = Number(securityOptions.idle_timeout_seconds || 0);

    const handleVisibilityChange = () => {
      if (document.hidden && focusLockEnabled) {
        activateViewerLock('focus');
        clearIdleTimer();
        triggerCaptureShield(2500);
      } else if (!document.hidden && !viewerLock) {
        scheduleIdleTimer(idleSeconds);
      }
    };

    const handleWindowBlur = () => {
      if (!focusLockEnabled) return;
      activateViewerLock('focus');
      clearIdleTimer();
      triggerCaptureShield(2500);
    };

    const handleActivity = () => {
      if (document.hidden || viewerLock) return;
      scheduleIdleTimer(idleSeconds);
    };

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (idleSeconds > 0 && !viewerLock) {
      const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];
      activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, true));
      scheduleIdleTimer(idleSeconds);
      return () => {
        window.removeEventListener('blur', handleWindowBlur);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity, true));
        clearIdleTimer();
      };
    }

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    activateViewerLock,
    clearIdleTimer,
    focusLockEnabled,
    linkData?.status,
    scheduleIdleTimer,
    securityOptions.idle_timeout_seconds,
    triggerCaptureShield,
    viewerLock,
  ]);

  useEffect(() => {
    if (linkData?.status !== 'active' || !requireFullscreen || !canRequestFullscreen()) {
      return undefined;
    }

    const handleFullscreenChange = () => {
      if (!isFullscreenActive()) {
        activateViewerLock('fullscreen');
        clearIdleTimer();
        triggerCaptureShield(2500);
        return;
      }

      if (viewerLock?.reason === 'fullscreen') {
        setViewerLock(null);
        scheduleIdleTimer();
      }
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [
    activateViewerLock,
    canRequestFullscreen,
    clearIdleTimer,
    linkData?.status,
    requireFullscreen,
    scheduleIdleTimer,
    triggerCaptureShield,
    viewerLock?.reason,
  ]);

  useEffect(() => {
    if (!singleViewerSession || !['active', 'nda_required'].includes(linkData?.status)) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return undefined;
    }

    void sendViewerHeartbeat({ silent: true });
    heartbeatRef.current = setInterval(() => {
      if (document.hidden) return;
      void sendViewerHeartbeat({ silent: true });
    }, VIEWER_HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [linkData?.status, sendViewerHeartbeat, singleViewerSession]);

  // Countdown timer
  useEffect(() => {
    if (remainingTime === null || remainingTime === undefined) return;
    
    timerRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          navigate('/expired', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [remainingTime !== null, navigate]);

  const formatTime = (seconds) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return {
      days: d.toString().padStart(2, '0'),
      hours: h.toString().padStart(2, '0'),
      minutes: m.toString().padStart(2, '0'),
      seconds: s.toString().padStart(2, '0')
    };
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleResetZoom = () => setZoom(100);
  const handleInternalLinkClick = useCallback((targetPageIndex) => {
    const canvas = canvasRefs.current[targetPageIndex];
    if (canvas) {
      canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (!pdfUrl) return;

    let cancelled = false;
    const loadPdf = async () => {
      setRenderingPdf(true);
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: pdfUrl,
          withCredentials: true,
          httpHeaders: getViewerRequestHeaders(),
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setPdfPageCount(doc.numPages);
        setPageLinks(new Array(doc.numPages).fill(null).map(() => []));
        canvasRefs.current = new Array(doc.numPages);
      } catch (err) {
        console.error('PDF load error:', err);
        if (!cancelled) {
          setError('Failed to load document');
        }
      } finally {
        if (!cancelled) {
          setRenderingPdf(false);
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      setPdfDoc(null);
      setPdfPageCount(0);
      setPageLinks([]);
      canvasRefs.current = [];
    };
  }, [getViewerRequestHeaders, pdfUrl]);

  useEffect(() => {
    if (!pdfDoc || !pdfPageCount) return;

    let cancelled = false;
    const renderPages = async () => {
      setRenderingPdf(true);
      try {
        const scale = 1.35 * (zoom / 100);
        const collectedPageLinks = new Array(pdfPageCount).fill(null).map(() => []);
        for (let pageIndex = 0; pageIndex < pdfPageCount; pageIndex++) {
          if (cancelled) return;

          const page = await pdfDoc.getPage(pageIndex + 1);
          const viewport = page.getViewport({ scale });
          const canvas = canvasRefs.current[pageIndex];
          if (!canvas) continue;

          const context = canvas.getContext('2d', { alpha: false });
          if (!context) continue;

          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
          context.imageSmoothingEnabled = true;

          await page.render({
            canvasContext: context,
            viewport,
            intent: 'display',
          }).promise;

          const annotations = await page.getAnnotations({ intent: 'display' });
          const linkAnnotations = [];
          for (let linkIndex = 0; linkIndex < annotations.length; linkIndex++) {
            const annotation = annotations[linkIndex];
            if (annotation.subtype !== 'Link' || !annotation.rect) {
              continue;
            }

            const rect = pdfjsLib.Util.normalizeRect(annotation.rect);
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);

            let href = annotation.url || annotation.unsafeUrl;
            if (!isSafeAnnotationUrl(href)) {
              href = null;
            }

            let targetPageIndex = null;
            if (!href && annotation.dest) {
              try {
                const destination = Array.isArray(annotation.dest)
                  ? annotation.dest
                  : await pdfDoc.getDestination(annotation.dest);
                if (Array.isArray(destination) && destination[0] !== undefined && destination[0] !== null) {
                  const target = destination[0];
                  if (typeof target === 'number') {
                    targetPageIndex = target;
                  } else {
                    targetPageIndex = await pdfDoc.getPageIndex(target);
                  }
                }
              } catch (linkErr) {
                console.warn('Could not resolve internal PDF link destination', linkErr);
              }
            }

            if (!href && targetPageIndex === null) {
              continue;
            }

            linkAnnotations.push({
              id: `${pageIndex}-${linkIndex}`,
              href,
              targetPageIndex,
              left: Math.min(x1, x2),
              top: Math.min(y1, y2),
              width: Math.abs(x2 - x1),
              height: Math.abs(y2 - y1),
            });
          }

          collectedPageLinks[pageIndex] = linkAnnotations;
        }
        if (!cancelled) {
          setPageLinks(collectedPageLinks);
        }
      } catch (err) {
        console.error('PDF render error:', err);
        if (!cancelled) {
          setError('Failed to render document');
        }
      } finally {
        if (!cancelled) {
          setRenderingPdf(false);
        }
      }
    };

    const raf = requestAnimationFrame(() => {
      renderPages();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [pdfDoc, pdfPageCount, zoom, handleInternalLinkClick]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-500 border-t-transparent mx-auto mb-6"></div>
          <p className="text-stone-300 text-lg">Loading secure document...</p>
          <p className="text-stone-500 text-sm mt-2">Please wait while we verify your access</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
        <div className="bg-stone-800 rounded-2xl shadow-2xl p-10 max-w-md text-center border border-stone-700">
          <div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-white mb-3">Access Error</h1>
          <p className="text-stone-400 mb-8">{error}</p>
          <a href="/" className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  if (linkData?.status === 'nda_required') {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-3xl border border-stone-700 bg-stone-800/95 p-8 shadow-2xl">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600/15">
            <Shield className="h-8 w-8 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-400">Confidential access</p>
          <h1 className="mt-3 text-3xl font-bold text-white">
            {linkData.nda?.title || 'Confidentiality agreement'}
          </h1>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-stone-300">
            {linkData.nda?.text || 'This document contains confidential information. By continuing, you agree to keep it private.'}
          </p>
          <div className="mt-6 grid gap-3 rounded-2xl border border-stone-700 bg-stone-900/50 p-5 text-sm text-stone-400 md:grid-cols-2">
            <p>Copying, printing, and common capture shortcuts stay blocked while this viewer is active.</p>
            <p>Opening the document starts the secure access session and any link timer configured by the owner.</p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleAcceptNda}
              disabled={acceptingNda}
              className="h-12 bg-emerald-600 px-6 text-base hover:bg-emerald-500"
            >
              {acceptingNda ? 'Verifying access...' : (linkData.nda?.accept_label || 'I agree and continue')}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/', { replace: true })}
              className="h-12 border-stone-600 bg-transparent text-stone-200 hover:bg-stone-700"
            >
              Leave viewer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const time = remainingTime !== null ? formatTime(remainingTime) : null;

  return (
    <>
      <div className="secure-viewer-print-blocker">
        <div className="secure-viewer-print-blocker__panel">
          <Shield className="h-10 w-10 text-white" />
          <h1 className="mt-4 text-2xl font-bold text-white">Printing is disabled</h1>
          <p className="mt-3 max-w-xl text-center text-sm leading-6 text-stone-300">
            This protected document can only be viewed inside the secure viewer. Print preview and paper output are blocked.
          </p>
        </div>
      </div>
      <div
        ref={viewerRootRef}
        className="min-h-screen bg-stone-900 secure-viewer flex flex-col"
        data-testid="secure-viewer"
      >
      {(captureShieldActive || printShieldActive) && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center pointer-events-none">
          <p className="text-red-200 text-sm font-medium tracking-wide">
            {printShieldActive
              ? 'Protected content hidden while printing is blocked'
              : 'Protected content hidden during screen capture attempt'}
          </p>
        </div>
      )}

      {viewerLock && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-stone-950/96 p-6">
          <div className="w-full max-w-xl rounded-3xl border border-stone-700 bg-stone-900/90 p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600/15">
              <Shield className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">{viewerLock.title}</h2>
            <p className="mt-3 leading-7 text-stone-300">{viewerLock.message}</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                onClick={handleResumeViewer}
                className="h-12 min-w-[180px] bg-emerald-600 text-base hover:bg-emerald-500"
              >
                {viewerLock.actionLabel || 'Resume viewing'}
              </Button>
              <p className="text-sm text-stone-500">
                {viewerLock?.reason === 'fullscreen'
                  ? 'Fullscreen stays required while this secure session is active.'
                  : 'The document stays hidden until you resume the secure session.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="bg-stone-800 border-b border-stone-700 px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-white text-lg">Secure Document Viewer</h1>
              <p className="text-xs text-stone-400 flex items-center">
                <Lock className="w-3 h-3 mr-1" />
                Protected Content • Copying Disabled
              </p>
            </div>
          </div>
          
          {/* Timer - shows remaining time, and for fixed mode also shows local expiry time */}
          {time && (
            <div className="flex flex-col items-end space-y-1 bg-red-900/30 px-4 py-2 rounded-lg border border-red-800/50">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-red-400 animate-pulse" />
                <span className="text-sm font-medium text-red-300">Expires in:</span>
                <div className="flex items-center space-x-1 font-mono">
                  <div className="flex flex-col items-center">
                    <span className="bg-red-800/50 text-red-200 px-3 py-1.5 rounded font-bold text-lg tabular-nums">{time.days}</span>
                    <span className="text-[10px] uppercase tracking-wide text-red-300/80 mt-1">Days</span>
                  </div>
                  <span className="text-red-400 font-bold text-lg">:</span>
                  <div className="flex flex-col items-center">
                    <span className="bg-red-800/50 text-red-200 px-3 py-1.5 rounded font-bold text-lg tabular-nums">{time.hours}</span>
                    <span className="text-[10px] uppercase tracking-wide text-red-300/80 mt-1">Hr</span>
                  </div>
                  <span className="text-red-400 font-bold text-lg">:</span>
                  <div className="flex flex-col items-center">
                    <span className="bg-red-800/50 text-red-200 px-3 py-1.5 rounded font-bold text-lg tabular-nums">{time.minutes}</span>
                    <span className="text-[10px] uppercase tracking-wide text-red-300/80 mt-1">Min</span>
                  </div>
                  <span className="text-red-400 font-bold text-lg">:</span>
                  <div className="flex flex-col items-center">
                    <span className="bg-red-800/50 text-red-200 px-3 py-1.5 rounded font-bold text-lg tabular-nums timer-digit">{time.seconds}</span>
                    <span className="text-[10px] uppercase tracking-wide text-red-300/80 mt-1">Sec</span>
                  </div>
                </div>
              </div>
              {linkData?.expiry_mode === 'fixed' && linkData?.expires_at && (
                <p className="text-xs text-red-400">
                  Expires: {new Date(linkData.expires_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              className="text-stone-400 hover:text-white hover:bg-stone-700"
              disabled={zoom <= 50}
            >
              <ZoomOut className="w-5 h-5" />
            </Button>
            <span className="text-stone-300 text-sm font-medium min-w-[50px] text-center">{zoom}%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              className="text-stone-400 hover:text-white hover:bg-stone-700"
              disabled={zoom >= 200}
            >
              <ZoomIn className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResetZoom}
              className="text-stone-400 hover:text-white hover:bg-stone-700"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* PDF Viewer Container */}
      <div className="flex-1 overflow-auto p-4 relative" id="pdf-container">
        {/* Watermark Overlay - positioned over PDF */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {watermarks.map((wm) => (
            wm.kind === 'logo' ? (
              <img
                key={wm.id}
                src={wm.src}
                alt=""
                draggable={false}
                className="absolute select-none"
                style={{
                  top: wm.top,
                  left: wm.left,
                  width: enhancedWatermark ? '170px' : '140px',
                  height: 'auto',
                  opacity: wm.opacity,
                  transform: 'rotate(-22deg)',
                  filter: 'grayscale(1) contrast(1.1)',
                  mixBlendMode: 'multiply',
                  userSelect: 'none',
                }}
              />
            ) : (
              <div
                key={wm.id}
                className="absolute select-none font-mono"
                style={{
                  top: wm.top,
                  left: wm.left,
                  maxWidth: enhancedWatermark ? '320px' : '260px',
                  color: wm.kind === 'text' ? 'rgba(6, 78, 59, 0.95)' : 'rgba(15, 23, 42, 0.92)',
                  opacity: wm.opacity,
                  transform: 'rotate(-25deg)',
                  fontSize: wm.kind === 'text' ? (enhancedWatermark ? '14px' : '13px') : (enhancedWatermark ? '12px' : '11px'),
                  fontWeight: wm.kind === 'text' ? 700 : 600,
                  letterSpacing: '0.08em',
                  lineHeight: 1.35,
                  whiteSpace: 'normal',
                  textTransform: wm.kind === 'text' ? 'uppercase' : 'none',
                  mixBlendMode: 'multiply',
                  textShadow: '0 0 1px rgba(255,255,255,0.35)',
                }}
              >
                {wm.text}
              </div>
            )
          ))}
        </div>

        {/* PDF Display (Canvas rendering to avoid selectable text) */}
        <div className="max-w-5xl mx-auto min-h-[600px]">
          {pdfUrl ? (
            <>
              {renderingPdf && pdfPageCount === 0 && (
                <div className="flex flex-col items-center justify-center h-96 text-stone-300">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
                  <p>Rendering secure pages...</p>
                </div>
              )}
              <div className="space-y-6">
                {Array.from({ length: pdfPageCount }).map((_, pageIndex) => (
                  <div
                    key={pageIndex}
                    className="bg-white rounded-lg shadow-2xl overflow-hidden mx-auto w-fit relative"
                  >
                    <canvas
                      ref={(el) => {
                        canvasRefs.current[pageIndex] = el;
                      }}
                      className="block"
                    />
                    <div className="absolute inset-0 pointer-events-none">
                      {(pageLinks[pageIndex] || []).map((link) => (
                        <a
                          key={link.id}
                          href={link.href || '#'}
                          target={link.href ? '_blank' : undefined}
                          rel={link.href ? 'noopener noreferrer' : undefined}
                          className="absolute pointer-events-auto cursor-pointer"
                          style={{
                            left: `${link.left}px`,
                            top: `${link.top}px`,
                            width: `${link.width}px`,
                            height: `${link.height}px`,
                          }}
                          aria-label="PDF link"
                          title={link.href || 'Go to linked section'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!link.href && typeof link.targetPageIndex === 'number') {
                              e.preventDefault();
                              handleInternalLinkClick(link.targetPageIndex);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-96 text-stone-500">
              <FileText className="w-16 h-16 mb-4" />
              <p>Unable to load document</p>
            </div>
          )}
        </div>
      </div>

      {/* Security Notice Footer */}
      <footer className="bg-stone-800 border-t border-stone-700 px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-center space-x-6 text-stone-400 text-sm">
          <span className="flex items-center">
            <Lock className="w-4 h-4 mr-2" />
            Download Disabled
          </span>
          <span className="flex items-center">
            <Shield className="w-4 h-4 mr-2" />
            Copy Protected
          </span>
          <span className="flex items-center">
            <FileText className="w-4 h-4 mr-2" />
            Print Restricted
          </span>
          {requireFullscreen && (
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              Fullscreen Required
            </span>
          )}
          {singleViewerSession && (
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              Single Active Session
            </span>
          )}
        </div>
      </footer>
      </div>
    </>
  );
};

export default SecureViewer;
