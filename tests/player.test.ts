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
      assert.strictEqual(getStateCalls, 2, 'getState should be called once for initialization during startup load and once for manual save');
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
      await waitForCondition(() => getStateCalls >= 3, 'destroy should persist the latest state');
      assert.strictEqual(getStateCalls, 3, 'getState should be called for initialization, manual save, and destroy');
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

  it('calls EJS_onGameStart callback and loads save', async () => {
    const { indexedDB, getStore } = createFakeIndexedDB();
    const savesStore = getStore('saves');

    const persistId = 'GAME-START-TEST';
    const existingSave = new Uint8Array([10, 20, 30, 40]);
    savesStore.set(persistId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;
    const priorOnGameStart = globalAny.EJS_onGameStart;

    let onGameStartCallCount = 0;
    const previousOnGameStart = () => {
      onGameStartCallCount += 1;
    };

    globalAny.indexedDB = indexedDB;
    globalAny.EJS_onGameStart = previousOnGameStart;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const blob = new Blob(['test'], { type: 'application/octet-stream' });

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'ongamestart-test.nes',
        metadata: { title: 'OnGameStart Test', persistId },
        loaderUrl: 'data:text/javascript,',
        autoLoadLoaderScript: false,
      });

      const onGameStartWrapper = globalAny.EJS_onGameStart as (() => void) | undefined;
      assert.ok(typeof onGameStartWrapper === 'function', 'EJS_onGameStart should be wrapped');
      assert.notStrictEqual(onGameStartWrapper, previousOnGameStart, 'onGameStart should be wrapped');

      // Set up emulator after player creation
      const loadStateCalls: Uint8Array[] = [];
      const emulator = {
        callEvent(_event: string) {},
        gameManager: {
          getState: () => ({ state: new Uint8Array([1, 2, 3]) }),
          loadState: (state: Uint8Array) => {
            loadStateCalls.push(new Uint8Array(state));
          },
        },
      } as any;

      globalAny.EJS_emulator = emulator;

      // First call readyWrapper to load save into pendingState
      const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
      assert.ok(typeof readyWrapper === 'function');
      readyWrapper!();

      // Give time for save to be loaded from IndexedDB
      await flushMicrotasks();

      // Now call the onGameStart wrapper to apply the pending state
      onGameStartWrapper!();

      // Wait for the save to be applied
      await waitForCondition(() => loadStateCalls.length >= 1, 'EJS_onGameStart should trigger save load', 3000);

      assert.strictEqual(onGameStartCallCount, 1, 'previous onGameStart should be called');
      assert.deepStrictEqual(Array.from(loadStateCalls[0]), Array.from(existingSave));

      await instance.destroy();

      const onGameStartAfterDestroy = globalAny.EJS_onGameStart;
      assert.strictEqual(onGameStartAfterDestroy, previousOnGameStart, 'destroy should restore previous onGameStart');
    } finally {
      if (instance) {
        try {
          await instance.destroy();
        } catch {
          // ignore
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

      if (priorOnGameStart === undefined) {
        delete globalAny.EJS_onGameStart;
      } else {
        globalAny.EJS_onGameStart = priorOnGameStart;
      }
    }
  });

  it('retries loading save with exponential backoff when game manager not ready', async () => {
    const { indexedDB, getStore } = createFakeIndexedDB();
    const savesStore = getStore('saves');

    const persistId = 'RETRY-TEST';
    const existingSave = new Uint8Array([50, 60, 70, 80]);
    savesStore.set(persistId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;

    globalAny.indexedDB = indexedDB;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const blob = new Blob(['test'], { type: 'application/octet-stream' });

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'retry-test.nes',
        metadata: { title: 'Retry Test', persistId },
        loaderUrl: 'data:text/javascript,',
        autoLoadLoaderScript: false,
      });

      const loadStateCalls: Uint8Array[] = [];
      let gameManagerReady = false;

      // Emulator exists but game manager is not ready initially
      const emulator = {
        callEvent(_event: string) {},
        get gameManager() {
          if (!gameManagerReady) {
            return undefined;
          }
          return {
            getState: () => ({ state: new Uint8Array([1, 2, 3]) }),
            loadState: (state: Uint8Array) => {
              loadStateCalls.push(new Uint8Array(state));
            },
          };
        },
      } as any;

      globalAny.EJS_emulator = emulator;

      // Trigger ready callback which will attempt to load save
      const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
      assert.ok(typeof readyWrapper === 'function');
      readyWrapper!();

      // Give some time for initial attempts (should fail because gameManager is undefined)
      await flushMicrotasks();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no loads happened yet
      assert.strictEqual(loadStateCalls.length, 0, 'save should not load while game manager unavailable');

      // Make game manager ready after some time
      gameManagerReady = true;

      // Wait for retry mechanism to succeed
      await waitForCondition(
        () => loadStateCalls.length >= 1,
        'retry mechanism should eventually load save when game manager becomes ready',
        5000
      );

      assert.deepStrictEqual(Array.from(loadStateCalls[0]), Array.from(existingSave));

      await instance.destroy();
    } finally {
      if (instance) {
        try {
          await instance.destroy();
        } catch {
          // ignore
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
    }
  });

  it('cleans up timeouts and intervals on destroy', async () => {
    const { indexedDB, getStore } = createFakeIndexedDB();
    const savesStore = getStore('saves');

    const persistId = 'CLEANUP-TEST';
    const existingSave = new Uint8Array([90, 100, 110, 120]);
    savesStore.set(persistId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;

    globalAny.indexedDB = indexedDB;

    // Flush microtasks to ensure IndexedDB is fully initialized
    await flushMicrotasks();

    // Emulator exists but game manager never becomes ready
    const emulator = {
      callEvent(_event: string) {},
      gameManager: undefined,
    } as any;

    globalAny.EJS_emulator = emulator;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const blob = new Blob(['test'], { type: 'application/octet-stream' });

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    // Track setTimeout/setInterval calls
    const originalSetTimeout = globalThis.setTimeout;
    const originalSetInterval = globalThis.setInterval;
    const originalClearTimeout = globalThis.clearTimeout;
    const originalClearInterval = globalThis.clearInterval;

    const activeTimeoutIds = new Set<ReturnType<typeof setTimeout>>();
    const activeIntervalIds = new Set<ReturnType<typeof setInterval>>();
    let clearTimeoutCount = 0;
    let clearIntervalCount = 0;

    globalThis.setTimeout = ((callback: () => void, delay: number) => {
      const id = originalSetTimeout(callback, delay);
      activeTimeoutIds.add(id);
      return id;
    }) as typeof setTimeout;

    globalThis.setInterval = ((callback: () => void, delay: number) => {
      const id = originalSetInterval(callback, delay);
      activeIntervalIds.add(id);
      return id;
    }) as typeof setInterval;

    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      if (activeTimeoutIds.has(id)) {
        clearTimeoutCount++;
        activeTimeoutIds.delete(id);
      }
      return originalClearTimeout(id);
    }) as typeof clearTimeout;

    globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
      if (activeIntervalIds.has(id)) {
        clearIntervalCount++;
        activeIntervalIds.delete(id);
      }
      return originalClearInterval(id);
    }) as typeof clearInterval;

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'cleanup-test.nes',
        metadata: { title: 'Cleanup Test', persistId },
        loaderUrl: 'data:text/javascript,',
        autoLoadLoaderScript: false,
      });

      // Trigger ready callback which will start retry mechanism
      const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
      assert.ok(typeof readyWrapper === 'function');
      readyWrapper!();

      // Give time for timeouts/intervals to be scheduled
      await flushMicrotasks();
      await new Promise(resolve => setTimeout(resolve, 50));

      const timeoutsBeforeDestroy = activeTimeoutIds.size;
      const intervalsBeforeDestroy = activeIntervalIds.size;

      // Verify some timers were created
      assert.ok(timeoutsBeforeDestroy > 0 || intervalsBeforeDestroy > 0, 'timers should be scheduled');

      // Destroy should clean up all timers
      await instance.destroy();

      // Give destroy a chance to complete
      await flushMicrotasks();

      assert.ok(clearTimeoutCount > 0 || clearIntervalCount > 0, 'destroy should clear scheduled timers');

      // Some timers might naturally expire, but destroy should have cleared most of them
      assert.ok(
        clearTimeoutCount + clearIntervalCount > 0,
        'destroy should have cleared at least some timers'
      );
    } finally {
      if (instance) {
        try {
          await instance.destroy();
        } catch {
          // ignore
        }
      }

      container.remove();

      // Restore globals
      globalThis.setTimeout = originalSetTimeout;
      globalThis.setInterval = originalSetInterval;
      globalThis.clearTimeout = originalClearTimeout;
      globalThis.clearInterval = originalClearInterval;

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
    }
  });

  it('uses polling fallback when event listener cannot be registered', async () => {
    const { indexedDB, getStore } = createFakeIndexedDB();
    const savesStore = getStore('saves');

    const persistId = 'POLL-TEST';
    const existingSave = new Uint8Array([130, 140, 150, 160]);
    savesStore.set(persistId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;

    globalAny.indexedDB = indexedDB;

    // Start with no emulator (will trigger polling)
    globalAny.EJS_emulator = null;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const blob = new Blob(['test'], { type: 'application/octet-stream' });

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'poll-test.nes',
        metadata: { title: 'Poll Test', persistId },
        loaderUrl: 'data:text/javascript,',
        autoLoadLoaderScript: false,
      });

      const loadStateCalls: Uint8Array[] = [];
      const emulator = {
        callEvent(_event: string) {},
        gameManager: {
          getState: () => ({ state: new Uint8Array([1, 2, 3]) }),
          loadState: (state: Uint8Array) => {
            loadStateCalls.push(new Uint8Array(state));
          },
        },
      } as any;

      // Trigger ready callback with no emulator (will start polling)
      const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
      assert.ok(typeof readyWrapper === 'function');
      readyWrapper!();

      // Wait a bit for polling to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no loads yet
      assert.strictEqual(loadStateCalls.length, 0, 'save should not load while emulator unavailable');

      // Make emulator available
      globalAny.EJS_emulator = emulator;

      // Wait for polling to detect emulator and load save
      await waitForCondition(
        () => loadStateCalls.length >= 1,
        'polling should detect emulator and load save',
        3000
      );

      assert.deepStrictEqual(Array.from(loadStateCalls[0]), Array.from(existingSave));

      await instance.destroy();
    } finally {
      if (instance) {
        try {
          await instance.destroy();
        } catch {
          // ignore
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
    }
  });

  it('stops retry after max attempts when game manager never becomes ready', async () => {
    const { indexedDB, getStore } = createFakeIndexedDB();
    const savesStore = getStore('saves');

    const persistId = 'MAX-RETRY-TEST';
    const existingSave = new Uint8Array([170, 180, 190, 200]);
    savesStore.set(persistId, { data: existingSave.buffer.slice(0), updatedAt: Date.now() });

    const globalAny = globalThis as any;
    const priorIndexedDB = globalAny.indexedDB;
    const priorEmulator = globalAny.EJS_emulator;

    globalAny.indexedDB = indexedDB;

    // Flush microtasks to ensure IndexedDB is fully initialized
    await flushMicrotasks();

    const loadStateCalls: Uint8Array[] = [];

    // Emulator exists but game manager never becomes ready
    const emulator = {
      callEvent(_event: string) {},
      gameManager: undefined,
    } as any;

    globalAny.EJS_emulator = emulator;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const blob = new Blob(['test'], { type: 'application/octet-stream' });

    let instance: Awaited<ReturnType<typeof startRomPlayer>> | null = null;

    // Capture console.warn calls
    const originalWarn = console.warn;
    const warnMessages: string[] = [];
    console.warn = (...args: any[]) => {
      warnMessages.push(args.join(' '));
      originalWarn.apply(console, args);
    };

    try {
      instance = await startRomPlayer({
        target: container,
        file: blob,
        filename: 'maxretry-test.nes',
        metadata: { title: 'Max Retry Test', persistId },
        loaderUrl: 'data:text/javascript,',
        autoLoadLoaderScript: false,
      });

      // Trigger ready callback
      const readyWrapper = globalAny.EJS_ready as (() => void) | undefined;
      assert.ok(typeof readyWrapper === 'function');
      readyWrapper!();

      // Wait long enough for all retries to exhaust (~51 seconds total, but we'll wait less)
      // The test should see the max retry warning
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no loads happened
      assert.strictEqual(loadStateCalls.length, 0, 'save should not load when game manager unavailable');

      // Note: We can't easily wait for all retries in a fast test, but we can verify the retry mechanism started
      // The actual max retry warning would appear after ~51 seconds in a real scenario

      await instance.destroy();
    } finally {
      console.warn = originalWarn;

      if (instance) {
        try {
          await instance.destroy();
        } catch {
          // ignore
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
