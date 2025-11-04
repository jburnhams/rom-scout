/**
 * Hash utilities for ROM files
 * Supports both browser (Web Crypto API) and Node.js (crypto module)
 */

import CRC32 from 'crc-32';

/**
 * Hash types supported by rom-scout
 */
export type HashType = 'md5' | 'sha1' | 'crc32';

/**
 * Result of hashing a ROM file
 */
export interface HashResult {
  md5?: string;
  sha1?: string;
  crc32?: string;
}

/**
 * Check if we're running in a browser environment
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.crypto !== 'undefined';
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Calculate MD5 hash in Node.js
 */
async function md5Node(data: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Calculate MD5 hash in browser using a pure JS implementation
 * Based on the RSA Data Security, Inc. MD5 Message-Digest Algorithm
 */
function md5Browser(data: Uint8Array): string {
  // MD5 implementation for browser
  const rotateLeft = (n: number, s: number): number => (n << s) | (n >>> (32 - s));

  // MD5 functions
  const F = (x: number, y: number, z: number): number => (x & y) | (~x & z);
  const G = (x: number, y: number, z: number): number => (x & z) | (y & ~z);
  const H = (x: number, y: number, z: number): number => x ^ y ^ z;
  const I = (x: number, y: number, z: number): number => y ^ (x | ~z);

  const FF = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number => {
    a = (a + F(b, c, d) + x + ac) | 0;
    a = rotateLeft(a, s);
    a = (a + b) | 0;
    return a;
  };

  const GG = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number => {
    a = (a + G(b, c, d) + x + ac) | 0;
    a = rotateLeft(a, s);
    a = (a + b) | 0;
    return a;
  };

  const HH = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number => {
    a = (a + H(b, c, d) + x + ac) | 0;
    a = rotateLeft(a, s);
    a = (a + b) | 0;
    return a;
  };

  const II = (a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number => {
    a = (a + I(b, c, d) + x + ac) | 0;
    a = rotateLeft(a, s);
    a = (a + b) | 0;
    return a;
  };

  // Prepare data
  const msgLen = data.length;
  const padLen = ((msgLen + 8) >>> 6 << 4) + 14;
  const padded = new Uint8Array((padLen + 2) << 2);
  padded.set(data);
  padded[msgLen] = 0x80;

  // Add length in bits
  const lenBits = msgLen * 8;
  padded[padded.length - 8] = lenBits & 0xff;
  padded[padded.length - 7] = (lenBits >>> 8) & 0xff;
  padded[padded.length - 6] = (lenBits >>> 16) & 0xff;
  padded[padded.length - 5] = (lenBits >>> 24) & 0xff;

  // Create 32-bit words
  const words = new Uint32Array(padded.buffer);

  // Initialize hash values
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  // Process 512-bit chunks
  for (let i = 0; i < words.length; i += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    // Round 1
    a = FF(a, b, c, d, words[i + 0], 7, 0xd76aa478);
    d = FF(d, a, b, c, words[i + 1], 12, 0xe8c7b756);
    c = FF(c, d, a, b, words[i + 2], 17, 0x242070db);
    b = FF(b, c, d, a, words[i + 3], 22, 0xc1bdceee);
    a = FF(a, b, c, d, words[i + 4], 7, 0xf57c0faf);
    d = FF(d, a, b, c, words[i + 5], 12, 0x4787c62a);
    c = FF(c, d, a, b, words[i + 6], 17, 0xa8304613);
    b = FF(b, c, d, a, words[i + 7], 22, 0xfd469501);
    a = FF(a, b, c, d, words[i + 8], 7, 0x698098d8);
    d = FF(d, a, b, c, words[i + 9], 12, 0x8b44f7af);
    c = FF(c, d, a, b, words[i + 10], 17, 0xffff5bb1);
    b = FF(b, c, d, a, words[i + 11], 22, 0x895cd7be);
    a = FF(a, b, c, d, words[i + 12], 7, 0x6b901122);
    d = FF(d, a, b, c, words[i + 13], 12, 0xfd987193);
    c = FF(c, d, a, b, words[i + 14], 17, 0xa679438e);
    b = FF(b, c, d, a, words[i + 15], 22, 0x49b40821);

    // Round 2
    a = GG(a, b, c, d, words[i + 1], 5, 0xf61e2562);
    d = GG(d, a, b, c, words[i + 6], 9, 0xc040b340);
    c = GG(c, d, a, b, words[i + 11], 14, 0x265e5a51);
    b = GG(b, c, d, a, words[i + 0], 20, 0xe9b6c7aa);
    a = GG(a, b, c, d, words[i + 5], 5, 0xd62f105d);
    d = GG(d, a, b, c, words[i + 10], 9, 0x02441453);
    c = GG(c, d, a, b, words[i + 15], 14, 0xd8a1e681);
    b = GG(b, c, d, a, words[i + 4], 20, 0xe7d3fbc8);
    a = GG(a, b, c, d, words[i + 9], 5, 0x21e1cde6);
    d = GG(d, a, b, c, words[i + 14], 9, 0xc33707d6);
    c = GG(c, d, a, b, words[i + 3], 14, 0xf4d50d87);
    b = GG(b, c, d, a, words[i + 8], 20, 0x455a14ed);
    a = GG(a, b, c, d, words[i + 13], 5, 0xa9e3e905);
    d = GG(d, a, b, c, words[i + 2], 9, 0xfcefa3f8);
    c = GG(c, d, a, b, words[i + 7], 14, 0x676f02d9);
    b = GG(b, c, d, a, words[i + 12], 20, 0x8d2a4c8a);

    // Round 3
    a = HH(a, b, c, d, words[i + 5], 4, 0xfffa3942);
    d = HH(d, a, b, c, words[i + 8], 11, 0x8771f681);
    c = HH(c, d, a, b, words[i + 11], 16, 0x6d9d6122);
    b = HH(b, c, d, a, words[i + 14], 23, 0xfde5380c);
    a = HH(a, b, c, d, words[i + 1], 4, 0xa4beea44);
    d = HH(d, a, b, c, words[i + 4], 11, 0x4bdecfa9);
    c = HH(c, d, a, b, words[i + 7], 16, 0xf6bb4b60);
    b = HH(b, c, d, a, words[i + 10], 23, 0xbebfbc70);
    a = HH(a, b, c, d, words[i + 13], 4, 0x289b7ec6);
    d = HH(d, a, b, c, words[i + 0], 11, 0xeaa127fa);
    c = HH(c, d, a, b, words[i + 3], 16, 0xd4ef3085);
    b = HH(b, c, d, a, words[i + 6], 23, 0x04881d05);
    a = HH(a, b, c, d, words[i + 9], 4, 0xd9d4d039);
    d = HH(d, a, b, c, words[i + 12], 11, 0xe6db99e5);
    c = HH(c, d, a, b, words[i + 15], 16, 0x1fa27cf8);
    b = HH(b, c, d, a, words[i + 2], 23, 0xc4ac5665);

    // Round 4
    a = II(a, b, c, d, words[i + 0], 6, 0xf4292244);
    d = II(d, a, b, c, words[i + 7], 10, 0x432aff97);
    c = II(c, d, a, b, words[i + 14], 15, 0xab9423a7);
    b = II(b, c, d, a, words[i + 5], 21, 0xfc93a039);
    a = II(a, b, c, d, words[i + 12], 6, 0x655b59c3);
    d = II(d, a, b, c, words[i + 3], 10, 0x8f0ccc92);
    c = II(c, d, a, b, words[i + 10], 15, 0xffeff47d);
    b = II(b, c, d, a, words[i + 1], 21, 0x85845dd1);
    a = II(a, b, c, d, words[i + 8], 6, 0x6fa87e4f);
    d = II(d, a, b, c, words[i + 15], 10, 0xfe2ce6e0);
    c = II(c, d, a, b, words[i + 6], 15, 0xa3014314);
    b = II(b, c, d, a, words[i + 13], 21, 0x4e0811a1);
    a = II(a, b, c, d, words[i + 4], 6, 0xf7537e82);
    d = II(d, a, b, c, words[i + 11], 10, 0xbd3af235);
    c = II(c, d, a, b, words[i + 2], 15, 0x2ad7d2bb);
    b = II(b, c, d, a, words[i + 9], 21, 0xeb86d391);

    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }

  // Convert to hex string
  const toHex = (n: number): string => {
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

/**
 * Calculate SHA-1 hash in Node.js
 */
async function sha1Node(data: Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * Calculate SHA-1 hash in browser using Web Crypto API
 */
async function sha1Browser(data: Uint8Array): Promise<string> {
  // Ensure we have a proper ArrayBuffer for Web Crypto API
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Calculate CRC32 hash (works in both Node.js and browser)
 */
function crc32Hash(data: Uint8Array | Buffer): string {
  const crc = CRC32.buf(data);
  // Convert to unsigned 32-bit hex string
  return (crc >>> 0).toString(16).padStart(8, '0');
}

/**
 * Calculate hash(es) for ROM data
 *
 * @param data - ROM data as Uint8Array, ArrayBuffer, or Buffer
 * @param types - Hash types to calculate (defaults to all)
 * @returns Object containing requested hash values
 *
 * @example
 * ```typescript
 * // In browser with File API
 * const file = fileInput.files[0];
 * const buffer = await file.arrayBuffer();
 * const hashes = await calculateHash(buffer, ['md5', 'sha1']);
 * console.log(hashes); // { md5: '...', sha1: '...' }
 *
 * // In Node.js
 * const fs = require('fs');
 * const buffer = fs.readFileSync('rom.zip');
 * const hashes = await calculateHash(buffer);
 * ```
 */
export async function calculateHash(
  data: Uint8Array | ArrayBuffer | Buffer,
  types: HashType[] = ['md5', 'sha1', 'crc32']
): Promise<HashResult> {
  // Convert to Uint8Array if ArrayBuffer
  let uint8Data: Uint8Array;
  if (data instanceof ArrayBuffer) {
    uint8Data = new Uint8Array(data);
  } else if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
    uint8Data = data;
  } else {
    throw new Error('Data must be Uint8Array, ArrayBuffer, or Buffer');
  }

  const result: HashResult = {};
  const browser = isBrowser();

  // Calculate requested hashes
  for (const type of types) {
    switch (type) {
      case 'md5':
        if (browser) {
          result.md5 = md5Browser(uint8Data);
        } else {
          result.md5 = await md5Node(uint8Data as Buffer);
        }
        break;

      case 'sha1':
        if (browser) {
          result.sha1 = await sha1Browser(uint8Data);
        } else {
          result.sha1 = await sha1Node(uint8Data as Buffer);
        }
        break;

      case 'crc32':
        result.crc32 = crc32Hash(uint8Data);
        break;
    }
  }

  return result;
}

/**
 * Calculate a single hash type
 *
 * @param data - ROM data
 * @param type - Hash type to calculate
 * @returns Hash value as hex string
 */
export async function calculateSingleHash(
  data: Uint8Array | ArrayBuffer | Buffer,
  type: HashType
): Promise<string> {
  const result = await calculateHash(data, [type]);
  return result[type] || '';
}
