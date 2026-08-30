// ─── Render ───────────────────────────────────────────────────────────────────

function scheduleRender() {
  clearTimeout(renderDebounce);
  renderDebounce = setTimeout(render, 80);
}

async function render() {
  const canvas = document.getElementById('labelCanvas');
  const scale = getPrintScale();
  const content = buildLabelContent();
  const heightMm = getLabelHeight();

  await renderLabel(canvas, {
    widthMm: getLabelLength() - LABEL_MARGIN_LEFT - LABEL_MARGIN_RIGHT,
    heightMm,
    scale,
    content,
  });
  updateLabelPxInfo();
}

async function renderLabel(canvas, { widthMm, heightMm, scale, content }) {
  const totalW = (widthMm + LABEL_MARGIN_LEFT + LABEL_MARGIN_RIGHT) * scale;
  const totalH = (heightMm + LABEL_MARGIN_TOP * 2) * scale;

  canvas.width = totalW;
  canvas.height = totalH;
  canvas.style.maxWidth = '100%';

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // Printable area margins (dashed guide)
  if (content.showMargins) {
    ctx.save();
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.05 * scale;
    ctx.setLineDash([0.2 * scale, 0.2 * scale]);
    ctx.strokeRect(
      LABEL_MARGIN_LEFT * scale,
      LABEL_MARGIN_TOP * scale,
      widthMm * scale,
      heightMm * scale
    );
    ctx.restore();
  }

  // Work within the printable area
  ctx.save();
  ctx.translate(LABEL_MARGIN_LEFT * scale, LABEL_MARGIN_TOP * scale);

  const pw = widthMm;   // printable width mm
  const ph = heightMm;  // printable height mm

  // Determine layout
  const layout = await computeLayout(ctx, content, pw, ph, scale);

  // Draw image or icon
  if (layout.image) {
    if (content.iconPath) {
      const { x, y, w, h } = layout.image;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x * scale, y * scale, w * scale, h * scale);
      ctx.clip();
      ctx.fillStyle = '#000000';
      ctx.translate(x * scale, y * scale);
      ctx.scale((w * scale) / (content.iconVbw ?? 24), (h * scale) / (content.iconVbh ?? 24));
      ctx.fill(new Path2D(content.iconPath));
      ctx.restore();
    } else if (content.photoUrl) {
      // Raster photo icon (PNG/JPG) — fit within the box by aspect ratio,
      // same as every other icon type. Since the box height derives from
      // the tape height, this is exactly the "resize to fit tape" behavior:
      // no separate resize step needed, just the generic aspect-fit here.
      // Rotation/mirror are applied as a transform around the box's centre:
      // the fit calc uses the *visual* (post-rotation) dimensions, but the
      // actual drawImage call uses the image's original dimensions in the
      // (still-unrotated) local coordinate space -- the ctx.rotate/scale
      // applied beforehand makes that rectangle appear correctly rotated.
      try {
        const img = await loadImage(assetUrl(content.photoUrl));
        const { x, y, w, h } = layout.image;
        const rotation = content.photoRotation || 0;
        const swapped = rotation === 90 || rotation === 270;
        const visW = swapped ? img.naturalHeight : img.naturalWidth;
        const visH = swapped ? img.naturalWidth : img.naturalHeight;
        const fitS = Math.min((w * scale) / visW, (h * scale) / visH);
        const localDw = img.naturalWidth * fitS;
        const localDh = img.naturalHeight * fitS;
        const cx = x * scale + (w * scale) / 2;
        const cy = y * scale + (h * scale) / 2;
        ctx.save();
        ctx.translate(cx, cy);
        if (rotation) ctx.rotate(rotation * Math.PI / 180);
        if (content.photoFlipH || content.photoFlipV) {
          ctx.scale(content.photoFlipH ? -1 : 1, content.photoFlipV ? -1 : 1);
        }
        ctx.drawImage(img, -localDw / 2, -localDh / 2, localDw, localDh);
        ctx.restore();
      } catch { /* image failed to load, skip */ }
    } else {
      const urls = resolveViewUrls(content);
      const { x, y, w, h } = layout.image;
      // Load every view and lay them out side by side in columns whose widths
      // are proportional to each view's aspect ratio, so none overlap.
      const imgs = [];
      const thickness = content.lineThickness ?? 1;
      for (const url of urls) {
        try { imgs.push(await loadDrawingImage(assetUrl(url), thickness)); }
        catch { /* image failed to load, skip */ }
      }
      if (imgs.length) {
        const gapMm = imgs.length > 1 ? VIEW_GAP_MM : 0;
        const totalGap = gapMm * (imgs.length - 1);
        const ars = imgs.map(im => im.naturalWidth / im.naturalHeight);
        const arSum = ars.reduce((a, b) => a + b, 0);
        const drawableW = (w - totalGap) * scale;
        let colX = x * scale;
        imgs.forEach((img, idx) => {
          const colW = drawableW * (ars[idx] / arSum);
          const fitS = Math.min(colW / img.naturalWidth, (h * scale) / img.naturalHeight);
          const dw = img.naturalWidth * fitS;
          const dh = img.naturalHeight * fitS;
          const dx = colX + (colW - dw) / 2;
          const dy = y * scale + ((h * scale) - dh) / 2;
          ctx.drawImage(img, dx, dy, dw, dh);
          colX += colW + gapMm * scale;
        });
      }
    }
  }

  // Draw primary text
  if (content.primaryText && layout.primary) {
    await drawText(ctx, {
      text: content.primaryText,
      x: layout.primary.x * scale,
      y: layout.primary.y * scale,
      width: layout.primary.width * scale,
      align: content.textAlign,
      fontSize: layout.primary.fontSize * scale,
      fontFamily: FONT_PRIMARY.family,
      fontWeight: FONT_PRIMARY.weight,
    });
  }

  // Draw secondary text
  if (content.secondaryText && layout.secondary) {
    await drawText(ctx, {
      text: content.secondaryText,
      x: layout.secondary.x * scale,
      y: layout.secondary.y * scale,
      width: layout.secondary.width * scale,
      align: content.textAlign,
      fontSize: layout.secondary.fontSize * scale,
      fontFamily: FONT_SECONDARY.family,
      fontWeight: FONT_SECONDARY.weight,
    });
  }

  // Draw QR code
  if (content.showQRCode && content.qrCodeUrl && layout.qr) {
    try {
      const qrDataUrl = await generateQR(content.qrCodeUrl, layout.qr.size * scale);
      const qrImg = await loadImage(qrDataUrl);
      ctx.drawImage(qrImg, layout.qr.x * scale, layout.qr.y * scale, layout.qr.size * scale, layout.qr.size * scale);
    } catch { /* qr failed */ }
  }

  ctx.restore();
}
// ─── Layout ───────────────────────────────────────────────────────────────────

function resolveViewUrls(content) {
  const rv = content.standard?.renderViews;
  const views = content.selectedViews;
  if (rv && views?.length) return views.map(v => rv[v]).filter(Boolean);
  if (content.standard?.image) return [content.standard.image];
  return [];
}

async function computeLayout(ctx, content, pw, ph, scale) {
  const hasImage  = content.imageSource === 'drawing' && resolveViewUrls(content).length > 0;
  const hasIcon   = (content.imageSource === 'mdi' || content.imageSource === 'custom') && !!content.iconPath;
  const hasPhoto  = content.imageSource === 'photo' && !!content.photoUrl;
  const hasVisual = hasImage || hasIcon || hasPhoto;
  const hasQR = content.showQRCode && content.qrCodeUrl;
  const hasPrimary = !!content.primaryText;
  const hasSecondary = !!content.secondaryText;

  const qrSize = QR_SIZE_MM;
  const qrMargin = 1;
  let availW = pw;

  const layout = {};

  // QR code always right, vertically centred, if shown
  if (hasQR) {
    layout.qr = {
      x: pw - qrSize,
      y: (ph - qrSize) / 2,
      size: qrSize,
    };
    availW -= (qrSize + qrMargin);
  }

  // Image / icon placement
  if (hasVisual) {
    let ar;
    if (hasIcon) {
      ar = (content.iconVbw ?? 24) / (content.iconVbh ?? 24);
    } else if (hasPhoto) {
      ar = await getImageAspectRatio(assetUrl(content.photoUrl));
      // A 90/270 rotation swaps visual width and height for fitting purposes.
      if (content.photoRotation === 90 || content.photoRotation === 270) ar = 1 / ar;
    } else {
      // Combined width-to-height of all selected views placed side by side,
      // so the image box is wide enough to hold them without overlap.
      const urls = resolveViewUrls(content);
      const ars = await Promise.all(urls.map(u => getImageAspectRatio(assetUrl(u))));
      ar = ars.reduce((a, b) => a + b, 0) || 1;
    }
    const aspectRatio = pw / ph;
    const useHorizontal = ar > 3.4 && aspectRatio >= 2.9;

    if (useHorizontal) {
      // IMAGE_HORIZONTAL: image on configured side, text stacked on other side
      const imgH = (ph - 1) * 0.95;
      const imgW = Math.min(imgH * ar, availW * 0.4);
      const imgLeft = content.iconPosition !== 'right';
      const imgX = imgLeft ? 0 : availW - imgW;
      const textX = imgLeft ? imgW + 1 : 0;
      const textW = availW - imgW - 1;
      layout.image = { x: imgX, y: (ph - imgH) / 2, w: imgW, h: imgH };
      layout.primary = computeTextLayout(ctx, content.primaryText, textX, ph * 0.28, textW, ph * 0.35, scale, FONT_PRIMARY);
      if (hasSecondary) {
        layout.secondary = computeTextLayout(ctx, content.secondaryText, textX, ph * 0.72, textW, ph * 0.3, scale, FONT_SECONDARY);
      }
    } else {
      // Text with image on the configured side (left or right)
      const imgH = ph * 0.85;
      const imgW = Math.min(imgH * ar, availW * 0.45);
      const iconLeft = content.iconPosition === 'left';

      let imgX, textX;
      if (iconLeft) {
        imgX = 0;
        textX = imgW + 1;
      } else {
        imgX = availW - imgW;
        textX = 0;
      }
      layout.image = { x: imgX, y: (ph - imgH) / 2, w: imgW, h: imgH };

      const textW = availW - imgW - 1;
      const topY = hasPrimary && hasSecondary ? ph * 0.33 : ph * 0.5;
      if (hasPrimary) {
        layout.primary = computeTextLayout(ctx, content.primaryText, textX, topY, textW, ph * 0.4, scale, FONT_PRIMARY);
      }
      if (hasSecondary) {
        const secY = hasPrimary ? ph * 0.75 : ph * 0.5;
        layout.secondary = computeTextLayout(ctx, content.secondaryText, textX, secY, textW, ph * 0.35, scale, FONT_SECONDARY);
      }
    }
  } else {
    // Text only
    const topY = hasPrimary && hasSecondary ? ph * 0.33 : ph * 0.5;
    if (hasPrimary) {
      layout.primary = computeTextLayout(ctx, content.primaryText, 0, topY, availW, ph * 0.4, scale, FONT_PRIMARY);
    }
    if (hasSecondary) {
      const secY = hasPrimary ? ph * 0.75 : ph * 0.5;
      layout.secondary = computeTextLayout(ctx, content.secondaryText, 0, secY, availW, ph * 0.35, scale, FONT_SECONDARY);
    }
  }

  return layout;
}

function computeTextLayout(ctx, text, x, y, maxW, maxH, scale, font) {
  if (!text) return null;
  const fontSize = fitFontSize(ctx, text, maxW * scale, maxH * scale, font) / scale;
  return { x, y, fontSize, width: maxW };
}

function fitFontSize(ctx, text, maxWidthPx, maxHeightPx, font) {
  const maxSize = Math.min(maxHeightPx, 100);
  let lo = 1, hi = maxSize;
  while (hi - lo > 0.2) {
    const mid = (lo + hi) / 2;
    ctx.font = `${font.weight} ${mid}px "${font.family}"`;
    const w = ctx.measureText(text).width;
    if (w <= maxWidthPx && mid <= maxHeightPx) lo = mid;
    else hi = mid;
  }
  return lo;
}
// ─── Drawing ──────────────────────────────────────────────────────────────────

async function drawText(ctx, { text, x, y, width = 0, align = 'left', fontSize, fontFamily, fontWeight }) {
  try {
    await document.fonts.load(`${fontWeight} ${fontSize}px "${fontFamily}"`, text);
  } catch { /* ignore font load errors */ }
  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'middle';
  let drawX = x;
  if (align === 'center') { ctx.textAlign = 'center'; drawX = x + width / 2; }
  else if (align === 'right') { ctx.textAlign = 'right'; drawX = x + width; }
  else { ctx.textAlign = 'left'; }
  ctx.fillText(text, drawX, y);
  ctx.restore();
}

function loadImage(src) {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { imageCache.set(src, img); resolve(img); };
    img.onerror = reject;
    img.src = src;
  });
}

// Loads a hardware-standard drawing SVG, optionally scaling its baked-in
// stroke-width by `thicknessScale` (1 = unmodified/thinnest). Each generated
// SVG has exactly one `stroke-width="…"` attribute on its wrapping <g>, so a
// single regex replace on the fetched text is enough -- no SVG DOM needed.
async function loadDrawingImage(url, thicknessScale) {
  const key = `${url}::${thicknessScale}`;
  if (drawingImageCache.has(key)) return drawingImageCache.get(key);

  if (thicknessScale === 1) {
    const img = await loadImage(url);
    drawingImageCache.set(key, img);
    return img;
  }

  const res = await fetch(url);
  const svgText = await res.text();
  const scaledText = svgText.replace(/stroke-width="([\d.]+)"/,
    (_, w) => `stroke-width="${(parseFloat(w) * thicknessScale).toFixed(4)}"`);
  const blobUrl = URL.createObjectURL(new Blob([scaledText], { type: 'image/svg+xml' }));
  const img = await loadImage(blobUrl);
  drawingImageCache.set(key, img);
  return img;
}

async function getImageAspectRatio(src) {
  if (!src) return 1;
  if (aspectCache.has(src)) return aspectCache.get(src);
  try {
    const img = await loadImage(src);
    const ar = img.naturalWidth / img.naturalHeight;
    aspectCache.set(src, ar);
    return ar;
  } catch { return 1; }
}

async function generateQR(url, sizePx) {
  const key = `${url}:${sizePx}`;
  if (qrCache.has(key)) return qrCache.get(key);

  const dataUrl = await QRCode.toDataURL(url, {
    width: Math.round(sizePx),
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
  });
  qrCache.set(key, dataUrl);
  return dataUrl;
}
// ─── Export ───────────────────────────────────────────────────────────────────

async function getPrintCanvas() {
  const scale = getPrintScale();
  const content = buildLabelContent();
  const heightMm = getLabelHeight();

  const canvas = document.createElement('canvas');
  await renderLabel(canvas, { widthMm: getLabelLength() - LABEL_MARGIN_LEFT - LABEL_MARGIN_RIGHT, heightMm, scale, content });
  return canvas;
}
// ─── Constants ───────────────────────────────────────────────────────────────

// Total physical label length (cut-to-cut) is user-configurable via
// getLabelLength() (labelLengthInput in the UI), default 35mm.
const LABEL_MARGIN_LEFT = 2;        // mm leading margin (hardware, via ESC i d)
const LABEL_MARGIN_RIGHT = 3;       // mm trailing margin (printer minimum cut margin)
const LABEL_MARGIN_TOP = 1;         // mm top margin
const FONT_PRIMARY = { family: 'Noto Sans', weight: '900' };
const FONT_SECONDARY = { family: 'Oswald', weight: '300' };
const QR_SIZE_MM = 10;
const VIEW_GAP_MM = 0.6;            // gap between side-by-side hardware views
// ─── Image Cache & Loading ────────────────────────────────────────────────────

const imageCache = new Map();
const aspectCache = new Map();
const drawingImageCache = new Map();
// ─── QR Code ──────────────────────────────────────────────────────────────────

const qrCache = new Map();

// Crops a rendered label canvas (which includes the hardware feed/cut margins
// -- LABEL_MARGIN_LEFT/RIGHT/TOP -- on every side) down to just the printable
// region: the same area the dashed guide rectangle in the preview marks.
// scale is px/mm for THIS canvas; pass the value active when it was rendered,
// not necessarily the current getPrintScale() (a print-queue canvas may have
// been rendered at a different scale/size than what's selected now).
function cropToPrintableArea(sourceCanvas, printableWidthMm, printableHeightMm, scale) {
  const w = Math.round(printableWidthMm * scale);
  const h = Math.round(printableHeightMm * scale);
  const cropped = document.createElement('canvas');
  cropped.width = w;
  cropped.height = h;
  const ctx = cropped.getContext('2d');
  ctx.drawImage(
    sourceCanvas,
    Math.round(LABEL_MARGIN_LEFT * scale), Math.round(LABEL_MARGIN_TOP * scale), w, h,
    0, 0, w, h
  );
  return cropped;
}

// Same crop, but deriving scale from a print-queue item's own stored
// widthMm/heightMm and its already-rendered canvas -- so it's correct even
// if the current Length/Height controls have since changed.
function cropQueueItemToPrintableArea(item) {
  const scale = item.canvas.width / item.widthMm;
  const printableWidthMm = item.widthMm - LABEL_MARGIN_LEFT - LABEL_MARGIN_RIGHT;
  return cropToPrintableArea(item.canvas, printableWidthMm, item.heightMm, scale);
}

// Trims only the top/bottom margin, keeping the left/right feed and cut
// margins intact -- for the chain export, where that horizontal margin is
// exactly the gap a real printer's autocutter would use between labels on
// one uncut length of tape, so it belongs in the image, unlike a single
// label export where it's just unwanted whitespace.
function cropTopBottomOnly(sourceCanvas, heightMm, scale) {
  const w = sourceCanvas.width;
  const h = Math.round(heightMm * scale);
  const cropped = document.createElement('canvas');
  cropped.width = w;
  cropped.height = h;
  const ctx = cropped.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, Math.round(LABEL_MARGIN_TOP * scale), w, h, 0, 0, w, h);
  return cropped;
}

function cropQueueItemTopBottomOnly(item) {
  const scale = item.canvas.width / item.widthMm;
  return cropTopBottomOnly(item.canvas, item.heightMm, scale);
}

async function downloadPng() {
  const canvas = await getPrintCanvas();
  const scale = getPrintScale();
  const printableWidthMm = getLabelLength() - LABEL_MARGIN_LEFT - LABEL_MARGIN_RIGHT;
  const printableHeightMm = getLabelHeight();
  const cropped = cropToPrintableArea(canvas, printableWidthMm, printableHeightMm, scale);
  const link = document.createElement('a');
  link.download = buildFilename() + '.png';
  link.href = cropped.toDataURL('image/png');
  link.click();
}

function buildFilename() {
  const content = buildLabelContent();
  const parts = [];
  if (content.primaryText) parts.push(content.primaryText.replace(/[^\w\s×-]/g, '').replace(/\s+/g, '_'));
  if (content.secondaryText) parts.push(content.secondaryText.replace(/\s+/g, '_'));
  return parts.join('-') || 'label';
}
