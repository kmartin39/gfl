// ─── Saved Designs (full label configuration, stored in localStorage) ─────────
//
// Distinct from Favorites (a single icon/standard): a "design" is everything
// needed to reconstruct the exact label you're looking at -- product type,
// spec, icon choice + transform, text options, label size, etc. Print-queue
// rows carry the same captured state so clicking one restores it too.

const LS_DESIGNS_KEY = 'gfl_designs';

function loadDesignsList() {
  try { return JSON.parse(localStorage.getItem(LS_DESIGNS_KEY)) || []; }
  catch { return []; }
}

function saveDesignsList(list) {
  localStorage.setItem(LS_DESIGNS_KEY, JSON.stringify(list));
}

function captureDesignState() {
  return {
    productType: getProductType(),
    measureSystem: getMeasureSystem(),
    specMode,
    standardId: selectedStandard?.id ?? null,
    selectedViews: [...selectedViews],
    stdPref: getStdPref(),
    threadSize: document.getElementById('threadSize').value,
    threadSizeImperial: document.getElementById('threadSizeImperial').value,
    lengthInput: document.getElementById('lengthInput').value,
    generalName: document.getElementById('generalName').value,
    noteInput: document.getElementById('noteInput').value,
    qrUrl: document.getElementById('qrUrl').value,
    showImage,
    showQR: document.getElementById('showQR').checked,
    showMargins: document.getElementById('showMargins').checked,
    imageSource: getImageSource(),
    iconPosition,
    textAlign: getTextAlign(),
    lineThickness: getLineThickness(),
    labelHeight: getLabelHeight(),
    labelLength: getLabelLength(),
    mdiIcon: selectedMdiIcon,
    customIcon: selectedCustomIcon,
    photoIcon: selectedPhotoIcon,
    photoRotation,
    photoFlipH,
    photoFlipV,
  };
}

// Restores every field captured above, in an order chosen so later steps
// (e.g. explicitly setting imageSource) aren't clobbered by side effects of
// earlier ones (e.g. onProductTypeChange() auto-flipping imageSource on a
// fastener<->general transition).
async function applyDesignState(state) {
  if (!state) return;

  document.querySelector(`input[name="productType"][value="${state.productType}"]`).checked = true;
  onProductTypeChange();

  document.querySelector(`input[name="measureSystem"][value="${state.measureSystem}"]`).checked = true;
  onMeasureSystemChange();

  specMode = state.specMode || 'standard';
  setSegValue('modeSeg', specMode);
  document.getElementById('standardGroup').hidden = specMode !== 'standard';

  if (specMode === 'standard' && state.standardId) {
    const std = standards.find(s => s.id === state.standardId);
    if (std) {
      selectStandard(std);
      if (state.selectedViews?.length) {
        selectedViews = state.selectedViews.filter(v => viewChipOrder.includes(v));
        renderViewChips();
      }
    } else {
      clearStandard();
    }
  } else {
    clearStandard();
  }

  if (state.stdPref) {
    const el = document.querySelector(`input[name="stdPref"][value="${state.stdPref}"]`);
    if (el) { el.checked = true; setSegValue('stdPrefSeg', state.stdPref); }
  }

  document.getElementById('threadSize').value = state.threadSize || '';
  document.getElementById('threadSizeImperial').value = state.threadSizeImperial || '';
  document.getElementById('generalName').value = state.generalName || '';
  document.getElementById('noteInput').value = state.noteInput || '';
  document.getElementById('qrUrl').value = state.qrUrl || '';
  document.getElementById('lengthInput').value = state.lengthInput || '';
  onLengthInput();

  showImage = state.showImage !== false;
  document.getElementById('chipImage')?.classList.toggle('chip-active', showImage);
  document.getElementById('showQR').checked = !!state.showQR;
  document.getElementById('chipQR')?.classList.toggle('chip-active', !!state.showQR);
  document.getElementById('showMargins').checked = state.showMargins !== false;
  document.getElementById('chipMargins')?.classList.toggle('chip-active', state.showMargins !== false);

  selectedMdiIcon = state.mdiIcon || null;
  selectedCustomIcon = state.customIcon || null;
  selectedPhotoIcon = state.photoIcon || null;
  photoRotation = state.photoRotation || 0;
  photoFlipH = !!state.photoFlipH;
  photoFlipV = !!state.photoFlipV;

  document.querySelector(`input[name="imageSource"][value="${state.imageSource}"]`).checked = true;
  onImageSourceChange();

  showSelectedMdiIcon();
  showSelectedCustomIcon();
  showSelectedPhotoIcon();
  updatePhotoTransformUI();

  iconPosition = state.iconPosition || 'right';
  setSegValue('iconPosSeg', iconPosition);

  const alignVal = state.textAlign || 'left';
  const alignEl = document.querySelector(`input[name="textAlign"][value="${alignVal}"]`);
  if (alignEl) { alignEl.checked = true; setSegValue('textAlignSeg', alignVal); }

  const thickVal = String(state.lineThickness || 1);
  const thickEl = document.querySelector(`input[name="lineThickness"][value="${thickVal}"]`);
  if (thickEl) { thickEl.checked = true; setSegValue('lineThicknessSeg', thickVal); }

  const heightVal = String(state.labelHeight || 12);
  const heightEl = document.querySelector(`input[name="labelHeight"][value="${heightVal}"]`);
  if (heightEl) heightEl.checked = true;
  document.querySelectorAll('.ht-btn[data-h]').forEach(b => b.classList.toggle('ht-active', b.dataset.h === heightVal));

  document.getElementById('labelLengthInput').value = state.labelLength || 35;
  updateLengthUnitButtons(state.labelLength || 35);
  onLabelHeightChange();

  scheduleRender();
}

function renderDesignsList() {
  const list = document.getElementById('designsList');
  const empty = document.getElementById('designsEmpty');
  if (!list) return;
  const designs = loadDesignsList();
  list.innerHTML = '';
  empty.hidden = designs.length > 0;
  designs.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'search-item design-item';
    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;';
    info.innerHTML = `
      <span class="search-item-code">${escHtml(d.name)}</span>
      <span class="search-item-desc">${escHtml(new Date(d.savedAt).toLocaleString())}</span>
    `;
    item.appendChild(info);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'clear-btn';
    del.title = 'Delete';
    del.textContent = '×';
    del.addEventListener('click', e => {
      e.stopPropagation();
      const designs2 = loadDesignsList();
      designs2.splice(i, 1);
      saveDesignsList(designs2);
      renderDesignsList();
    });
    item.appendChild(del);
    item.addEventListener('click', () => applyDesignState(d.state));
    list.appendChild(item);
  });
}

function saveCurrentDesign() {
  const name = prompt('Name this design:');
  if (!name || !name.trim()) return;
  const designs = loadDesignsList();
  designs.unshift({ name: name.trim(), savedAt: new Date().toISOString(), state: captureDesignState() });
  saveDesignsList(designs);
  renderDesignsList();
}

function initDesigns() {
  document.getElementById('saveDesignBtn')?.addEventListener('click', saveCurrentDesign);
  renderDesignsList();
}

// ─── Export print queue to PNG ─────────────────────────────────────────────

function sanitizeFilename(name) {
  return (name || 'label').replace(/[^\w\s×-]/g, '').replace(/\s+/g, '_') || 'label';
}

function downloadCanvasAsPng(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function exportQueueIndividual() {
  if (printQueue.length === 0) return;
  printQueue.forEach((item, i) => {
    const filename = `${String(i + 1).padStart(2, '0')}_${sanitizeFilename(item.name)}.png`;
    downloadCanvasAsPng(item.canvas, filename);
  });
}

// Concatenates every queued label left-to-right into one continuous strip,
// matching how the physical batch print chains labels on one uncut length
// of tape. Canvases of differing height (mixed tape widths) are centred
// vertically against the tallest one rather than stretched.
function exportQueueChain() {
  if (printQueue.length === 0) return;
  const maxH = Math.max(...printQueue.map(item => item.canvas.height));
  const totalW = printQueue.reduce((sum, item) => sum + item.canvas.width, 0);
  const chain = document.createElement('canvas');
  chain.width = totalW;
  chain.height = maxH;
  const ctx = chain.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, maxH);
  let x = 0;
  printQueue.forEach(item => {
    const y = (maxH - item.canvas.height) / 2;
    ctx.drawImage(item.canvas, x, y);
    x += item.canvas.width;
  });
  downloadCanvasAsPng(chain, 'label_chain.png');
}

function initQueueExport() {
  document.getElementById('exportQueueIndividualBtn')?.addEventListener('click', exportQueueIndividual);
  document.getElementById('exportQueueChainBtn')?.addEventListener('click', exportQueueChain);
}
