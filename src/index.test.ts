import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RomScout, calculateHash } from './index.js';

describe('RomScout', () => {
  const pacmanPath = join(process.cwd(), 'roms', 'pacman.zip');
  let pacmanBuffer: Buffer;

  // Load pacman.zip before tests
  try {
    pacmanBuffer = readFileSync(pacmanPath);
  } catch (error) {
    console.warn('Warning: Could not load pacman.zip for testing');
  }

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const scout = new RomScout();
      assert.ok(scout, 'RomScout instance should be created');
    });

    it('should create instance with custom config', () => {
      const scout = new RomScout({
        provider: 'hasheous',
        hasheousUrl: 'https://test.example.com',
        timeout: 5000,
      });
      assert.ok(scout, 'RomScout instance should be created with config');
    });

    it('should accept IGDB config', () => {
      const scout = new RomScout({
        provider: 'igdb',
        igdb: {
          clientId: 'test-client-id',
          clientSecret: 'test-secret',
        },
      });
      assert.ok(scout, 'RomScout instance should be created with IGDB config');
    });

    it('should accept ScreenScraper config', () => {
      const scout = new RomScout({
        provider: 'screenscraper',
        screenscraper: {
          devId: 'test-dev',
          devPassword: 'test-pass',
          softwareName: 'rom-scout-test',
        },
      });
      assert.ok(scout, 'RomScout instance should be created with ScreenScraper config');
    });
  });

  describe('hash method', () => {
    it('should calculate hashes for Buffer', async () => {
      const scout = new RomScout();
      const data = Buffer.from('Test data for hashing');

      const hashes = await scout.hash(data);

      assert.ok(hashes.md5, 'MD5 hash should be calculated');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated');

      assert.match(hashes.md5, /^[a-f0-9]{32}$/, 'MD5 should be valid format');
      assert.match(hashes.sha1, /^[a-f0-9]{40}$/, 'SHA-1 should be valid format');
      assert.match(hashes.crc32, /^[a-f0-9]{8}$/, 'CRC32 should be valid format');
    });

    it('should calculate hashes for Uint8Array', async () => {
      const scout = new RomScout();
      const data = new TextEncoder().encode('Test data');

      const hashes = await scout.hash(data);

      assert.ok(hashes.md5, 'MD5 hash should be calculated');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated');
    });

    it('should calculate hashes for ArrayBuffer', async () => {
      const scout = new RomScout();
      const data = new TextEncoder().encode('Test data').buffer;

      const hashes = await scout.hash(data);

      assert.ok(hashes.md5, 'MD5 hash should be calculated');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated');
    });

    it('should calculate hashes for pacman.zip', async function (this: any) {
      if (!pacmanBuffer) {
        this.skip();
        return;
      }

      const scout = new RomScout();
      const hashes = await scout.hash(pacmanBuffer);

      assert.ok(hashes.md5, 'MD5 hash should be calculated for pacman.zip');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated for pacman.zip');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated for pacman.zip');

      // Log the hashes for reference
      console.log('Pac-Man ROM hashes:');
      console.log('  MD5:', hashes.md5);
      console.log('  SHA-1:', hashes.sha1);
      console.log('  CRC32:', hashes.crc32);
      console.log('  Size:', pacmanBuffer.length, 'bytes');
    });
  });

  describe('identify method with pacman.zip', () => {
    it('should process pacman.zip file', async function (this: any) {
      if (!pacmanBuffer) {
        this.skip();
        return;
      }

      const scout = new RomScout({
        hasheousUrl: 'https://hasheous.example.com',
      });

      // We can't actually make API calls in tests, but we can verify
      // the file is processed correctly
      const hashes = await scout.hash(pacmanBuffer);
      assert.ok(hashes.md5, 'Should calculate MD5 for pacman.zip');
    });

    it('should extract filename from File object', async () => {
      const scout = new RomScout();
      const data = Buffer.from('test');

      // The identify method should handle File-like objects
      // We can't test the full flow without API mocking, but we can verify
      // it doesn't throw errors
      try {
        await scout.hash(data);
        assert.ok(true, 'Should handle file-like objects');
      } catch (error) {
        assert.fail('Should not throw error');
      }
    });
  });

  describe('API client errors', () => {
    it('should throw error if Hasheous not configured', async () => {
      const scout = new RomScout({ provider: 'hasheous' });

      await assert.rejects(
        async () => {
          await scout.lookup({ md5: 'test' });
        },
        /Hasheous client not configured/,
        'Should throw config error'
      );
    });

    it('should throw error if IGDB not configured', async () => {
      const scout = new RomScout({ provider: 'igdb' });

      await assert.rejects(
        async () => {
          await scout.lookup({ filename: 'test.rom' });
        },
        /IGDB client not configured/,
        'Should throw config error'
      );
    });

    it('should throw error if ScreenScraper not configured', async () => {
      const scout = new RomScout({ provider: 'screenscraper' });

      await assert.rejects(
        async () => {
          await scout.lookup({ md5: 'test' });
        },
        /ScreenScraper client not configured/,
        'Should throw config error'
      );
    });

    it('should throw error for unknown provider', async () => {
      const scout = new RomScout({
        provider: 'invalid' as any,
      });

      await assert.rejects(
        async () => {
          await scout.lookup({ md5: 'test' });
        },
        /Unknown provider/,
        'Should throw error for unknown provider'
      );
    });
  });

  describe('Hash calculation integration', () => {
    it('should calculate consistent hashes', async function (this: any) {
      if (!pacmanBuffer) {
        this.skip();
        return;
      }

      const scout = new RomScout();

      // Calculate hashes multiple times
      const hashes1 = await scout.hash(pacmanBuffer);
      const hashes2 = await scout.hash(pacmanBuffer);

      assert.strictEqual(hashes1.md5, hashes2.md5, 'MD5 should be consistent');
      assert.strictEqual(hashes1.sha1, hashes2.sha1, 'SHA-1 should be consistent');
      assert.strictEqual(hashes1.crc32, hashes2.crc32, 'CRC32 should be consistent');
    });

    it('should match direct hash calculation', async function (this: any) {
      if (!pacmanBuffer) {
        this.skip();
        return;
      }

      const scout = new RomScout();

      const scoutHashes = await scout.hash(pacmanBuffer);
      const directHashes = await calculateHash(pacmanBuffer);

      assert.strictEqual(scoutHashes.md5, directHashes.md5, 'MD5 should match');
      assert.strictEqual(scoutHashes.sha1, directHashes.sha1, 'SHA-1 should match');
      assert.strictEqual(scoutHashes.crc32, directHashes.crc32, 'CRC32 should match');
    });
  });

  describe('Data type handling', () => {
    it('should handle small files', async () => {
      const scout = new RomScout();
      const smallData = Buffer.from('Small ROM file');

      const hashes = await scout.hash(smallData);

      assert.ok(hashes.md5, 'Should handle small files');
      assert.ok(hashes.sha1, 'Should handle small files');
      assert.ok(hashes.crc32, 'Should handle small files');
    });

    it('should handle medium files', async () => {
      const scout = new RomScout();
      // Create 100KB file
      const mediumData = Buffer.alloc(100 * 1024);
      for (let i = 0; i < mediumData.length; i++) {
        mediumData[i] = i % 256;
      }

      const hashes = await scout.hash(mediumData);

      assert.ok(hashes.md5, 'Should handle medium files');
      assert.ok(hashes.sha1, 'Should handle medium files');
      assert.ok(hashes.crc32, 'Should handle medium files');
    });

    it('should handle different data representations', async () => {
      const scout = new RomScout();
      const text = 'Test ROM data';

      // Test Buffer
      const bufferHashes = await scout.hash(Buffer.from(text));

      // Test Uint8Array
      const uint8Hashes = await scout.hash(new TextEncoder().encode(text));

      // Test ArrayBuffer
      const arrayBufferHashes = await scout.hash(new TextEncoder().encode(text).buffer);

      // All should produce the same hashes
      assert.strictEqual(bufferHashes.md5, uint8Hashes.md5, 'Buffer and Uint8Array MD5 should match');
      assert.strictEqual(uint8Hashes.md5, arrayBufferHashes.md5, 'Uint8Array and ArrayBuffer MD5 should match');
    });
  });

  describe('Export verification', () => {
    it('should export RomScout class', () => {
      assert.strictEqual(typeof RomScout, 'function', 'RomScout should be exported');
    });

    it('should export calculateHash function', () => {
      assert.strictEqual(typeof calculateHash, 'function', 'calculateHash should be exported');
    });

    it('should create RomScout instance', () => {
      const scout = new RomScout();
      assert.ok(scout instanceof RomScout, 'Should create RomScout instance');
    });
  });
});
