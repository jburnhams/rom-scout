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
  EJS_emulator?: {
    callEvent?: (eventName: string) => void;
    destroy?: () => void;
  } | null;
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
