const price_per_gram = 8000;
const price_per_hour = 20000;
const DEFAULT_FILAMENT_DENSITY = 1.25;
const currencyFormatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
});
const SLICE_READY_HTML = 'Slice &amp; Get Price';
const SLICE_BUSY_HTML = '<div class="loader w-4 h-4 mr-2 !border-2 !border-white !border-t-transparent"></div> Slicing...';
const DROP_DEFAULT_TEXT = 'Drop STL here';

const uiState = {
    slicing: false,
    stats: null,
    fileName: ''
};

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

function initSimpleUI(api) {
    if (window.__simple_ui_initialized) {
        return;
    }
    window.__simple_ui_initialized = true;

    const dom = {
        shell: document.getElementById('customer-shell') || document.getElementById('app'),
        dropZone: document.getElementById('customer-drop-zone'),
        fileInput: document.getElementById('customer-file-input'),
        uploadStatus: document.getElementById('customer-upload-status') || document.getElementById('file-status-badge'),
        dropText: document.getElementById('customer-drop-text'),
        uploadBtn: document.getElementById('customer-upload-btn'),
        viewerHost: document.getElementById('customer-viewer'),
        viewerPlaceholder: document.getElementById('viewer-placeholder'),
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
        settingsPanel: document.getElementById('settings-panel'),
        orderName: document.getElementById('customer-name'),
        orderPhone: document.getElementById('customer-phone'),
        orderNotes: document.getElementById('customer-notes')
    };
    dom.sliceDefault = dom.sliceBtn?.innerHTML || SLICE_READY_HTML;

    if (!dom.shell) {
        return;
    }

    const canvas = document.getElementById('container');
    if (canvas && dom.viewerHost && canvas.parentElement !== dom.viewerHost) {
        dom.viewerHost.appendChild(canvas);
    }

    setupInfillControls(api, dom);
    setupUploader(api, dom);
    setupSlicing(api, dom);
    setupOrderForm(dom);
    resetStats(dom, 'Upload an STL to begin.');
}

function setupInfillControls(api, dom) {
    const settings = api.conf.get();
    const currentProcess = settings?.process || {};
    if (dom.infillType) {
        dom.infillType.value = currentProcess.sliceFillType || dom.infillType.value;
        dom.infillType.addEventListener('change', () => {
            currentProcess.sliceFillType = dom.infillType.value;
            api.conf.save();
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
            api.conf.save();
        });
    }
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
    });

    api.event.on('widget.delete', () => {
        if (api.widgets.count() === 0) {
            uiState.fileName = '';
            resetStats(dom, 'Upload an STL to begin.');
            updateUploadStatus(dom, 'No File');
        }
        updateSliceAvailability(api, dom);
    });

    updateSliceAvailability(api, dom);
}

function setupSlicing(api, dom) {
    if (dom.sliceBtn) {
        dom.sliceBtn.addEventListener('click', () => {
            if (uiState.slicing || api.widgets.count() === 0) {
                return;
            }
            startSlicing(api, dom);
        });
    }

    api.event.on('slice.begin', () => {
        uiState.slicing = true;
        setSliceButtonState(dom, true);
        if (dom.pricingNote) {
            dom.pricingNote.textContent = 'Slicing in progress…';
        }
    });

    api.event.on('slice.error', error => {
        console.warn('Slicing error', error);
        uiState.slicing = false;
        setSliceButtonState(dom, false);
        if (dom.pricingNote) {
            dom.pricingNote.textContent = 'Something went wrong. Please try again.';
        }
    });

    api.event.on('slice.end', () => {
        uiState.slicing = false;
        setSliceButtonState(dom, false);
        if (dom.pricingNote) {
            dom.pricingNote.textContent = 'Crunching numbers…';
        }
        fetchStats(api, dom);
    });
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
    const timeSeconds = info.time || 0;
    const settings = info.settings || api.conf.get();
    const filament = settings?.device?.extruders?.[0]?.extFilament || 1.75;
    const weight = calcWeight(distance, filament, DEFAULT_FILAMENT_DENSITY);
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
        dom.statWeight.textContent = `${stats.weightGrams.toFixed(1)} g`;
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
    hideOrderModal(dom);
    uiState.stats = null;
}

function setSliceButtonState(dom, busy) {
    if (!dom.sliceBtn) {
        return;
    }
    const widgetCount = self.kiri_api?.widgets.count() || 0;
    dom.sliceBtn.disabled = busy || widgetCount === 0;
    dom.sliceBtn.innerHTML = busy ? SLICE_BUSY_HTML : (dom.sliceDefault || SLICE_READY_HTML);
}

function updateSliceAvailability(api, dom) {
    const widgetCount = api.widgets.count();
    const hasWidgets = widgetCount > 0;
    if (dom.sliceBtn) {
        dom.sliceBtn.disabled = uiState.slicing || !hasWidgets;
    }
    setSettingsEnabled(dom, hasWidgets);
    setViewerPlaceholderVisible(dom, !hasWidgets);
}

function updateUploadStatus(dom, label) {
    const status = dom.uploadStatus;
    const normalized = (label || '').trim();
    const lower = normalized.toLowerCase();
    const hasFile = normalized.length > 0 && lower !== 'no file';
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
