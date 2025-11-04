/**
 * rom-scout - ROM identification and metadata fetching library
 *
 * A JavaScript library that identifies emulator ROM files by calculating hashes
 * and fetching metadata from various APIs including Hasheous, IGDB, and ScreenScraper.
 *
 * @example
 * ```typescript
 * import { RomScout } from 'rom-scout';
 *
 * // Create a scout instance
 * const scout = new RomScout({
 *   provider: 'hasheous',
 *   hasheousUrl: 'https://hasheous.example.com'
 * });
 *
 * // Identify a ROM file
 * const file = fileInput.files[0];
 * const metadata = await scout.identify(file);
 * console.log(metadata.title); // Game title
 * console.log(metadata.images); // Cover art and screenshots
 * ```
 *
 * @packageDocumentation
 */

// Main class
export { RomScout } from './rom-scout.js';

// Hash utilities
export { calculateHash, calculateSingleHash } from './hash.js';
export type { HashType, HashResult } from './hash.js';

// API clients
export { HasheousClient } from './api/hasheous.js';
export { IGDBClient } from './api/igdb.js';
export { ScreenScraperClient } from './api/screenscraper.js';

// Types
export type {
  RomScoutConfig,
  RomMetadata,
  ImageMetadata,
  HashLookupRequest,
} from './types.js';
