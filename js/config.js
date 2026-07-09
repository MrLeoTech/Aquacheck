/**
 * AquaCheck v3.1 - Configuration & Constants
 */
const DEFAULT_POOLS = [
  { id: 'ondas', name: 'Ondas', emoji: '🌊' },
  { id: 'adultos', name: 'Adultos', emoji: '🏊' },
  { id: 'infantil', name: 'Infantil', emoji: '👶' },
  { id: 'aquaspray', name: 'Aquaspray', emoji: '💦' },
  { id: 'mini-compact', name: 'Mini Compact Slide', emoji: '🛝' }
];

/** Piscinas removidas da lista ativa — usadas apenas na migração de configurações antigas */
const LEGACY_POOL_IDS = new Set([
  'chapinheiro', 'aquatube', 'bacia-media', 'bacia-grande', 'foam',
  'fast-mountain', 'turbolance', 'cascata', 'escorrega-infantil', 'lotus-monster'
]);

const ACTIVE_POOL_IDS = new Set(DEFAULT_POOLS.map(p => p.id));

/** Piscinas ligadas: valores de doseadora partilhados entre si */
const LINKED_POOL_SYNC = {
  aquaspray: 'mini-compact',
  'mini-compact': 'aquaspray'
};

const LINKED_SYNC_KEYS = ['temp_agua', 'ph_doseadora', 'cloro_livre_doseadora'];

const DEFAULT_TIMES = ['08:00', '13:00', '17:00'];

const PARAMETERS = [
  { key: 'ph', label: 'pH', unit: '', step: 0.01, type: 'number', limitKey: 'ph' },
  { key: 'temp_agua', label: 'Temperatura da Água', unit: '°C', step: 0.1, type: 'number', min: 0, max: 50 },
  { key: 'ph_doseadora', label: 'pH Doseadora', unit: '', step: 0.01, type: 'number', limitKey: 'ph' },
  { key: 'cloro_livre', label: 'Cloro Livre', unit: 'mg/L', step: 0.01, type: 'number', limitKey: 'cl' },
  { key: 'cloro_livre_doseadora', label: 'Cloro Livre Doseadora', unit: 'mg/L', step: 0.01, type: 'number', limitKey: 'cl' },
  { key: 'cloro_total', label: 'Cloro Total', unit: 'mg/L', step: 0.01, type: 'number', limitKey: 'cl' },
  { key: 'cloro_combinado', label: 'Cloro Combinado', unit: 'mg/L', step: 0.01, type: 'number', readonly: true, limitKey: 'cc' },
  { key: 'transparencia', label: 'Transparência', unit: 'm', step: 0.1, type: 'number', min: 0, max: 50 },
  { key: 'banhistas', label: 'Nº de Banhistas', unit: '', step: 1, type: 'number', min: 0, max: 9999 },
  { key: 'lavagem_filtros', label: 'Lavagem dos Filtros', unit: '', type: 'checkbox' }
];

const STORAGE_KEYS = {
  USER: 'aqw_user',
  THEME: 'aqw_theme',
  RECORDS: 'aqw_records',
  CONFIG: 'aqw_config',
  MIGRATED: 'aqw_idb_migrated'
};

const DEFAULT_CONFIG = {
  phMin: 7.20,
  phMax: 7.80,
  clMin: 0.50,
  clMax: 2.50,
  ccMax: 0.60,
  pools: DEFAULT_POOLS,
  times: DEFAULT_TIMES,
  pin: '',
  enableNotifications: true,
  autoBackupDays: 7
};

const APP_VERSION = '3.1.0';
