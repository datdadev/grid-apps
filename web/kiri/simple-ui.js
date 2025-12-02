const price_per_gram = 555;
const price_per_hour = 0;
const DEFAULT_FILAMENT_DENSITY = 1.25;
const currencyFormatter = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
});
const CREALITY_K1_PRINT_MM_S = 200; // PETG print speed for K1 (slower than PLA)
const SLICE_READY_HTML = 'Slice &amp; Get Price';
const SLICE_BUSY_HTML = '<div class="loader w-4 h-4 mr-2 !border-2 !border-white !border-t-transparent"></div> Slicing...';
const DROP_DEFAULT_TEXT = 'Drop STL here';
const MIN_BRIM_LINES = 3;
const MIN_BRIM_OFFSET = 2;
const SUPPORT_OVERHANG_ANGLE = 30;
const K1_DEVICE_NAME = 'Creality K1';
const PROFILE_OVERRIDE_PATH = 'profile.custom.json';
let profileOverride = null;

const uiState = {
    slicing: false,
    stats: null,
    fileName: '',
    hasSliced: false
};
let selectedWidgetIds = [];
let rotatePanel = null;

function setRotatePanelEnabled(enabled) {
    if (!rotatePanel) {
        return;
    }
    rotatePanel.classList.toggle('opacity-40', !enabled);
    rotatePanel.classList.toggle('pointer-events-none', !enabled);
    rotatePanel.classList.toggle('select-none', !enabled);
    rotatePanel.classList.toggle('opacity-100', enabled);
}

function updateSelection(newIds) {
    const unique = Array.from(new Set((newIds || []).filter(Boolean)));
    selectedWidgetIds = unique;
    setRotatePanelEnabled(unique.length > 0);
}

document.addEventListener('DOMContentLoaded', () => {
    waitForKiri();
});

function waitForKiri(retry = 0) {
    if (self.kiri_api) {
        initSimpleUI(self.kiri_api);
        return;
    }
    if (retry > 200) {
        console.warn('kiri_api not available yet');
        return;
    }
    setTimeout(() => waitForKiri(retry + 1), 50);
}

function safeSave(api) {
    try {
        api.conf.save();
    } catch (e) {
        console.debug('conf.save skipped', e);
    }
}

let sliceProgress = { bar: null, wrap: null, percent: 0 };

async function initSimpleUI(api) {
    if (window.__simple_ui_initialized) {
        return;
    }
    window.__simple_ui_initialized = true;
    self.kiri_simple_ui = true;
    profileOverride = null;

    const dom = {
        shell: document.getElementById('customer-shell') || document.getElementById('app'),
        dropZone: document.getElementById('customer-drop-zone'),
        fileInput: document.getElementById('customer-file-input'),
        uploadStatus: document.getElementById('customer-upload-status') || document.getElementById('file-status-badge'),
        dropText: document.getElementById('customer-drop-text'),
        uploadBtn: document.getElementById('customer-upload-btn'),
        viewerHost: document.getElementById('customer-viewer'),
        viewerWindow: document.getElementById('kiri-view-window'),
        undoBtn: document.getElementById('viewer-undo'),
        viewerPlaceholder: document.getElementById('viewer-placeholder'),
        objectList: document.getElementById('plate-object-list'),
        objectCount: document.getElementById('plate-object-count'),
        sliceBtn: document.getElementById('customer-slice-btn'),
        orderBtn: document.getElementById('customer-order-btn'),
        orderForm: document.getElementById('customer-order-form'),
        closeOrderModal: document.getElementById('close-order-modal'),
        submitOrder: document.getElementById('customer-submit-order'),
        pricingNote: document.getElementById('customer-pricing-note'),
        statTime: document.getElementById('customer-stat-time'),
        statWeight: document.getElementById('customer-stat-weight'),
        statPrice: document.getElementById('customer-stat-price'),
        infillType: document.getElementById('customer-infill-type'),
        infillAmount: document.getElementById('customer-infill-amount'),
        infillValue: document.getElementById('customer-infill-value'),
        supportToggle: document.getElementById('customer-support-toggle'),
        settingsPanel: document.getElementById('settings-panel'),
        orderName: document.getElementById('customer-name'),
        orderPhone: document.getElementById('customer-phone'),
        orderNotes: document.getElementById('customer-notes')
    };
    sliceProgress = {
        bar: document.getElementById('slice-progress-bar'),
        wrap: document.getElementById('slice-progress')
    };
    dom.sliceDefault = dom.sliceBtn?.innerHTML || SLICE_READY_HTML;

    // tap into global progress to drive the bottom bar
    const show = api.show;
    if (show && typeof show.progress === 'function') {
        const origProgress = show.progress.bind(show);
        show.progress = (pct, msg) => {
            const clamped = Math.max(0, Math.min(1, pct || 0));
            if (clamped === 0) {
                setSliceProgress(0, false);
            } else {
                setSliceProgress(Math.max(5, clamped * 100), true);
            }
            return origProgress(pct, msg);
        };
    }

    if (!dom.shell) {
        return;
    }

    const canvas = document.getElementById('container');
    const targetHost = dom.viewerWindow || dom.viewerHost;
    if (canvas && targetHost && canvas.parentElement !== targetHost) {
        targetHost.appendChild(canvas);
        // After moving the canvas into the customer viewer, force Kiri to recompute sizes.
        if (api?.platform?.update_size && api?.space?.platform) {
            requestAnimationFrame(() => api.platform.update_size());
        } else {
            // retry sizing once the platform is ready
            setTimeout(() => api?.platform?.update_size?.(), 200);
        }
        window.dispatchEvent(new Event('resize'));
    }

    await loadCustomProfile(api);
    ensureBed300(api);
    ensureBrimDefaults(api);
    ensureSupportAngle(api);
    ensureDeviceK1(api);
    setupInfillControls(api, dom);
    setupUploader(api, dom);
    setupSlicing(api, dom);
    setupOrderForm(dom);
    setupUndo(api, dom);
    preventViewerSelection(api);
    lockObjectInteraction(api);
    setupRotatePanel(api, dom);
    renderObjectList(api, dom);
    resetStats(dom, 'Upload an STL to begin.');

    api.event.on('device.selected', () => {
        ensureBed300(api);
        ensureBrimDefaults(api);
        ensureSupportAngle(api);
        ensureDeviceK1(api);
    });
    api.event.on('settings', () => {
        ensureBed300(api);
        ensureBrimDefaults(api);
        ensureSupportAngle(api);
        ensureDeviceK1(api);
    });
}

function setupInfillControls(api, dom) {
    const settings = api.conf.get();
    const currentProcess = settings?.process || {};
    const fillOptions = ['hex', 'grid', 'gyroid', 'linear', 'triangle', 'cubic'];
    if (dom.infillType) {
        if (!fillOptions.includes(currentProcess.sliceFillType)) {
            currentProcess.sliceFillType = 'hex';
        }
        dom.infillType.value = currentProcess.sliceFillType || dom.infillType.value;
        dom.infillType.addEventListener('change', () => {
            currentProcess.sliceFillType = fillOptions.includes(dom.infillType.value) ? dom.infillType.value : 'hex';
            safeSave(api);
            markSettingsDirty(api, dom);
        });
    }
    if (dom.infillAmount && dom.infillValue) {
        const current = Math.round((currentProcess.sliceFillSparse || 0.15) * 100);
        const sliderMax = Number(dom.infillAmount.max) || 100;
        const sliderMin = Number(dom.infillAmount.min) || 0;
        const clamped = Math.min(sliderMax, Math.max(sliderMin, current));
        dom.infillAmount.value = clamped;
        dom.infillValue.textContent = `${clamped}%`;
        dom.infillAmount.addEventListener('input', () => {
            dom.infillValue.textContent = `${dom.infillAmount.value}%`;
        });
        dom.infillAmount.addEventListener('change', () => {
            let percent = parseInt(dom.infillAmount.value, 10);
            if (Number.isNaN(percent)) {
                percent = clamped;
            }
            percent = Math.min(sliderMax, Math.max(sliderMin, percent));
            dom.infillAmount.value = percent;
            dom.infillValue.textContent = `${percent}%`;
            currentProcess.sliceFillSparse = Math.min(1, Math.max(0, percent / 100));
            safeSave(api);
            markSettingsDirty(api, dom);
        });
    }
    if (dom.supportToggle) {
        const proc = api.conf.get()?.process || {};
        if (proc.sliceSupportEnable === undefined) {
            proc.sliceSupportEnable = true;
            safeSave(api);
        }
        dom.supportToggle.checked = proc.sliceSupportEnable !== false;
        dom.supportToggle.addEventListener('change', () => {
            proc.sliceSupportEnable = !!dom.supportToggle.checked;
            safeSave(api);
            markSettingsDirty(api, dom);
        });
    }
}

function applyInfillSetting(api, dom) {
    const slider = dom.infillAmount;
    const select = dom.infillType;
    const fillOptions = ['hex', 'grid', 'gyroid', 'linear', 'triangle', 'cubic'];
    if (!slider) {
        return;
    }
    const sliderMax = Number(slider.max) || 100;
    const sliderMin = Number(slider.min) || 0;
    let percent = parseInt(slider.value, 10);
    if (Number.isNaN(percent)) {
        percent = sliderMin;
    }
    percent = Math.min(sliderMax, Math.max(sliderMin, percent));
    slider.value = percent;
    const settings = api.conf.get();
    const proc = settings?.process || {};
    proc.sliceFillSparse = Math.min(1, Math.max(0, percent / 100));
    if (select && fillOptions.includes(select.value)) {
        proc.sliceFillType = select.value;
    }
    if (select && !fillOptions.includes(select.value)) {
        proc.sliceFillType = 'hex';
        select.value = 'hex';
    }
    if (dom.infillValue) {
        dom.infillValue.textContent = `${percent}%`;
    }
    applySupportSetting(api, dom);
    safeSave(api);
}

function applySupportSetting(api, dom) {
    const toggle = dom.supportToggle;
    const proc = api.conf.get()?.process || {};
    if (toggle) {
        proc.sliceSupportEnable = !!toggle.checked;
    } else if (proc.sliceSupportEnable === undefined) {
        proc.sliceSupportEnable = true;
    }
    safeSave(api);
}

function markSettingsDirty(api, dom, message = 'Settings changed. Please slice again.') {
    uiState.hasSliced = false;
    resetStats(dom, message);
    updateSliceAvailability(api, dom);
}

function setupUploader(api, dom) {
    const dropZone = dom.dropZone;
    const queueFiles = files => {
        if (!files?.length) {
            return;
        }
        const label = files.length > 1 ? `${files.length} files queued` : files[0].name;
        updateUploadStatus(dom, label);
        uiState.fileName = files[0].name;
        resetStats(dom, 'Click “Slice & Price” to continue.');
        api.platform.load_files(files);
    };
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(evt => {
            dropZone.addEventListener(evt, event => {
                event.preventDefault();
                event.stopPropagation();
                dropZone.classList.add('is-dragging');
            });
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('is-dragging');
        });
        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove('is-dragging');
            const files = event.dataTransfer?.files;
            queueFiles(files);
        });
        dropZone.addEventListener('click', event => {
            if (event.target === dom.fileInput) {
                return;
            }
            dom.fileInput?.click();
        });
    }

    if (dom.uploadBtn && dom.fileInput) {
        dom.uploadBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            dom.fileInput.click();
        });
    }

    if (dom.fileInput) {
        dom.fileInput.addEventListener('change', event => {
            queueFiles(event.target?.files);
            if (event.target) {
                event.target.value = '';
            }
        });
    }

    api.event.on('widget.add', payload => {
        const widgets = Array.isArray(payload) ? payload : [payload];
        const named = widgets.find(w => w?.meta?.file);
        if (named) {
            uiState.fileName = named.meta.file;
            updateUploadStatus(dom, named.meta.file);
        }
        resetStats(dom, 'Click “Slice & Price” to continue.');
        updateSliceAvailability(api, dom);
        autoArrangeAndOrient(api, dom);
        uiState.hasSliced = false;
        updateUndoState(api, dom);
        renderObjectList(api, dom);
    });

    api.event.on('widget.delete', () => {
        const remaining = api.widgets.count();
        uiState.hasSliced = false;
        const message = remaining ? 'Object removed. Slice again.' : 'Upload an STL to begin.';
        resetStats(dom, message);
        if (remaining === 0) {
            uiState.fileName = '';
            updateUploadStatus(dom, 'No File');
        }
        updateSliceAvailability(api, dom);
        renderObjectList(api, dom);
        try {
            api.view?.set_arrange?.();
        } catch (e) {
            console.debug('set arrange on delete failed', e);
        }
    });

    updateSliceAvailability(api, dom);
}

function autoArrangeAndOrient(api, dom, attempt = 0) {
    try {
        api.view?.set_arrange?.();
    } catch (e) {
        console.debug('auto arrange failed', e);
    }
    const oriented = autoOrientWidgets(api);
    try {
        api.platform?.layout?.({ force: true });
    } catch (e) {
        console.debug('platform layout failed', e);
    }
    renderObjectList(api, dom);
    if (!oriented && attempt < 3) {
        setTimeout(() => autoArrangeAndOrient(api, dom, attempt + 1), 200);
    }
}

function setupSlicing(api, dom) {
    if (dom.sliceBtn) {
        dom.sliceBtn.addEventListener('click', () => {
            if (uiState.slicing || api.widgets.count() === 0) {
                return;
            }
            try {
                self.kiri_slice_meta = buildSliceMeta(api, dom);
            } catch (e) {
                console.debug('capture slice meta failed', e);
            }
            applyInfillSetting(api, dom);
            applySupportSetting(api, dom);
            startSlicing(api, dom);
        });
    }

    api.event.on('slice.begin', () => {
        uiState.slicing = true;
        setSliceButtonState(dom, true);
        setGlobalInputsEnabled(dom, true);
        setSliceProgress(5, true);
        if (dom.pricingNote) {
            dom.pricingNote.textContent = 'Slicing in progress…';
        }
    });

    api.event.on('slice.progress', data => {
        // data is percent [0,1] from core show.progress when slicing
        const pct = typeof data === 'number' ? data : (data?.percent ?? data?.progress ?? 0);
        setSliceProgress(Math.max(5, pct * 100), true);
    });

    api.event.on('slice.error', error => {
        console.warn('Slicing error', error);
        uiState.slicing = false;
        setSliceButtonState(dom, false);
        setGlobalInputsEnabled(dom, false);
        setSliceProgress(0, false);
        if (dom.pricingNote) {
            dom.pricingNote.textContent = 'Something went wrong. Please try again.';
        }
    });

    api.event.on('slice.end', () => {
        uiState.slicing = false;
        uiState.hasSliced = true;
        setSliceButtonState(dom, false);
        setGlobalInputsEnabled(dom, true); // keep disabled until stats are ready
        setSliceProgress(100, true);
        if (dom.pricingNote) {
            dom.pricingNote.textContent = 'Crunching numbers…';
        }
        fetchStats(api, dom);
        updateUndoState(api, dom);
    });

    api.event.on('preview.end', () => {
        uiState.hasSliced = true;
        updateUndoState(api, dom);
        setSliceProgress(0, false);
        setGlobalInputsEnabled(dom, false);
    });
}

function buildSliceMeta(api, dom) {
    const settings = api.conf.get();
    const proc = settings?.process || {};
    const device = settings?.device || {};
    const widgets = api.widgets?.all ? api.widgets.all() : [];
    const files = widgets.map(w => w?.meta?.file).filter(Boolean);
    return {
        source: 'simple-ui',
        requestedAt: Date.now(),
        files: files.length ? files : (uiState.fileName ? [uiState.fileName] : []),
        settings: {
            device: device.deviceName,
            infill: proc.sliceFillSparse,
            infillType: proc.sliceFillType,
            support: proc.sliceSupportEnable !== false
        },
        user: {
            name: dom.orderName?.value?.trim() || '',
            phone: dom.orderPhone?.value?.trim() || '',
            notes: dom.orderNotes?.value?.trim() || ''
        },
        stats: uiState.stats
    };
}

function setupOrderForm(dom) {
    if (dom.orderBtn) {
        dom.orderBtn.addEventListener('click', () => {
            if (dom.orderBtn.disabled) {
                return;
            }
            showOrderModal(dom);
        });
    }
    if (dom.closeOrderModal) {
        dom.closeOrderModal.addEventListener('click', () => {
            hideOrderModal(dom);
        });
    }
    if (dom.orderForm) {
        dom.orderForm.addEventListener('click', event => {
            if (event.target === dom.orderForm) {
                hideOrderModal(dom);
            }
        });
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideOrderModal(dom);
        }
    });
    if (dom.submitOrder) {
        dom.submitOrder.addEventListener('click', () => {
            const payload = {
                name: dom.orderName?.value.trim(),
                phone: dom.orderPhone?.value.trim(),
                notes: dom.orderNotes?.value.trim(),
                price: uiState.stats?.price,
                fileName: uiState.fileName
            };
            console.log('Order request', payload);
            hideOrderModal(dom);
            if (dom.pricingNote) {
                dom.pricingNote.textContent = payload.name ?
                    `Thanks ${payload.name}! We will contact you shortly.` :
                    'Order received! We will contact you shortly.';
            }
        });
    }
}

function setupUndo(api, dom) {
    if (!dom.undoBtn || !api?.view?.set_arrange) {
        return;
    }
    dom.undoBtn.addEventListener('click', () => {
        try {
            api.view.set_arrange();
            updateUndoState(api, dom);
            resetStats(dom, 'Upload an STL to begin.');
        } catch (e) {
            console.debug('undo failed', e);
        }
    });
}

function updateUndoState(api, dom) {
    if (!dom.undoBtn) {
        return;
    }
    const inArrange = api?.view?.is_arrange ? api.view.is_arrange() : false;
    const enable = uiState.hasSliced && !inArrange;
    dom.undoBtn.disabled = !enable;
    dom.undoBtn.classList.toggle('hover:-translate-y-0.5', enable);
    dom.undoBtn.classList.toggle('hover:bg-white', enable);
    dom.undoBtn.classList.toggle('opacity-60', !enable);
}

let bedFixTries = 0;
function ensureBed300(api, retry = false) {
    const settings = api.conf.get();
    const device = settings?.device;
    if (!device) return;
    if (device.deviceName && device.deviceName !== K1_DEVICE_NAME) {
        return;
    }
    const targetW = 300;
    const targetD = 300;
    const targetH = device.maxHeight && device.maxHeight > 0 ? Math.max(300, device.maxHeight) : 300;
    const needsUpdate = device.bedWidth !== targetW || device.bedDepth !== targetD || device.maxHeight !== targetH;
    device.bedWidth = targetW;
    device.bedDepth = targetD;
    device.maxHeight = targetH;
    const platformReady = api.space?.platform;
    const viewReady = api.space?.view?.getPosition;
    if (viewReady && (needsUpdate || retry)) {
        safeSave(api);
    }
    try {
        const plat = platformReady;
        if (plat?.setSize) {
            plat.setSize(targetW, targetD, device.bedHeight || 5, targetH);
        }
        if (plat?.setRulers) {
            plat.setRulers(true, true, 1, 'X', 'Y');
        }
        if (plat) {
            api.platform?.update_bounds?.();
            api.platform?.layout?.();
            api.view?.set_arrange?.();
            window.dispatchEvent(new Event('kiri-platform-resize'));
            api.space?.update?.();
        }
    } catch (e) {
        console.debug('force bed size failed', e);
    }
    // retry a few times while waiting for platform/view to be ready
    const shouldRetry = !retry && bedFixTries < 3 && (!platformReady || !viewReady);
    if (shouldRetry) {
        bedFixTries++;
        setTimeout(() => ensureBed300(api, true), 350);
    }
}

function ensureBrimDefaults(api) {
    try {
        const settings = api.conf.get();
        const proc = settings?.process;
        if (!proc) return;
        let changed = false;
        if ((proc.outputBrimCount || 0) < MIN_BRIM_LINES) {
            proc.outputBrimCount = MIN_BRIM_LINES;
            changed = true;
        }
        if (!proc.outputBrimOffset || proc.outputBrimOffset < MIN_BRIM_OFFSET) {
            proc.outputBrimOffset = MIN_BRIM_OFFSET;
            changed = true;
        }
        if (changed) {
            safeSave(api);
        }
    } catch (e) {
        console.debug('ensure brim defaults failed', e);
    }
}

function ensureSupportAngle(api) {
    try {
        const settings = api.conf.get();
        const proc = settings?.process;
        if (!proc) return;
        const target = SUPPORT_OVERHANG_ANGLE;
        if (proc.sliceSupportAngle !== target) {
            proc.sliceSupportAngle = target;
            safeSave(api);
        }
    } catch (e) {
        console.debug('ensure support angle failed', e);
    }
}

function ensureDeviceK1(api) {
    try {
        const settings = api.conf.get();
        const dev = settings?.device || {};
        if (dev.deviceName === K1_DEVICE_NAME) {
            if (profileOverride?.device) {
                Object.assign(dev, profileOverride.device);
                safeSave(api);
            }
            return;
        }
        const k1 = self.kiri?.device?.get
            ? self.kiri.device.get(K1_DEVICE_NAME)
            : null;
        if (k1) {
            settings.device = Object.clone(k1);
            if (profileOverride?.device) {
                Object.assign(settings.device, profileOverride.device);
            }
            safeSave(api);
            api.event.emit('device.select', settings.device);
            api.platform?.update_size?.();
            api.platform?.layout?.({ force: true });
            api.view?.set_arrange?.();
        } else {
            dev.deviceName = K1_DEVICE_NAME;
            if (profileOverride?.device) {
                Object.assign(dev, profileOverride.device);
            }
            safeSave(api);
        }
    } catch (e) {
        console.debug('ensure K1 failed', e);
    }
}

function autoOrientWidgets(api) {
    let allOriented = true;
    try {
        const widgets = api.widgets?.all ? api.widgets.all() : [];
        widgets.forEach(widget => {
            const oriented = autoOrientWidget(widget);
            if (!oriented) {
                allOriented = false;
            }
        });
    } catch (e) {
        allOriented = false;
        console.debug('auto orient failed', e);
    }
    return allOriented;
}

function autoOrientWidget(widget) {
    const THREE = self.THREE;
    if (!THREE || !widget?.mesh?.geometry || typeof widget.unrotate !== 'function' || typeof widget.rotate !== 'function') {
        return false;
    }
    try {
        widget.unrotate();
    } catch (e) {
        console.debug('unrotate failed', e);
    }
    const geom = widget.mesh.geometry;
    // lay the largest face downward to minimize supports
    const normals = findDominantNormals(geom, THREE);
    const best = normals[0];
    if (!best?.normal) {
        return false;
    }
    const targetDown = new THREE.Vector3(0, 0, -1);
    const quat = new THREE.Quaternion().setFromUnitVectors(best.normal.clone().normalize(), targetDown);
    const delta = Math.abs(quat.x) + Math.abs(quat.y) + Math.abs(quat.z);
    if (delta > 1e-6 && Number.isFinite(delta)) {
        widget.rotate(quat);
        return true;
    }
    return false;
}

// pick the largest face normal by aggregated area to orient flat faces downward
function findDominantNormals(geom, THREE) {
    const pos = geom.attributes?.position;
    if (!pos?.count) {
        return [];
    }
    const buckets = new Map();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
        v1.fromArray(pos.array, i * 3);
        v2.fromArray(pos.array, (i + 1) * 3);
        v3.fromArray(pos.array, (i + 2) * 3);
        edge1.subVectors(v2, v1);
        edge2.subVectors(v3, v1);
        normal.crossVectors(edge1, edge2);
        const area = normal.length();
        if (!isFinite(area) || area < 1e-6) continue;
        normal.normalize();
        const key = `${Math.round(normal.x * 10) / 10},${Math.round(normal.y * 10) / 10},${Math.round(normal.z * 10) / 10}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { area: 0, normal: new THREE.Vector3() };
            buckets.set(key, bucket);
        }
        bucket.area += area;
        bucket.normal.addScaledVector(normal, area);
    }
    return Array.from(buckets.values())
        .sort((a, b) => b.area - a.area)
        .map(({ area, normal }) => ({ area, normal: normal.normalize() }));
}

async function loadCustomProfile(api) {
    try {
        const res = await fetch(PROFILE_OVERRIDE_PATH, { cache: 'no-store' });
        if (!res.ok) {
            return;
        }
        const data = await res.json();
        profileOverride = data;
        const procOverride = data?.process;
        const devOverride = data?.device;
        if (!procOverride) {
            // still allow device override only
        }
        const settings = api.conf.get();
        if (procOverride) {
            const proc = settings?.process || {};
            Object.assign(proc, procOverride);
        }
        if (devOverride) {
            const dev = settings?.device || {};
            Object.assign(dev, devOverride);
        }
        safeSave(api);
    } catch (e) {
        console.debug('profile override load failed', e);
    }
}

function preventViewerSelection(api) {
    try {
        api.event.on('widget.select', widget => {
            if (api.platform?.deselect) {
                api.platform.deselect(widget);
            }
        });
    } catch (e) {
        console.debug('disable selection failed', e);
    }
}

function lockObjectInteraction(api) {
    let restoring = false;
    const snapBack = () => {
        if (restoring) return;
        restoring = true;
        try {
            api.view?.set_arrange?.();
            api.platform?.layout?.();
            api.platform?.update_bounds?.();
            api.space?.update?.();
        } catch (e) {
            console.debug('restore layout failed', e);
        } finally {
            restoring = false;
        }
    };
    try {
        ['widget.move', 'widget.scale', 'widget.rotate', 'widget.mirror'].forEach(topic => {
            api.event.on(topic, snapBack);
        });
    } catch (e) {
        console.debug('lock object interaction failed', e);
    }
}

function setupRotatePanel(api, dom) {
    const host = dom.viewerHost || dom.viewerWindow || dom.shell;
    if (!host) {
        return;
    }
    if (document.getElementById('customer-rotate-panel')) {
        return;
    }
    const ROTATE_STEP = Math.PI / 2;
    const panel = document.createElement('div');
    panel.id = 'customer-rotate-panel';
    panel.className = 'absolute bottom-[30px] right-[170px] z-10 bg-white/95 text-slate-900 px-4 py-3 rounded-xl shadow-2xl text-xs leading-5 w-52 text-center flex flex-col items-center gap-2 opacity-40 pointer-events-none select-none';
    panel.innerHTML = `
        <div class="w-full flex flex-col items-center gap-2">
            <div class="flex items-center justify-center gap-2" style="letter-spacing:0.1em;font-size:11px;">
                <i class="text-[12px]"></i>
                <span style="font-size:11px;">Rotate model</span>
            </div>
            <div class="rotate-btns grid grid-cols-3 gap-2 w-full">
                <button class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 uppercase tracking-wide transition duration-150 ease-in-out text-center" style="font-size:10px;" type="button" data-axis="x" data-dir="-1">X -90°</button>
                <button class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 uppercase tracking-wide transition duration-150 ease-in-out text-center" style="font-size:10px;" type="button" data-axis="x" data-dir="1">X +90°</button>
                <button class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 uppercase tracking-wide transition duration-150 ease-in-out text-center" style="font-size:10px;" type="button" data-axis="y" data-dir="-1">Y -90°</button>
                <button class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 uppercase tracking-wide transition duration-150 ease-in-out text-center" style="font-size:10px;" type="button" data-axis="y" data-dir="1">Y +90°</button>
                <button class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 uppercase tracking-wide transition duration-150 ease-in-out text-center" style="font-size:10px;" type="button" data-axis="z" data-dir="-1">Z -90°</button>
                <button class="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 uppercase tracking-wide transition duration-150 ease-in-out text-center" style="font-size:10px;" type="button" data-axis="z" data-dir="1">Z +90°</button>
            </div>
        </div>
    `;
    const rotate = (axis, dir) => {
        const widgets = getSelectedWidgets(api);
        if (!widgets.length) {
            return;
        }
        const angle = dir * ROTATE_STEP;
        const coords = { x: 0, y: 0, z: 0 };
        coords[axis] = angle;
        widgets.forEach(widget => {
            if (typeof widget.rotate === 'function') {
                widget.rotate(coords.x, coords.y, coords.z);
            }
        });
        if (typeof api.platform?.update_bounds === 'function') {
            api.platform.update_bounds();
        }
        if (typeof api.space?.update === 'function') {
            api.space.update();
        }
        api.space?.auto_save?.();
    };
    panel.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            rotate(btn.dataset.axis, parseInt(btn.dataset.dir, 10) || 0);
        });
    });
    host.appendChild(panel);
    rotatePanel = panel;
    setRotatePanelEnabled(false);
}

function getSelectedWidgets(api) {
    const widgets = api.widgets?.all ? api.widgets.all() : [];
    return widgets.filter(w => selectedWidgetIds.includes(w.id));
}

function renderObjectList(api, dom) {
    if (!dom.objectList) {
        return;
    }
    const list = dom.objectList;
    const countLabel = dom.objectCount;
    list.innerHTML = '';
    const widgets = api.widgets?.all ? api.widgets.all() : [];
    const filteredSelection = selectedWidgetIds.filter(id => widgets.some(w => w.id === id));
    selectedWidgetIds = filteredSelection;
    setRotatePanelEnabled(selectedWidgetIds.length > 0);
    if (countLabel) {
        countLabel.textContent = widgets.length.toString();
    }
    if (!widgets.length) {
        const li = document.createElement('li');
        li.className = 'text-slate-400';
        li.textContent = 'No objects loaded';
        list.appendChild(li);
        return;
    }
    widgets.forEach((w, idx) => {
        const name = (w?.meta?.file || `Object ${idx + 1}`).toString();
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between gap-2 text-slate-600 cursor-pointer rounded-md border border-transparent transition-colors duration-150 px-3 py-1';
        const isSelected = selectedWidgetIds.includes(w.id);
        li.classList.toggle('bg-slate-100', isSelected);
        li.classList.toggle('border-slate-300', isSelected);
        li.classList.toggle('text-slate-900', isSelected);
        const dot = document.createElement('span');
        dot.className = 'w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'inline-flex items-center gap-2 truncate';
        nameSpan.appendChild(dot);
        nameSpan.appendChild(document.createTextNode(name));
        const removeBtn = document.createElement('button');
        removeBtn.className = 'text-[10px] px-2 py-1 rounded border border-slate-200 hover:border-red-300 hover:text-red-600 transition';
        removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        removeBtn.addEventListener('click', event => {
            event.stopPropagation();
            try {
                if (api.platform?.delete) {
                    api.platform.delete(w);
                } else if (api.widgets?.remove) {
                    api.widgets.remove(w);
                }
                renderObjectList(api, dom);
            } catch (e) {
                console.debug('failed to delete widget', e);
            }
        });
        li.addEventListener('click', event => {
            event.stopPropagation();
            const alreadySelected = selectedWidgetIds.includes(w.id);
            const multiAdd = event.ctrlKey || event.metaKey || event.shiftKey;
            let nextSelection = [];
            if (multiAdd) {
                nextSelection = [...selectedWidgetIds];
                if (alreadySelected) {
                    nextSelection = nextSelection.filter(id => id !== w.id);
                } else {
                    nextSelection.push(w.id);
                }
            } else {
                nextSelection = alreadySelected && selectedWidgetIds.length === 1 ? [] : [w.id];
            }
            updateSelection(nextSelection, nextSelection.includes(w.id) ? w.id : nextSelection[0] || null);
            renderObjectList(api, dom);
        });
        li.appendChild(nameSpan);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

function startSlicing(api, dom) {
    uiState.slicing = true;
    setSliceButtonState(dom, true);
    if (dom.pricingNote) {
        dom.pricingNote.textContent = 'Slicing in progress…';
    }
    api.function.slice();
}

function fetchStats(api, dom) {
    api.function.export({
        silent: true,
        collectGCode: false,
        onExport(result) {
            const info = result?.info;
            if (!info) {
                resetStats(dom, 'Unable to calculate price. Please slice again.');
                return;
            }
            const stats = buildStats(info, api);
            uiState.stats = stats;
            renderStats(dom, stats);
        }
    });
}

function buildStats(info, api) {
    const distance = info.distance || 0;
    let timeSeconds = info.time || 0;
    const settings = info.settings || api.conf.get();
    const filament = settings?.device?.extruders?.[0]?.extFilament || 1.75;
    const weight = calcWeight(distance, filament, DEFAULT_FILAMENT_DENSITY);
    const isK1 = (settings?.device?.deviceName || '').toLowerCase().includes('creality k1');
    if (isK1 && distance > 0) {
        // Derive time from toolpath length using K1 PLA speed when available
        const k1Seconds = distance / CREALITY_K1_PRINT_MM_S;
        timeSeconds = Math.max(timeSeconds, k1Seconds);
    }
    const hours = timeSeconds / 3600;
    const price = (weight * price_per_gram) + (hours * price_per_hour);
    return {
        timeSeconds,
        weightGrams: weight,
        price
    };
}

function calcWeight(distance, filamentDiameter, density) {
    const dia = isFinite(filamentDiameter) && filamentDiameter > 0 ? filamentDiameter : 1.75;
    const safeDensity = isFinite(density) && density > 0 ? density : DEFAULT_FILAMENT_DENSITY;
    const radius = dia / 2;
    const area = Math.PI * Math.pow(radius, 2);
    const volume = area * distance;
    const grams = (volume * safeDensity) / 1000;
    return isFinite(grams) ? grams : 0;
}

function renderStats(dom, stats) {
    if (dom.statTime) {
        dom.statTime.textContent = formatTime(stats.timeSeconds);
    }
    if (dom.statWeight) {
        dom.statWeight.textContent = `${stats.weightGrams.toFixed(4)} g`;
    }
    if (dom.statPrice) {
        dom.statPrice.textContent = currencyFormatter.format(Math.max(0, Math.round(stats.price)));
    }
    if (dom.pricingNote) {
        dom.pricingNote.textContent = 'Quote ready! Place your order whenever you are ready.';
    }
    if (dom.orderBtn) {
        dom.orderBtn.disabled = false;
    }
}

function resetStats(dom, message) {
    if (dom.statTime) dom.statTime.textContent = '--:--';
    if (dom.statWeight) dom.statWeight.textContent = '-- g';
    if (dom.statPrice) dom.statPrice.textContent = '--';
    if (dom.pricingNote) dom.pricingNote.textContent = message || 'Click “Slice & Price” after upload.';
    if (dom.orderBtn) {
        dom.orderBtn.disabled = true;
        dom.orderBtn.textContent = 'Place Order';
    }
    if (dom.undoBtn) {
        dom.undoBtn.disabled = true;
    }
    const slider = document.getElementById('slice-layer-slider');
    const label = document.getElementById('slice-layer-label');
    const hint = document.getElementById('slice-preview-hint');
    const panel = document.getElementById('slice-preview-panel');
    if (slider) {
        slider.disabled = true;
        slider.value = 0;
        slider.max = 0;
    }
    if (label) {
        label.textContent = '-- / --';
    }
    if (hint) {
        hint.textContent = 'Slice to unlock preview.';
    }
    if (panel) {
        panel.classList.add('opacity-60');
    }
    window.dispatchEvent(new Event('slice-preview-reset'));
    hideOrderModal(dom);
    uiState.stats = null;
    uiState.hasSliced = false;
}

function setSliceButtonState(dom, busy) {
    if (!dom.sliceBtn) {
        return;
    }
    const widgetCount = self.kiri_api?.widgets.count() || 0;
    dom.sliceBtn.disabled = busy || widgetCount === 0;
    dom.sliceBtn.innerHTML = busy ? SLICE_BUSY_HTML : (dom.sliceDefault || SLICE_READY_HTML);
}

function setSliceProgress(percent, visible = true) {
    if (!sliceProgress.bar || !sliceProgress.wrap) return;
    sliceProgress.percent = Math.min(100, Math.max(0, percent));
    sliceProgress.bar.style.width = `${sliceProgress.percent}%`;
    sliceProgress.wrap.style.opacity = visible && sliceProgress.percent > 0 ? 1 : 0;
}

function setGlobalInputsEnabled(dom, slicing) {
    const disable = !!slicing;
    // toggle whole sidebar + drop zone
    setSettingsEnabled(dom, !disable);
    if (dom.uploadBtn) {
        dom.uploadBtn.disabled = disable;
        dom.uploadBtn.classList.toggle('opacity-50', disable);
        dom.uploadBtn.classList.toggle('cursor-not-allowed', disable);
    }
    if (dom.fileInput) dom.fileInput.disabled = disable;
    if (dom.dropZone) {
        dom.dropZone.classList.toggle('pointer-events-none', disable);
        dom.dropZone.classList.toggle('opacity-60', disable);
    }
    // disable object list delete buttons
    if (dom.objectList) {
        dom.objectList.querySelectorAll('button').forEach(btn => {
            btn.disabled = disable;
        });
    }
    // disable slice/order buttons
    if (dom.sliceBtn) dom.sliceBtn.disabled = disable || (self.kiri_api?.widgets.count() || 0) === 0;
    if (dom.orderBtn) dom.orderBtn.disabled = disable || !uiState.hasSliced;
}

function updateSliceAvailability(api, dom) {
    const widgetCount = api.widgets.count();
    const hasWidgets = widgetCount > 0;
    if (dom.sliceBtn) {
        dom.sliceBtn.disabled = uiState.slicing || !hasWidgets;
    }
    setSettingsEnabled(dom, hasWidgets);
    setViewerPlaceholderVisible(dom, !hasWidgets);
    updateUndoState(api, dom);
    renderObjectList(api, dom);
}

function updateUploadStatus(dom, label) {
    const status = dom.uploadStatus;
    const normalized = (label || '').trim();
    const lower = normalized.toLowerCase();
    const hasFile = normalized.length > 0 && lower !== 'no file';
    setSliceProgress(0, false);
    if (status) {
        status.textContent = normalized || 'No File';
        status.classList.toggle('bg-slate-100', !hasFile);
        status.classList.toggle('text-slate-500', !hasFile);
        status.classList.toggle('bg-green-100', hasFile);
        status.classList.toggle('text-green-700', hasFile);
    }
    if (dom.dropText) {
        dom.dropText.textContent = hasFile ? normalized : DROP_DEFAULT_TEXT;
    }
    markDropZoneState(dom, hasFile);
}

function setSettingsEnabled(dom, enabled) {
    if (!dom.settingsPanel) {
        return;
    }
    dom.settingsPanel.classList.toggle('opacity-50', !enabled);
    dom.settingsPanel.classList.toggle('pointer-events-none', !enabled);
    dom.settingsPanel.querySelectorAll('input, select, button').forEach(el => {
        el.disabled = !enabled;
    });
}

function setViewerPlaceholderVisible(dom, visible) {
    if (!dom.viewerPlaceholder) {
        return;
    }
    dom.viewerPlaceholder.style.display = visible ? '' : 'none';
}

function markDropZoneState(dom, active) {
    if (!dom.dropZone) {
        return;
    }
    dom.dropZone.classList.toggle('border-brand-500', active);
    dom.dropZone.classList.toggle('bg-brand-50', active);
    dom.dropZone.classList.toggle('is-loaded', active);
}

function showOrderModal(dom) {
    if (!dom.orderForm) {
        return;
    }
    dom.orderForm.hidden = false;
    dom.orderForm.classList.remove('hidden');
}

function hideOrderModal(dom) {
    if (!dom.orderForm) {
        return;
    }
    dom.orderForm.hidden = true;
    dom.orderForm.classList.add('hidden');
}

function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) {
        return `${hours}h ${mins}m`;
    }
    if (mins) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}
