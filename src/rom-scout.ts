/**
 * Main RomScout class for ROM identification and metadata fetching
 */

import { calculateHash } from './hash.js';
import { HasheousClient } from './api/hasheous.js';
import { isZipArchive, isArchiveFilename, extractZipFiles } from './archive.js';
import type {
  RomScoutConfig,
  RomMetadata,
  HashLookupRequest,
} from './types.js';
import type { HashResult } from './hash.js';

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
        corsProxy: this.config.corsProxy,
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

    // Pre-compute hashes so we always have a fallback identifier available
    const fileHashes = await calculateHash(buffer);

    if (isArchive && isZipArchive(uint8Data)) {
      // Extract files from the archive
      const extractedFiles = extractZipFiles(uint8Data);

      // Collect all matches and count how many files match each ROM
      const matchCounts = new Map<string, { metadata: RomMetadata; count: number }>();

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

        let metadata: RomMetadata | null = null;
        try {
          metadata = await this.lookup(request);
        } catch (error) {
          console.warn('Failed to lookup metadata for archive entry, skipping:', error);
        }

        if (metadata) {
          metadata = this.attachPersistenceIds(metadata, hashes);
          // Create a unique key for this ROM (use title + platform + publisher)
          const romKey = `${metadata.title}|${metadata.platform || ''}|${metadata.publisher || ''}`;

          if (matchCounts.has(romKey)) {
            // Increment count for this ROM
            matchCounts.get(romKey)!.count++;
          } else {
            // First match for this ROM
            matchCounts.set(romKey, { metadata, count: 1 });
          }
        }
      }

      // Return the ROM that matched the most files
      if (matchCounts.size > 0) {
        let bestMatch: { metadata: RomMetadata; count: number } | null = null;

        for (const match of matchCounts.values()) {
          if (!bestMatch || match.count > bestMatch.count) {
            bestMatch = match;
          }
        }

        return bestMatch!.metadata;
      }

      // No matches found in archive files
      return this.createFallbackMetadata(fileHashes, filename);
    }

    // Create lookup request
    const request: HashLookupRequest = {
      md5: fileHashes.md5,
      sha1: fileHashes.sha1,
      crc32: fileHashes.crc32,
      size: buffer.byteLength,
      filename,
    };

    // Try to fetch metadata from the configured provider
    try {
      const metadata = await this.lookup(request);
      if (metadata) {
        return this.attachPersistenceIds(metadata, fileHashes);
      }
    } catch (error) {
      console.warn('Failed to lookup metadata from provider, using fallback hash metadata:', error);
    }

    return this.createFallbackMetadata(fileHashes, filename);
  }

  private attachPersistenceIds(metadata: RomMetadata, hashes: HashResult): RomMetadata {
    const persistId = hashes.sha1 ?? hashes.md5 ?? hashes.crc32;
    if (!persistId) {
      return metadata;
    }

    const alternateIds = new Set<string>();
    if (Array.isArray(metadata.alternateIds)) {
      for (const id of metadata.alternateIds) {
        if (typeof id === 'string' && id.trim()) {
          alternateIds.add(id);
        }
      }
    }
    if (metadata.id) {
      alternateIds.add(metadata.id);
    }
    alternateIds.add(persistId);

    return {
      ...metadata,
      persistId,
      alternateIds: Array.from(alternateIds),
    };
  }

  private createFallbackMetadata(hashes: HashResult, filename?: string): RomMetadata | null {
    const fallbackId = hashes.sha1 ?? hashes.md5 ?? hashes.crc32;
    if (!fallbackId) {
      return null;
    }

    const title = filename && filename.trim().length > 0 ? filename : fallbackId;

    return {
      id: fallbackId,
      persistId: fallbackId,
      alternateIds: [fallbackId],
      title,
      source: 'local-hash',
      raw: {
        fallback: true,
        hashes,
        filename,
      },
    };
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
    providers?: Array<'hasheous'>
  ): Promise<RomMetadata | null> {
    const providersToTry = providers || ['hasheous'];

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
