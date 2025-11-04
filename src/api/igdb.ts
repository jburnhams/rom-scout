/**
 * IGDB (Internet Game Database) API client
 * https://api-docs.igdb.com/
 */

import type { HashLookupRequest, RomMetadata, ImageMetadata } from '../types.js';

export interface IGDBConfig {
  clientId: string;
  clientSecret: string;
  timeout?: number;
}

interface IGDBToken {
  access_token: string;
  expires_at: number;
}

/**
 * IGDB API client for game metadata
 * Note: IGDB doesn't support hash-based lookups, so this client searches by filename
 */
export class IGDBClient {
  private clientId: string;
  private clientSecret: string;
  private timeout: number;
  private token: IGDBToken | null = null;

  constructor(config: IGDBConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Get or refresh OAuth token
   */
  private async getToken(): Promise<string> {
    // Check if we have a valid token
    if (this.token && this.token.expires_at > Date.now()) {
      return this.token.access_token;
    }

    // Request new token
    const url = `https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`IGDB token request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.token = {
        access_token: data.access_token,
        expires_at: Date.now() + (data.expires_in * 1000) - 60000, // Refresh 1 minute early
      };

      return this.token.access_token;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Lookup game by name (extracted from filename)
   * IGDB doesn't support hash-based lookups
   */
  async lookup(request: HashLookupRequest): Promise<RomMetadata | null> {
    if (!request.filename) {
      throw new Error('IGDB requires a filename for lookup');
    }

    // Extract game name from filename (remove extension and common patterns)
    const gameName = this.extractGameName(request.filename);

    try {
      const token = await this.getToken();

      // Search for game
      const query = `
        search "${gameName}";
        fields name, summary, genres.name, cover.url, screenshots.url,
               first_release_date, involved_companies.company.name,
               involved_companies.publisher, involved_companies.developer,
               rating, platforms.name;
        limit 1;
      `;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch('https://api.igdb.com/v4/games', {
          method: 'POST',
          headers: {
            'Client-ID': this.clientId,
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'text/plain',
          },
          body: query,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`IGDB API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data || data.length === 0) {
          return null;
        }

        return this.transformResponse(data[0]);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('IGDB API request timed out');
        }
        throw error;
      }
      throw new Error('Unknown error occurred during IGDB API request');
    }
  }

  /**
   * Extract game name from filename
   */
  private extractGameName(filename: string): string {
    // Remove extension
    let name = filename.replace(/\.[^.]+$/, '');

    // Remove common ROM naming patterns
    name = name.replace(/\([^)]*\)/g, ''); // Remove parentheses content
    name = name.replace(/\[[^\]]*\]/g, ''); // Remove bracket content
    name = name.replace(/[_-]/g, ' '); // Replace underscores and dashes with spaces
    name = name.trim();

    return name;
  }

  /**
   * Transform IGDB API response to RomMetadata
   */
  private transformResponse(data: any): RomMetadata {
    const images: ImageMetadata[] = [];

    // Add cover image
    if (data.cover && data.cover.url) {
      images.push({
        url: `https:${data.cover.url.replace('t_thumb', 't_cover_big')}`,
        type: 'cover',
        thumbnail: `https:${data.cover.url}`,
      });
    }

    // Add screenshots
    if (data.screenshots) {
      for (const screenshot of data.screenshots) {
        if (screenshot.url) {
          images.push({
            url: `https:${screenshot.url.replace('t_thumb', 't_screenshot_big')}`,
            type: 'screenshot',
            thumbnail: `https:${screenshot.url}`,
          });
        }
      }
    }

    // Extract publisher and developer
    let publisher: string | undefined;
    let developer: string | undefined;

    if (data.involved_companies) {
      for (const company of data.involved_companies) {
        if (company.publisher && company.company) {
          publisher = company.company.name;
        }
        if (company.developer && company.company) {
          developer = company.company.name;
        }
      }
    }

    // Extract year from release date
    let year: number | undefined;
    if (data.first_release_date) {
      const date = new Date(data.first_release_date * 1000);
      year = date.getFullYear();
    }

    // Extract platform
    const platform = data.platforms && data.platforms.length > 0
      ? data.platforms[0].name
      : undefined;

    // Extract genres
    const genres = data.genres
      ? data.genres.map((g: any) => g.name)
      : undefined;

    return {
      title: data.name || 'Unknown',
      platform,
      year,
      publisher,
      developer,
      description: data.summary,
      genres,
      images: images.length > 0 ? images : undefined,
      rating: data.rating ? Math.round(data.rating) : undefined,
      source: 'igdb',
      raw: data,
    };
  }
}
