import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateHash, calculateSingleHash } from './hash.js';

describe('Hash utilities', () => {
  describe('calculateHash', () => {
    it('should calculate MD5 hash correctly', async () => {
      const data = new TextEncoder().encode('Hello, World!');
      const result = await calculateHash(data, ['md5']);

      assert.ok(result.md5, 'MD5 hash should be calculated');
      assert.strictEqual(result.md5, '65a8e27d8879283831b664bd8b7f0ad4');
    });

    it('should calculate SHA-1 hash correctly', async () => {
      const data = new TextEncoder().encode('Hello, World!');
      const result = await calculateHash(data, ['sha1']);

      assert.ok(result.sha1, 'SHA-1 hash should be calculated');
      assert.strictEqual(result.sha1, '0a0a9f2a6772942557ab5355d76af442f8f65e01');
    });

    it('should calculate CRC32 hash correctly', async () => {
      const data = new TextEncoder().encode('Hello, World!');
      const result = await calculateHash(data, ['crc32']);

      assert.ok(result.crc32, 'CRC32 hash should be calculated');
      assert.strictEqual(result.crc32, 'ec4ac3d0');
    });

    it('should calculate all hashes by default', async () => {
      const data = new TextEncoder().encode('Test data');
      const result = await calculateHash(data);

      assert.ok(result.md5, 'MD5 hash should be calculated');
      assert.ok(result.sha1, 'SHA-1 hash should be calculated');
      assert.ok(result.crc32, 'CRC32 hash should be calculated');
    });

    it('should handle empty data', async () => {
      const data = new Uint8Array(0);
      const result = await calculateHash(data);

      assert.ok(result.md5, 'Should calculate MD5 for empty data');
      assert.ok(result.sha1, 'Should calculate SHA-1 for empty data');
      assert.ok(result.crc32, 'Should calculate CRC32 for empty data');

      // Known hash values for empty data
      assert.strictEqual(result.md5, 'd41d8cd98f00b204e9800998ecf8427e');
      assert.strictEqual(result.sha1, 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
      assert.strictEqual(result.crc32, '00000000');
    });

    it('should handle ArrayBuffer input', async () => {
      const text = 'Test with ArrayBuffer';
      const buffer = new TextEncoder().encode(text).buffer;
      const result = await calculateHash(buffer);

      assert.ok(result.md5, 'Should calculate MD5 from ArrayBuffer');
      assert.ok(result.sha1, 'Should calculate SHA-1 from ArrayBuffer');
      assert.ok(result.crc32, 'Should calculate CRC32 from ArrayBuffer');
    });

    it('should handle Buffer input in Node.js', async () => {
      const buffer = Buffer.from('Test with Buffer');
      const result = await calculateHash(buffer);

      assert.ok(result.md5, 'Should calculate MD5 from Buffer');
      assert.ok(result.sha1, 'Should calculate SHA-1 from Buffer');
      assert.ok(result.crc32, 'Should calculate CRC32 from Buffer');
    });

    it('should calculate consistent hashes for same data', async () => {
      const data = new TextEncoder().encode('Consistency test');

      const result1 = await calculateHash(data);
      const result2 = await calculateHash(data);

      assert.strictEqual(result1.md5, result2.md5, 'MD5 should be consistent');
      assert.strictEqual(result1.sha1, result2.sha1, 'SHA-1 should be consistent');
      assert.strictEqual(result1.crc32, result2.crc32, 'CRC32 should be consistent');
    });

    it('should calculate different hashes for different data', async () => {
      const data1 = new TextEncoder().encode('Data one');
      const data2 = new TextEncoder().encode('Data two');

      const result1 = await calculateHash(data1);
      const result2 = await calculateHash(data2);

      assert.notStrictEqual(result1.md5, result2.md5, 'MD5 should differ');
      assert.notStrictEqual(result1.sha1, result2.sha1, 'SHA-1 should differ');
      assert.notStrictEqual(result1.crc32, result2.crc32, 'CRC32 should differ');
    });

    it('should handle large data', async () => {
      // Create 1MB of data
      const data = new Uint8Array(1024 * 1024);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      const result = await calculateHash(data);

      assert.ok(result.md5, 'Should calculate MD5 for large data');
      assert.ok(result.sha1, 'Should calculate SHA-1 for large data');
      assert.ok(result.crc32, 'Should calculate CRC32 for large data');

      // Verify hash format
      assert.match(result.md5, /^[a-f0-9]{32}$/, 'MD5 should be 32 hex chars');
      assert.match(result.sha1, /^[a-f0-9]{40}$/, 'SHA-1 should be 40 hex chars');
      assert.match(result.crc32, /^[a-f0-9]{8}$/, 'CRC32 should be 8 hex chars');
    });

    it('should only calculate requested hash types', async () => {
      const data = new TextEncoder().encode('Selective hashing');

      const mdOnly = await calculateHash(data, ['md5']);
      assert.ok(mdOnly.md5, 'MD5 should be present');
      assert.strictEqual(mdOnly.sha1, undefined, 'SHA-1 should not be present');
      assert.strictEqual(mdOnly.crc32, undefined, 'CRC32 should not be present');

      const shaOnly = await calculateHash(data, ['sha1']);
      assert.strictEqual(shaOnly.md5, undefined, 'MD5 should not be present');
      assert.ok(shaOnly.sha1, 'SHA-1 should be present');
      assert.strictEqual(shaOnly.crc32, undefined, 'CRC32 should not be present');

      const crcOnly = await calculateHash(data, ['crc32']);
      assert.strictEqual(crcOnly.md5, undefined, 'MD5 should not be present');
      assert.strictEqual(crcOnly.sha1, undefined, 'SHA-1 should not be present');
      assert.ok(crcOnly.crc32, 'CRC32 should be present');
    });
  });

  describe('calculateSingleHash', () => {
    it('should calculate MD5 hash', async () => {
      const data = new TextEncoder().encode('Single hash test');
      const hash = await calculateSingleHash(data, 'md5');

      assert.ok(hash, 'Hash should be returned');
      assert.match(hash, /^[a-f0-9]{32}$/, 'Should be valid MD5 format');
    });

    it('should calculate SHA-1 hash', async () => {
      const data = new TextEncoder().encode('Single hash test');
      const hash = await calculateSingleHash(data, 'sha1');

      assert.ok(hash, 'Hash should be returned');
      assert.match(hash, /^[a-f0-9]{40}$/, 'Should be valid SHA-1 format');
    });

    it('should calculate CRC32 hash', async () => {
      const data = new TextEncoder().encode('Single hash test');
      const hash = await calculateSingleHash(data, 'crc32');

      assert.ok(hash, 'Hash should be returned');
      assert.match(hash, /^[a-f0-9]{8}$/, 'Should be valid CRC32 format');
    });

    it('should return same result as calculateHash', async () => {
      const data = new TextEncoder().encode('Comparison test');

      const singleMd5 = await calculateSingleHash(data, 'md5');
      const multiMd5 = await calculateHash(data, ['md5']);

      assert.strictEqual(singleMd5, multiMd5.md5, 'MD5 should match');

      const singleSha1 = await calculateSingleHash(data, 'sha1');
      const multiSha1 = await calculateHash(data, ['sha1']);

      assert.strictEqual(singleSha1, multiSha1.sha1, 'SHA-1 should match');

      const singleCrc32 = await calculateSingleHash(data, 'crc32');
      const multiCrc32 = await calculateHash(data, ['crc32']);

      assert.strictEqual(singleCrc32, multiCrc32.crc32, 'CRC32 should match');
    });
  });
});
