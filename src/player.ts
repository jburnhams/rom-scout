import type { RomMetadata } from './types.js';

const DEFAULT_LOADER_URL = 'https://cdn.emulatorjs.org/stable/data/loader.js';
const DEFAULT_DATA_PATH = 'https://cdn.emulatorjs.org/stable/data/';
const PLATFORM_CORE_PATTERNS: Array<[string, string]> = [
  ['game boy advance', 'gba'],
  ['gameboy advance', 'gba'],
  ['game boy color', 'gbc'],
  ['gameboy color', 'gbc'],
  ['game boy', 'gb'],
  ['gameboy', 'gb'],
  ['sega master system', 'segaMS'],
  ['master system', 'segaMS'],
  ['sms', 'segaMS'],
  ['game gear', 'segaGG'],
  ['gg', 'segaGG'],
  ['genesis', 'segaMD'],
  ['sega genesis', 'segaMD'],
  ['mega drive', 'segaMD'],
  ['nintendo entertainment system', 'nes'],
  ['super nintendo', 'snes'],
  ['snes', 'snes'],
  ['nes', 'nes'],
  ['arcade', 'arcade'],
  ['mame', 'arcade'],
];

const EXTENSION_CORE_MAP: Record<string, string> = {
  'nes': 'nes',
  'snes': 'snes',
  'smc': 'snes',
  'gba': 'gba',
  'gb': 'gb',
  'gbc': 'gbc',
  'bin': 'segaMS',
  'smd': 'segaMD',
  'md': 'segaMD',
  'gen': 'segaMD',
  'sms': 'segaMS',
  'gg': 'segaGG',
  'zip': 'arcade',
};

const SAVE_DATABASE_NAME = 'rom-scout-emulatorjs';
const SAVE_STORE_NAME = 'saves';

interface PersistedSaveState {
  data: ArrayBuffer;
  updatedAt: number;
  crc32: string;
}

interface PersistedSaveRecord {
  saves: PersistedSaveState[];
}

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return 'null';
  }
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function computeCrc32(data: Uint8Array): string {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    crcTable[i] = crc;
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  return crc.toString(16).padStart(8, '0').toUpperCase();
}

let saveDatabasePromise: Promise<IDBDatabase | null> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openSaveDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }

  if (!saveDatabasePromise) {
    saveDatabasePromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(SAVE_DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SAVE_STORE_NAME)) {
            db.createObjectStore(SAVE_STORE_NAME);
          }
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          console.warn('Failed to open IndexedDB for EmulatorJS save persistence:', request.error);
          resolve(null);
        };
        request.onblocked = () => {
          resolve(null);
        };
      } catch (error) {
        console.warn('Failed to initialise IndexedDB for EmulatorJS save persistence:', error);
        resolve(null);
      }
    });
  }

  return saveDatabasePromise;
}

function toStoredBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength && data.buffer instanceof ArrayBuffer) {
    return data.buffer.slice(0);
  }
  return data.slice().buffer;
}

async function writePersistedSave(romId: string, data: Uint8Array | null, createNewState = false): Promise<void> {
  const db = await openSaveDatabase();
  if (!db) {
    console.log('[ROM Scout] IndexedDB not available, cannot persist save');
    return;
  }

  const crc32 = data ? computeCrc32(data) : 'null';
  console.log('[ROM Scout] Writing save to IndexedDB for ROM:', romId, 'size:', data ? data.length : 0, 'crc32:', crc32, 'createNew:', createNewState);

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(SAVE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SAVE_STORE_NAME);

      if (!data) {
        // Delete all saves for this ROM
        const deleteRequest = store.delete(romId);
        deleteRequest.onsuccess = () => {
          console.log('[ROM Scout] Successfully deleted all saves from IndexedDB for ROM:', romId);
          resolve();
        };
        deleteRequest.onerror = () => {
          console.warn('Failed to delete EmulatorJS save data:', deleteRequest.error);
          resolve();
        };
        return;
      }

      // Read existing record
      const getRequest = store.get(romId);
      getRequest.onsuccess = () => {
        const existingRecord = getRequest.result as PersistedSaveRecord | undefined;
        const existingSaves = existingRecord?.saves ?? [];

        const newSave: PersistedSaveState = {
          data: toStoredBuffer(data),
          updatedAt: Date.now(),
          crc32: crc32,
        };

        let updatedSaves: PersistedSaveState[];

        if (createNewState) {
          // Add as a new save state
          updatedSaves = [newSave, ...existingSaves];
        } else {
          // Update the most recent save state (or create first one)
          if (existingSaves.length > 0) {
            updatedSaves = [newSave, ...existingSaves.slice(1)];
          } else {
            updatedSaves = [newSave];
          }
        }

        // Keep saves sorted by timestamp (most recent first)
        updatedSaves.sort((a, b) => b.updatedAt - a.updatedAt);

        const record: PersistedSaveRecord = { saves: updatedSaves };
        const putRequest = store.put(record, romId);

        putRequest.onsuccess = () => {
          console.log('[ROM Scout] Successfully persisted save to IndexedDB for ROM:', romId, 'crc32:', crc32, 'total saves:', updatedSaves.length);
          resolve();
        };
        putRequest.onerror = () => {
          console.warn('Failed to persist EmulatorJS save data:', putRequest.error);
          resolve();
        };
      };

      getRequest.onerror = () => {
        console.warn('Failed to read existing save data:', getRequest.error);
        resolve();
      };

      transaction.onerror = () => {
        console.warn('Failed to persist EmulatorJS save data:', transaction.error);
        resolve();
      };
    } catch (error) {
      console.warn('Unexpected error while writing EmulatorJS save data:', error);
      resolve();
    }
  });
}

interface StoredSaveData {
  data: Uint8Array;
  updatedAt: number | null;
  crc32: string;
}

interface StoredSaveList {
  saves: StoredSaveData[];
}

async function readPersistedSaves(romId: string): Promise<StoredSaveList> {
  const db = await openSaveDatabase();
  if (!db) {
    console.log('[ROM Scout] IndexedDB not available, cannot read saves');
    return { saves: [] };
  }

  console.log('[ROM Scout] Reading saves from IndexedDB for ROM:', romId);

  return new Promise<StoredSaveList>((resolve) => {
    try {
      const transaction = db.transaction(SAVE_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SAVE_STORE_NAME);
      const request = store.get(romId);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          console.log('[ROM Scout] No saved data found in IndexedDB for ROM:', romId);
          resolve({ saves: [] });
          return;
        }

        // Handle new multi-save format
        if (result && typeof result === 'object' && 'saves' in result && Array.isArray(result.saves)) {
          const record = result as PersistedSaveRecord;
          const saves: StoredSaveData[] = record.saves.map(save => ({
            data: new Uint8Array(save.data),
            updatedAt: save.updatedAt,
            crc32: save.crc32,
          }));
          console.log('[ROM Scout] Successfully read', saves.length, 'saves from IndexedDB for ROM:', romId);
          resolve({ saves });
          return;
        }

        // Handle legacy single-save format for backward compatibility
        let buffer: ArrayBuffer | undefined;
        let updatedAt: number | null = null;
        if (result instanceof ArrayBuffer) {
          buffer = result;
        } else if (result && typeof result === 'object' && 'data' in result) {
          buffer = (result as any).data;
          if ('updatedAt' in result && typeof (result as any).updatedAt === 'number') {
            updatedAt = Number.isFinite((result as any).updatedAt) ? (result as any).updatedAt : null;
          }
        }

        const saveData = buffer ? new Uint8Array(buffer) : null;
        if (saveData) {
          const crc32 = computeCrc32(saveData);
          console.log(
            '[ROM Scout] Migrating legacy save from IndexedDB for ROM:',
            romId,
            'size:',
            saveData.length,
            'bytes',
            'updatedAt:',
            formatTimestamp(updatedAt),
            'crc32:',
            crc32
          );
          resolve({ saves: [{ data: saveData, updatedAt: updatedAt ?? Date.now(), crc32 }] });
        } else {
          console.log('[ROM Scout] Save data found but could not be converted for ROM:', romId);
          resolve({ saves: [] });
        }
      };
      request.onerror = () => {
        console.warn('Failed to read EmulatorJS save data:', request.error);
        resolve({ saves: [] });
      };
    } catch (error) {
      console.warn('Unexpected error while reading EmulatorJS save data:', error);
      resolve({ saves: [] });
    }
  });
}

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
  return data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
}

function extractSavePayload(payload: unknown): Uint8Array | null {
  if (!payload) {
    return null;
  }
  if (payload instanceof Uint8Array) {
    return new Uint8Array(payload);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (typeof SharedArrayBuffer !== 'undefined' && payload instanceof SharedArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    const source = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return new Uint8Array(source);
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if ('state' in record) {
      return extractSavePayload(record.state);
    }
    if ('save' in record) {
      return extractSavePayload(record.save);
    }
  }
  return null;
}

function writeSaveToFilesystem(emulator: EmulatorInstance, data: Uint8Array): boolean {
  const manager = emulator.gameManager;
  if (!manager || !manager.FS || typeof manager.getSaveFilePath !== 'function') {
    console.log('[ROM Scout] Cannot write save to filesystem: game manager not ready');
    return false;
  }

  const path = manager.getSaveFilePath();
  if (!path) {
    console.log('[ROM Scout] Cannot write save to filesystem: no save file path');
    return false;
  }

  console.log('[ROM Scout] Writing save to emulator filesystem:', path, 'size:', data.length, 'bytes', 'crc32:', computeCrc32(data));

  const fs = manager.FS;
  try {
    const segments = path.split('/');
    let current = '';
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (!segment) continue;
      current += `/${segment}`;
      try {
        if (!fs.analyzePath(current).exists) {
          fs.mkdir(current);
        }
      } catch {
        // Ignore directory creation errors (likely already exists)
      }
    }

    try {
      if (fs.analyzePath(path).exists) {
        fs.unlink(path);
      }
    } catch {
      // ignore unlink failures
    }

    fs.writeFile(path, data);
    console.log('[ROM Scout] Successfully wrote save to emulator filesystem');
    return true;
  } catch (error) {
    console.warn('Failed to apply persisted EmulatorJS save data:', error);
    return false;
  }
}

interface EmulatorFilesystem {
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
  unlink(path: string): void;
}

interface EmulatorGameManager {
  FS?: EmulatorFilesystem;
  getSaveFilePath?: () => string;
  loadSaveFiles?: () => void;
  saveState?: () => void;
  getState?: () => unknown;
  loadState?: (state: Uint8Array) => void;
  setState?: (state: Uint8Array) => void;
}

interface EmulatorInstance {
  callEvent?: (eventName: string) => void;
  destroy?: () => void;
  gameManager?: EmulatorGameManager;
  events?: Record<string, { functions?: unknown[] }>;
}

type EmulatorGlobal = typeof globalThis & {
  EJS_player?: string | null;
  EJS_gameUrl?: string | Blob | null;
  EJS_core?: string | null;
  EJS_gameName?: string | null;
  EJS_biosUrl?: string | null;
  EJS_pathtodata?: string | null;
  EJS_startOnLoaded?: boolean;
  EJS_disableDatabases?: boolean;
  EJS_threads?: boolean;
  EJS_ready?: (() => void) | null;
  EJS_emulator?: EmulatorInstance | null;
};

export interface RomPlayerOptions {
  target: HTMLElement | string;
  file: Blob;
  /**
   * Metadata about the ROM. Only the title and platform are used for player configuration.
   */
  metadata?: Partial<RomMetadata>;
  /**
   * Optional filename to help with platform detection when using raw Blob instances.
   */
  filename?: string;
  /**
   * Override the automatically detected EmulatorJS core.
   */
  core?: string;
  /**
   * Override the EmulatorJS loader URL. Defaults to the stable CDN build.
   */
  loaderUrl?: string;
  /**
   * Override the EmulatorJS data path. Defaults to the stable CDN build.
   */
  dataPath?: string;
  /**
   * Optional BIOS URL passed through to EmulatorJS.
   */
  biosUrl?: string;
  /**
   * When true, the emulator will start automatically when loaded. Defaults to true.
   */
  startOnLoaded?: boolean;
  /**
   * Disable EmulatorJS databases (on by default to reduce network access).
   */
  disableDatabases?: boolean;
  /**
   * Enable EmulatorJS threading support. Disabled by default for compatibility with the CDN build.
   */
  threads?: boolean;
  /**
   * Automatically append the EmulatorJS loader script. Defaults to true.
   */
  autoLoadLoaderScript?: boolean;
}

export interface SaveStateInfo {
  timestamp: number;
  crc32: string;
  formattedTimestamp: string;
}

export interface RomPlayerInstance {
  element: HTMLElement;
  core: string;
  /**
   * Object URL that EmulatorJS will load. Consumers should call `destroy()` to release it.
   */
  gameUrl: string | Blob;
  metadata?: Partial<RomMetadata>;
  filename?: string;
  destroy(): Promise<void>;
  /**
   * Force the emulator to persist its current save state, if persistence is available.
   * If createNew is true, a new save state is created; otherwise, the most recent one is updated.
   * Returns true when save data was captured.
   */
  persistSave(createNew?: boolean): Promise<boolean>;
  /**
   * Load the most recent persisted save into the running emulator, if available.
   * Returns true when save data was restored.
   */
  loadLatestSave(): Promise<boolean>;
  /**
   * Load a specific save state by timestamp.
   * Returns true when save data was restored.
   */
  loadSaveByTimestamp(timestamp: number): Promise<boolean>;
  /**
   * List all available save states for this ROM.
   * Returns an array of save state info, sorted by timestamp (most recent first).
   */
  listSaves(): Promise<SaveStateInfo[]>;
}

interface InternalPlayerInstance extends RomPlayerInstance {
  loaderScript: HTMLScriptElement | null;
  destroyed: boolean;
}

let activePlayer: InternalPlayerInstance | null = null;
let activePlayerDestroyPromise: Promise<void> | null = null;

function ensureDomAvailable(): void {
  if (typeof document === 'undefined') {
    throw new Error('startRomPlayer requires a browser or DOM-like environment');
  }
}

function resolveTargetElement(target: HTMLElement | string): HTMLElement {
  if (typeof target !== 'string') {
    return target;
  }

  const element = document.querySelector(target);
  if (!element) {
    throw new Error(`Target element not found for selector: ${target}`);
  }
  return element as HTMLElement;
}

function normaliseFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  const parts = filename.split('/');
  return parts[parts.length - 1];
}

export function detectEmulatorCore(filename?: string, metadata?: Partial<RomMetadata>): string {
  const normalisedMetadata = metadata?.platform?.toLowerCase();
  if (normalisedMetadata) {
    for (const [pattern, core] of PLATFORM_CORE_PATTERNS) {
      if (normalisedMetadata.includes(pattern)) {
        return core;
      }
    }
  }

  if (filename) {
    const lowerName = filename.toLowerCase();
    const ext = lowerName.includes('.') ? lowerName.split('.').pop() : undefined;
    if (ext && EXTENSION_CORE_MAP[ext]) {
      return EXTENSION_CORE_MAP[ext];
    }
  }

  return 'nes';
}

function getUrlFactory(): typeof URL | undefined {
  if (typeof window !== 'undefined' && window.URL) {
    return window.URL;
  }
  if (globalThis.URL) {
    return globalThis.URL;
  }
  return undefined;
}

function createObjectUrl(blob: Blob): string {
  const urlFactory = getUrlFactory();
  if (!urlFactory || typeof urlFactory.createObjectURL !== 'function') {
    throw new Error('URL.createObjectURL is not available in this environment');
  }
  return urlFactory.createObjectURL(blob);
}

function cleanupActivePlayer(): Promise<void> {
  if (!activePlayer) {
    return activePlayerDestroyPromise ?? Promise.resolve();
  }

  const instance = activePlayer;
  activePlayer = null;

  try {
    const destroyResult = instance.destroy();
    const destroyPromise = Promise.resolve(destroyResult).finally(() => {
      if (activePlayerDestroyPromise === destroyPromise) {
        activePlayerDestroyPromise = null;
      }
    });
    activePlayerDestroyPromise = destroyPromise;
    return destroyPromise;
  } catch (error) {
    activePlayerDestroyPromise = null;
    return Promise.reject(error);
  }
}


function setupPersistentSave(instance: InternalPlayerInstance, metadata?: Partial<RomMetadata>): void {
  const romLabel = metadata?.title ?? metadata?.id ?? metadata?.persistId ?? 'unknown ROM';

  const persistenceKeys = Array.from(
    new Set(
      [metadata?.persistId, metadata?.id, ...(metadata?.alternateIds ?? [])]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => Boolean(value))
    )
  );

  instance.persistSave = async () => {
    console.log('[ROM Scout] Manual save requested but persistence is not available for ROM:', romLabel);
    return false;
  };

  instance.loadLatestSave = async () => {
    console.log('[ROM Scout] Manual load requested but persistence is not available for ROM:', romLabel);
    return false;
  };

  instance.loadSaveByTimestamp = async () => {
    console.log('[ROM Scout] Manual load by timestamp requested but persistence is not available for ROM:', romLabel);
    return false;
  };

  instance.listSaves = async () => {
    console.log('[ROM Scout] List saves requested but persistence is not available for ROM:', romLabel);
    return [];
  };

  if (persistenceKeys.length === 0 || !isIndexedDbAvailable()) {
    const reason = persistenceKeys.length === 0 ? 'no persistence keys' : 'IndexedDB not available';
    console.log('[ROM Scout] Persistent save not configured:', reason, 'for ROM:', romLabel);
    return;
  }

  console.log('[ROM Scout] Setting up persistent save for ROM:', romLabel, 'keys:', persistenceKeys.join(', '));

  const globalScope = globalThis as EmulatorGlobal;
  const previousReady = typeof globalScope.EJS_ready === 'function' ? globalScope.EJS_ready : null;

  let pendingState: Uint8Array | null = null;
  let destroyInProgress: Promise<void> | null = null;
  let startupLoadAttempted = false;

  const applyPendingState = (reason: string): 'restored' | 'queued' | 'failed' => {
    if (!pendingState || pendingState.length === 0) {
      console.log('[ROM Scout] No pending save state to restore for ROM:', romLabel, 'reason:', reason);
      return 'failed';
    }

    const emulator = globalScope.EJS_emulator;
    if (!emulator) {
      console.log('[ROM Scout] Emulator not ready to restore save for ROM:', romLabel, 'reason:', reason);
      return 'queued';
    }

    const manager = emulator.gameManager;
    if (!manager) {
      console.log('[ROM Scout] Emulator game manager unavailable for ROM:', romLabel, 'reason:', reason);
      return 'queued';
    }

    let restored = false;

    if (typeof manager.loadState === 'function') {
      try {
        const stateCopy = toUint8Array(pendingState);
        manager.loadState(stateCopy);
        restored = true;
        console.log('[ROM Scout] Restored save using gameManager.loadState for ROM:', romLabel, 'reason:', reason);
      } catch (error) {
        console.warn('[ROM Scout] Failed to restore save via gameManager.loadState for ROM:', romLabel, 'reason:', reason, error);
      }
    }

    if (!restored && typeof manager.setState === 'function') {
      try {
        manager.setState(pendingState);
        restored = true;
        console.log('[ROM Scout] Restored save using gameManager.setState for ROM:', romLabel, 'reason:', reason);
      } catch (error) {
        console.warn('[ROM Scout] Failed to restore save via gameManager.setState for ROM:', romLabel, 'reason:', reason, error);
      }
    }

    if (!restored) {
      const filesystemState = toUint8Array(pendingState);
      restored = writeSaveToFilesystem(emulator, filesystemState);
      if (restored) {
        if (typeof manager.loadSaveFiles === 'function') {
          try {
            manager.loadSaveFiles();
          } catch (error) {
            console.warn('Failed to load EmulatorJS save files after filesystem restore:', error);
          }
        }
        if (typeof emulator.callEvent === 'function') {
          try {
            emulator.callEvent('load');
          } catch (error) {
            console.warn('Failed to trigger EmulatorJS load event after filesystem restore:', error);
          }
        }
        console.log('[ROM Scout] Restored save using filesystem fallback for ROM:', romLabel, 'reason:', reason);
      } else {
        console.log('[ROM Scout] Failed to restore save via filesystem fallback for ROM:', romLabel, 'reason:', reason);
      }
    }

    if (restored) {
      pendingState = null;
      return 'restored';
    }

    pendingState = null;
    return 'failed';
  };

  const loadPersistedState = async (reason: string, specificTimestamp?: number): Promise<boolean> => {
    console.log('[ROM Scout] Loading persisted save for ROM:', romLabel, 'reason:', reason, 'timestamp:', specificTimestamp ?? 'latest', 'keys:', persistenceKeys.join(', '));

    const candidates: Array<{ key: string; data: Uint8Array; updatedAt: number | null }> = [];

    for (const key of persistenceKeys) {
      try {
        const saveList = await readPersistedSaves(key);
        if (saveList.saves.length === 0) {
          continue;
        }

        // If a specific timestamp is requested, find that save
        if (specificTimestamp !== undefined) {
          const specificSave = saveList.saves.find(s => s.updatedAt === specificTimestamp);
          if (specificSave && specificSave.data.length > 0) {
            candidates.push({ key, data: new Uint8Array(specificSave.data), updatedAt: specificSave.updatedAt });
          }
        } else {
          // Otherwise, use the most recent save
          const mostRecent = saveList.saves[0];
          if (mostRecent && mostRecent.data.length > 0) {
            candidates.push({ key, data: new Uint8Array(mostRecent.data), updatedAt: mostRecent.updatedAt });
          }
        }
      } catch (error) {
        console.warn('[ROM Scout] Failed to read persisted save data for ROM:', romLabel, 'key:', key, 'reason:', reason, error);
      }
    }

    if (candidates.length === 0) {
      pendingState = null;
      console.log('[ROM Scout] No persisted save data available for ROM:', romLabel, 'after checking keys:', persistenceKeys.join(', '));
      return false;
    }

    candidates.sort((a, b) => {
      const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : -Infinity;
      const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : -Infinity;
      return bTime - aTime;
    });

    for (const candidate of candidates) {
      pendingState = new Uint8Array(candidate.data);
      const outcome = applyPendingState(reason);
      if (outcome === 'restored') {
        console.log('[ROM Scout] Persisted save applied for ROM:', romLabel, 'key:', candidate.key, 'reason:', reason, 'updatedAt:', formatTimestamp(candidate.updatedAt), 'crc32:', computeCrc32(candidate.data));
        return true;
      }

      if (outcome === 'queued') {
        console.log('[ROM Scout] Persisted save queued until emulator ready for ROM:', romLabel, 'key:', candidate.key, 'reason:', reason, 'updatedAt:', formatTimestamp(candidate.updatedAt), 'crc32:', computeCrc32(candidate.data));
        return false;
      }

      console.log('[ROM Scout] Persisted save failed for ROM:', romLabel, 'key:', candidate.key, 'reason:', reason, 'updatedAt:', formatTimestamp(candidate.updatedAt), 'crc32:', computeCrc32(candidate.data), 'trying next most recent');
      pendingState = null;
    }

    pendingState = null;
    console.log('[ROM Scout] Unable to restore persisted save for ROM:', romLabel, 'after trying keys by recency:', persistenceKeys.join(', '));
    return false;
  };

  const persistState = async (reason: string, createNew = false): Promise<boolean> => {
    const emulator = globalScope.EJS_emulator;
    if (!emulator) {
      console.log('[ROM Scout] No emulator instance available to save for ROM:', romLabel, 'reason:', reason);
      return false;
    }

    const manager = emulator.gameManager;
    if (!manager || typeof manager.getState !== 'function') {
      console.log('[ROM Scout] Emulator does not expose getState for ROM:', romLabel, 'reason:', reason);
      return false;
    }

    let stateData: Uint8Array | null = null;
    try {
      const payload = manager.getState();
      stateData = extractSavePayload(payload);
    } catch (error) {
      console.warn('[ROM Scout] Failed to capture save state via gameManager.getState for ROM:', romLabel, 'reason:', reason, error);
      return false;
    }

    if (!stateData || stateData.length === 0) {
      console.log('[ROM Scout] No save state data returned for ROM:', romLabel, 'reason:', reason);
      return false;
    }

    try {
      for (const key of persistenceKeys) {
        await writePersistedSave(key, stateData, createNew);
      }
      console.log('[ROM Scout] Persisted save state for ROM:', romLabel, 'bytes:', stateData.length, 'reason:', reason, 'createNew:', createNew, 'keys:', persistenceKeys.join(', '), 'crc32:', computeCrc32(stateData));
      return true;
    } catch (error) {
      console.warn('Failed to persist EmulatorJS save data:', error);
      return false;
    }
  };

  const triggerStartupLoad = (reason: string) => {
    if (startupLoadAttempted) {
      return;
    }
    startupLoadAttempted = true;
    void loadPersistedState(reason);
  };

  const readyWrapper = () => {
    if (previousReady) {
      try {
        previousReady();
      } catch (error) {
        console.warn('Error in existing EmulatorJS ready callback:', error);
      }
    }

    if (pendingState) {
      const outcome = applyPendingState('ready');
      if (outcome !== 'restored') {
        console.log('[ROM Scout] Save data still pending after ready event for ROM:', romLabel, 'status:', outcome);
      }
    } else {
      triggerStartupLoad('startup');
    }
  };

  globalScope.EJS_ready = readyWrapper;

  if (globalScope.EJS_emulator) {
    triggerStartupLoad('startup immediate');
  }

  instance.persistSave = async (createNew = false) => {
    console.log('[ROM Scout] Manual save requested for ROM:', romLabel, 'createNew:', createNew);
    return persistState('manual', createNew);
  };

  instance.loadLatestSave = async () => {
    console.log('[ROM Scout] Manual load requested for ROM:', romLabel);
    return loadPersistedState('manual');
  };

  instance.loadSaveByTimestamp = async (timestamp: number) => {
    console.log('[ROM Scout] Manual load by timestamp requested for ROM:', romLabel, 'timestamp:', timestamp);
    return loadPersistedState('manual', timestamp);
  };

  instance.listSaves = async () => {
    console.log('[ROM Scout] List saves requested for ROM:', romLabel);
    const allSaves: SaveStateInfo[] = [];

    for (const key of persistenceKeys) {
      try {
        const saveList = await readPersistedSaves(key);
        for (const save of saveList.saves) {
          // Avoid duplicates by checking if we already have this timestamp
          if (!allSaves.some(s => s.timestamp === save.updatedAt)) {
            allSaves.push({
              timestamp: save.updatedAt ?? 0,
              crc32: save.crc32,
              formattedTimestamp: formatTimestamp(save.updatedAt),
            });
          }
        }
      } catch (error) {
        console.warn('[ROM Scout] Failed to read save list for key:', key, error);
      }
    }

    // Sort by timestamp, most recent first
    allSaves.sort((a, b) => b.timestamp - a.timestamp);

    console.log('[ROM Scout] Found', allSaves.length, 'save states for ROM:', romLabel);
    return allSaves;
  };

  const originalDestroy = instance.destroy.bind(instance);
  instance.destroy = () => {
    if (destroyInProgress) {
      return destroyInProgress;
    }

    console.log('[ROM Scout] Destroying player instance for ROM:', romLabel);

    const destroyPromise = (async () => {
      try {
        await persistState('destroy', true);

        if (globalScope.EJS_ready === readyWrapper) {
          if (previousReady) {
            globalScope.EJS_ready = previousReady;
          } else {
            delete globalScope.EJS_ready;
          }
        }
      } finally {
        await originalDestroy();
      }
    })();

    destroyInProgress = destroyPromise.finally(() => {
      destroyInProgress = null;
    });

    return destroyInProgress;
  };
}

function applyEmulatorConfig(instance: InternalPlayerInstance, options: RomPlayerOptions, core: string, gameUrl: string | Blob, gameName: string): HTMLScriptElement {
  const globalScope = globalThis as EmulatorGlobal;

  const element = instance.element;
  if (!element.id) {
    element.id = `rom-scout-player-${Math.random().toString(36).slice(2)}`;
  }

  const selector = `#${element.id}`;

  globalScope.EJS_player = selector;
  globalScope.EJS_gameUrl = gameUrl;
  globalScope.EJS_core = core;
  globalScope.EJS_gameName = gameName;
  globalScope.EJS_biosUrl = options.biosUrl ?? '';
  globalScope.EJS_pathtodata = options.dataPath ?? DEFAULT_DATA_PATH;
  globalScope.EJS_startOnLoaded = options.startOnLoaded ?? true;
  globalScope.EJS_disableDatabases = options.disableDatabases ?? true;
  globalScope.EJS_threads = options.threads ?? false;

  const script = document.createElement('script');
  script.src = options.loaderUrl ?? DEFAULT_LOADER_URL;
  script.async = true;
  return script;
}

function clearEmulatorConfig(instance: InternalPlayerInstance): void {
  const globalScope = globalThis as EmulatorGlobal;

  if (globalScope.EJS_emulator && typeof globalScope.EJS_emulator.callEvent === 'function') {
    try {
      globalScope.EJS_emulator.callEvent('exit');
    } catch (error) {
      console.warn('Failed to signal EmulatorJS to exit cleanly:', error);
    }
  }

  if (globalScope.EJS_emulator && typeof globalScope.EJS_emulator.destroy === 'function') {
    try {
      globalScope.EJS_emulator.destroy();
    } catch (error) {
      console.warn('Failed to destroy EmulatorJS instance:', error);
    }
  }

  globalScope.EJS_player = null;
  globalScope.EJS_gameUrl = null;
  globalScope.EJS_core = null;
  globalScope.EJS_gameName = null;
  globalScope.EJS_biosUrl = null;
  globalScope.EJS_pathtodata = null;
  globalScope.EJS_startOnLoaded = false;
  globalScope.EJS_disableDatabases = false;
  globalScope.EJS_threads = false;
  globalScope.EJS_emulator = null;

  instance.element.innerHTML = '';
}

export async function startRomPlayer(options: RomPlayerOptions): Promise<RomPlayerInstance> {
  ensureDomAvailable();

  const element = resolveTargetElement(options.target);

  await cleanupActivePlayer();

  const effectiveName = options.filename ?? ('name' in options.file ? (options.file as File).name : undefined);
  const filename = normaliseFilename(effectiveName);
  const displayName = options.metadata?.title ?? filename ?? effectiveName ?? 'Unknown ROM';
  const core = options.core ?? detectEmulatorCore(filename ?? effectiveName, options.metadata);

  const gameUrl = 'name' in options.file ? options.file as File : createObjectUrl(options.file);

  element.innerHTML = '';

  const instance: InternalPlayerInstance = {
    element,
    core,
    gameUrl,
    metadata: options.metadata,
    filename,
    loaderScript: null,
    destroyed: false,
    destroy: async () => {
      if (instance.destroyed) {
        return;
      }
      instance.destroyed = true;

      try {
        clearEmulatorConfig(instance);
      } finally {
        if (instance.loaderScript && instance.loaderScript.isConnected) {
          instance.loaderScript.remove();
        }
        if (instance.gameUrl) {
          const urlFactory = getUrlFactory();
          if (typeof instance.gameUrl === 'string' && urlFactory && typeof urlFactory.revokeObjectURL === 'function') {
            try {
              urlFactory.revokeObjectURL(instance.gameUrl);
            } catch (error) {
              console.warn('Failed to revoke object URL:', error);
            }
          }
        }
        if (activePlayer === instance) {
          activePlayer = null;
        }
      }
    },
    persistSave: async () => false,
    loadLatestSave: async () => false,
    loadSaveByTimestamp: async () => false,
    listSaves: async () => [],
  };

  setupPersistentSave(instance, options.metadata);

  const script = applyEmulatorConfig(instance, options, core, gameUrl, displayName);
  instance.loaderScript = script;

  if (options.autoLoadLoaderScript !== false) {
    script.onerror = () => {
      if (activePlayer === instance) {
        activePlayer = null;
      }
      void instance.destroy();
      console.error('Failed to load EmulatorJS resources');
    };

    document.body.appendChild(script);
  }

  activePlayer = instance;

  return instance;
}
