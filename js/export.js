/**
 * AquaCheck v3.1 - Export (PDF, Excel, JSON)
 */
const AquaExport = (() => {
  function getLimits(param, config) {
    if (param.limitKey === 'ph') return { min: config.phMin, max: config.phMax };
    if (param.limitKey === 'cl') return { min: config.clMin, max: config.clMax };
    if (param.limitKey === 'cc') return { min: 0, max: config.ccMax };
    return { min: param.min || 0, max: param.max || 9999 };
  }

  function paramRow(doc, p, record, config, y, pageW, margin) {
    const val = record.params[p.key];
    const limits = getLimits(p, config);
    const displayVal = p.type === 'checkbox' ? (val ? 'Sim' : 'Não') : (val !== '' && val != null ? val + ' ' + p.unit : '—');
    const num = parseFloat(val);
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

    if (record.observations) {
      doc.setTextColor(12, 74, 110);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('OBSERVAÇÕES', margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const lines = doc.splitTextToSize(record.observations, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 4;
    }

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
    const margin = 12;
    let y = pdfHeader(doc, pageW, margin, `Relatório Diário — ${formatDateDisplay(dateISO)}`);

    doc.setFontSize(9);
    doc.setTextColor(12, 74, 110);
    doc.text(`Total: ${dayRecords.length} leituras | Alertas: ${dayRecords.filter(r => r.hasAlerts).length}`, margin, y + 4);
    y += 10;

    const cols = ['Piscina', 'Hora', 'pH', 'Cl.Livre', 'Cl.Comb.', 'Temp.', 'Estado'];
    const colW = [45, 18, 18, 22, 22, 18, 20];
    let x = margin;

    doc.setFillColor(224, 242, 254);
    doc.rect(margin, y, pageW - margin * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    cols.forEach((c, i) => { doc.text(c, x + 2, y + 5); x += colW[i]; });
    y += 9;

    const sorted = [...dayRecords].sort((a, b) => a.poolName.localeCompare(b.poolName) || a.time.localeCompare(b.time));
    doc.setFont('helvetica', 'normal');
    sorted.forEach((r, i) => {
      if (y > 185) { doc.addPage(); y = 15; }
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, pageW - margin * 2, 7, 'F');
      }
      x = margin;
      const vals = [
        r.poolName, r.time,
        r.params.ph ?? '—', r.params.cloro_livre ?? '—', r.params.cloro_combinado ?? '—',
        r.params.temp_agua ?? '—',
        r.hasAlerts ? 'ALERTA' : 'OK'
      ];
      vals.forEach((v, ci) => {
        if (ci === 6 && r.hasAlerts) doc.setTextColor(239, 68, 68);
        else doc.setTextColor(12, 74, 110);
        doc.text(String(v), x + 2, y + 4);
        x += colW[ci];
      });
      y += 7;
    });

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
      const data = [
        ['Data', 'Hora', 'Piscina', 'Funcionário', 'pH', 'Temp. Água (°C)', 'pH Doseadora',
          'Cloro Livre (mg/L)', 'Cloro Livre Doseadora (mg/L)', 'Cloro Total (mg/L)',
          'Cloro Combinado (mg/L)', 'Transparência (m)', 'Banhistas', 'Lavagem Filtros', 'Observações', 'Alertas']
      ];
      filtered.forEach(r => {
        data.push([
          formatDateDisplay(r.date), r.time, r.poolName, r.employee,
          r.params.ph, r.params.temp_agua, r.params.ph_doseadora,
          r.params.cloro_livre, r.params.cloro_livre_doseadora, r.params.cloro_total,
          r.params.cloro_combinado, r.params.transparencia, r.params.banhistas,
          r.params.lavagem_filtros ? 'Sim' : 'Não',
          r.observations || '',
          r.hasAlerts ? 'Sim' : 'Não'
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(data);
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
      const val = record.params[p.key];
      const limits = getLimits(p, config);
      const displayVal = p.type === 'checkbox' ? (val ? 'Sim' : 'Não') : val;
      const num = parseFloat(val);
      let estado = '—';
      if (p.type === 'number' && !isNaN(num)) {
        if (num < limits.min) estado = 'ABAIXO';
        else if (num > limits.max) estado = 'ACIMA';
        else estado = 'OK';
      } else if (p.type === 'checkbox') {
        estado = val ? 'REALIZADA' : 'NÃO REALIZADA';
      }
      data.push([p.label, displayVal, p.unit, limits.min, limits.max, estado]);
    });
    if (record.observations) {
      data.push([]);
      data.push(['Observações:', record.observations]);
    }
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
