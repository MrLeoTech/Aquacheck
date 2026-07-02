/**
 * AquaCheck Water Quality v3.1
 * Parque Aquático de Amarante
 */
const AquaApp = (() => {
  let currentUser = null;
  let currentRecord = null;
  let currentPoolId = null;
  let currentTime = null;
  let currentDateISO = null;
  let config = null;
  let allRecords = [];
  let deferredPrompt = null;
  let photoTarget = 'pool';
  let autoSaveTimer = null;
  let recordsCacheTime = 0;

  let sigCanvas, sigCtx, sigDrawing = false;
  let sigBound = false;

  const screens = {
    login: $('#login-screen'),
    app: $('#app-screen'),
    record: $('#record-screen'),
    history: $('#history-screen'),
    search: $('#search-screen'),
    settings: $('#settings-screen'),
    charts: $('#charts-screen')
  };

  async function refreshRecords() {
    allRecords = await AquaStorage.getAllRecords();
    recordsCacheTime = Date.now();
    return allRecords;
  }

  function getRecordsForDate(dateISO) {
    return allRecords.filter(r => r.date === dateISO);
  }

  function getLimits(param) {
    return AquaExport.getLimits(param, config);
  }

  // ─── INIT ───

  async function init() {
    await AquaStorage.init();
    config = await AquaStorage.getConfig();
    await refreshRecords();
    initTheme();
    setupInstallPrompt();
    registerSW();

    updatePinFieldVisibility();

    const savedUser = await AquaStorage.getUser();
    if (savedUser?.name) {
      currentUser = savedUser;
      showScreen(screens, 'app');
      await initApp();
      return;
    }

    $('#btn-login').addEventListener('click', handleLogin);
    $('#employee-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    $('#employee-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  }

  async function handleLogin() {
    const name = $('#employee-name').value.trim();
    if (!name) { showToast('Por favor, insira o nome do funcionário.', 'error'); return; }

    if (config.pin) {
      const pin = $('#employee-pin').value.trim();
      if (hashPin(pin) !== hashPin(config.pin)) {
        showToast('PIN incorreto.', 'error');
        return;
      }
    }

    currentUser = { name, loginDate: nowISO() };
    await AquaStorage.saveUser(currentUser);
    showScreen(screens, 'app');
    await initApp();
    showToast(`Bem-vindo, ${name}!`);
  }

  async function initApp() {
    currentDateISO = formatDateISO(new Date());
    $('#current-date').value = currentDateISO;
    updateDateLabel();
    updatePinFieldVisibility();
    renderPools();
    updateDashboard();
    updateFooter();
    setupAppEvents();
    bindSignatureOnce();

    if (config.enableNotifications) {
      AquaNotifications.requestPermission().then(() => {
        AquaNotifications.checkPendingReadings(config, async (iso) => getRecordsForDate(iso));
      });
      AquaNotifications.scheduleDailyCheck(config, async (iso) => getRecordsForDate(iso));
    }

    maybeAutoBackup();
    startAutoSaveInterval();
  }

  function updatePinFieldVisibility() {
    const wrap = $('#pin-field-wrap');
    if (wrap) wrap.style.display = config.pin ? 'flex' : 'none';
  }

  function updateDateLabel() {
    $('#current-date-label').textContent = formatDateLong(currentDateISO);
  }

  function updateFooter() {
    $('#footer-user').textContent = currentUser?.name || '—';
    $('#footer-date').textContent = `${formatDateDisplay(formatDateISO(new Date()))} ${nowTime()}`;
  }

  function changeDate(days) {
    const d = isoToDate(currentDateISO);
    d.setDate(d.getDate() + days);
    currentDateISO = formatDateISO(d);
    $('#current-date').value = currentDateISO;
    updateDateLabel();
    renderPools();
    updateDashboard();
  }

  function setDateFromInput(e) {
    if (e.target.value) {
      currentDateISO = e.target.value;
      updateDateLabel();
      renderPools();
      updateDashboard();
    }
  }

  // ─── POOLS ───

  function renderPools() {
    const grid = $('#pools-grid');
    const records = getRecordsForDate(currentDateISO);

    grid.innerHTML = config.pools.map(pool => {
      const poolRecords = records.filter(r => r.poolId === pool.id);
      const completedTimes = poolRecords.filter(r => r.completed).map(r => r.time);
      const hasAlerts = poolRecords.some(r => r.hasAlerts);

      const dots = config.times.map(t => {
        const rec = poolRecords.find(r => r.time === t);
        let cls = '';
        if (rec?.completed) cls = rec.hasAlerts ? 'alert' : 'filled';
        return `<span class="pool-time-dot ${cls}" title="${t}"></span>`;
      }).join('');

      let statusClass = '';
      if (completedTimes.length === config.times.length) statusClass = hasAlerts ? 'alert' : 'complete';
      else if (completedTimes.length > 0) statusClass = 'partial';

      return `
        <div class="pool-card" data-pool="${pool.id}" role="button" tabindex="0" aria-label="Registar ${pool.name}">
          <span class="pool-status ${statusClass}"></span>
          <span class="pool-emoji">${pool.emoji}</span>
          <span class="pool-name">${pool.name}</span>
          <div class="pool-times">${dots}</div>
        </div>`;
    }).join('');

    $$('.pool-card').forEach(card => {
      card.onclick = () => openPool(card.dataset.pool);
      card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPool(card.dataset.pool); } };
    });
  }

  // ─── RECORD ───

  async function openPool(poolId, timeSlot = null) {
    currentPoolId = poolId;
    const pool = config.pools.find(p => p.id === poolId);
    if (!pool) return;

    currentTime = timeSlot && config.times.includes(timeSlot) ? timeSlot : config.times[0];
    await loadOrCreateRecord();

    $('#record-pool-title').textContent = pool.name;
    $('#record-date').textContent = formatDateDisplay(currentRecord.date);
    $('#record-time').textContent = currentRecord.time;
    updateRecordStatus();
    renderTimeSelector();
    renderParamsForm();
    loadObservations();
    renderPoolPhotos();
    loadSignatureCanvas();
    showComparisonHint();
    showScreen(screens, 'record');
  }

  async function loadOrCreateRecord() {
    const existing = allRecords.find(r =>
      r.poolId === currentPoolId && r.date === currentDateISO && r.time === currentTime
    );

    if (existing) {
      currentRecord = JSON.parse(JSON.stringify(existing));
    } else {
      currentRecord = {
        id: 'rec_' + Date.now(),
        poolId: currentPoolId,
        poolName: config.pools.find(p => p.id === currentPoolId)?.name || currentPoolId,
        employee: currentUser.name,
        date: currentDateISO,
        time: currentTime,
        timestamp: nowISO(),
        completed: false,
        params: {},
        observations: '',
        photos: [],
        signature: null,
        hasAlerts: false
      };
      PARAMETERS.forEach(p => {
        if (p.type === 'checkbox') currentRecord.params[p.key] = false;
        else currentRecord.params[p.key] = '';
      });
    }
  }

  function loadObservations() {
    const ta = $('#record-observations');
    if (ta) ta.value = currentRecord.observations || '';
  }

  function updateRecordStatus() {
    const badge = $('#record-status');
    badge.textContent = currentRecord.completed ? 'Guardado' : 'Em curso';
    badge.className = 'status-badge ' + (currentRecord.completed ? 'completed' : 'pending');
  }

  function renderTimeSelector() {
    const select = $('#record-time-select');
    select.innerHTML = config.times.map(t =>
      `<option value="${t}" ${t === currentTime ? 'selected' : ''}>${t}</option>`
    ).join('');

    select.onchange = async (e) => {
      await saveCurrentRecord(false);
      currentTime = e.target.value;
      await loadOrCreateRecord();
      $('#record-time').textContent = currentTime;
      updateRecordStatus();
      renderParamsForm();
      loadObservations();
      renderPoolPhotos();
      loadSignatureCanvas();
      showComparisonHint();
    };
  }

  function showComparisonHint() {
    const hint = $('#comparison-hint');
    if (!hint) return;
    const records = getRecordsForDate(currentDateISO).filter(r =>
      r.poolId === currentPoolId && r.completed && r.time !== currentTime
    );
    if (!records.length) { hint.textContent = ''; hint.classList.remove('visible'); return; }

    const prev = records.sort((a, b) => b.time.localeCompare(a.time))[0];
    const parts = [];
    ['ph', 'cloro_livre', 'temp_agua'].forEach(key => {
      const cur = parseFloat(currentRecord.params[key]);
      const old = parseFloat(prev.params[key]);
      if (!isNaN(cur) && !isNaN(old)) {
        const diff = (cur - old).toFixed(2);
        const sign = diff > 0 ? '+' : '';
        parts.push(`${PARAMETERS.find(p => p.key === key)?.label}: ${sign}${diff}`);
      }
    });
    if (parts.length) {
      hint.textContent = `Comparado com ${prev.time}: ${parts.join(' | ')}`;
      hint.classList.add('visible');
    } else {
      hint.textContent = '';
      hint.classList.remove('visible');
    }
  }

  // ─── PARAMS ───

  function renderParamsForm() {
    const container = $('#params-form');
    container.innerHTML = PARAMETERS.map(p => {
      const value = currentRecord.params[p.key];
      const limits = getLimits(p);

      if (p.type === 'checkbox') {
        return `
          <div class="param-row" data-key="${p.key}">
            <div class="param-checkbox-wrap">
              <input type="checkbox" id="param-${p.key}" data-key="${p.key}" ${value ? 'checked' : ''}>
              <label for="param-${p.key}">${p.label}</label>
            </div>
          </div>`;
      }

      const alertCls = getParamAlertClass(p, value);
      const alertMsg = getParamAlertMessage(p, value);

      return `
        <div class="param-row ${alertCls}" data-key="${p.key}">
          <div class="param-header">
            <span class="param-label">${p.label}${config.requiredFields.includes(p.key) ? ' *' : ''}</span>
            <span class="param-limits">${limits.min} – ${limits.max} ${p.unit}</span>
          </div>
          <div class="param-input-wrap">
            <input type="number" id="param-${p.key}" data-key="${p.key}"
              value="${value !== '' && value != null ? value : ''}" step="${p.step}"
              ${p.readonly ? 'readonly' : ''} class="${alertCls}" placeholder="—"
              inputmode="decimal">
            <span class="param-unit">${p.unit}</span>
          </div>
          <div class="param-alert-msg ${alertMsg ? 'visible' : ''}" id="alert-${p.key}">${alertMsg}</div>
        </div>`;
    }).join('');

    $$('#params-form input[type="number"]').forEach(inp => {
      if (!inp.readOnly) {
        inp.oninput = debounce((e) => {
          const key = e.target.dataset.key;
          currentRecord.params[key] = e.target.value;
          validateParam(key, e.target.value);
          if (key === 'cloro_livre' || key === 'cloro_total') calculateCombinedChlorine();
          showComparisonHint();
          scheduleAutoSave();
        }, 150);
      }
    });

    $$('#params-form input[type="checkbox"]').forEach(cb => {
      cb.onchange = (e) => {
        currentRecord.params[e.target.dataset.key] = e.target.checked;
        scheduleAutoSave();
      };
    });
  }

  function calculateCombinedChlorine() {
    const livre = parseFloat(currentRecord.params.cloro_livre) || 0;
    const total = parseFloat(currentRecord.params.cloro_total) || 0;

    if (livre > 0 && total > 0 && livre > total) {
      const msg = $('#alert-cloro_combinado');
      if (msg) {
        msg.textContent = '⚠ Cloro livre superior ao cloro total — verifique os valores';
        msg.classList.add('visible');
      }
      const row = $('.param-row[data-key="cloro_total"]');
      if (row) row.classList.add('warning');
    }

    const combinado = Math.max(0, total - livre);
    const rounded = Math.round(combinado * 100) / 100;
    currentRecord.params.cloro_combinado = rounded;

    const inp = $('#param-cloro_combinado');
    if (inp) {
      inp.value = rounded;
      validateParam('cloro_combinado', rounded);
    }
  }

  function validateParam(key, value) {
    const p = PARAMETERS.find(x => x.key === key);
    if (!p || p.type === 'checkbox') return;

    const num = parseFloat(value);
    const row = $(`.param-row[data-key="${key}"]`);
    const inp = $(`#param-${key}`);
    const msg = $(`#alert-${key}`);
    if (!row || !inp || !msg) return;

    const limits = getLimits(p);
    let alertCls = '';
    let message = '';

    if (value !== '' && !isNaN(num)) {
      if (num < limits.min) {
        alertCls = 'alert';
        message = key === 'ph' ? 'pH abaixo do limite.' : key === 'cloro_livre' ? 'Cloro insuficiente.' : `⚠ Valor abaixo do limite (${limits.min}${p.unit})`;
      } else if (num > limits.max) {
        alertCls = 'alert';
        message = key === 'ph' ? 'pH acima do limite.' : key === 'cloro_livre' ? 'Cloro elevado.' : key === 'cloro_combinado' ? 'Cloro combinado elevado!' : `⚠ Valor acima do limite (${limits.max}${p.unit})`;
      } else {
        const range = limits.max - limits.min;
        if (range > 0 && (num - limits.min < range * 0.15 || limits.max - num < range * 0.15)) {
          alertCls = 'warning';
          message = '⚡ Próximo do limite';
        }
      }
    }

    row.className = 'param-row ' + alertCls;
    inp.className = alertCls;
    msg.textContent = message;
    msg.className = 'param-alert-msg ' + (message ? 'visible' : '');
  }

  function getParamAlertClass(p, value) {
    if (p.type === 'checkbox' || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    const limits = getLimits(p);
    if (num < limits.min || num > limits.max) return 'alert';
    const range = limits.max - limits.min;
    if (range > 0 && (num - limits.min < range * 0.15 || limits.max - num < range * 0.15)) return 'warning';
    return '';
  }

  function getParamAlertMessage(p, value) {
    if (p.type === 'checkbox' || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    const limits = getLimits(p);
    if (num < limits.min) {
      if (p.key === 'ph') return 'pH abaixo do limite.';
      if (p.key === 'cloro_livre') return 'Cloro insuficiente.';
      return `⚠ Abaixo do mínimo (${limits.min}${p.unit})`;
    }
    if (num > limits.max) {
      if (p.key === 'ph') return 'pH acima do limite.';
      if (p.key === 'cloro_livre') return 'Cloro elevado.';
      if (p.key === 'cloro_combinado') return 'Cloro combinado elevado!';
      return `⚠ Acima do máximo (${limits.max}${p.unit})`;
    }
    const range = limits.max - limits.min;
    if (range > 0 && (num - limits.min < range * 0.15 || limits.max - num < range * 0.15)) return '⚡ Próximo do limite';
    return '';
  }

  function canvasHasSignature() {
    if (currentRecord.signature) return true;
    if (!sigCanvas) return false;
    const pixels = sigCanvas.getContext('2d').getImageData(0, 0, sigCanvas.width, sigCanvas.height).data;
    for (let i = 3; i < pixels.length; i += 16) {
      if (pixels[i] > 0) return true;
    }
    return false;
  }

  function validateBeforeSave() {
    const missing = config.requiredFields.filter(key => {
      const p = PARAMETERS.find(x => x.key === key);
      if (!p) return false;
      const val = currentRecord.params[key];
      return val === '' || val == null;
    });

    if (missing.length) {
      const labels = missing.map(k => PARAMETERS.find(p => p.key === k)?.label).join(', ');
      showToast(`Campos obrigatórios em falta: ${labels}`, 'error');
      return false;
    }

    if (config.requireSignature) {
      if (!canvasHasSignature()) {
        showToast('Assinatura do responsável é obrigatória.', 'error');
        return false;
      }
      if (!currentRecord.signature && sigCanvas) {
        currentRecord.signature = sigCanvas.toDataURL('image/png');
      }
    }

    const livre = parseFloat(currentRecord.params.cloro_livre);
    const total = parseFloat(currentRecord.params.cloro_total);
    if (!isNaN(livre) && !isNaN(total) && livre > total) {
      showToast('Cloro livre não pode ser superior ao cloro total.', 'error');
      return false;
    }

    return true;
  }

  function computeHasAlerts() {
    let hasAlerts = false;
    PARAMETERS.forEach(p => {
      if (p.type === 'number' && !p.readonly) {
        const val = parseFloat(currentRecord.params[p.key]);
        if (!isNaN(val)) {
          const limits = getLimits(p);
          if (val < limits.min || val > limits.max) hasAlerts = true;
        }
      }
    });
    const cc = parseFloat(currentRecord.params.cloro_combinado);
    if (!isNaN(cc) && cc > config.ccMax) hasAlerts = true;
    return hasAlerts;
  }

  async function saveCurrentRecord(showMsg = true, forceComplete = true) {
    const obsTextarea = $('#record-observations');
    if (obsTextarea) currentRecord.observations = obsTextarea.value.trim();

    if (forceComplete) {
      currentRecord.hasAlerts = computeHasAlerts();
      currentRecord.completed = true;
      currentRecord.savedAt = nowISO();
    }

    currentRecord.employee = currentUser?.name || currentRecord.employee;
    await AquaStorage.upsertRecord(currentRecord);
    await refreshRecords();

    if (showMsg) {
      showToast(
        currentRecord.hasAlerts ? 'Registo guardado com alertas!' : 'Registo guardado com sucesso!',
        currentRecord.hasAlerts ? 'error' : 'success'
      );
    }
    updateRecordStatus();
    renderPools();
  }

  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (currentRecord && screens.record.classList.contains('active')) {
        await saveCurrentRecord(false, false);
      }
    }, 2000);
  }

  function startAutoSaveInterval() {
    setInterval(async () => {
      if (currentRecord && screens.record.classList.contains('active')) {
        await saveCurrentRecord(false, false);
      }
    }, 30000);
  }

  // ─── OCR ───

  async function handleOCRPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      resizeImage(ev.target.result, 1200, 900, 0.85, async (resized) => {
        showToast('A analisar imagem com OCR...');
        $('#btn-ocr-doseadora').disabled = true;
        try {
          const detected = await AquaOCR.recognize(resized);
          let filled = 0;

          if (detected.ph) {
            currentRecord.params.ph = detected.ph;
            const inp = $('#param-ph');
            if (inp) { inp.value = detected.ph; validateParam('ph', detected.ph); filled++; }
          }
          if (detected.temp) {
            currentRecord.params.temp_agua = detected.temp;
            const inp = $('#param-temp_agua');
            if (inp) { inp.value = detected.temp; validateParam('temp_agua', detected.temp); filled++; }
          }
          if (detected.cloro) {
            currentRecord.params.cloro_livre = detected.cloro;
            const inp = $('#param-cloro_livre');
            if (inp) { inp.value = detected.cloro; validateParam('cloro_livre', detected.cloro); calculateCombinedChlorine(); filled++; }
          }

          if (filled > 0) {
            showToast(`${filled} valor(es) detetado(s). Verifique e corrija se necessário.`, 'success');
            scheduleAutoSave();
          } else {
            showToast('Não foi possível ler valores. Insira manualmente.', 'error');
          }
        } catch (err) {
          showToast('Erro no OCR: ' + (err.message || 'tente novamente'), 'error');
        } finally {
          $('#btn-ocr-doseadora').disabled = false;
        }
      });
    };
    reader.readAsDataURL(file);
  }

  // ─── PHOTOS ───

  function renderPoolPhotos() {
    const container = $('#pool-photos');
    container.innerHTML = (currentRecord.photos || []).map((photo, idx) => `
      <div class="photo-thumb-wrap">
        <img src="${photo}" class="photo-thumb" data-idx="${idx}" alt="Foto ${idx + 1}">
        <button type="button" class="photo-delete" data-idx="${idx}" aria-label="Remover foto ${idx + 1}">&times;</button>
      </div>
    `).join('');

    $$('#pool-photos .photo-thumb').forEach(img => {
      img.onclick = () => openLightbox(img.src);
    });
    $$('#pool-photos .photo-delete').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        currentRecord.photos.splice(idx, 1);
        renderPoolPhotos();
        scheduleAutoSave();
        showToast('Fotografia removida');
      };
    });
  }

  function handlePhotoInput(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      resizeImage(ev.target.result, 800, 600, 0.7, async (resized) => {
        if (!currentRecord.photos) currentRecord.photos = [];
        currentRecord.photos.push(resized);
        renderPoolPhotos();
        scheduleAutoSave();
        showToast('Fotografia adicionada');
      });
    };
    reader.readAsDataURL(file);
  }

  // ─── SIGNATURE ───

  function bindSignatureOnce() {
    if (sigBound) return;
    sigBound = true;
    sigCanvas = $('#signature-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    sigCtx.strokeStyle = '#0c4a6e';
    sigCtx.lineWidth = 2;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';

    sigCanvas.addEventListener('mousedown', startSig);
    sigCanvas.addEventListener('mousemove', drawSig);
    sigCanvas.addEventListener('mouseup', endSig);
    sigCanvas.addEventListener('mouseleave', endSig);
    sigCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startSig(e.touches[0]); }, { passive: false });
    sigCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); drawSig(e.touches[0]); }, { passive: false });
    sigCanvas.addEventListener('touchend', endSig);
  }

  function loadSignatureCanvas() {
    bindSignatureOnce();
    if (!sigCanvas || !sigCtx) return;

    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    const hint = $('.signature-hint');

    if (currentRecord.signature) {
      const img = new Image();
      img.onload = () => {
        sigCtx.drawImage(img, 0, 0);
        hint?.classList.add('hidden');
      };
      img.src = currentRecord.signature;
    } else {
      hint?.classList.remove('hidden');
    }
  }

  function getSigPos(e) {
    const rect = sigCanvas.getBoundingClientRect();
    const scaleX = sigCanvas.width / rect.width;
    const scaleY = sigCanvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startSig(e) {
    sigDrawing = true;
    const pos = getSigPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
    $('.signature-hint')?.classList.add('hidden');
  }

  function drawSig(e) {
    if (!sigDrawing) return;
    const pos = getSigPos(e);
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
  }

  function endSig() {
    sigDrawing = false;
    sigCtx.beginPath();
  }

  function clearSignature() {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    currentRecord.signature = null;
    $('.signature-hint')?.classList.remove('hidden');
  }

  function saveSignature() {
    currentRecord.signature = sigCanvas.toDataURL('image/png');
    showToast('Assinatura guardada');
    scheduleAutoSave();
  }

  // ─── DASHBOARD ───

  function updateDashboard() {
    const records = getRecordsForDate(currentDateISO);
    const completed = records.filter(r => r.completed);
    const alerts = completed.filter(r => r.hasAlerts);
    const expected = config.pools.length * config.times.length;
    const pct = expected ? Math.round((completed.length / expected) * 100) : 0;

    const welcome = $('#welcome-user');
    if (welcome) welcome.textContent = currentUser?.name ? `Olá, ${currentUser.name.split(' ')[0]}!` : 'Olá!';

    const statusEl = $('#dashboard-status');
    if (statusEl) {
      statusEl.className = 'dashboard-status';
      if (pct === 100 && alerts.length === 0) {
        statusEl.textContent = '✓ Dia completo — todas as leituras registadas!';
        statusEl.classList.add('status-complete');
      } else if (pct === 100 && alerts.length > 0) {
        statusEl.textContent = `Dia completo com ${alerts.length} alerta(s) a rever.`;
        statusEl.classList.add('status-alert');
      } else if (completed.length === 0) {
        statusEl.textContent = `${expected} leituras planeadas — comece por selecionar uma piscina.`;
      } else {
        statusEl.textContent = `${expected - completed.length} leitura(s) em falta — continue o registo.`;
      }
    }

    const ring = $('#progress-ring');
    const ringPct = $('#progress-pct');
    if (ring) ring.style.setProperty('--pct', pct);
    if (ringPct) ringPct.textContent = pct + '%';

    $('#dash-pools-checked').textContent = new Set(completed.map(r => r.poolId)).size;
    $('#dash-readings').textContent = completed.length;
    $('#dash-alerts').textContent = alerts.length;

    const alertsCard = $('#dash-alerts-card');
    if (alertsCard) alertsCard.classList.toggle('alert', alerts.length > 0);

    const phValues = completed.map(r => parseFloat(r.params.ph)).filter(v => !isNaN(v));
    const clValues = completed.map(r => parseFloat(r.params.cloro_livre)).filter(v => !isNaN(v));
    const tempValues = completed.map(r => parseFloat(r.params.temp_agua)).filter(v => !isNaN(v));

    $('#dash-ph-avg').textContent = phValues.length ? (phValues.reduce((a, b) => a + b, 0) / phValues.length).toFixed(2) : '—';
    $('#dash-cl-avg').textContent = clValues.length ? (clValues.reduce((a, b) => a + b, 0) / clValues.length).toFixed(2) : '—';
    $('#dash-temp-avg').textContent = tempValues.length ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(1) : '—';

    $('#progress-fill').style.width = pct + '%';
    $('#progress-text').textContent = `${completed.length}/${expected} leituras (${pct}%)`;

    const pending = [];
    config.times.forEach(t => {
      config.pools.forEach(pool => {
        const done = completed.find(r => r.poolId === pool.id && r.time === t);
        if (!done) pending.push({ poolId: pool.id, pool: pool.name, time: t });
      });
    });

    const pendingEl = $('#pending-list');
    if (pendingEl) {
      if (pending.length === 0) {
        pendingEl.innerHTML = '<p class="pending-empty">✓ Todas as leituras do dia estão completas!</p>';
      } else {
        pendingEl.innerHTML = pending.slice(0, 10).map(p =>
          `<button type="button" class="pending-chip" data-pool="${p.poolId}" data-time="${p.time}">${p.pool} (${p.time})</button>`
        ).join('') + (pending.length > 10 ? `<span class="pending-chip">+${pending.length - 10} mais</span>` : '');

        $$('#pending-list .pending-chip[data-pool]').forEach(btn => {
          btn.onclick = () => openPool(btn.dataset.pool, btn.dataset.time);
        });
      }
    }

    const last = [...completed].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))[0];
    $('#last-update').textContent = last ? `Última atualização: ${last.time}` : 'Última atualização: —';
  }

  // ─── HISTORY ───

  function renderHistory(filters = {}) {
    const list = $('#history-list');
    let records = [...allRecords];

    if (filters.search) {
      const f = filters.search.toLowerCase();
      records = records.filter(r =>
        r.employee.toLowerCase().includes(f) ||
        r.poolName.toLowerCase().includes(f) ||
        r.date.includes(f) ||
        formatDateDisplay(r.date).includes(f)
      );
    }
    if (filters.poolId) records = records.filter(r => r.poolId === filters.poolId);
    if (filters.dateFrom) records = records.filter(r => r.date >= filters.dateFrom);
    if (filters.dateTo) records = records.filter(r => r.date <= filters.dateTo);
    if (filters.alertsOnly) records = records.filter(r => r.hasAlerts);

    if (records.length === 0) {
      list.innerHTML = '<div class="history-empty"><p>Nenhum registo encontrado.</p></div>';
      return;
    }

    list.innerHTML = records.map(r => {
      const alertBadge = r.hasAlerts
        ? '<span class="badge-alert">⚠ Alertas</span>'
        : '<span class="badge-ok">✓ OK</span>';
      return `
        <div class="history-card" data-id="${r.id}">
          <div class="history-card-header">
            <span class="history-card-zone">${escapeHtml(r.poolName)} — ${r.time}</span>
            <span class="history-card-date">${formatDateDisplay(r.date)}</span>
          </div>
          <div class="history-card-meta">${alertBadge}<span>${escapeHtml(r.employee)}</span></div>
        </div>`;
    }).join('');

    $$('.history-card').forEach(card => {
      card.onclick = () => openRecordById(card.dataset.id);
    });
  }

  function getHistoryFilters() {
    return {
      search: $('#history-search')?.value || '',
      poolId: $('#history-filter-pool')?.value || '',
      dateFrom: $('#history-filter-from')?.value || '',
      dateTo: $('#history-filter-to')?.value || '',
      alertsOnly: $('#history-filter-alerts')?.checked || false
    };
  }

  async function openRecordById(id) {
    const rec = allRecords.find(r => r.id === id);
    if (!rec) return;
    currentRecord = JSON.parse(JSON.stringify(rec));
    currentPoolId = rec.poolId;
    currentTime = rec.time;
    currentDateISO = rec.date;
    $('#record-pool-title').textContent = rec.poolName;
    $('#record-date').textContent = formatDateDisplay(rec.date);
    $('#record-time').textContent = rec.time;
    updateRecordStatus();
    renderTimeSelector();
    renderParamsForm();
    loadObservations();
    renderPoolPhotos();
    loadSignatureCanvas();
    showComparisonHint();
    showScreen(screens, 'record');
  }

  // ─── SEARCH ───

  function performSearch(query) {
    const results = $('#search-results');
    if (!query.trim()) { results.innerHTML = ''; return; }

    const f = query.toLowerCase();
    const filtered = allRecords.filter(r =>
      r.employee.toLowerCase().includes(f) ||
      r.poolName.toLowerCase().includes(f) ||
      r.date.includes(f) ||
      formatDateDisplay(r.date).includes(f) ||
      (r.observations || '').toLowerCase().includes(f)
    );

    if (filtered.length === 0) {
      results.innerHTML = '<div class="history-empty"><p>Nenhum resultado.</p></div>';
      return;
    }

    results.innerHTML = filtered.map(r => `
      <div class="history-card" data-id="${r.id}">
        <div class="history-card-header">
          <span class="history-card-zone">${escapeHtml(r.poolName)} — ${r.time} ${r.hasAlerts ? '⚠' : ''}</span>
          <span class="history-card-date">${formatDateDisplay(r.date)}</span>
        </div>
        <div class="history-card-meta"><span>${escapeHtml(r.employee)}</span></div>
      </div>`).join('');

    $$('#search-results .history-card').forEach(card => {
      card.onclick = () => openRecordById(card.dataset.id);
    });
  }

  // ─── CHARTS ───

  async function openCharts() {
    const select = $('#chart-pool-select');
    select.innerHTML = config.pools.map(p =>
      `<option value="${p.id}">${p.emoji} ${p.name}</option>`
    ).join('');
    select.onchange = () => renderChartForPool(select.value);
    await renderChartForPool(config.pools[0]?.id);
    showScreen(screens, 'charts');
  }

  function renderChartForPool(poolId) {
    if (!poolId) return;
    const pool = config.pools.find(p => p.id === poolId);
    const records = allRecords.filter(r => r.poolId === poolId);
    $('#charts-pool-title').textContent = pool?.name || '';
    AquaCharts.render($('#chart-container'), records, pool?.name || '');
  }

  // ─── SETTINGS ───

  function initSettings() {
    $('#setting-ph-min').value = config.phMin;
    $('#setting-ph-max').value = config.phMax;
    $('#setting-cl-min').value = config.clMin;
    $('#setting-cl-max').value = config.clMax;
    $('#setting-cc-max').value = config.ccMax;
    $('#setting-pools').value = config.pools.map(p => p.name).join('\n');
    $('#setting-times').value = config.times.join('\n');
    $('#setting-pin').value = config.pin || '';
    $('#setting-require-sig').checked = config.requireSignature;
    $('#setting-notifications').checked = config.enableNotifications;

    const reqContainer = $('#required-fields-list');
    if (reqContainer) {
      reqContainer.innerHTML = PARAMETERS.filter(p => p.type === 'number' && !p.readonly).map(p => `
        <label class="checkbox-inline">
          <input type="checkbox" data-field="${p.key}" ${config.requiredFields.includes(p.key) ? 'checked' : ''}>
          ${p.label}
        </label>`).join('');
    }
  }

  async function saveSettings() {
    config.phMin = parseFloat($('#setting-ph-min').value) || 7.20;
    config.phMax = parseFloat($('#setting-ph-max').value) || 7.80;
    config.clMin = parseFloat($('#setting-cl-min').value) || 0.50;
    config.clMax = parseFloat($('#setting-cl-max').value) || 2.50;
    config.ccMax = parseFloat($('#setting-cc-max').value) || 0.60;
    config.pin = $('#setting-pin').value.trim();
    config.requireSignature = $('#setting-require-sig').checked;
    config.enableNotifications = $('#setting-notifications').checked;

    config.requiredFields = [];
    $$('#required-fields-list input:checked').forEach(cb => {
      config.requiredFields.push(cb.dataset.field);
    });
    if (config.requiredFields.length === 0) config.requiredFields = ['ph', 'cloro_livre'];

    const poolNames = $('#setting-pools').value.split('\n').map(n => n.trim()).filter(Boolean);
    const existingPools = config.pools;
    config.pools = poolNames.map((name) => {
      const existing = existingPools.find(p => p.name === name) || DEFAULT_POOLS.find(p => p.name === name);
      return {
        id: existing?.id || slugify(name),
        name,
        emoji: existing?.emoji || '💧'
      };
    });

    config.times = $('#setting-times').value.split('\n').map(t => t.trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
    if (config.times.length === 0) config.times = [...DEFAULT_TIMES];

    await AquaStorage.saveConfig(config);
    updatePinFieldVisibility();
    showToast('Definições guardadas!', 'success');
    renderPools();
    updateDashboard();
  }

  async function resetConfig() {
    config = { ...DEFAULT_CONFIG, pools: [...DEFAULT_POOLS], times: [...DEFAULT_TIMES] };
    await AquaStorage.saveConfig(config);
    showToast('Definições repostas para os valores padrão', 'success');
  }

  async function toggleTheme() {
    const isDark = $('#theme-toggle').checked;
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      await AquaStorage.saveTheme('dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      await AquaStorage.saveTheme('light');
    }
  }

  async function initTheme() {
    const saved = await AquaStorage.getTheme();
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      const toggle = $('#theme-toggle');
      if (toggle) toggle.checked = true;
    }
  }

  async function maybeAutoBackup() {
    const last = await AquaStorage.getLastBackup();
    const days = config.autoBackupDays || 7;
    if (last) {
      const diff = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
      if (diff < days) return;
    }
    AquaExport.exportJSON(allRecords);
    await AquaStorage.setLastBackup(nowISO());
  }

  // ─── EVENTS ───

  function goToToday() {
    currentDateISO = formatDateISO(new Date());
    $('#current-date').value = currentDateISO;
    updateDateLabel();
    renderPools();
    updateDashboard();
  }

  function setupAppEvents() {
    $('#btn-prev-date').onclick = () => changeDate(-1);
    $('#btn-next-date').onclick = () => changeDate(1);
    $('#btn-today').onclick = goToToday;
    $('#current-date').onchange = setDateFromInput;

    $('#btn-quick-pdf').onclick = () => AquaExport.exportDailyPDF(currentDateISO, allRecords, config);
    $('#btn-quick-excel').onclick = () => AquaExport.exportExcel(allRecords, config, { dateISO: currentDateISO });
    $('#btn-quick-charts').onclick = () => openCharts();
    $('#btn-quick-history').onclick = () => {
      populateHistoryFilters();
      renderHistory(getHistoryFilters());
      showScreen(screens, 'history');
    };

    $('#photo-input').onchange = (e) => {
      if (photoTarget === 'ocr') handleOCRPhoto(e);
      else handlePhotoInput(e);
    };
    $('#btn-add-pool-photo').onclick = () => { photoTarget = 'pool'; $('#photo-input').click(); };
    $('#btn-ocr-doseadora').onclick = () => { photoTarget = 'ocr'; $('#photo-input').click(); };

    $('#record-observations')?.addEventListener('input', scheduleAutoSave);

    $('#btn-back-pools').onclick = async () => {
      await saveCurrentRecord(false, false);
      showScreen(screens, 'app');
      updateDashboard();
    };

    $('#btn-clear-sig').onclick = clearSignature;
    $('#btn-save-sig').onclick = saveSignature;

    $('#btn-save-record').onclick = async () => {
      if (!validateBeforeSave()) return;
      const hasAlerts = computeHasAlerts();
      if (hasAlerts && !confirm('Este registo contém alertas. Deseja guardar mesmo assim?')) return;
      await saveCurrentRecord(true);
      showScreen(screens, 'app');
      updateDashboard();
    };

    $('#btn-export-pdf').onclick = () => AquaExport.exportRecordPDF(currentRecord, config);

    $('#btn-history').onclick = () => {
      populateHistoryFilters();
      renderHistory(getHistoryFilters());
      showScreen(screens, 'history');
    };

    $('#btn-export-excel').onclick = () => AquaExport.exportExcel(allRecords, config, { dateISO: currentDateISO });
    $('#btn-export-daily-pdf').onclick = () => AquaExport.exportDailyPDF(currentDateISO, allRecords, config);
    $('#btn-export-json').onclick = () => AquaExport.exportJSON(allRecords);
    $('#btn-import-json').onclick = () => $('#import-input').click();

    $('#import-input').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const mode = confirm('OK = Combinar com existentes\nCancelar = Substituir todos') ? 'merge' : 'replace';
      try {
        const records = await AquaExport.importJSON(file, mode);
        await AquaStorage.saveAllRecords(records);
        await refreshRecords();
        renderPools();
        updateDashboard();
        showToast(`Importados ${records.length} registos.`, 'success');
      } catch {
        showToast('Erro ao importar ficheiro JSON.', 'error');
      }
    };

    $('#btn-back-history').onclick = () => showScreen(screens, 'app');
    $('#btn-charts').onclick = () => openCharts();
    $('#btn-back-charts').onclick = () => { AquaCharts.destroy(); showScreen(screens, 'app'); };

    ['history-search', 'history-filter-pool', 'history-filter-from', 'history-filter-to', 'history-filter-alerts'].forEach(id => {
      const el = $('#' + id);
      if (el) el.addEventListener('input', () => renderHistory(getHistoryFilters()));
      if (el && el.type === 'checkbox') el.addEventListener('change', () => renderHistory(getHistoryFilters()));
    });

    $('#btn-search').onclick = () => {
      $('#global-search').value = '';
      $('#search-results').innerHTML = '';
      showScreen(screens, 'search');
      setTimeout(() => $('#global-search').focus(), 100);
    };
    $('#btn-back-search').onclick = () => showScreen(screens, 'app');
    $('#global-search').oninput = (e) => performSearch(e.target.value);

    $('#btn-settings').onclick = async () => {
      await refreshRecords();
      $('#settings-user').textContent = currentUser?.name || '—';
      $('#settings-records').textContent = allRecords.length;
      const todayISO = formatDateISO(new Date());
      $('#settings-alerts').textContent = allRecords.filter(r => r.date === todayISO && r.hasAlerts).length;
      initSettings();
      showScreen(screens, 'settings');
    };
    $('#btn-back-settings').onclick = () => showScreen(screens, 'app');
    $('#theme-toggle').onchange = toggleTheme;
    $('#btn-save-settings').onclick = saveSettings;
    $('#btn-reset-settings').onclick = async () => {
      if (confirm('Tem a certeza que deseja repor as definições padrão?')) {
        await resetConfig();
        initSettings();
        renderPools();
        updateDashboard();
      }
    };
    $('#btn-export-all-excel').onclick = () => AquaExport.exportExcel(allRecords, config);
    $('#btn-request-notifications').onclick = async () => {
      const ok = await AquaNotifications.requestPermission();
      showToast(ok ? 'Notificações ativadas!' : 'Notificações não permitidas.', ok ? 'success' : 'error');
    };
    $('#btn-logout').onclick = async () => {
      await AquaStorage.saveUser(null);
      currentUser = null;
      showScreen(screens, 'login');
      showToast('Sessão terminada.');
    };
  }

  function populateHistoryFilters() {
    const sel = $('#history-filter-pool');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas as piscinas</option>' +
      config.pools.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!document.querySelector('.install-prompt')) {
        const banner = document.createElement('div');
        banner.className = 'install-prompt';
        banner.innerHTML = '<span>📲 Instalar AquaCheck no ecrã inicial</span><button class="btn-primary" id="btn-install-pwa">Instalar</button>';
        document.body.appendChild(banner);
        $('#btn-install-pwa').onclick = async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') showToast('AquaCheck instalado!');
            deferredPrompt = null;
          }
          banner.remove();
        };
      }
    });
    window.addEventListener('appinstalled', () => {
      document.querySelector('.install-prompt')?.remove();
      deferredPrompt = null;
      showToast('AquaCheck instalado com sucesso!');
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => AquaApp.init());
