import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, FileBadge, Icon, Loading } from './UI.jsx';
import {
  decodeSmartText,
  detectBufferFormat,
  ensureFileName,
  normalizeBlob,
} from '../lib/file-types.js';
import { sanitizeHtml } from '../lib/sanitize-html.js';
import {
  columnLetter,
  parseDocBinary,
  parseOpenDocument,
  parsePptBinary,
  parsePptx,
  parseRtf,
  parseSpreadsheet,
  parseZipArchive,
  renderMarkdownToHtml,
} from '../lib/document-parsers.js';
import { formatBytes } from '../lib/format.js';

/**
 * Visionneuse intégrée multi-format (plein écran, utilisable en ligne et hors connexion).
 * Prend en charge : PDF, DOCX, DOC, RTF, ODT, PPTX, PPT, ODP, XLSX, XLS, CSV, TSV, ODS,
 * images (JPG, PNG, WEBP, GIF, SVG, BMP), Markdown, HTML, texte/code, audio/vidéo et ZIP.
 */
export default function DocumentViewer({ open, blob, doc, onClose, onDownload }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [detected, setDetected] = useState(null);
  const [buffer, setBuffer] = useState(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [toolbarControls, setToolbarControls] = useState(null);

  const fileName = doc?.file_name || doc?.fileName || doc?.title || 'document';
  const fileType = doc?.file_type || doc?.fileType || '';
  const title = doc?.title || fileName;

  // Fermeture par Échap + verrouillage du défilement d'arrière-plan.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Lecture des octets et détection fiable du format réel.
  useEffect(() => {
    if (!open || !blob) {
      setBuffer(null);
      setDetected(null);
      setToolbarControls(null);
      return undefined;
    }

    let cancelled = false;
    let createdUrl = '';
    setStatus('loading');
    setToolbarControls(null);

    (async () => {
      try {
        const ab = typeof blob.arrayBuffer === 'function'
          ? await blob.arrayBuffer()
          : await new Response(blob).arrayBuffer();
        if (cancelled) return;
        const info = detectBufferFormat(ab, fileName, fileType);
        const typedBlob = normalizeBlob(new Blob([ab], { type: info.mime }), fileName, info.ext);
        createdUrl = URL.createObjectURL(typedBlob);
        setBuffer(ab);
        setDetected(info);
        setObjectUrl(createdUrl);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, blob, fileName, fileType]);

  const handleDownloadClick = useCallback(() => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = ensureFileName(fileName, detected?.ext || fileType, title);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [onDownload, objectUrl, fileName, detected, fileType, title]);

  if (!open) return null;

  return (
    <div className="doc-viewer-overlay" role="dialog" aria-modal="true" aria-label={`Lecture : ${title}`}>
      <header className="doc-viewer-header">
        <div className="doc-viewer-header-main">
          <button
            type="button"
            className="btn btn-outline btn-sm doc-viewer-close"
            onClick={onClose}
            aria-label="Fermer le lecteur"
          >
            <Icon name="chevronLeft" size={18} />
            <span>Fermer</span>
          </button>

          <div className="doc-viewer-title-wrap">
            <FileBadge type={detected?.ext || fileType} />
            <div className="doc-viewer-title-text">
              <div className="doc-viewer-title" title={title}>{title}</div>
              <div className="doc-viewer-subtitle">
                {(detected?.ext || fileType || 'fichier').toUpperCase()}
                {doc?.file_size || doc?.fileSize ? ` · ${formatBytes(doc.file_size || doc.fileSize)}` : ''}
              </div>
            </div>
          </div>

          <div className="doc-viewer-actions">
            <Button size="sm" variant="primary" icon="download" onClick={handleDownloadClick}>
              <span className="hide-xs">Télécharger</span>
            </Button>
          </div>
        </div>

        {toolbarControls && (
          <div className="doc-viewer-subbar">
            {toolbarControls}
          </div>
        )}
      </header>

      <div className="doc-viewer-body">
        {status === 'loading' && <Loading label="Préparation du document…" />}
        {status === 'error' && (
          <FallbackStage
            title="Impossible de lire ce fichier"
            message="Le fichier semble endommagé ou incomplet. Vous pouvez tout de même l'enregistrer sur votre appareil."
            onDownload={handleDownloadClick}
          />
        )}
        {status === 'ready' && detected && (
          <FormatRouter
            detected={detected}
            buffer={buffer}
            objectUrl={objectUrl}
            title={title}
            setToolbar={setToolbarControls}
            onDownload={handleDownloadClick}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Routeur de rendu selon le format réel détecté
// ============================================================================

function FormatRouter({ detected, buffer, objectUrl, title, setToolbar, onDownload }) {
  switch (detected.kind) {
    case 'pdf':
      return <PdfStage buffer={buffer} objectUrl={objectUrl} title={title} setToolbar={setToolbar} onDownload={onDownload} />;
    case 'docx':
      return <DocxStage buffer={buffer} setToolbar={setToolbar} onDownload={onDownload} />;
    case 'doc':
      return <DocBinaryStage buffer={buffer} setToolbar={setToolbar} onDownload={onDownload} />;
    case 'rtf':
    case 'odt':
    case 'html':
    case 'markdown':
      return <RichHtmlStage kind={detected.kind} buffer={buffer} setToolbar={setToolbar} onDownload={onDownload} />;
    case 'pptx':
    case 'ppt':
    case 'odp':
      return <PresentationStage kind={detected.kind} buffer={buffer} setToolbar={setToolbar} onDownload={onDownload} />;
    case 'spreadsheet':
      return <SpreadsheetStage buffer={buffer} ext={detected.ext} setToolbar={setToolbar} onDownload={onDownload} />;
    case 'image':
      return <ImageStage objectUrl={objectUrl} title={title} setToolbar={setToolbar} />;
    case 'text':
      return <TextStage buffer={buffer} ext={detected.ext} setToolbar={setToolbar} />;
    case 'audio':
      return (
        <div className="doc-stage-center">
          <audio controls src={objectUrl} style={{ width: 'min(92vw, 480px)' }}>
            Votre navigateur ne prend pas en charge la lecture audio.
          </audio>
        </div>
      );
    case 'video':
      return (
        <div className="doc-stage-center">
          <video controls src={objectUrl} style={{ maxWidth: '100%', maxHeight: '80dvh', borderRadius: 12 }} />
        </div>
      );
    case 'zip':
      return <ZipStage buffer={buffer} onDownload={onDownload} />;
    default:
      return (
        <FallbackStage
          title="Aperçu direct non disponible pour ce format"
          message="Téléchargez ce fichier pour l'ouvrir avec une application compatible sur votre appareil."
          onDownload={onDownload}
        />
      );
  }
}

// ============================================================================
// 1. PDF (PDF.js sur canevas haute définition + repli natif)
// ============================================================================

function PdfStage({ buffer, objectUrl, title, setToolbar, onDownload }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef(null);
  const pageRefs = useRef([]);
  const [containerWidth, setContainerWidth] = useState(760);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = Math.max(260, el.clientWidth - 28);
      setContainerWidth(w);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    let loadedDoc = null;
    setLoading(true);
    setUseNativeFallback(false);

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (typeof Worker !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        } else if (typeof Worker === 'undefined' && !globalThis.pdfjsWorker) {
          globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
        }

        // Copie le tampon car PDF.js transfère l'ArrayBuffer au Worker.
        const copy = buffer.slice(0);
        const task = pdfjsLib.getDocument({
          data: new Uint8Array(copy),
          isEvalSupported: false,
          useSystemFonts: true,
        });
        loadedDoc = await task.promise;
        if (cancelled) {
          loadedDoc.destroy?.();
          return;
        }
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages || 1);
        setCurrentPage(1);
      } catch {
        if (!cancelled) setUseNativeFallback(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      loadedDoc?.destroy?.();
    };
  }, [buffer]);

  const jumpToPage = useCallback((target) => {
    const clamped = Math.max(1, Math.min(numPages, target));
    setCurrentPage(clamped);
    const node = pageRefs.current[clamped - 1];
    if (node?.scrollIntoView) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [numPages]);

  useEffect(() => {
    if (loading || useNativeFallback || !numPages) {
      setToolbar(null);
      return () => setToolbar(null);
    }
    setToolbar(
      <div className="viewer-controls">
        <div className="viewer-pill-group">
          <button
            type="button"
            className="viewer-ctrl-btn"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Page précédente"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="viewer-indicator">
            Page {currentPage} / {numPages}
          </span>
          <button
            type="button"
            className="viewer-ctrl-btn"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            aria-label="Page suivante"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <ZoomControls zoom={zoom} setZoom={setZoom} />
      </div>
    );
    return () => setToolbar(null);
  }, [loading, useNativeFallback, numPages, currentPage, zoom, jumpToPage, setToolbar]);

  const handleScroll = (e) => {
    const scroller = e.currentTarget;
    const mid = scroller.scrollTop + scroller.clientHeight * 0.35;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (el && el.offsetTop + el.offsetHeight >= mid) {
        if (currentPage !== i + 1) setCurrentPage(i + 1);
        break;
      }
    }
  };

  if (loading) return <Loading label="Chargement du PDF…" />;

  if (useNativeFallback) {
    return (
      <div className="pdf-iframe-wrap">
        <iframe src={objectUrl} title={title} className="pdf-iframe" />
        <div className="pdf-iframe-bar">
          <span>Si le PDF ne s'affiche pas sur votre appareil :</span>
          <Button size="sm" variant="outline" icon="download" onClick={onDownload}>
            Télécharger le PDF
          </Button>
        </div>
      </div>
    );
  }

  const targetWidth = Math.min(920, containerWidth) * zoom;

  return (
    <div className="doc-scroll-area" ref={wrapRef} onScroll={handleScroll}>
      <div className="pdf-pages-stack">
        {Array.from({ length: numPages }, (_, idx) => (
          <div
            key={idx + 1}
            ref={(el) => { pageRefs.current[idx] = el; }}
            className="pdf-page-slot"
          >
            <PdfCanvasPage pdfDoc={pdfDoc} pageNumber={idx + 1} targetWidth={targetWidth} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PdfCanvasPage({ pdfDoc, pageNumber, targetWidth }) {
  const canvasRef = useRef(null);
  const slotRef = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined' || pageNumber <= 2);
  const [aspect, setAspect] = useState(1.414);

  useEffect(() => {
    if (visible || typeof IntersectionObserver === 'undefined') return undefined;
    const el = slotRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '900px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !pdfDoc || !canvasRef.current) return undefined;
    let cancelled = false;
    let renderTask = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        if (baseVp.width > 0 && baseVp.height > 0) {
          setAspect(baseVp.height / baseVp.width);
        }
        const cssScale = Math.max(0.25, targetWidth / (baseVp.width || 595));
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.2);
        const vp = page.getViewport({ scale: cssScale * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${Math.floor(baseVp.width * cssScale)}px`;
        canvas.style.height = `${Math.floor(baseVp.height * cssScale)}px`;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({ canvasContext: ctx, viewport: vp });
        await renderTask.promise;
      } catch {
        /* Rendu annulé lors d'un changement rapide de zoom */
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [visible, pdfDoc, pageNumber, targetWidth]);

  return (
    <div
      ref={slotRef}
      className="pdf-page-card"
      style={{
        width: `${Math.floor(targetWidth)}px`,
        minHeight: visible ? undefined : `${Math.floor(targetWidth * aspect)}px`,
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

// ============================================================================
// 2. WORD .docx (Mise en page fidèle + Mode lecture mobile adaptable)
// ============================================================================

function DocxStage({ buffer, setToolbar, onDownload }) {
  const [layoutMode, setLayoutMode] = useState('page'); // 'page' | 'flow'
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const [rendering, setRendering] = useState(true);
  const outerRef = useRef(null);
  const hostRef = useRef(null);
  const [availWidth, setAvailWidth] = useState(800);
  const [naturalDims, setNaturalDims] = useState({ width: 794, height: 1123 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return undefined;
    const measure = () => setAvailWidth(Math.max(280, el.clientWidth - 24));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setError(false);

    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = '';
        const isFlow = layoutMode === 'flow';
        await renderAsync(buffer.slice(0), hostRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: isFlow,
          ignoreHeight: isFlow,
          breakPages: !isFlow,
          ignoreLastRenderedPageBreak: isFlow,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
        });
        if (cancelled || !hostRef.current) return;

        // Mesure les dimensions réelles du document généré pour la mise à l'échelle mobile.
        const measureDoc = () => {
          const host = hostRef.current;
          if (!host) return;
          const wrapper = host.querySelector('.docx-wrapper') || host;
          const sections = host.querySelectorAll('section.docx');
          let maxW = 0;
          sections.forEach((s) => {
            if (s.offsetWidth > maxW) maxW = s.offsetWidth;
          });
          const w = Math.max(maxW || wrapper.scrollWidth || 794, 320);
          const h = Math.max(wrapper.scrollHeight || host.scrollHeight || 600, 200);
          setNaturalDims({ width: w, height: h });
        };

        measureDoc();
        hostRef.current.querySelectorAll('img').forEach((img) => {
          img.addEventListener('load', measureDoc, { once: true });
        });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buffer, layoutMode]);

  useEffect(() => {
    if (error) {
      setToolbar(null);
      return () => setToolbar(null);
    }
    setToolbar(
      <div className="viewer-controls">
        <div className="viewer-segmented" role="tablist" aria-label="Mode d'affichage Word">
          <button
            type="button"
            role="tab"
            aria-selected={layoutMode === 'page'}
            className={layoutMode === 'page' ? 'active' : ''}
            onClick={() => { setLayoutMode('page'); setZoom(1); }}
          >
            Mise en page
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layoutMode === 'flow'}
            className={layoutMode === 'flow' ? 'active' : ''}
            onClick={() => { setLayoutMode('flow'); setZoom(1); }}
          >
            Mode lecture
          </button>
        </div>

        <ZoomControls zoom={zoom} setZoom={setZoom} />
      </div>
    );
    return () => setToolbar(null);
  }, [layoutMode, zoom, error, setToolbar]);

  if (error) {
    return (
      <FallbackStage
        title="Impossible d'afficher la mise en page de ce document Word"
        message="Vous pouvez le télécharger pour l'ouvrir dans votre application bureautique."
        onDownload={onDownload}
      />
    );
  }

  const fitScale = layoutMode === 'page' ? Math.min(1, availWidth / (naturalDims.width + 24)) : 1;
  const effectiveScale = layoutMode === 'page' ? fitScale * zoom : 1;
  const scaledW = Math.round((naturalDims.width + 24) * effectiveScale);
  const scaledH = Math.round(naturalDims.height * effectiveScale);

  return (
    <div className="doc-scroll-area" ref={outerRef}>
      {rendering && <Loading label="Mise en page du document Word…" />}
      {layoutMode === 'page' ? (
        <div
          className="docx-scale-frame"
          style={{
            width: `${scaledW}px`,
            height: rendering ? 'auto' : `${scaledH}px`,
          }}
        >
          <div
            ref={hostRef}
            className="docx-paper-host docx-paged"
            style={{
              width: `${naturalDims.width + 24}px`,
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      ) : (
        <div
          ref={hostRef}
          className="docx-paper-host docx-flow"
          style={{ fontSize: `${Math.round(zoom * 100)}%` }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 3. WORD 97-2003 (.doc binaire OLE2)
// ============================================================================

function DocBinaryStage({ buffer, setToolbar, onDownload }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    parseDocBinary(buffer)
      .then((res) => {
        if (!cancelled) {
          if (!res.blocks.length && !res.images.length) setError(true);
          else setData(res);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [buffer]);

  useEffect(() => {
    if (!data || error) {
      setToolbar(null);
      return () => setToolbar(null);
    }
    setToolbar(
      <div className="viewer-controls">
        <ZoomControls zoom={zoom} setZoom={setZoom} />
      </div>
    );
    return () => setToolbar(null);
  }, [data, error, zoom, setToolbar]);

  if (loading) return <Loading label="Lecture du document Word…" />;
  if (error || !data) {
    return (
      <FallbackStage
        title="Ce document Word ancien (.doc) ne peut pas être affiché directement"
        message="Enregistrez-le sur votre appareil pour l'ouvrir."
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="doc-scroll-area">
      <article className="rich-paper" style={{ fontSize: `${Math.round(zoom * 100)}%` }}>
        {data.blocks.map((b, idx) => renderDocBlock(b, idx))}

        {data.images.length > 0 && (
          <div className="doc-embedded-images">
            {data.images.map((src, idx) => (
              <img key={idx} src={src} alt={`Illustration ${idx + 1}`} />
            ))}
          </div>
        )}

        {data.footnotes.length > 0 && (
          <footer className="doc-footnotes">
            <hr />
            <h4>Notes de bas de page</h4>
            {data.footnotes.map((b, idx) => renderDocBlock(b, `fn-${idx}`))}
          </footer>
        )}
      </article>
    </div>
  );
}

function renderDocBlock(block, key) {
  if (block.type === 'heading') {
    const Tag = block.level === 2 ? 'h2' : 'h3';
    return <Tag key={key}>{block.text}</Tag>;
  }
  if (block.type === 'bullet') {
    return (
      <p key={key} className="doc-bullet-item">
        <span aria-hidden="true">•</span>
        <span>{block.text}</span>
      </p>
    );
  }
  if (block.type === 'hr') {
    return <hr key={key} />;
  }
  if (block.type === 'table') {
    return (
      <div key={key} className="rich-table-scroll">
        <table>
          <tbody>
            {block.rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p key={key}>{block.text}</p>;
}

// ============================================================================
// 4. DOCUMENTS RICHES HTML (RTF, ODT, HTML, Markdown)
// ============================================================================

function RichHtmlStage({ kind, buffer, setToolbar, onDownload }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const task =
      kind === 'rtf'
        ? Promise.resolve().then(() => parseRtf(buffer))
        : kind === 'odt'
          ? parseOpenDocument(buffer, 'odt')
          : kind === 'markdown'
            ? Promise.resolve().then(() => renderMarkdownToHtml(decodeSmartText(buffer)))
            : Promise.resolve().then(() => sanitizeHtml(decodeSmartText(buffer)));

    task
      .then((res) => {
        if (!cancelled) {
          if (!res || !res.trim()) setError(true);
          else setHtml(res);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [kind, buffer]);

  useEffect(() => {
    if (!html || error) {
      setToolbar(null);
      return () => setToolbar(null);
    }
    setToolbar(
      <div className="viewer-controls">
        <ZoomControls zoom={zoom} setZoom={setZoom} />
      </div>
    );
    return () => setToolbar(null);
  }, [html, error, zoom, setToolbar]);

  if (loading) return <Loading label="Ouverture du document…" />;
  if (error) {
    return (
      <FallbackStage
        title="Document vide ou non pris en charge"
        message="Téléchargez le fichier sur votre appareil pour le consulter."
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="doc-scroll-area">
      <article
        className="rich-paper"
        style={{ fontSize: `${Math.round(zoom * 100)}%` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ============================================================================
// 5. PRÉSENTATIONS : .pptx, .ppt, .odp
// ============================================================================

function PresentationStage({ kind, buffer, setToolbar, onDownload }) {
  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'all'
  const [showNotes, setShowNotes] = useState(false);
  const stageWrapRef = useRef(null);
  const [availWidth, setAvailWidth] = useState(800);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return undefined;
    const measure = () => setAvailWidth(Math.max(260, el.clientWidth - 28));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const task =
      kind === 'pptx'
        ? parsePptx(buffer)
        : kind === 'ppt'
          ? parsePptBinary(buffer)
          : parseOpenDocument(buffer, 'odp');

    task
      .then((res) => {
        if (!cancelled) {
          if (!res || !Array.isArray(res.slides) || res.slides.length === 0) setError(true);
          else {
            setDeck(res);
            setCurrent(0);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [kind, buffer]);

  // Navigation clavier (flèches gauche / droite)
  useEffect(() => {
    if (!deck || viewMode !== 'single') return undefined;
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setCurrent((c) => Math.min(deck.slides.length - 1, c + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrent((c) => Math.max(0, c - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deck, viewMode]);

  useEffect(() => {
    if (!deck || error) {
      setToolbar(null);
      return () => setToolbar(null);
    }
    const total = deck.slides.length;
    const activeSlide = deck.slides[current];
    const hasNotes = Boolean(activeSlide?.note && activeSlide.note.replace(/<[^>]*>/g, '').trim());

    setToolbar(
      <div className="viewer-controls">
        <div className="viewer-segmented" role="tablist" aria-label="Mode présentation">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'single'}
            className={viewMode === 'single' ? 'active' : ''}
            onClick={() => setViewMode('single')}
          >
            Diapositive
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'all'}
            className={viewMode === 'all' ? 'active' : ''}
            onClick={() => setViewMode('all')}
          >
            Toutes ({total})
          </button>
        </div>

        {viewMode === 'single' && (
          <div className="viewer-pill-group">
            <button
              type="button"
              className="viewer-ctrl-btn"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current <= 0}
              aria-label="Diapositive précédente"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className="viewer-indicator">
              {current + 1} / {total}
            </span>
            <button
              type="button"
              className="viewer-ctrl-btn"
              onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
              disabled={current >= total - 1}
              aria-label="Diapositive suivante"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        )}

        {viewMode === 'single' && hasNotes && (
          <button
            type="button"
            className={`viewer-chip-toggle ${showNotes ? 'active' : ''}`}
            onClick={() => setShowNotes((v) => !v)}
          >
            Notes
          </button>
        )}
      </div>
    );
    return () => setToolbar(null);
  }, [deck, error, current, viewMode, showNotes, setToolbar]);

  if (loading) return <Loading label="Chargement de la présentation…" />;
  if (error || !deck) {
    return (
      <FallbackStage
        title="Impossible d'afficher cette présentation"
        message="Téléchargez le fichier pour l'ouvrir sur votre appareil."
        onDownload={onDownload}
      />
    );
  }

  const slideW = deck.width || 960;
  const slideH = deck.height || 540;
  const renderWidth = Math.min(960, availWidth);
  const scale = renderWidth / slideW;

  if (viewMode === 'all') {
    return (
      <div className="doc-scroll-area" ref={stageWrapRef}>
        <div className="slides-stack">
          {deck.slides.map((s) => (
            <div key={s.index} className="slide-card-item">
              <div className="slide-card-num">Diapositive {s.index} / {deck.slides.length}</div>
              <SlideFrame slide={s} slideW={slideW} slideH={slideH} scale={scale} />
              {s.note && s.note.replace(/<[^>]*>/g, '').trim() && (
                <div className="slide-notes-box" dangerouslySetInnerHTML={{ __html: s.note }} />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const activeSlide = deck.slides[current];
  return (
    <div className="doc-scroll-area" ref={stageWrapRef}>
      <div className="slide-single-wrap">
        <SlideFrame slide={activeSlide} slideW={slideW} slideH={slideH} scale={scale} />

        {deck.slides.length > 1 && (
          <div className="slide-QuickNav">
            <Button
              size="sm"
              variant="outline"
              icon="chevronLeft"
              disabled={current <= 0}
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            >
              Précédente
            </Button>
            <span className="text-sm text-secondary">
              Diapositive {current + 1} sur {deck.slides.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrent((c) => Math.min(deck.slides.length - 1, c + 1))}
              disabled={current >= deck.slides.length - 1}
            >
              Suivante
              <Icon name="chevronRight" size={16} />
            </Button>
          </div>
        )}

        {showNotes && activeSlide?.note && (
          <div className="slide-notes-box" dangerouslySetInnerHTML={{ __html: activeSlide.note }} />
        )}
      </div>
    </div>
  );
}

function SlideFrame({ slide, slideW, slideH, scale }) {
  if (!slide) return null;

  if (slide.mode === 'structured') {
    return (
      <div className="slide-structured-card" style={{ maxWidth: `${Math.round(slideW * scale)}px` }}>
        <h3>{slide.title}</h3>
        {slide.bullets?.length > 0 && (
          <ul>
            {slide.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        {slide.images?.length > 0 && (
          <div className="slide-structured-imgs">
            {slide.images.map((src, i) => (
              <img key={i} src={src} alt="" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const bgStyle = resolveSlideFillStyle(slide.fill);
  const allElements = [
    ...(slide.layoutElements || []),
    ...(slide.elements || []),
  ];

  return (
    <div
      className="slide-viewport"
      style={{
        width: `${Math.round(slideW * scale)}px`,
        height: `${Math.round(slideH * scale)}px`,
      }}
    >
      <div
        className="slide-canvas"
        style={{
          width: `${slideW}px`,
          height: `${slideH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          ...bgStyle,
        }}
      >
        {allElements.map((el, idx) => (
          <SlideElement key={el.id || idx} el={el} />
        ))}
      </div>
    </div>
  );
}

function resolveSlideFillStyle(fill) {
  if (!fill) return { backgroundColor: '#ffffff' };
  if (typeof fill === 'string') return { backgroundColor: fill || '#ffffff' };
  if (fill.type === 'color') {
    return { backgroundColor: fill.value || '#ffffff' };
  }
  if (fill.type === 'image') {
    const src = fill.value?.base64 || fill.value?.blob;
    if (src) {
      return {
        backgroundImage: `url("${src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
  }
  if (fill.type === 'gradient' && Array.isArray(fill.value?.colors) && fill.value.colors.length > 0) {
    const stops = fill.value.colors.map((c) => `${c.color} ${c.pos || ''}`.trim()).join(', ');
    const angle = Number.isFinite(fill.value.rot) ? (fill.value.rot + 90) % 360 : 180;
    return { background: `linear-gradient(${angle}deg, ${stops})` };
  }
  if (fill.type === 'pattern') {
    return { backgroundColor: fill.value?.backgroundColor || '#ffffff' };
  }
  return { backgroundColor: '#ffffff' };
}

function SlideElement({ el }) {
  if (!el) return null;
  const transforms = [];
  if (el.rotate) transforms.push(`rotate(${el.rotate}deg)`);
  if (el.isFlipH) transforms.push('scaleX(-1)');
  if (el.isFlipV) transforms.push('scaleY(-1)');

  const boxStyle = {
    position: 'absolute',
    left: `${el.left || 0}px`,
    top: `${el.top || 0}px`,
    width: `${Math.max(1, el.width || 0)}px`,
    height: `${Math.max(1, el.height || 0)}px`,
    transform: transforms.length ? transforms.join(' ') : undefined,
  };

  if (el.type === 'group') {
    return (
      <div style={boxStyle}>
        {(el.elements || []).map((child, i) => (
          <SlideElement key={child.id || i} el={child} />
        ))}
      </div>
    );
  }

  if (el.type === 'diagram') {
    if (Array.isArray(el.elements) && el.elements.length > 0) {
      return (
        <div style={boxStyle}>
          {el.elements.map((child, i) => (
            <SlideElement key={child.id || i} el={child} />
          ))}
        </div>
      );
    }
    return (
      <div style={{ ...boxStyle, padding: 8, overflow: 'hidden', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(el.textList || []).map((t, i) => (
          <div key={i} style={{ padding: '6px 10px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 13, color: '#1e293b' }}>
            {t}
          </div>
        ))}
      </div>
    );
  }

  if (el.type === 'image') {
    const src = el.base64 || el.blob;
    if (!src) return null;
    return (
      <div
        style={{
          ...boxStyle,
          overflow: 'hidden',
          border: el.borderWidth ? `${el.borderWidth}px ${el.borderType || 'solid'} ${el.borderColor || 'transparent'}` : undefined,
        }}
      >
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  if (el.type === 'math') {
    const src = el.picBase64 || el.picBlob;
    if (src) {
      return (
        <div style={boxStyle}>
          <img src={src} alt={el.latex || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      );
    }
    return (
      <div style={{ ...boxStyle, display: 'flex', alignItems: 'center', fontFamily: 'serif', fontStyle: 'italic', color: '#111827' }}>
        {el.text || el.latex || ''}
      </div>
    );
  }

  if (el.type === 'table') {
    const totalColW = (el.colWidths || []).reduce((a, b) => a + (b || 0), 0);
    return (
      <div style={{ ...boxStyle, overflow: 'hidden' }}>
        <table className="slide-table">
          {totalColW > 0 && (
            <colgroup>
              {el.colWidths.map((cw, i) => (
                <col key={i} style={{ width: `${((cw || 0) / totalColW) * 100}%` }} />
              ))}
            </colgroup>
          )}
          <tbody>
            {(el.data || []).map((row, rIdx) => (
              <tr key={rIdx} style={el.rowHeights?.[rIdx] ? { height: `${el.rowHeights[rIdx]}px` } : undefined}>
                {row.map((cell, cIdx) => {
                  if (!cell || cell.vMerge || cell.hMerge) return null;
                  const b = cell.borders || {};
                  const borderSide = (side) =>
                    side && side.borderWidth
                      ? `${side.borderWidth}px ${side.borderType || 'solid'} ${side.borderColor || '#cbd5e1'}`
                      : '1px solid #cbd5e1';
                  return (
                    <td
                      key={cIdx}
                      rowSpan={cell.rowSpan || 1}
                      colSpan={cell.colSpan || 1}
                      style={{
                        backgroundColor: cell.fillColor || 'transparent',
                        color: cell.fontColor || '#111827',
                        fontWeight: cell.fontBold ? 700 : undefined,
                        verticalAlign: cell.vAlign === 'mid' ? 'middle' : cell.vAlign === 'down' ? 'bottom' : 'top',
                        borderTop: borderSide(b.top),
                        borderBottom: borderSide(b.bottom),
                        borderLeft: borderSide(b.left),
                        borderRight: borderSide(b.right),
                        padding: '4px 6px',
                      }}
                      dangerouslySetInnerHTML={{ __html: cell.text || '' }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (el.type === 'chart') {
    return <SlideChart el={el} boxStyle={boxStyle} />;
  }

  if (el.type === 'video' && el.blob) {
    return (
      <div style={boxStyle}>
        <video controls src={el.blob} style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }

  if (el.type === 'audio' && el.blob) {
    return (
      <div style={{ ...boxStyle, display: 'flex', alignItems: 'center' }}>
        <audio controls src={el.blob} style={{ width: '100%' }} />
      </div>
    );
  }

  // Formes ('shape') et zones de texte ('text')
  const vJustify = el.vAlign === 'mid' ? 'center' : el.vAlign === 'down' || el.vAlign === 'btm' ? 'flex-end' : 'flex-start';
  const inset = el.textInset || {};
  const fillBg = el.fill && el.fill.type === 'color' && el.fill.value ? el.fill.value : 'transparent';

  return (
    <div
      className="slide-shape-box"
      style={{
        ...boxStyle,
        backgroundColor: el.path ? 'transparent' : fillBg,
        border: !el.path && el.borderWidth
          ? `${el.borderWidth}px ${el.borderType || 'solid'} ${el.borderColor || 'transparent'}`
          : undefined,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: vJustify,
        paddingTop: inset.t ?? 4,
        paddingBottom: inset.b ?? 4,
        paddingLeft: inset.l ?? 7,
        paddingRight: inset.r ?? 7,
      }}
    >
      {el.path && (
        <svg
          aria-hidden="true"
          viewBox={
            el.pathViewBox
              ? `${el.pathViewBox.x || 0} ${el.pathViewBox.y || 0} ${el.pathViewBox.width || el.width || 100} ${el.pathViewBox.height || el.height || 100}`
              : `0 0 ${Math.max(1, el.width || 100)} ${Math.max(1, el.height || 100)}`
          }
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          <path
            d={el.path}
            fill={el.strokeOnly ? 'none' : fillBg || 'none'}
            stroke={el.borderColor || (el.strokeOnly ? '#334155' : 'none')}
            strokeWidth={el.borderWidth || (el.strokeOnly ? 1.5 : 0)}
            strokeDasharray={el.borderStrokeDasharray || undefined}
          />
        </svg>
      )}
      {el.content && (
        <div
          className="slide-rich-text"
          style={{ position: 'relative', zIndex: 1 }}
          dangerouslySetInnerHTML={{ __html: el.content }}
        />
      )}
    </div>
  );
}

function SlideChart({ el, boxStyle }) {
  const series = Array.isArray(el.data) ? el.data : [];
  const firstSeries = series[0];
  if (!firstSeries || !Array.isArray(firstSeries.values) || firstSeries.values.length === 0) {
    return null;
  }
  const values = firstSeries.values;
  const maxVal = Math.max(1, ...values.map((v) => Math.abs(Number(v.y) || 0)));
  const colors = el.colors?.length ? el.colors : ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0891b2'];

  return (
    <div style={{ ...boxStyle, background: 'rgba(255,255,255,0.92)', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column' }}>
      {firstSeries.key && (
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{firstSeries.key}</div>
      )}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 0 }}>
        {values.slice(0, 16).map((pt, idx) => {
          const pct = Math.max(4, Math.round((Math.abs(Number(pt.y) || 0) / maxVal) * 100));
          const label = firstSeries.xlabels?.[pt.x] ?? pt.x;
          return (
            <div key={idx} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>{pt.y}</div>
              <div style={{ width: '72%', height: `${pct}%`, background: colors[idx % colors.length], borderRadius: '4px 4px 0 0' }} />
              <div style={{ fontSize: 10, color: '#334155', marginTop: 3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 6. TABLEURS : .xlsx, .xls, .ods, .csv, .tsv
// ============================================================================

const SHEET_PAGE_ROWS = 250;

function SpreadsheetStage({ buffer, ext, setToolbar, onDownload }) {
  const [wb, setWb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [query, setQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(SHEET_PAGE_ROWS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    parseSpreadsheet(buffer, ext)
      .then((res) => {
        if (!cancelled) {
          setWb(res);
          setSheetIdx(0);
          setVisibleLimit(SHEET_PAGE_ROWS);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [buffer, ext]);

  const activeSheet = wb?.sheets?.[sheetIdx] || null;

  const filteredRows = useMemo(() => {
    if (!activeSheet) return [];
    const q = query.trim().toLowerCase();
    if (!q) return activeSheet.rows.map((cells, idx) => ({ num: idx + 1, cells }));
    return activeSheet.rows
      .map((cells, idx) => ({ num: idx + 1, cells }))
      .filter(({ cells }) => cells.some((c) => !c.skip && String(c.text || '').toLowerCase().includes(q)));
  }, [activeSheet, query]);

  useEffect(() => {
    if (!wb || error) {
      setToolbar(null);
      return () => setToolbar(null);
    }
    setToolbar(
      <div className="viewer-controls viewer-controls-sheet">
        {wb.sheets.length > 1 && (
          <div className="sheet-tabs" role="tablist" aria-label="Feuilles du classeur">
            {wb.sheets.map((s, idx) => (
              <button
                key={s.name + idx}
                type="button"
                role="tab"
                aria-selected={sheetIdx === idx}
                className={`sheet-tab ${sheetIdx === idx ? 'active' : ''}`}
                onClick={() => { setSheetIdx(idx); setVisibleLimit(SHEET_PAGE_ROWS); }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="sheet-search-box">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisibleLimit(SHEET_PAGE_ROWS); }}
            placeholder="Filtrer les lignes…"
            aria-label="Filtrer les lignes du tableau"
          />
        </div>

        {activeSheet && (
          <span className="viewer-indicator">
            {filteredRows.length} ligne{filteredRows.length > 1 ? 's' : ''} · {activeSheet.colCount} col.
          </span>
        )}
      </div>
    );
    return () => setToolbar(null);
  }, [wb, error, sheetIdx, query, activeSheet, filteredRows.length, setToolbar]);

  if (loading) return <Loading label="Ouverture du tableau…" />;
  if (error || !wb || wb.sheets.length === 0) {
    return (
      <FallbackStage
        title="Impossible de lire ce classeur"
        message="Téléchargez le fichier sur votre appareil pour l'ouvrir dans Excel ou LibreOffice."
        onDownload={onDownload}
      />
    );
  }

  if (!activeSheet || activeSheet.rows.length === 0 || activeSheet.colCount === 0) {
    return (
      <div className="doc-stage-center">
        <p className="text-secondary">Cette feuille est vide.</p>
      </div>
    );
  }

  const isFiltering = Boolean(query.trim());
  const slice = filteredRows.slice(0, visibleLimit);

  return (
    <div className="sheet-stage-wrap">
      <div className="sheet-scroll">
        <table className="sheet-grid">
          <thead>
            <tr>
              <th className="sheet-corner">#</th>
              {Array.from({ length: activeSheet.colCount }, (_, c) => (
                <th
                  key={c}
                  style={activeSheet.colWidths?.[c] ? { minWidth: `${activeSheet.colWidths[c]}px` } : undefined}
                >
                  {columnLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(({ num, cells }) => (
              <tr key={num}>
                <td className="sheet-rownum">{num}</td>
                {cells.map((cell, cIdx) => {
                  if (!isFiltering && cell.skip) return null;
                  return (
                    <td
                      key={cIdx}
                      rowSpan={!isFiltering && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      colSpan={!isFiltering && cell.colSpan > 1 ? cell.colSpan : undefined}
                      className={cell.align === 'right' ? 'num' : cell.align === 'center' ? 'center' : ''}
                    >
                      {cell.text || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredRows.length > visibleLimit && (
        <div className="sheet-more-bar">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setVisibleLimit((v) => v + SHEET_PAGE_ROWS)}
          >
            Afficher plus de lignes ({visibleLimit} / {filteredRows.length})
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. IMAGES : Zoom + Rotation 90° (pratique pour les photos de tableau / TD)
// ============================================================================

function ImageStage({ objectUrl, title, setToolbar }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    setToolbar(
      <div className="viewer-controls">
        <ZoomControls zoom={zoom} setZoom={setZoom} />
        <button
          type="button"
          className="viewer-chip-toggle"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          title="Pivoter l'image de 90°"
        >
          <Icon name="rotate" size={15} />
          <span>Pivoter</span>
        </button>
      </div>
    );
    return () => setToolbar(null);
  }, [zoom, setToolbar]);

  return (
    <div className="doc-scroll-area image-stage-scroll">
      <div className="image-stage-inner">
        <img
          src={objectUrl}
          alt={title}
          style={{
            maxWidth: zoom === 1 ? '100%' : 'none',
            maxHeight: zoom === 1 ? 'calc(100dvh - 150px)' : 'none',
            width: zoom === 1 ? 'auto' : `${Math.round(zoom * 100)}%`,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 8. TEXTE BRUT / CODE / JSON / XML & ARCHIVES ZIP
// ============================================================================

function TextStage({ buffer, ext, setToolbar }) {
  const [zoom, setZoom] = useState(1);
  const text = useMemo(() => {
    const raw = decodeSmartText(buffer);
    if (ext === 'json') {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    }
    return raw;
  }, [buffer, ext]);

  useEffect(() => {
    setToolbar(
      <div className="viewer-controls">
        <ZoomControls zoom={zoom} setZoom={setZoom} />
      </div>
    );
    return () => setToolbar(null);
  }, [zoom, setToolbar]);

  const isCodeLike = ['json', 'xml', 'log'].includes(ext);

  return (
    <div className="doc-scroll-area">
      <div className="rich-paper" style={{ fontSize: `${Math.round(zoom * 100)}%` }}>
        <pre className={`text-stage-pre ${isCodeLike ? 'code' : ''}`}>{text}</pre>
      </div>
    </div>
  );
}

function ZipStage({ buffer, onDownload }) {
  const [files, setFiles] = useState(null);

  useEffect(() => {
    parseZipArchive(buffer)
      .then((res) => setFiles(res.files || []))
      .catch(() => setFiles([]));
  }, [buffer]);

  if (!files) return <Loading label="Lecture de l'archive…" />;

  return (
    <div className="doc-scroll-area">
      <div className="rich-paper">
        <h3>Contenu de l'archive ({files.length} fichier{files.length > 1 ? 's' : ''})</h3>
        {files.length === 0 ? (
          <p className="text-secondary">Archive vide ou chiffrée.</p>
        ) : (
          <ul className="zip-file-list">
            {files.map((f) => (
              <li key={f.name}>
                <span>{f.name}</span>
                {f.size != null && <small>{formatBytes(f.size)}</small>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">
          <Button icon="download" onClick={onDownload}>Télécharger l'archive</Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Composants utilitaires de barre d'outils & repli
// ============================================================================

function ZoomControls({ zoom, setZoom }) {
  const stepDown = () => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100));
  const stepUp = () => setZoom((z) => Math.min(2.5, Math.round((z + 0.15) * 100) / 100));

  return (
    <div className="viewer-pill-group">
      <button
        type="button"
        className="viewer-ctrl-btn"
        onClick={stepDown}
        disabled={zoom <= 0.5}
        aria-label="Réduire le zoom"
      >
        <Icon name="zoomOut" size={16} />
      </button>
      <button
        type="button"
        className="viewer-zoom-reset"
        onClick={() => setZoom(1)}
        title="Réinitialiser le zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className="viewer-ctrl-btn"
        onClick={stepUp}
        disabled={zoom >= 2.5}
        aria-label="Augmenter le zoom"
      >
        <Icon name="zoomIn" size={16} />
      </button>
    </div>
  );
}

function FallbackStage({ title, message, onDownload }) {
  return (
    <div className="doc-stage-center">
      <div className="viewer-fallback-card">
        <div className="empty-icon">
          <Icon name="file" />
        </div>
        <h3>{title}</h3>
        <p className="text-secondary">{message}</p>
        <Button icon="download" onClick={onDownload} className="mt-2">
          Enregistrer sur l'appareil
        </Button>
      </div>
    </div>
  );
}
