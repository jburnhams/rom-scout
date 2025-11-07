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
    globalAny.navigator = windowInstance.navigator;
    globalAny.URL = windowInstance.URL;

    cleanupGlobals = () => {
      const keys = ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'HTMLVideoElement', 'HTMLAudioElement', 'navigator'];
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

    instance.destroy();

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
    instance.destroy();
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
    second.destroy();
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
        instance.destroy();
      }
      windowInstance.document.body.appendChild = originalAppendChild as any;
    }
  });
});
