/**
 * Hasheous API client
 * https://github.com/Hasheous/Hasheous
 */

import type { HashLookupRequest, RomMetadata, ImageMetadata } from '../types.js';

interface LookupResponse {
  status: number;
  data: any;
}

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

      const { status, data } = await this.performLookupRequest(url, JSON.stringify(requestBody));

      if (status === 404) {
        return null;
      }

      if (status < 200 || status >= 300) {
        throw new Error(`Hasheous API error: ${status}`);
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

  private async performLookupRequest(url: string, body: string): Promise<LookupResponse> {
    const fetchResult = await this.tryFetch(url, body);
    if (fetchResult) {
      return fetchResult;
    }

    const fallbackResult = await this.tryCurlFallback(url, body);
    if (fallbackResult) {
      return fallbackResult;
    }

    throw new Error('Failed to reach Hasheous API');
  }

  private async tryFetch(url: string, body: string): Promise<LookupResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });

      const text = await response.text();
      const data = this.parseJsonSafely(text);
      return { status: response.status, data };
    } catch (error) {
      if (this.isNetworkUnreachable(error)) {
        return null;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async tryCurlFallback(url: string, body: string): Promise<LookupResponse | null> {
    if (!this.isNodeEnvironment()) {
      return null;
    }

    try {
      const [{ execFile }] = await Promise.all([import('node:child_process')]);

      const timeoutSeconds = Math.max(1, Math.ceil(this.timeout / 1000));
      const args = [
        '-sS',
        '-X',
        'POST',
        '-H',
        'Accept: application/json',
        '-H',
        'Content-Type: application/json',
        '--data',
        body,
        '--max-time',
        String(timeoutSeconds),
        '-o',
        '-',
        '-w',
        '\n%{http_code}\n',
        url,
      ];

      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        execFile('curl', args, { env: process.env }, (error, stdout, stderr) => {
          if (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            err.message = `${err.message}${stderr ? `: ${stderr}` : ''}`;
            reject(err);
            return;
          }
          resolve({ stdout: String(stdout) });
        });
      });

      const trimmed = stdout.trimEnd();
      const lastNewline = trimmed.lastIndexOf('\n');
      if (lastNewline === -1) {
        throw new Error('Unexpected curl output');
      }

      const bodyText = trimmed.slice(0, lastNewline);
      const statusText = trimmed.slice(lastNewline + 1).trim();
      const status = Number.parseInt(statusText, 10);

      if (Number.isNaN(status)) {
        throw new Error(`Invalid HTTP status from curl: ${statusText}`);
      }

      const data = this.parseJsonSafely(bodyText);
      return { status, data };
    } catch (error) {
      console.warn('Failed to retry Hasheous lookup via curl:', error);
      return null;
    }
  }

  private isNetworkUnreachable(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause && this.isNetworkUnreachable(cause)) {
      return true;
    }

    const code = (error as { code?: unknown }).code;
    if (code === 'ENETUNREACH') {
      return true;
    }

    const nestedErrors = (error as { errors?: unknown }).errors;
    if (Array.isArray(nestedErrors)) {
      return nestedErrors.some((nested) => this.isNetworkUnreachable(nested));
    }

    return false;
  }

  private isNodeEnvironment(): boolean {
    return typeof process !== 'undefined' && !!process.versions?.node;
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
