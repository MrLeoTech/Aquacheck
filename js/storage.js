/**
 * AquaCheck v3.1 - IndexedDB Storage Layer
 */
const AquaStorage = (() => {
  const DB_NAME = 'aquacheck-db';
  const DB_VERSION = 1;
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('records')) {
          database.createObjectStore('records', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function getMeta(key) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setMeta(key, value) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllRecords() {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('records', 'readonly');
      const req = tx.objectStore('records').getAll();
      req.onsuccess = () => {
        const records = (req.result || []).map(normalizeRecord);
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        resolve(records);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function saveAllRecords(records) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      store.clear();
      records.forEach(r => store.put(normalizeRecord(r)));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function upsertRecord(record) {
    const normalized = normalizeRecord(record);
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('records', 'readwrite');
      tx.objectStore('records').put(normalized);
      tx.oncomplete = () => resolve(normalized);
      tx.onerror = () => reject(tx.error);
    });
  }

  function normalizeRecord(r) {
    const rec = { ...r };
    rec.date = normalizeDateISO(rec.date);
    if (!rec.id) rec.id = 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    if (!rec.params) rec.params = {};
    if (!rec.photos) rec.photos = [];
    return rec;
  }

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  async function migrateFromLocalStorage() {
    const migrated = lsGet(STORAGE_KEYS.MIGRATED);
    if (migrated) return;

    const oldRecords = lsGet(STORAGE_KEYS.RECORDS);
    if (oldRecords?.length) {
      await saveAllRecords(oldRecords.map(normalizeRecord));
    }

    const oldConfig = lsGet(STORAGE_KEYS.CONFIG);
    if (oldConfig) {
      await setMeta('config', { ...DEFAULT_CONFIG, ...oldConfig });
    }

    const oldUser = lsGet(STORAGE_KEYS.USER);
    if (oldUser) await setMeta('user', oldUser);

    const oldTheme = lsGet(STORAGE_KEYS.THEME);
    if (oldTheme) await setMeta('theme', oldTheme);

    localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
  }

  async function getConfig() {
    const saved = await getMeta('config');
    const cfg = saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG };
    if (saved?.pools) cfg.pools = saved.pools;
    if (saved?.times) cfg.times = saved.times;
    return cfg;
  }

  async function saveConfig(config) {
    return setMeta('config', config);
  }

  async function getUser() {
    return getMeta('user');
  }

  async function saveUser(user) {
    if (user) return setMeta('user', user);
    return setMeta('user', null);
  }

  async function getTheme() {
    return getMeta('theme');
  }

  async function saveTheme(theme) {
    return setMeta('theme', theme);
  }

  async function getLastBackup() {
    return getMeta('lastBackup');
  }

  async function setLastBackup(iso) {
    return setMeta('lastBackup', iso);
  }

  async function init() {
    await openDB();
    await migrateFromLocalStorage();
  }

  return {
    init, getAllRecords, saveAllRecords, upsertRecord,
    getConfig, saveConfig, getUser, saveUser, getTheme, saveTheme,
    getLastBackup, setLastBackup
  };
})();
