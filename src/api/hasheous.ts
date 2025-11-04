/**
 * Hasheous API client
 * https://github.com/Hasheous/Hasheous
 */

import type { HashLookupRequest, RomMetadata, ImageMetadata } from '../types.js';

export interface HasheousConfig {
  baseUrl: string;
  timeout?: number;
}

/**
 * Hasheous API client for ROM metadata lookups
 */
export class HasheousClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: HasheousConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout || 30000;
  }

  /**
   * Fetch metadata using ROM hashes
   */
  async lookup(request: HashLookupRequest): Promise<RomMetadata | null> {
    try {
      // Build query parameters
      const params = new URLSearchParams();

      if (request.md5) params.append('md5', request.md5);
      if (request.sha1) params.append('sha1', request.sha1);
      if (request.crc32) params.append('crc32', request.crc32);
      if (request.size) params.append('size', request.size.toString());
      if (request.filename) params.append('filename', request.filename);

      const url = `${this.baseUrl}/api/lookup?${params.toString()}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            return null; // ROM not found
          }
          throw new Error(`Hasheous API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return this.transformResponse(data);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Hasheous API request timed out');
        }
        throw error;
      }
      throw new Error('Unknown error occurred during Hasheous API request');
    }
  }

  /**
   * Transform Hasheous API response to RomMetadata
   */
  private transformResponse(data: any): RomMetadata {
    const images: ImageMetadata[] = [];

    // Extract images from various possible fields
    if (data.images) {
      for (const img of data.images) {
        images.push({
          url: img.url || img.path,
          type: img.type || 'unknown',
          resolution: img.resolution,
          thumbnail: img.thumbnail,
        });
      }
    }

    // Also check for direct image fields
    if (data.boxart) {
      images.push({
        url: data.boxart,
        type: 'boxart',
      });
    }

    if (data.cover) {
      images.push({
        url: data.cover,
        type: 'cover',
      });
    }

    return {
      title: data.title || data.name || 'Unknown',
      platform: data.platform || data.system,
      year: data.year || data.releaseYear,
      publisher: data.publisher,
      developer: data.developer,
      description: data.description || data.synopsis,
      genres: data.genres || (data.genre ? [data.genre] : undefined),
      players: data.players,
      images: images.length > 0 ? images : undefined,
      rating: data.rating,
      source: 'hasheous',
      raw: data,
    };
  }
}
