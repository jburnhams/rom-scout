/**
 * Hasheous API client
 * https://github.com/Hasheous/Hasheous
 */

import type { HashLookupRequest, RomMetadata, ImageMetadata } from '../types.js';

export interface HasheousConfig {
  baseUrl: string;
  timeout?: number;
  /** Optional CORS proxy prefix (e.g., 'https://proxy.corsfix.com/?') */
  corsProxy?: string;
}

/**
 * Hasheous API client for ROM metadata lookups
 */
export class HasheousClient {
  private baseUrl: string;
  private timeout: number;
  private corsProxy?: string;

  constructor(config: HasheousConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = config.timeout || 30000;
    this.corsProxy = config.corsProxy;
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

      let url = `${this.baseUrl}/api/v1/Lookup/ByHash`;

      // Apply CORS proxy if configured
      if (this.corsProxy) {
        url = `${this.corsProxy}${url}`;
      }

      const response = await this.performLookupRequest(url, JSON.stringify(requestBody));

      const text = await response.text();
      const data = this.parseJsonSafely(text);

      if (response.status === 404) {
        return null;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Hasheous API error: ${response.status}`);
      }

      return this.transformResponse(data);
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

  private async performLookupRequest(url: string, body: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      await ensureProxyConfigured();

      const options: RequestInit = {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      };
      return await fetch(url, options);
    } catch (error) {
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseJsonSafely(text: string): any {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn('Failed to parse Hasheous JSON response:', error);
      throw error;
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
      id: this.buildIdentifier(data),
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

  /**
   * Build the metadata identifier for Hasheous responses
   */
  private buildIdentifier(data: any): string {
    const attribute = Array.isArray(data.attributes)
      ? data.attributes.find((attr: any) =>
          ['GameId', 'gameId', 'Id'].includes(attr.attributeType)
        )
      : undefined;

    const attributeId = attribute?.value ?? attribute?.attributeValue ?? attribute?.id;

    const providerId =
      data.id ??
      data.gameId ??
      data.game_id ??
      data.game?.id ??
      data.game?.gameId ??
      data.metadataId ??
      data.romId ??
      data.rom?.id ??
      data.rom?.romId ??
      attributeId;

    if (providerId === undefined || providerId === null) {
      throw new Error('Hasheous response missing required identifier field');
    }

    return `HASHEOUS${String(providerId)}`;
  }
}

let proxySetupPromise: Promise<void> | null = null;

async function ensureProxyConfigured(): Promise<void> {
  if (proxySetupPromise) {
    return proxySetupPromise;
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    proxySetupPromise = Promise.resolve();
    return proxySetupPromise;
  }

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.npm_config_https_proxy ||
    process.env.npm_config_http_proxy ||
    null;

  if (!proxyUrl) {
    proxySetupPromise = Promise.resolve();
    return proxySetupPromise;
  }

  proxySetupPromise = (async () => {
    try {
      const { ProxyAgent, setGlobalDispatcher } = await import('undici');
      if (typeof ProxyAgent === 'function' && typeof setGlobalDispatcher === 'function') {
        const agent = new ProxyAgent(proxyUrl);
        setGlobalDispatcher(agent);
      }
    } catch (error) {
      console.warn('Failed to configure proxy for Hasheous lookup:', error);
    }
  })();

  return proxySetupPromise;
}
