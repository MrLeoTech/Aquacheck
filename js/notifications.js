/**
 * AquaCheck v3.1 - Notifications
 */
const AquaNotifications = (() => {
  async function requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: './icons/icon-192.png', tag: 'aquacheck-reminder' });
    } catch { /* ignore */ }
  }

  function getCurrentTimeSlot(times) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    let best = null;
    let bestDiff = Infinity;
    for (const t of times) {
      const [h, m] = t.split(':').map(Number);
      const slotMins = h * 60 + m;
      const diff = Math.abs(mins - slotMins);
      if (diff < bestDiff && mins >= slotMins - 30) {
        bestDiff = diff;
        best = t;
      }
    }
    return best;
  }

  async function checkPendingReadings(config, getRecordsForDate) {
    if (!config.enableNotifications) return;
    if (Notification.permission !== 'granted') return;

    const todayISO = formatDateISO(new Date());
    const records = await getRecordsForDate(todayISO);
    const slot = getCurrentTimeSlot(config.times);
    if (!slot) return;

    const pending = config.pools.filter(pool => {
      const rec = records.find(r => r.poolId === pool.id && r.time === slot && r.completed);
      return !rec;
    });

    if (pending.length > 0 && pending.length <= config.pools.length) {
      const names = pending.slice(0, 3).map(p => p.name).join(', ');
      const extra = pending.length > 3 ? ` (+${pending.length - 3})` : '';
      notify(
        `Leituras pendentes (${slot})`,
        `${pending.length} piscina(s): ${names}${extra}`
      );
    }
  }

  function scheduleDailyCheck(config, getRecordsForDate) {
    setInterval(() => {
      checkPendingReadings(config, getRecordsForDate);
    }, 30 * 60 * 1000);
  }

  return { requestPermission, notify, checkPendingReadings, scheduleDailyCheck, getCurrentTimeSlot };
})();
