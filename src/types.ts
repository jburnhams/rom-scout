/**
 * Type definitions for rom-scout
 */

/**
 * Configuration for RomScout
 */
export interface RomScoutConfig {
  /** API provider to use (defaults to 'hasheous') */
  provider?: 'hasheous';

  /** Base URL for Hasheous API */
  hasheousUrl?: string;

  /** Optional CORS proxy prefix for Hasheous API (e.g., 'https://proxy.corsfix.com/?') */
  corsProxy?: string;

  /** Timeout for API requests in milliseconds (defaults to 30000) */
  timeout?: number;
}

/**
 * Image metadata
 */
export interface ImageMetadata {
  /** Image URL */
  url: string;

  /** Image type (e.g., 'boxart', 'screenshot', 'title-screen') */
  type: string;

  /** Image resolution (e.g., '1024x768') */
  resolution?: string;

  /** Thumbnail URL */
  thumbnail?: string;
}

/**
 * ROM metadata result
 */
export interface RomMetadata {
  /** Unique identifier composed of provider name and source-specific ID */
  id: string;

  /** Identifier used for local persistence (typically a ROM hash) */
  persistId?: string;

  /** Additional identifiers that may reference the same ROM */
  alternateIds?: string[];

  /** Game title */
  title: string;

  /** Platform/system name */
  platform?: string;

  /** Publisher */
  publisher?: string;

  /** Cover/box art images */
  images?: ImageMetadata[];

  /** Source API that provided the metadata */
  source: string;

  /** Raw response from the API */
  raw?: unknown;
}

/**
 * Hash lookup request
 */
export interface HashLookupRequest {
  /** MD5 hash */
  md5?: string;

  /** SHA-1 hash */
  sha1?: string;

  /** CRC32 hash */
  crc32?: string;

  /** File size in bytes */
  size?: number;

  /** Filename (optional, helps with identification) */
  filename?: string;
}
