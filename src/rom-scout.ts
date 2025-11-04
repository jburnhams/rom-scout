/**
 * Main RomScout class for ROM identification and metadata fetching
 */

import { calculateHash } from './hash.js';
import { HasheousClient } from './api/hasheous.js';
import { IGDBClient } from './api/igdb.js';
import { ScreenScraperClient } from './api/screenscraper.js';
import { isZipArchive, isArchiveFilename, extractZipFiles } from './archive.js';
import type {
  RomScoutConfig,
  RomMetadata,
  HashLookupRequest,
} from './types.js';

/**
 * RomScout - Identify ROM files and fetch metadata
 *
 * @example
 * ```typescript
 * // Browser usage
 * const scout = new RomScout({
 *   provider: 'hasheous',
 *   hasheousUrl: 'https://hasheous.example.com'
 * });
 *
 * const fileInput = document.getElementById('rom-file');
 * fileInput.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const metadata = await scout.identify(file);
 *   console.log(metadata);
 * });
 *
 * // Node.js usage
 * import fs from 'fs';
 * const buffer = fs.readFileSync('pacman.zip');
 * const metadata = await scout.identify(buffer, 'pacman.zip');
 * ```
 */
export class RomScout {
  private config: RomScoutConfig;
  private hasheousClient?: HasheousClient;
  private igdbClient?: IGDBClient;
  private screenScraperClient?: ScreenScraperClient;

  constructor(config: RomScoutConfig = {}) {
    this.config = {
      provider: 'hasheous',
      timeout: 30000,
      ...config,
    };

    // Initialize API clients based on config
    this.initializeClients();
  }

  /**
   * Initialize API clients
   */
  private initializeClients(): void {
    // Hasheous
    if (this.config.hasheousUrl) {
      this.hasheousClient = new HasheousClient({
        baseUrl: this.config.hasheousUrl,
        timeout: this.config.timeout,
      });
    }

    // IGDB
    if (this.config.igdb) {
      this.igdbClient = new IGDBClient({
        clientId: this.config.igdb.clientId,
        clientSecret: this.config.igdb.clientSecret,
        timeout: this.config.timeout,
      });
    }

    // ScreenScraper
    if (this.config.screenscraper) {
      this.screenScraperClient = new ScreenScraperClient({
        devId: this.config.screenscraper.devId,
        devPassword: this.config.screenscraper.devPassword,
        softwareName: this.config.screenscraper.softwareName,
        username: this.config.screenscraper.username,
        password: this.config.screenscraper.password,
        timeout: this.config.timeout,
      });
    }
  }

  /**
   * Identify a ROM file and fetch metadata
   *
   * @param data - ROM data (File, Blob, ArrayBuffer, Uint8Array, or Buffer)
   * @param filename - Optional filename (extracted from File if not provided)
   * @returns ROM metadata or null if not found
   */
  async identify(
    data: File | Blob | ArrayBuffer | Uint8Array | Buffer,
    filename?: string
  ): Promise<RomMetadata | null> {
    // Extract filename from File object if not provided
    if (!filename && data instanceof File) {
      filename = data.name;
    }

    // Convert to buffer
    let buffer: ArrayBuffer | Uint8Array | Buffer;
    if (data instanceof File || data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else if (data instanceof ArrayBuffer) {
      buffer = data;
    } else {
      buffer = data;
    }

    // Convert to Uint8Array for archive detection
    let uint8Data: Uint8Array;
    if (buffer instanceof ArrayBuffer) {
      uint8Data = new Uint8Array(buffer);
    } else if (buffer instanceof Uint8Array || Buffer.isBuffer(buffer)) {
      uint8Data = buffer;
    } else {
      throw new Error('Data must be Uint8Array, ArrayBuffer, or Buffer');
    }

    // Check if this is an archive file
    const isArchive = isArchiveFilename(filename) || isZipArchive(uint8Data);

    if (isArchive && isZipArchive(uint8Data)) {
      // Extract files from the archive
      const extractedFiles = extractZipFiles(uint8Data);

      // Try to identify each file in the archive
      for (const file of extractedFiles) {
        const hashes = await calculateHash(file.data);

        const request: HashLookupRequest = {
          md5: hashes.md5,
          sha1: hashes.sha1,
          crc32: hashes.crc32,
          size: file.data.byteLength,
          filename: file.name,
        };

        const metadata = await this.lookup(request);

        // Return the first match found
        if (metadata) {
          return metadata;
        }
      }

      // No matches found in archive files
      return null;
    }

    // Not an archive, or couldn't extract - hash the whole file
    const hashes = await calculateHash(buffer);

    // Create lookup request
    const request: HashLookupRequest = {
      md5: hashes.md5,
      sha1: hashes.sha1,
      crc32: hashes.crc32,
      size: buffer.byteLength,
      filename,
    };

    // Try to fetch metadata from the configured provider
    return this.lookup(request);
  }

  /**
   * Lookup ROM metadata using hash information
   *
   * @param request - Hash lookup request
   * @returns ROM metadata or null if not found
   */
  async lookup(request: HashLookupRequest): Promise<RomMetadata | null> {
    const provider = this.config.provider || 'hasheous';

    switch (provider) {
      case 'hasheous':
        if (!this.hasheousClient) {
          throw new Error('Hasheous client not configured. Provide hasheousUrl in config.');
        }
        return this.hasheousClient.lookup(request);

      case 'igdb':
        if (!this.igdbClient) {
          throw new Error('IGDB client not configured. Provide igdb credentials in config.');
        }
        return this.igdbClient.lookup(request);

      case 'screenscraper':
        if (!this.screenScraperClient) {
          throw new Error('ScreenScraper client not configured. Provide screenscraper credentials in config.');
        }
        return this.screenScraperClient.lookup(request);

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Try multiple providers in sequence until metadata is found
   *
   * @param request - Hash lookup request
   * @param providers - List of providers to try (defaults to all configured)
   * @returns ROM metadata or null if not found in any provider
   */
  async lookupMultiple(
    request: HashLookupRequest,
    providers?: Array<'hasheous' | 'igdb' | 'screenscraper'>
  ): Promise<RomMetadata | null> {
    const providersToTry = providers || ['hasheous', 'igdb', 'screenscraper'];

    for (const provider of providersToTry) {
      try {
        const originalProvider = this.config.provider;
        this.config.provider = provider;

        const result = await this.lookup(request);

        this.config.provider = originalProvider;

        if (result) {
          return result;
        }
      } catch (error) {
        // Continue to next provider if this one fails
        console.warn(`Provider ${provider} failed:`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * Calculate hashes for ROM data without fetching metadata
   *
   * @param data - ROM data
   * @returns Hash values
   */
  async hash(
    data: File | Blob | ArrayBuffer | Uint8Array | Buffer
  ): Promise<{ md5: string; sha1: string; crc32: string }> {
    // Convert to buffer
    let buffer: ArrayBuffer | Uint8Array | Buffer;
    if (data instanceof File || data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else if (data instanceof ArrayBuffer) {
      buffer = data;
    } else {
      buffer = data;
    }

    const hashes = await calculateHash(buffer);

    return {
      md5: hashes.md5 || '',
      sha1: hashes.sha1 || '',
      crc32: hashes.crc32 || '',
    };
  }
}
