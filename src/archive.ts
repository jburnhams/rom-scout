/**
 * Archive utilities for ROM files
 * Supports extracting files from ZIP archives using fflate (works in both browser and Node.js)
 */

import { unzipSync } from 'fflate';

/**
 * Extracted file information
 */
export interface ExtractedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Check if a file is a ZIP archive by checking the magic bytes
 */
export function isZipArchive(data: Uint8Array): boolean {
  // ZIP files start with PK (0x50 0x4B)
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4B;
}

/**
 * Extract files from a ZIP archive
 *
 * @param data - ZIP archive data
 * @returns Array of extracted files
 *
 * @example
 * ```typescript
 * const zipData = new Uint8Array(await file.arrayBuffer());
 * const files = extractZipFiles(zipData);
 * for (const file of files) {
 *   console.log(`Extracted: ${file.name} (${file.data.length} bytes)`);
 * }
 * ```
 */
export function extractZipFiles(data: Uint8Array): ExtractedFile[] {
  try {
    // Use fflate to decompress the ZIP archive
    const unzipped = unzipSync(data);

    const files: ExtractedFile[] = [];

    for (const [filename, fileData] of Object.entries(unzipped)) {
      // Skip directories and metadata files
      if (filename.endsWith('/') || filename.startsWith('__MACOSX/')) {
        continue;
      }

      files.push({
        name: filename,
        data: fileData,
      });
    }

    return files;
  } catch (error) {
    // If extraction fails, return empty array
    console.error('Failed to extract ZIP archive:', error);
    return [];
  }
}

/**
 * Check if filename suggests it's an archive file
 */
export function isArchiveFilename(filename?: string): boolean {
  if (!filename) return false;

  const lowerFilename = filename.toLowerCase();
  return lowerFilename.endsWith('.zip') ||
         lowerFilename.endsWith('.7z') ||
         lowerFilename.endsWith('.rar');
}
