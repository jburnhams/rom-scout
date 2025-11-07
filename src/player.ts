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

interface PersistedSaveRecord {
  data: ArrayBuffer;
  updatedAt: number;
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

async function writePersistedSave(romId: string, data: Uint8Array | null): Promise<void> {
  const db = await openSaveDatabase();
  if (!db) {
    console.log('[ROM Scout] IndexedDB not available, cannot persist save');
    return;
  }

  console.log('[ROM Scout] Writing save to IndexedDB for ROM:', romId, 'size:', data ? data.length : 0);

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(SAVE_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SAVE_STORE_NAME);
      let request: IDBRequest;
      if (data) {
        const record: PersistedSaveRecord = {
          data: toStoredBuffer(data),
          updatedAt: Date.now(),
        };
        request = store.put(record, romId);
      } else {
        request = store.delete(romId);
      }

      request.onsuccess = () => {
        console.log('[ROM Scout] Successfully persisted save to IndexedDB for ROM:', romId);
        resolve();
      };
      request.onerror = () => {
        console.warn('Failed to persist EmulatorJS save data:', request.error);
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

async function readPersistedSave(romId: string): Promise<Uint8Array | null> {
  const db = await openSaveDatabase();
  if (!db) {
    console.log('[ROM Scout] IndexedDB not available, cannot read save');
    return null;
  }

  console.log('[ROM Scout] Reading save from IndexedDB for ROM:', romId);

  return new Promise<Uint8Array | null>((resolve) => {
    try {
      const transaction = db.transaction(SAVE_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SAVE_STORE_NAME);
      const request = store.get(romId);
      request.onsuccess = () => {
        const result = request.result as PersistedSaveRecord | ArrayBuffer | undefined;
        if (!result) {
          console.log('[ROM Scout] No saved data found in IndexedDB for ROM:', romId);
          resolve(null);
          return;
        }

        let buffer: ArrayBuffer | undefined;
        if (result instanceof ArrayBuffer) {
          buffer = result;
        } else if (result && typeof result === 'object' && 'data' in result) {
          buffer = result.data;
        }

        const saveData = buffer ? new Uint8Array(buffer) : null;
        if (saveData) {
          console.log('[ROM Scout] Successfully read save from IndexedDB for ROM:', romId, 'size:', saveData.length, 'bytes');
        } else {
          console.log('[ROM Scout] Save data found but could not be converted for ROM:', romId);
        }
        resolve(saveData);
      };
      request.onerror = () => {
        console.warn('Failed to read EmulatorJS save data:', request.error);
        resolve(null);
      };
    } catch (error) {
      console.warn('Unexpected error while reading EmulatorJS save data:', error);
      resolve(null);
    }
  });
}

function extractSavePayload(payload: unknown): Uint8Array | null {
  if (!payload) {
    return null;
  }
  if (payload instanceof Uint8Array) {
    return payload;
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
  if (typeof payload === 'object' && 'save' in (payload as Record<string, unknown>)) {
    return extractSavePayload((payload as Record<string, unknown>).save);
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

  console.log('[ROM Scout] Writing save to emulator filesystem:', path, 'size:', data.length, 'bytes');

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

type EmulatorEventHandler = (payload?: unknown) => void;

interface EmulatorFilesystem {
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array): void;
  unlink(path: string): void;
}

interface EmulatorGameManager {
  FS?: EmulatorFilesystem;
  getSaveFilePath?: () => string;
  loadSaveFiles?: () => void;
}

interface EmulatorInstance {
  on(event: string, callback: EmulatorEventHandler): void;
  callEvent?: (eventName: string) => void;
  destroy?: () => void;
  gameManager?: EmulatorGameManager;
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
  EJS_onSaveUpdate?: ((payload: unknown) => void) | null;
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

export interface RomPlayerInstance {
  element: HTMLElement;
  core: string;
  /**
   * Object URL that EmulatorJS will load. Consumers should call `destroy()` to release it.
   */
  gameUrl: string | Blob;
  metadata?: Partial<RomMetadata>;
  filename?: string;
  destroy(): void;
}

interface InternalPlayerInstance extends RomPlayerInstance {
  loaderScript: HTMLScriptElement | null;
  destroyed: boolean;
}

let activePlayer: InternalPlayerInstance | null = null;

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

function cleanupActivePlayer(): void {
  if (!activePlayer) {
    return;
  }
  activePlayer.destroy();
  activePlayer = null;
}


function setupPersistentSave(instance: InternalPlayerInstance, romId?: string): void {
  if (!romId || !isIndexedDbAvailable()) {
    console.log('[ROM Scout] Persistent save not configured:', !romId ? 'no ROM ID' : 'IndexedDB not available');
    return;
  }

  console.log('[ROM Scout] Setting up persistent save for ROM:', romId);

  const globalScope = globalThis as EmulatorGlobal;
  const previousReady = typeof globalScope.EJS_ready === 'function' ? globalScope.EJS_ready : null;
  const previousSaveUpdate = typeof globalScope.EJS_onSaveUpdate === 'function' ? globalScope.EJS_onSaveUpdate : null;

  let handlersAttached = false;
  let hasPendingLoad = false;

  const handleSavePayload = (payload: unknown) => {
    console.log('[ROM Scout] Save event triggered for ROM:', romId);
    const data = extractSavePayload(payload);
    if (data) {
      console.log('[ROM Scout] Save data extracted, size:', data.length, 'bytes');
    } else {
      console.log('[ROM Scout] No save data extracted from payload');
    }
    void writePersistedSave(romId, data);
  };

  const attachHandlers = () => {
    if (handlersAttached) {
      return;
    }
    const emulator = globalScope.EJS_emulator;
    if (!emulator) {
      return;
    }
    handlersAttached = true;
    console.log('[ROM Scout] Attaching save/load event handlers for ROM:', romId);

    emulator.on('saveSaveFiles', (payload) => {
      console.log('[ROM Scout] EmulatorJS "saveSaveFiles" event fired');
      handleSavePayload(payload);
    });
    emulator.on('saveSave', (payload) => {
      console.log('[ROM Scout] EmulatorJS "saveSave" event fired');
      handleSavePayload(payload);
    });

    emulator.on('saveDatabaseLoaded', async () => {
      console.log('[ROM Scout] EmulatorJS "saveDatabaseLoaded" event fired');
      try {
        const existing = await readPersistedSave(romId);
        if (existing && writeSaveToFilesystem(emulator, existing)) {
          hasPendingLoad = true;
          console.log('[ROM Scout] Save data restored to filesystem, will load on start');
        }
      } catch (error) {
        console.warn('Failed to restore persisted EmulatorJS save data:', error);
      }
    });

    emulator.on('start', () => {
      console.log('[ROM Scout] EmulatorJS "start" event fired');
      if (hasPendingLoad && emulator.gameManager && typeof emulator.gameManager.loadSaveFiles === 'function') {
        console.log('[ROM Scout] Loading save files into game');
        try {
          emulator.gameManager.loadSaveFiles();
          console.log('[ROM Scout] Successfully loaded save files into game');
        } catch (error) {
          console.warn('Failed to hydrate EmulatorJS save files:', error);
        }
      }
      hasPendingLoad = false;
    });
  };

  const readyWrapper = () => {
    attachHandlers();
    if (previousReady) {
      try {
        previousReady();
      } catch (error) {
        console.warn('Error in existing EmulatorJS ready callback:', error);
      }
    }
  };

  const saveUpdateWrapper = (payload: unknown) => {
    handleSavePayload(payload);
    if (previousSaveUpdate) {
      try {
        previousSaveUpdate(payload);
      } catch (error) {
        console.warn('Error in existing EmulatorJS save update callback:', error);
      }
    }
  };

  globalScope.EJS_ready = readyWrapper;
  globalScope.EJS_onSaveUpdate = saveUpdateWrapper;

  if (globalScope.EJS_emulator) {
    attachHandlers();
  }

  const originalDestroy = instance.destroy.bind(instance);
  instance.destroy = () => {
    console.log('[ROM Scout] Destroying player instance for ROM:', romId);
    if (globalScope.EJS_ready === readyWrapper) {
      if (previousReady) {
        globalScope.EJS_ready = previousReady;
      } else {
        delete globalScope.EJS_ready;
      }
    }
    if (globalScope.EJS_onSaveUpdate === saveUpdateWrapper) {
      if (previousSaveUpdate) {
        globalScope.EJS_onSaveUpdate = previousSaveUpdate;
      } else {
        delete globalScope.EJS_onSaveUpdate;
      }
    }
    originalDestroy();
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

  cleanupActivePlayer();

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
    destroy: () => {
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
  };

  setupPersistentSave(instance, options.metadata?.id);

  const script = applyEmulatorConfig(instance, options, core, gameUrl, displayName);
  instance.loaderScript = script;

  if (options.autoLoadLoaderScript !== false) {
    script.onerror = () => {
      if (activePlayer === instance) {
        activePlayer = null;
      }
      instance.destroy();
      console.error('Failed to load EmulatorJS resources');
    };

    document.body.appendChild(script);
  }

  activePlayer = instance;

  return instance;
}
