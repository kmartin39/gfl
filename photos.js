// ─── Photo Icon Catalog (PNG/JPG, uploaded via the local image agent) ─────────

const IMAGE_AGENT_URL = 'http://localhost:9101';

async function loadPhotoCatalog() {
  if (photoCatalog) return photoCatalog;
  try {
    const res = await fetch(assetUrl('photo-catalog.json'));
    photoCatalog = await res.json();
  } catch {
    photoCatalog = [];
  }
  return photoCatalog;
}

function photoImagePath(entry) {
  return `images/photos/${entry.file}`;
}

function renderPhotoList(filter) {
  const list = document.getElementById('photoIconsList');
  if (!list) return;
  const q = (filter || '').trim().toLowerCase();
  const items = q.length === 0 ? photoCatalog : (photoCatalog || []).filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.designation || '').toLowerCase().includes(q)
  );

  list.innerHTML = '';
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="search-no-results">No photos yet — upload one below</div>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'icon-grid';
  items.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'icon-grid-item';
    item.title = entry.designation ? `${entry.name} (${entry.designation})` : entry.name;
    const img = document.createElement('img');
    img.src = assetUrl(photoImagePath(entry));
    img.alt = entry.name;
    const label = document.createElement('span');
    label.textContent = entry.name;
    item.append(img, label);
    item.addEventListener('click', () => selectPhotoIcon(entry));
    grid.appendChild(item);
  });
  list.appendChild(grid);
}

async function initPhotoPicker() {
  await loadPhotoCatalog();
  renderPhotoList(document.getElementById('photoSearch').value);
  pollImageAgentStatus();
}

function onPhotoSearch(e) {
  renderPhotoList(e.target.value);
}

function selectPhotoIcon(entry) {
  selectedPhotoIcon = { id: entry.id, name: entry.name, designation: entry.designation, path: photoImagePath(entry) };
  resetPhotoTransform();
  showSelectedPhotoIcon();
  scheduleRender();
}

function showSelectedPhotoIcon() {
  const box = document.getElementById('selectedPhotoIconDisplay');
  if (!selectedPhotoIcon) { box.hidden = true; return; }
  document.getElementById('photoIconPreview').src = assetUrl(selectedPhotoIcon.path);
  document.getElementById('selectedPhotoIconName').textContent = selectedPhotoIcon.name;
  document.getElementById('selectedPhotoIconDesig').textContent = selectedPhotoIcon.designation || '';
  box.hidden = false;
  document.getElementById('photoTransformRow').hidden = false;
}

function clearPhotoIcon() {
  selectedPhotoIcon = null;
  resetPhotoTransform();
  document.getElementById('selectedPhotoIconDisplay').hidden = true;
  document.getElementById('photoTransformRow').hidden = true;
  document.getElementById('photoSearch').value = '';
  scheduleRender();
}

// ─── Rotate / Mirror ────────────────────────────────────────────────────────

function resetPhotoTransform() {
  photoRotation = 0;
  photoFlipH = false;
  photoFlipV = false;
  updatePhotoTransformUI();
}

function updatePhotoTransformUI() {
  const label = document.getElementById('photoRotationLabel');
  if (label) label.textContent = `${photoRotation}°`;
  const flipHBtn = document.getElementById('photoFlipHBtn');
  const flipVBtn = document.getElementById('photoFlipVBtn');
  if (flipHBtn) flipHBtn.classList.toggle('ht-active', photoFlipH);
  if (flipVBtn) flipVBtn.classList.toggle('ht-active', photoFlipV);
}

function initPhotoTransformControls() {
  document.getElementById('photoRotateLeftBtn')?.addEventListener('click', () => {
    photoRotation = (photoRotation + 270) % 360;
    updatePhotoTransformUI();
    scheduleRender();
  });
  document.getElementById('photoRotateRightBtn')?.addEventListener('click', () => {
    photoRotation = (photoRotation + 90) % 360;
    updatePhotoTransformUI();
    scheduleRender();
  });
  document.getElementById('photoFlipHBtn')?.addEventListener('click', () => {
    photoFlipH = !photoFlipH;
    updatePhotoTransformUI();
    scheduleRender();
  });
  document.getElementById('photoFlipVBtn')?.addEventListener('click', () => {
    photoFlipV = !photoFlipV;
    updatePhotoTransformUI();
    scheduleRender();
  });
}

// ─── Image Agent status ────────────────────────────────────────────────────

async function checkImageAgentStatus() {
  try {
    const res = await fetch(`${IMAGE_AGENT_URL}/status`, { signal: AbortSignal.timeout(1500) });
    const data = await res.json();
    return !!data.ready;
  } catch {
    return false;
  }
}

async function pollImageAgentStatus() {
  const ready = await checkImageAgentStatus();
  [document.getElementById('photoAgentDot'), document.getElementById('uploadAgentDot')]
    .forEach(d => { if (d) d.className = 'status-dot ' + (ready ? 'online' : 'offline'); });
  [document.getElementById('photoAgentLabel'), document.getElementById('uploadAgentLabel')]
    .forEach(l => { if (l) l.textContent = ready ? 'Image agent ready' : 'Image agent offline'; });
  const submitBtn = document.getElementById('photoUploadSubmitBtn');
  if (submitBtn) submitBtn.disabled = !ready;
  const copyBtn = document.getElementById('copyAgentCommandBtn');
  if (copyBtn) copyBtn.hidden = ready;
  return ready;
}

// Browsers can't launch a local program from a web page (no exceptions --
// this is a hard security boundary, not a missing feature here). The closest
// practical shortcut: copy the exact command to run, so the user just needs
// an already-open terminal in the project folder rather than hunting for
// run-local.bat or remembering the module path.
function initCopyAgentCommandButton() {
  const btn = document.getElementById('copyAgentCommandBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const command = 'python image-agent/agent.py';
    try {
      await navigator.clipboard.writeText(command);
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = original; }, 2000);
    } catch {
      alert(`Couldn't access the clipboard. Run this from the project folder:\n\n${command}`);
    }
  });
}

// ─── Upload Modal ───────────────────────────────────────────────────────────

function openPhotoUploadModal() {
  resetUploadForm();
  document.getElementById('photoUploadOverlay').hidden = false;
  pollImageAgentStatus();
}

function closePhotoUploadModal() {
  document.getElementById('photoUploadOverlay').hidden = true;
}

function resetUploadForm() {
  pendingUploadBlob = null;
  document.getElementById('photoFileInput').value = '';
  document.getElementById('photoUrlInput').value = '';
  document.getElementById('photoNameInput').value = '';
  document.getElementById('photoDesignationInput').value = '';
  document.getElementById('uploadPreviewBox').hidden = true;
  document.getElementById('uploadPreviewImg').src = '';
  document.getElementById('photoUploadError').hidden = true;
  document.getElementById('pasteTarget').textContent = 'Click here, then press Ctrl+V to paste an image';
  setUploadMode('browse');
}

function setUploadMode(mode) {
  uploadMode = mode;
  document.querySelectorAll('#uploadModeSeg .seg-btn').forEach(b => {
    const active = b.dataset.value === mode;
    b.classList.toggle('seg-active', active);
    b.setAttribute('aria-checked', String(active));
  });
  document.getElementById('uploadBrowseGroup').hidden = mode !== 'browse';
  document.getElementById('uploadPasteGroup').hidden = mode !== 'paste';
  document.getElementById('uploadUrlGroup').hidden = mode !== 'url';
}

function showUploadPreview(src) {
  document.getElementById('uploadPreviewImg').src = src;
  document.getElementById('uploadPreviewBox').hidden = false;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function showUploadError(msg) {
  const el = document.getElementById('photoUploadError');
  el.textContent = msg;
  el.hidden = false;
}

function initPhotoUploadModal() {
  document.getElementById('photoUploadBtn')?.addEventListener('click', openPhotoUploadModal);
  document.getElementById('photoUploadCloseBtn')?.addEventListener('click', closePhotoUploadModal);
  document.getElementById('photoUploadCancelBtn')?.addEventListener('click', closePhotoUploadModal);
  document.getElementById('photoUploadOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closePhotoUploadModal();
  });

  document.querySelectorAll('#uploadModeSeg .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setUploadMode(btn.dataset.value));
  });

  document.getElementById('photoFileInput')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingUploadBlob = file;
    showUploadPreview(await blobToDataUrl(file));
    if (!document.getElementById('photoNameInput').value) {
      document.getElementById('photoNameInput').value = file.name.replace(/\.[^.]+$/, '');
    }
  });

  const pasteTarget = document.getElementById('pasteTarget');
  pasteTarget?.addEventListener('paste', async e => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        pendingUploadBlob = blob;
        showUploadPreview(await blobToDataUrl(blob));
        pasteTarget.textContent = 'Image pasted ✓ — paste again to replace';
        break;
      }
    }
  });

  document.getElementById('photoUrlInput')?.addEventListener('input', e => {
    const url = e.target.value.trim();
    // Best-effort <img> preview -- doesn't require CORS the way canvas readback would.
    if (url) showUploadPreview(url);
  });

  document.getElementById('photoUploadSubmitBtn')?.addEventListener('click', submitPhotoUpload);
}

async function submitPhotoUpload() {
  const name = document.getElementById('photoNameInput').value.trim();
  const designation = document.getElementById('photoDesignationInput').value.trim();
  document.getElementById('photoUploadError').hidden = true;
  if (!name) { showUploadError('Name is required.'); return; }

  const payload = { name, designation };
  if (uploadMode === 'url') {
    const url = document.getElementById('photoUrlInput').value.trim();
    if (!url) { showUploadError('Enter a URL.'); return; }
    payload.url = url;
  } else {
    if (!pendingUploadBlob) {
      showUploadError(uploadMode === 'paste' ? 'Paste an image first.' : 'Choose a file first.');
      return;
    }
    payload.image_base64 = (await blobToDataUrl(pendingUploadBlob)).split(',')[1];
    payload.filename = pendingUploadBlob.name || 'pasted-image.png';
  }

  const btn = document.getElementById('photoUploadSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await fetch(`${IMAGE_AGENT_URL}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) {
      showUploadError(data.error || 'Upload failed.');
      return;
    }
    photoCatalog = photoCatalog || [];
    photoCatalog.push(data.entry);
    closePhotoUploadModal();
    renderPhotoList(document.getElementById('photoSearch').value);
    selectPhotoIcon(data.entry);
  } catch (e) {
    showUploadError(`Image agent unreachable: ${e.message}. Is it running? (starts with run-local.bat)`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to Catalog';
  }
}
