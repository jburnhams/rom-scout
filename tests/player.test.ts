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
    const existingSave = new Uint8Array([1, 2, 3, 4]);
    savesStore.set(romId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;
    const priorReady = globalAny.EJS_ready;
    const priorSaveUpdate = globalAny.EJS_onSaveUpdate;

    let readyCallbackCount = 0;
    const previousReady = () => {
      readyCallbackCount += 1;
    };

    let saveUpdateCallbackCount = 0;
    const previousSaveUpdate = () => {
      saveUpdateCallbackCount += 1;
    };

    globalAny.indexedDB = indexedDB;
    globalAny.EJS_ready = previousReady;
    globalAny.EJS_onSaveUpdate = previousSaveUpdate;

    const eventHandlers = new Map<string, Array<(payload?: unknown) => void>>();

    const emit = (event: string, payload?: unknown) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        for (const handler of handlers) {
          handler(payload);
        }
      }
    };

    const files = new Map<string, Uint8Array>();
    const directories = new Set<string>(['/']);
    const filesystem = {
      analyzePath(path: string) {
        return { exists: directories.has(path) || files.has(path) };
      },
      mkdir(path: string) {
        directories.add(path);
      },
      writeFile(path: string, data: Uint8Array) {
        const copy = new Uint8Array(data);
        files.set(path, copy);
        directories.add(path);
      },
      unlink(path: string) {
        files.delete(path);
      },
      readFile(path: string) {
        const existing = files.get(path);
        if (!existing) {
          throw new Error(`File not found: ${path}`);
        }
        return new Uint8Array(existing);
      },
    } as const;

    let loadSaveFilesCount = 0;
    let loadEventCount = 0;
    let manualSaveEventCount = 0;
    let manualSavePayload = new Uint8Array([9, 8, 7]);

    const emulator = {
      on(event: string, handler: (payload?: unknown) => void) {
        const handlers = eventHandlers.get(event) ?? [];
        handlers.push(handler);
        eventHandlers.set(event, handlers);
      },
      callEvent(event: string) {
        if (event === 'save') {
          manualSaveEventCount += 1;
          emit('saveSave', manualSavePayload);
        } else if (event === 'load') {
          loadEventCount += 1;
        }
      },
      gameManager: {
        FS: filesystem,
        getSaveFilePath: () => '/saves/test.sav',
        loadSaveFiles: () => {
          loadSaveFilesCount += 1;
        },
      },
    };

    globalAny.EJS_emulator = emulator;

    const container = createContainer('persist-target');
    const romBlob = createBlob(new Uint8Array([0, 1, 2]));

    const instance = await startRomPlayer({
      target: container,
      file: romBlob,
      filename: 'persistent.nes',
      metadata: { id: romId, title: 'Persistent Game', platform: 'NES' },
      loaderUrl: 'data:text/javascript,',
      autoLoadLoaderScript: false,
    });

    const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
    const saveUpdateWrapper = globalAny.EJS_onSaveUpdate as ((payload: unknown) => void) | undefined;
    assert.ok(typeof readyWrapper === 'function');
    assert.ok(typeof saveUpdateWrapper === 'function');

    const invokeReady = readyWrapper as () => void;
    const invokeSaveUpdate = saveUpdateWrapper as (payload: unknown) => void;

    invokeReady();
    await flushMicrotasks();
    assert.strictEqual(readyCallbackCount, 1);

    const databaseHandlers = eventHandlers.get('saveDatabaseLoaded');
    assert.ok(databaseHandlers && databaseHandlers.length > 0, 'saveDatabaseLoaded handler should be registered');
    databaseHandlers[0]();
    await flushMicrotasks();

    // After saveDatabaseLoaded, save should be read but not yet written to filesystem
    let savedBuffer = files.get('/saves/test.sav');
    assert.ok(!savedBuffer, 'save should not be written to filesystem yet (before start event)');

    const startHandlers = eventHandlers.get('start');
    assert.ok(startHandlers && startHandlers.length > 0, 'start handler should be registered');
    startHandlers[0]();
    await flushMicrotasks();

    // After start event, save should be written to filesystem and loaded into game
    savedBuffer = files.get('/saves/test.sav');
    assert.ok(savedBuffer, 'persisted save data should be written to the filesystem after start event');
    assert.deepStrictEqual(Array.from(savedBuffer!), Array.from(existingSave));
    assert.strictEqual(loadSaveFilesCount, 1, 'loadSaveFiles should be invoked after startup');
    assert.strictEqual(loadEventCount, 1, 'load event should trigger after startup restore');

    const saveHandlers = eventHandlers.get('saveSave');
    assert.ok(saveHandlers && saveHandlers.length > 0, 'save handler should be registered');
    const newSave = new Uint8Array([9, 8, 7]);
    saveHandlers[0](newSave);
    await flushMicrotasks();

    const firstRecord = savesStore.get(romId) as FakeSaveRecord | undefined;
    assert.ok(firstRecord, 'IndexedDB should receive save data from emulator events');
    assert.deepStrictEqual(Array.from(new Uint8Array(firstRecord.data)), Array.from(newSave));

    const alternateSave = new Uint8Array([5, 4, 3, 2]);
    invokeSaveUpdate(alternateSave);
    await flushMicrotasks();

    const updatedRecord = savesStore.get(romId) as FakeSaveRecord | undefined;
    assert.ok(updatedRecord, 'IndexedDB should be updated when save callbacks fire');
    assert.deepStrictEqual(Array.from(new Uint8Array(updatedRecord.data)), Array.from(alternateSave));
    assert.strictEqual(saveUpdateCallbackCount, 1, 'previous save update handler should be invoked');

    manualSavePayload = new Uint8Array([4, 5, 6, 7]);
    const manualSaveResult = await instance.persistSave();
    assert.strictEqual(manualSaveResult, true, 'persistSave should report success when data is captured');
    await flushMicrotasks();
    const postManualRecord = savesStore.get(romId) as FakeSaveRecord | undefined;
    assert.ok(postManualRecord, 'Manual save should write to IndexedDB');
    assert.deepStrictEqual(Array.from(new Uint8Array(postManualRecord.data)), Array.from(manualSavePayload));
    assert.strictEqual(manualSaveEventCount, 1, 'persistSave should trigger emulator save event');

    const manualLoadData = new Uint8Array([11, 12, 13, 14]);
    savesStore.set(romId, { data: manualLoadData.buffer.slice(0), updatedAt: Date.now() });
    files.delete('/saves/test.sav');
    const manualLoadResult = await instance.loadLatestSave();
    assert.strictEqual(manualLoadResult, true, 'loadLatestSave should restore when data exists');
    await flushMicrotasks();
    const restoredManualBuffer = files.get('/saves/test.sav');
    assert.ok(restoredManualBuffer, 'Manual load should write save data to filesystem');
    assert.deepStrictEqual(Array.from(restoredManualBuffer!), Array.from(manualLoadData));
    assert.strictEqual(loadSaveFilesCount, 2, 'loadSaveFiles should be invoked during manual load');
    assert.strictEqual(loadEventCount, 2, 'manual load should trigger emulator load event');

    await instance.destroy();
    await flushMicrotasks();

    const readyAfterDestroy = globalAny.EJS_ready;
    const saveAfterDestroy = globalAny.EJS_onSaveUpdate;

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

    if (priorSaveUpdate === undefined) {
      delete globalAny.EJS_onSaveUpdate;
    } else {
      globalAny.EJS_onSaveUpdate = priorSaveUpdate;
    }

    assert.strictEqual(readyAfterDestroy, previousReady, 'destroy should restore previous ready handler');
    assert.strictEqual(saveAfterDestroy, previousSaveUpdate, 'destroy should restore previous save update handler');
  });
});

type FakeSaveRecord = { data: ArrayBuffer; updatedAt: number };

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
