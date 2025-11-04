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
      // Build request body for Hasheous v1 API
      const requestBody: any = {};

      if (request.md5) requestBody.mD5 = request.md5;
      if (request.sha1) requestBody.shA1 = request.sha1;
      if (request.crc32) requestBody.crc = request.crc32;

      const url = `${this.baseUrl}/api/v1/Lookup/ByHash`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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

    // Extract images from attributes
    if (data.attributes && Array.isArray(data.attributes)) {
      for (const attr of data.attributes) {
        if (attr.attributeType === 'ImageId' && attr.link) {
          // Construct full image URL
          const imageUrl = attr.link.startsWith('http')
            ? attr.link
            : `${this.baseUrl}${attr.link}`;

          images.push({
            url: imageUrl,
            type: attr.attributeName?.toLowerCase() || 'unknown',
            thumbnail: attr.thumbnail,
          });
        }
      }
    }

    return {
      title: data.name || 'Unknown',
      platform: data.platform?.name,
      publisher: data.publisher?.name,
      // Note: Hasheous v1 API doesn't directly provide these fields
      // They would need to be fetched from the metadata sources
      year: undefined,
      developer: undefined,
      description: undefined,
      genres: undefined,
      players: undefined,
      images: images.length > 0 ? images : undefined,
      rating: undefined,
      source: 'hasheous',
      raw: data,
    };
  }
}
