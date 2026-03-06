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
const BACKEND_URL = (ENV_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');
const API = `${BACKEND_URL}/api`;

// Use a CDN worker so the migration does not depend on legacy CRA public asset placement.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const isSafeAnnotationUrl = (value) => {
  if (!value) return false;
  return !/^javascript:/i.test(String(value).trim());
};

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
  const timerRef = useRef(null);
  const shieldTimeoutRef = useRef(null);
  const canvasRefs = useRef([]);
  const fetchedRef = useRef(false);

  const pdfUrl = linkData?.pdf_url ? `${BACKEND_URL}${linkData.pdf_url}` : null;

  const triggerCaptureShield = useCallback((durationMs = 1800) => {
    setCaptureShieldActive(true);
    if (shieldTimeoutRef.current) {
      clearTimeout(shieldTimeoutRef.current);
    }
    shieldTimeoutRef.current = setTimeout(() => {
      setCaptureShieldActive(false);
    }, durationMs);
  }, []);

  const fetchLinkData = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    try {
      const response = await axios.get(`${API}/view/${token}`);
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
      
      setLinkData(data);
      if (data.remaining_seconds !== null && data.remaining_seconds !== undefined) {
        setRemainingTime(data.remaining_seconds);
      }
      
      // Generate watermarks
      if (data.watermark_data) {
        generateWatermarks(data.watermark_data);
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
  }, [token, navigate]);

  useEffect(() => {
    fetchLinkData();
    
    // Prevent right-click
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);
    
    // Prevent keyboard shortcuts
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 's' || key === 'c' || key === 'p' || key === 'a')) {
        e.preventDefault();
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
    const handleBeforePrint = (e) => e.preventDefault();
    window.addEventListener('beforeprint', handleBeforePrint);
    
    // Blur on tab switch (deterrent)
    const handleVisibilityChange = () => {
      const viewer = document.getElementById('pdf-container');
      if (viewer) {
        if (document.hidden) {
          viewer.style.filter = 'blur(15px)';
          triggerCaptureShield(2500);
        } else {
          viewer.style.filter = 'none';
        }
      }
    };

    const handleWindowBlur = () => {
      triggerCaptureShield(2500);
    };
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', preventEvent);
      document.removeEventListener('cut', preventEvent);
      document.removeEventListener('selectstart', preventEvent);
      document.removeEventListener('dragstart', preventEvent);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (shieldTimeoutRef.current) {
        clearTimeout(shieldTimeoutRef.current);
      }
    };
  }, [fetchLinkData, triggerCaptureShield]);

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

  const generateWatermarks = (data) => {
    const positions = [];
    const text = `${data.ip} | ${new Date(data.timestamp).toLocaleString()}`;
    // Create a grid of watermarks
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        positions.push({
          id: row * 2 + col,
          top: `${15 + row * 25}%`,
          left: `${10 + col * 55}%`,
          text: text
        });
      }
    }
    setWatermarks(positions);
  };

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
          withCredentials: true
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
  }, [pdfUrl]);

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

  const time = remainingTime !== null ? formatTime(remainingTime) : null;

  return (
    <div className="min-h-screen bg-stone-900 secure-viewer flex flex-col" data-testid="secure-viewer">
      {captureShieldActive && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center pointer-events-none">
          <p className="text-red-200 text-sm font-medium tracking-wide">
            Protected content hidden during screen capture attempt
          </p>
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
            <div 
              key={wm.id}
              className="absolute text-sm font-mono whitespace-nowrap select-none"
              style={{ 
                top: wm.top, 
                left: wm.left,
                color: 'rgba(255, 255, 255, 0.08)',
                transform: 'rotate(-25deg)',
                fontSize: '12px',
                letterSpacing: '1px'
              }}
            >
              {wm.text}
            </div>
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
        </div>
      </footer>
    </div>
  );
};

export default SecureViewer;
