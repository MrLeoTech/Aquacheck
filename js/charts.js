/**
 * AquaCheck v3.1 - Charts
 */
const AquaCharts = (() => {
  let chartInstance = null;

  function destroy() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  function render(container, records, poolName) {
    destroy();
    if (typeof Chart === 'undefined') {
      container.innerHTML = '<p class="chart-empty">Biblioteca de gráficos não disponível.</p>';
      return;
    }

    const sorted = [...records]
      .filter(r => r.completed)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-30);

    if (sorted.length < 2) {
      container.innerHTML = '<p class="chart-empty">São necessários pelo menos 2 registos para gráficos.</p>';
      return;
    }

    container.innerHTML = `<canvas id="trend-chart" aria-label="Gráfico de tendências ${poolName}"></canvas>`;
    const ctx = $('#trend-chart').getContext('2d');
    const labels = sorted.map(r => `${formatDateDisplay(r.date)} ${r.time}`);

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'pH',
            data: sorted.map(r => parseFloat(r.params.ph) || null),
            borderColor: '#0ea5e9',
            tension: 0.3,
            spanGaps: true
          },
          {
            label: 'Cloro Livre',
            data: sorted.map(r => parseFloat(r.params.cloro_livre) || null),
            borderColor: '#22c55e',
            tension: 0.3,
            spanGaps: true
          },
          {
            label: 'Temp. °C',
            data: sorted.map(r => parseFloat(r.params.temp_agua) || null),
            borderColor: '#f59e0b',
            tension: 0.3,
            spanGaps: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: false, title: { display: true, text: 'pH / Cloro' } },
          y1: { position: 'right', beginAtZero: false, title: { display: true, text: '°C' }, grid: { drawOnChartArea: false } }
        }
      }
    });
  }

  return { render, destroy };
})();
