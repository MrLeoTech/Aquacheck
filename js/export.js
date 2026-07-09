/**
 * AquaCheck v3.1 - Export (PDF, Excel, JSON)
 */
const AquaExport = (() => {
  const PDF_SHORT_LABELS = {
    ph: 'pH',
    temp_agua: 'Temp.',
    ph_doseadora: 'pH Dos.',
    cloro_livre: 'Cl.Liv.',
    cloro_livre_doseadora: 'Cl.Dos.',
    cloro_total: 'Cl.Tot.',
    cloro_combinado: 'Cl.Comb.',
    transparencia: 'Transp.',
    banhistas: 'Banh.',
    lavagem_filtros: 'Filtros'
  };

  function getLimits(param, config) {
    if (param.limitKey === 'ph') return { min: config.phMin, max: config.phMax };
    if (param.limitKey === 'cl') return { min: config.clMin, max: config.clMax };
    if (param.limitKey === 'cc') return { min: 0, max: config.ccMax };
    return { min: param.min || 0, max: param.max || 9999 };
  }

  function formatParamValue(p, record) {
    const val = record.params[p.key];
    if (p.type === 'checkbox') return val ? 'Sim' : 'Não';
    if (val === '' || val == null) return '—';
    return String(val);
  }

  function getParamStatus(p, record, config) {
    const val = record.params[p.key];
    const limits = getLimits(p, config);
    if (p.type === 'checkbox') return val ? 'REALIZADA' : 'NÃO REALIZADA';
    const num = parseDecimal(val);
    if (isNaN(num)) return '—';
    if (num < limits.min) return 'ABAIXO';
    if (num > limits.max) return 'ACIMA';
    return 'OK';
  }

  function buildExcelHeaders() {
    return [
      'Data', 'Hora', 'Piscina', 'Funcionário',
      ...PARAMETERS.map(p => p.label + (p.unit ? ` (${p.unit})` : '')),
      'Observações', 'Alertas', 'Estado'
    ];
  }

  function buildExcelRow(record) {
    return [
      formatDateDisplay(record.date),
      record.time,
      record.poolName,
      record.employee,
      ...PARAMETERS.map(p => formatParamValue(p, record)),
      record.observations || '',
      record.hasAlerts ? 'Sim' : 'Não',
      record.completed ? (record.hasAlerts ? 'ALERTAS' : 'OK') : 'EM CURSO'
    ];
  }

  function getDailyPdfColumns(config) {
    return [
      { label: 'Piscina', width: 28, get: r => r.poolName },
      { label: 'Hora', width: 11, get: r => r.time },
      ...PARAMETERS.map(p => ({
        label: PDF_SHORT_LABELS[p.key] || p.label,
        width: p.type === 'checkbox' ? 10 : 13,
        get: r => formatParamValue(p, r),
        isAlert: (r) => {
          if (p.type !== 'number') return false;
          const num = parseDecimal(r.params[p.key]);
          if (isNaN(num)) return false;
          const limits = getLimits(p, config);
          return num < limits.min || num > limits.max;
        }
      })),
      { label: 'Obs.', width: 28, get: r => (r.observations || '—').slice(0, 40) },
      { label: 'Est.', width: 11, get: r => r.hasAlerts ? 'ALERTA' : 'OK', isStatus: true }
    ];
  }

  function paramRow(doc, p, record, config, y, pageW, margin) {
    const val = record.params[p.key];
    const limits = getLimits(p, config);
    const displayVal = p.type === 'checkbox' ? (val ? 'Sim' : 'Não') : (val !== '' && val != null ? val + ' ' + p.unit : '—');
    const num = parseDecimal(val);
    const isAlert = p.type === 'number' && !isNaN(num) && (num < limits.min || num > limits.max);

    doc.setTextColor(...(isAlert ? [239, 68, 68] : [12, 74, 110]));
    doc.setFont('helvetica', isAlert ? 'bold' : 'normal');
    doc.text(p.label, margin + 3, y + 4);
    doc.text(displayVal.trim(), pageW - margin - 50, y + 4);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    const limitText = p.limitKey ? `${limits.min}-${limits.max}${p.unit}` : (p.min !== undefined ? `${p.min}-${p.max}${p.unit}` : '—');
    doc.text(limitText, pageW - margin - 20, y + 4);
    return y + 8;
  }

  function pdfHeader(doc, pageW, margin, subtitle) {
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('AquaCheck - Qualidade da Água', margin, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Parque Aquático de Amarante', margin, 18);
    doc.text(subtitle, margin, 24);
    return 32;
  }

  async function exportRecordPDF(record, config) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('Biblioteca PDF não disponível.', 'error'); return; }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = pdfHeader(doc, pageW, margin, 'Registo de Controlo da Qualidade da Água');

    doc.setDrawColor(14, 165, 233);
    doc.setLineWidth(0.5);
    doc.rect(margin, y, pageW - margin * 2, 32);
    doc.setTextColor(12, 74, 110);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('FUNCIONÁRIO:', margin + 3, y + 7);
    doc.text('PISCINA:', margin + 3, y + 14);
    doc.text('DATA:', margin + 3, y + 21);
    doc.text('HORA:', margin + 3, y + 28);
    doc.setFont('helvetica', 'normal');
    doc.text(record.employee, margin + 32, y + 7);
    doc.text(record.poolName, margin + 32, y + 14);
    doc.text(formatDateDisplay(record.date), margin + 32, y + 21);
    doc.text(record.time, margin + 32, y + 28);

    const statusText = record.completed ? (record.hasAlerts ? 'ALERTAS' : 'OK') : 'EM CURSO';
    const statusColor = record.hasAlerts ? [239, 68, 68] : (record.completed ? [34, 197, 94] : [245, 158, 11]);
    doc.setFillColor(...statusColor);
    doc.roundedRect(pageW - margin - 35, y + 2, 35, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(statusText, pageW - margin - 17.5, y + 7, { align: 'center' });
    y += 38;

    doc.setFillColor(224, 242, 254);
    doc.rect(margin, y, pageW - margin * 2, 8, 'F');
    doc.setTextColor(12, 74, 110);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PARÂMETRO', margin + 3, y + 5.5);
    doc.text('VALOR', pageW - margin - 50, y + 5.5);
    doc.text('LIMITES', pageW - margin - 20, y + 5.5);
    y += 10;

    doc.setFontSize(8.5);
    PARAMETERS.forEach((p, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, pageW - margin * 2, 7, 'F');
      }
      y = paramRow(doc, p, record, config, y, pageW, margin);
    });
    y += 4;

    doc.setTextColor(12, 74, 110);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVAÇÕES', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const obsText = record.observations?.trim() || '—';
    const lines = doc.splitTextToSize(obsText, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;

    if (record.photos?.length > 0) {
      doc.setTextColor(12, 74, 110);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('FOTOGRAFIAS', margin, y);
      y += 6;
      let px = margin;
      for (let i = 0; i < Math.min(record.photos.length, 4); i++) {
        try {
          const imgProps = doc.getImageProperties(record.photos[i]);
          const iw = 42;
          const ih = (imgProps.height / imgProps.width) * iw;
          if (px + iw > pageW - margin) { px = margin; y += ih + 4; }
          if (y + ih > 270) { doc.addPage(); y = 15; }
          doc.addImage(record.photos[i], 'JPEG', px, y, iw, ih);
          px += iw + 4;
        } catch { /* skip */ }
      }
      y += 30;
    }

    if (record.signature) {
      if (y + 30 > 270) { doc.addPage(); y = 15; }
      doc.setTextColor(12, 74, 110);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('ASSINATURA DO RESPONSÁVEL', margin, y);
      try {
        const sp = doc.getImageProperties(record.signature);
        const sw = 55;
        const sh = (sp.height / sp.width) * sw;
        doc.addImage(record.signature, 'PNG', margin, y + 3, sw, sh);
      } catch {
        doc.text('[Assinatura não disponível]', margin, y + 10);
      }
    }

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7);
      doc.text(`Pág. ${i}/${totalPages} | AquaCheck © Parque Aquático de Amarante | ${formatDateDisplay(record.date)} ${record.time}`, pageW / 2, 292, { align: 'center' });
    }

    const fn = `AquaCheck_${record.poolName.replace(/\s+/g, '_')}_${record.date}_${record.time.replace(/:/g, 'h')}.pdf`;
    doc.save(fn);
    showToast('PDF exportado!', 'success');
  }

  async function exportDailyPDF(dateISO, records, config) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('Biblioteca PDF não disponível.', 'error'); return; }

    const dayRecords = records.filter(r => r.date === dateISO && r.completed);
    if (!dayRecords.length) {
      showToast('Sem registos completos para esta data.', 'error');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 8;
    let y = pdfHeader(doc, pageW, margin, `Relatório Diário — ${formatDateDisplay(dateISO)}`);

    doc.setFontSize(8);
    doc.setTextColor(12, 74, 110);
    doc.text(`Total: ${dayRecords.length} leituras | Alertas: ${dayRecords.filter(r => r.hasAlerts).length}`, margin, y + 4);
    y += 9;

    const columns = getDailyPdfColumns(config);
    const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
    const rowH = 6.5;

    function drawTableHeader() {
      let x = margin;
      doc.setFillColor(224, 242, 254);
      doc.rect(margin, y, tableWidth, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(12, 74, 110);
      columns.forEach(col => {
        doc.text(col.label, x + 1, y + 4.5);
        x += col.width;
      });
      y += rowH + 1;
    }

    drawTableHeader();

    const sorted = [...dayRecords].sort((a, b) => a.poolName.localeCompare(b.poolName) || a.time.localeCompare(b.time));
    doc.setFont('helvetica', 'normal');

    sorted.forEach((r, i) => {
      if (y > pageH - 25) {
        doc.addPage();
        y = 12;
        drawTableHeader();
      }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, tableWidth, rowH, 'F');
      }

      let x = margin;
      columns.forEach(col => {
        const val = String(col.get(r));
        if (col.isStatus && r.hasAlerts) doc.setTextColor(239, 68, 68);
        else if (col.isAlert?.(r)) doc.setTextColor(239, 68, 68);
        else doc.setTextColor(12, 74, 110);
        doc.text(val, x + 1, y + 4.5, { maxWidth: col.width - 2 });
        x += col.width;
      });
      y += rowH;
    });

    const withObs = sorted.filter(r => r.observations?.trim());
    if (withObs.length) {
      y += 6;
      if (y > pageH - 30) { doc.addPage(); y = 15; }
      doc.setTextColor(12, 74, 110);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('OBSERVAÇÕES COMPLETAS', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      withObs.forEach(r => {
        const block = `${r.poolName} (${r.time}): ${r.observations.trim()}`;
        const lines = doc.splitTextToSize(block, pageW - margin * 2);
        if (y + lines.length * 3.5 > pageH - 15) { doc.addPage(); y = 15; }
        doc.setTextColor(12, 74, 110);
        doc.text(lines, margin, y);
        y += lines.length * 3.5 + 2;
      });
    }

    doc.save(`AquaCheck_Relatorio_${dateISO}.pdf`);
    showToast('Relatório diário exportado!', 'success');
  }

  function exportExcel(records, config, options = {}) {
    if (typeof XLSX === 'undefined') {
      showToast('Biblioteca Excel não disponível.', 'error');
      return;
    }

    const { single = null, dateISO = null } = options;
    const wb = XLSX.utils.book_new();
    wb.Props = {
      Title: 'AquaCheck - Qualidade da Água',
      Subject: 'Parque Aquático de Amarante',
      CreatedDate: new Date()
    };

    if (single) {
      const data = buildSingleSheet(single, config);
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, single.poolName.substring(0, 31));
      XLSX.writeFile(wb, `AquaCheck_${single.poolName.replace(/\s+/g, '_')}_${single.date}.xlsx`);
    } else {
      let filtered = records;
      if (dateISO) filtered = records.filter(r => r.date === dateISO);
      const data = [buildExcelHeaders(), ...filtered.map(buildExcelRow)];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = buildExcelHeaders().map((h, i) => ({ wch: i < 4 ? 14 : (h.length > 20 ? 22 : 12) }));
      XLSX.utils.book_append_sheet(wb, ws, dateISO ? formatDateDisplay(dateISO).replace(/\//g, '-') : 'Todos');
      const fn = dateISO
        ? `AquaCheck_${dateISO}.xlsx`
        : `AquaCheck_Todos_${formatDateISO(new Date())}.xlsx`;
      XLSX.writeFile(wb, fn);
    }
    showToast('Excel exportado!', 'success');
  }

  function buildSingleSheet(record, config) {
    const data = [
      ['AquaCheck - Parque Aquático de Amarante'],
      ['Controlo da Qualidade da Água'],
      [],
      ['Funcionário:', record.employee],
      ['Piscina:', record.poolName],
      ['Data:', formatDateDisplay(record.date)],
      ['Hora:', record.time],
      [],
      ['Parâmetro', 'Valor', 'Unidade', 'Mínimo', 'Máximo', 'Estado']
    ];
    PARAMETERS.forEach(p => {
      const limits = getLimits(p, config);
      const displayVal = formatParamValue(p, record);
      data.push([
        p.label,
        displayVal === '—' ? '' : displayVal,
        p.unit,
        limits.min,
        limits.max,
        getParamStatus(p, record, config)
      ]);
    });
    data.push([]);
    data.push(['Observações:', record.observations?.trim() || '—']);
    return data;
  }

  function exportJSON(records) {
    const data = { app: 'AquaCheck Water Quality', version: APP_VERSION, exportedAt: nowISO(), records };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AquaCheck_Backup_${formatDateISO(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON exportado!', 'success');
  }

  async function importJSON(file, mode = 'merge') {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.records || !Array.isArray(data.records)) {
      throw new Error('Ficheiro JSON inválido');
    }
    const incoming = data.records.map(r => ({
      ...r,
      date: normalizeDateISO(r.date)
    }));
    if (mode === 'replace') return incoming;
    const existing = await AquaStorage.getAllRecords();
    const merged = [...incoming, ...existing];
    const seen = new Set();
    const unique = [];
    for (const item of merged) {
      if (!seen.has(item.id)) { seen.add(item.id); unique.push(item); }
    }
    unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return unique;
  }

  return {
    exportRecordPDF, exportDailyPDF, exportExcel, exportJSON, importJSON, getLimits
  };
})();
