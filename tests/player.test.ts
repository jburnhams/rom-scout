import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Window } from 'happy-dom';
import { startRomPlayer, detectEmulatorCore } from '../src/player.js';

describe('startRomPlayer', () => {
  let windowInstance: Window;
  let cleanupGlobals: (() => void) | null = null;
  let originalURL: typeof URL | undefined;

  beforeEach(() => {
    windowInstance = new Window();
    const globalAny = globalThis as any;

    originalURL = globalAny.URL;
    globalAny.window = windowInstance;
    globalAny.document = windowInstance.document;
    globalAny.HTMLElement = windowInstance.HTMLElement;
    globalAny.HTMLIFrameElement = windowInstance.HTMLIFrameElement;
    globalAny.HTMLVideoElement = windowInstance.HTMLVideoElement;
    globalAny.HTMLAudioElement = windowInstance.HTMLAudioElement;
    globalAny.URL = windowInstance.URL;

    cleanupGlobals = () => {
      const keys = ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLVideoElement', 'HTMLAudioElement'];
      for (const key of keys) {
        delete globalAny[key];
      }
      if (originalURL) {
        globalAny.URL = originalURL;
      } else {
        delete globalAny.URL;
      }
      windowInstance.close();
    };
  });

  afterEach(() => {
    if (cleanupGlobals) {
      cleanupGlobals();
      cleanupGlobals = null;
    }
  });

  function createContainer(id?: string): HTMLElement {
    const element = windowInstance.document.createElement('div');
    if (id) {
      element.id = id;
    }
    windowInstance.document.body.appendChild(element);
    return element as unknown as HTMLElement;
  }

  function createBlob(parts: Uint8Array | Uint8Array[], type = 'application/octet-stream'): Blob {
    const blobParts = Array.isArray(parts) ? parts : [parts];
    return new windowInstance.Blob(blobParts, { type }) as unknown as Blob;
  }

  async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function waitForCondition(
    condition: () => boolean,
    message: string,
    timeoutMs = 2000
  ): Promise<void> {
    const start = Date.now();
    while (true) {
      if (condition()) {
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        assert.fail(message);
      }
      await flushMicrotasks();
    }
  }

  it('detects core from metadata and filename', () => {
    assert.strictEqual(detectEmulatorCore(undefined, { platform: 'Super Nintendo' }), 'snes');
    assert.strictEqual(detectEmulatorCore('game.gba'), 'gba');
    assert.strictEqual(detectEmulatorCore('unknown.xyz'), 'nes');
  });

  it('configures emulator globals and appends loader script', async () => {
    const container = createContainer('emulator-target');

    const romData = new Uint8Array([0, 1, 2, 3]);
    const blob = createBlob(romData);

    const instance = await startRomPlayer({
      target: container,
      file: blob,
      filename: 'test.nes',
      metadata: { title: 'Test Game', platform: 'NES' },
      loaderUrl: 'data:text/javascript,',
      dataPath: '/data/',
      autoLoadLoaderScript: false,
    });

    const globalAny = globalThis as any;
    assert.strictEqual(globalAny.EJS_player, '#emulator-target');
    assert.strictEqual(globalAny.EJS_core, 'nes');
    assert.strictEqual(globalAny.EJS_gameName, 'Test Game');
    assert.strictEqual(globalAny.EJS_pathtodata, '/data/');
    assert.ok(globalAny.EJS_gameUrl.startsWith('blob:'), 'game URL should be an object URL');

    const scripts = windowInstance.document.querySelectorAll('script');
    assert.strictEqual(scripts.length, 0, 'loader script should not be appended when disabled');

    await instance.destroy();

    assert.strictEqual(globalAny.EJS_player, null);
    assert.strictEqual(globalAny.EJS_core, null);
    assert.strictEqual(windowInstance.document.querySelectorAll('script').length, 0);
  });

  it('uses the provided ROM blob without extraction', async () => {
    const container = createContainer();

    const romData = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
    const romBlob = createBlob(romData, 'application/zip');

    const instance = await startRomPlayer({
      target: container,
      file: romBlob,
      filename: 'folder/archive.zip',
      metadata: { title: 'Archive Game', platform: 'Game Boy Advance' },
      loaderUrl: 'data:text/javascript,',
      autoLoadLoaderScript: false,
    });

    assert.strictEqual(instance.filename, 'archive.zip');
    assert.strictEqual(instance.core, 'gba');
    await instance.destroy();
  });

  it('cleans up previous player when starting a new one', async () => {
    const container = createContainer();

    const blobA = createBlob(new Uint8Array([1, 2, 3]));
    const blobB = createBlob(new Uint8Array([4, 5, 6]));

    const first = await startRomPlayer({
      target: container,
      file: blobA,
      filename: 'first.nes',
      metadata: { title: 'First Game' },
      loaderUrl: 'data:text/javascript,',
      autoLoadLoaderScript: false,
    });

    const firstUrl = first.gameUrl;
    const second = await startRomPlayer({
      target: container,
      file: blobB,
      filename: 'second.nes',
      metadata: { title: 'Second Game' },
      loaderUrl: 'data:text/javascript,',
      autoLoadLoaderScript: false,
    });

    const globalAny = globalThis as any;
    assert.notStrictEqual(globalAny.EJS_gameUrl, firstUrl, 'game URL should update for new player');

    // Destroying the second instance should clean up globals
    await second.destroy();
    assert.strictEqual(globalAny.EJS_player, null);
  });

  it('appends the loader script when enabled', async () => {
    const container = createContainer();
    const romData = new Uint8Array([7, 8, 9]);
    const blob = createBlob(romData);

    const originalAppendChild = windowInstance.document.body.appendChild.bind(windowInstance.document.body);
    let appendedScript: any = null;

    windowInstance.document.body.appendChild = function (node: any) {
      if (node.tagName && node.tagName.toLowerCase() === 'script') {
        appendedScript = node;
        return node;
      }
      return originalAppendChild(node);
    } as any;

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'script-test.nes',
        metadata: { title: 'Script Test' },
        loaderUrl: 'data:text/javascript,',
      });

      assert.ok(appendedScript, 'script element should be created');
      assert.strictEqual(appendedScript.getAttribute('src'), 'data:text/javascript,');
    } finally {
      if (instance) {
        await instance.destroy();
      }
      windowInstance.document.body.appendChild = originalAppendChild as any;
    }
  });

  it('restores and persists emulator saves using IndexedDB', async () => {
    const { indexedDB, getStore } = createFakeIndexedDB();
    const savesStore = getStore('saves');

    const romId = 'HASHEOUS1234';
    const persistId = 'SHA1-FAKE-HASH';
    const existingSave = new Uint8Array([1, 2, 3, 4]);
    savesStore.set(persistId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;
    const priorReady = globalAny.EJS_ready;

    let readyCallbackCount = 0;
    const previousReady = () => {
      readyCallbackCount += 1;
    };

    globalAny.indexedDB = indexedDB;
    globalAny.EJS_ready = previousReady;

    const loadStateCalls: Uint8Array[] = [];
    let getStateCalls = 0;
    const callEventHistory: string[] = [];

    let stateBytes = new Uint8Array([9, 8, 7]);
    let stateToReturn: Uint8Array | { state: Uint8Array } = { state: stateBytes };

    const emulator = {
      callEvent(event: string) {
        callEventHistory.push(event);
      },
      gameManager: {
        getState: () => {
          getStateCalls += 1;
          return stateToReturn;
        },
        loadState: (state: Uint8Array) => {
          const copy = new Uint8Array(state);
          loadStateCalls.push(copy);
        },
      },
    } as any;

    globalAny.EJS_emulator = emulator;

    const container = document.createElement('div');
    document.body.appendChild(container);

    const blob = new Blob(['fake rom'], { type: 'application/octet-stream' });

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'indexeddb-test.nes',
        metadata: { title: 'IndexedDB Test', id: romId, persistId, alternateIds: ['legacy-id'] },
        loaderUrl: 'data:text/javascript,',
        autoLoadLoaderScript: false,
      });

      const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
      assert.ok(typeof readyWrapper === 'function');
      assert.notStrictEqual(readyWrapper, previousReady, 'ready handler should be wrapped to manage persistence');

      readyWrapper!();
      await waitForCondition(() => loadStateCalls.length >= 1, 'startup should restore persisted save');

      assert.strictEqual(readyCallbackCount, 1, 'previous ready handler should be invoked');
      assert.deepStrictEqual(Array.from(loadStateCalls[0]), Array.from(existingSave));

      stateBytes = new Uint8Array([4, 5, 6, 7]);
      stateToReturn = { state: stateBytes };
      const manualSaveResult = await instance.persistSave();
      assert.strictEqual(manualSaveResult, true, 'persistSave should report success when data is captured');
      assert.strictEqual(getStateCalls, 1, 'manual save should call gameManager.getState exactly once');
      await waitForCondition(() => {
        const primary = savesStore.get(persistId) as FakeSaveRecord | undefined;
        const secondary = savesStore.get(romId) as FakeSaveRecord | undefined;
        return Boolean(primary && 'saves' in primary && primary.saves.length === 1 && secondary && 'saves' in secondary && secondary.saves.length === 1);
      }, 'Manual save should persist data to IndexedDB');
      const postManualPrimary = savesStore.get(persistId) as FakeSaveRecord | undefined;
      const postManualSecondary = savesStore.get(romId) as FakeSaveRecord | undefined;
      assert.ok(postManualPrimary, 'Manual save should write to IndexedDB using persistId');
      assert.ok(postManualSecondary, 'Manual save should mirror data under ROM id');
      // Check new multi-save format
      assert.ok('saves' in postManualPrimary!, 'Should use new multi-save format');
      assert.ok('saves' in postManualSecondary!, 'Should use new multi-save format');
      assert.strictEqual(postManualPrimary!.saves.length, 1, 'Should have one save state');
      assert.deepStrictEqual(Array.from(new Uint8Array(postManualPrimary!.saves[0].data)), Array.from(stateBytes));
      assert.deepStrictEqual(Array.from(new Uint8Array(postManualSecondary!.saves[0].data)), Array.from(stateBytes));

      const manualLoadData = new Uint8Array([11, 12, 13, 14]);
      // Ensure the manual load payload sorts newer than any previously persisted entries.
      // The persistence layer picks the most recent timestamp, so using a future timestamp
      // avoids flakes when the manual save and load happen within the same millisecond.
      const manualLoadTimestamp = Date.now() + 1000;
      savesStore.set(persistId, { data: manualLoadData.buffer.slice(0), updatedAt: manualLoadTimestamp });
      savesStore.set(romId, { data: manualLoadData.buffer.slice(0), updatedAt: manualLoadTimestamp });
      // Flush microtasks to ensure IndexedDB operations from manual save are fully settled
      await flushMicrotasks();
      const manualLoadResult = await instance.loadLatestSave();
      assert.strictEqual(manualLoadResult, true, 'loadLatestSave should restore when data exists');
      await waitForCondition(() => loadStateCalls.length >= 2, 'manual load should call gameManager.loadState');
      assert.deepStrictEqual(Array.from(loadStateCalls[1]), Array.from(manualLoadData));

      stateBytes = new Uint8Array([21, 22, 23]);
      stateToReturn = { state: stateBytes };
      await instance.destroy();
      await waitForCondition(() => getStateCalls >= 2, 'destroy should persist the latest state');
      assert.strictEqual(getStateCalls, 2, 'destroy should persist the latest state');
      await waitForCondition(() => {
        const primary = savesStore.get(persistId) as FakeSaveRecord | undefined;
        const secondary = savesStore.get(romId) as FakeSaveRecord | undefined;
        return Boolean(primary && 'saves' in primary && primary.saves.length === 1 && secondary && 'saves' in secondary && secondary.saves.length === 1);
      }, 'Destroy should update the persisted save entries');
      const finalPrimary = savesStore.get(persistId) as FakeSaveRecord | undefined;
      const finalSecondary = savesStore.get(romId) as FakeSaveRecord | undefined;
      assert.ok(finalPrimary, 'Destroy should update the persisted save primary key');
      assert.ok(finalSecondary, 'Destroy should update the persisted save secondary key');
      // Check new multi-save format
      assert.ok('saves' in finalPrimary!, 'Should use new multi-save format');
      assert.ok('saves' in finalSecondary!, 'Should use new multi-save format');
      assert.deepStrictEqual(Array.from(new Uint8Array(finalPrimary!.saves[0].data)), Array.from(stateBytes));
      assert.deepStrictEqual(Array.from(new Uint8Array(finalSecondary!.saves[0].data)), Array.from(stateBytes));
      assert.ok(!callEventHistory.includes('load'), 'load events should not be triggered when loadState succeeds');

      const readyAfterDestroy = globalAny.EJS_ready;
      assert.strictEqual(readyAfterDestroy, previousReady, 'destroy should restore previous ready handler');
    } finally {
      if (instance) {
        try {
          await instance.destroy();
        } catch {
          // ignore errors from double destruction
        }
      }

      container.remove();

      if (priorIndexedDB === undefined) {
        delete globalAny.indexedDB;
      } else {
        globalAny.indexedDB = priorIndexedDB;
      }

      if (priorEmulator === undefined) {
        delete globalAny.EJS_emulator;
      } else {
        globalAny.EJS_emulator = priorEmulator;
      }

      if (priorReady === undefined) {
        delete globalAny.EJS_ready;
      } else {
        globalAny.EJS_ready = priorReady;
      }
    }
  });
});


type FakeSaveRecord = {
  saves: Array<{ data: ArrayBuffer; updatedAt: number; crc32: string }>;
} | {
  // Legacy format for backward compatibility testing
  data: ArrayBuffer;
  updatedAt: number;
};

function createFakeIndexedDB() {
  const stores = new Map<string, Map<string, FakeSaveRecord>>();
  const storeNames = new Set<string>();

  const ensureStore = (name: string) => {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    storeNames.add(name);
    return stores.get(name)!;
  };

  const createRequest = (executor: (request: any) => void) => {
    const request: any = {
      onsuccess: null,
      onerror: null,
      result: undefined,
    };

    queueMicrotask(() => {
      try {
        executor(request);
      } catch (error) {
        if (typeof request.onerror === 'function') {
          request.onerror.call(request, error);
        }
      }
    });

    return request;
  };

  const createStoreInterface = (store: Map<string, FakeSaveRecord>) => ({
    put(value: FakeSaveRecord, key: string) {
      return createRequest((request) => {
        store.set(key, value);
        if (typeof request.onsuccess === 'function') {
          request.onsuccess.call(request);
        }
      });
    },
    delete(key: string) {
      return createRequest((request) => {
        store.delete(key);
        if (typeof request.onsuccess === 'function') {
          request.onsuccess.call(request);
        }
      });
    },
    get(key: string) {
      return createRequest((request) => {
        request.result = store.get(key);
        if (typeof request.onsuccess === 'function') {
          request.onsuccess.call(request);
        }
      });
    },
  });

  const database: any = {
    objectStoreNames: {
      contains(name: string) {
        return storeNames.has(name);
      },
    },
    createObjectStore(name: string) {
      return createStoreInterface(ensureStore(name));
    },
    transaction(name: string) {
      return {
        objectStore() {
          return createStoreInterface(ensureStore(name));
        },
        onerror: null,
      };
    },
    close() {
      // noop for tests
    },
  };

  const factory = {
    open(_name: string, _version?: number) {
      const request: any = {
        result: database,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };

      queueMicrotask(() => {
        request.onupgradeneeded?.call(request);
        request.onsuccess?.call(request);
      });

      return request;
    },
  };

  return {
    indexedDB: factory as unknown as IDBFactory,
    getStore(name: string) {
      return ensureStore(name) as Map<string, FakeSaveRecord>;
    },
  };
}
