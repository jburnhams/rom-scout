/**
 * ScreenScraper API client
 * https://www.screenscraper.fr/
 */

import type { HashLookupRequest, RomMetadata, ImageMetadata } from '../types.js';

export interface ScreenScraperConfig {
  devId: string;
  devPassword: string;
  softwareName: string;
  username?: string;
  password?: string;
  timeout?: number;
}

/**
 * ScreenScraper API client for ROM metadata
 */
export class ScreenScraperClient {
  private devId: string;
  private devPassword: string;
  private softwareName: string;
  private username?: string;
  private password?: string;
  private timeout: number;

  constructor(config: ScreenScraperConfig) {
    this.devId = config.devId;
    this.devPassword = config.devPassword;
    this.softwareName = config.softwareName;
    this.username = config.username;
    this.password = config.password;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Lookup game by hash
   */
  async lookup(request: HashLookupRequest): Promise<RomMetadata | null> {
    try {
      // Build query parameters
      const params = new URLSearchParams({
        devid: this.devId,
        devpassword: this.devPassword,
        softname: this.softwareName,
        output: 'json',
      });

      // Add user credentials if provided
      if (this.username) params.append('ssid', this.username);
      if (this.password) params.append('sspassword', this.password);

      // Add hash parameters (ScreenScraper supports multiple hash types)
      if (request.md5) params.append('md5', request.md5);
      if (request.sha1) params.append('sha1', request.sha1);
      if (request.crc32) params.append('crc', request.crc32);
      if (request.size) params.append('romsize', request.size.toString());
      if (request.filename) params.append('romnom', request.filename);

      const url = `https://www.screenscraper.fr/api2/jeuInfos.php?${params.toString()}`;

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
          throw new Error(`ScreenScraper API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Check for API errors
        if (data.error) {
          throw new Error(`ScreenScraper API error: ${data.error}`);
        }

        if (!data.response || !data.response.jeu) {
          return null;
        }

        return this.transformResponse(data.response.jeu);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('ScreenScraper API request timed out');
        }
        throw error;
      }
      throw new Error('Unknown error occurred during ScreenScraper API request');
    }
  }

  /**
   * Transform ScreenScraper API response to RomMetadata
   */
  private transformResponse(data: any): RomMetadata {
    const images: ImageMetadata[] = [];

    // Extract images from medias
    if (data.medias) {
      for (const media of data.medias) {
        if (media.type === 'box-2D') {
          images.push({
            url: media.url,
            type: 'boxart',
            resolution: media.format,
            thumbnail: media.url_thumbnail,
          });
        } else if (media.type === 'ss' || media.type === 'screenshot') {
          images.push({
            url: media.url,
            type: 'screenshot',
            resolution: media.format,
            thumbnail: media.url_thumbnail,
          });
        } else if (media.type === 'sstitle' || media.type === 'title-screenshot') {
          images.push({
            url: media.url,
            type: 'title-screen',
            resolution: media.format,
            thumbnail: media.url_thumbnail,
          });
        }
      }
    }

    // Extract text data (prefer English)
    const getText = (field: any): string | undefined => {
      if (!field) return undefined;
      if (typeof field === 'string') return field;
      if (Array.isArray(field)) {
        const en = field.find((t: any) => t.langue === 'en');
        return en?.text || field[0]?.text;
      }
      return undefined;
    };

    // Extract publisher and developer
    let publisher: string | undefined;
    let developer: string | undefined;

    if (data.editeur) {
      publisher = data.editeur.text || data.editeur.nom;
    }

    if (data.developpeur) {
      developer = data.developpeur.text || data.developpeur.nom;
    }

    // Extract genres
    const genres = data.genres
      ? data.genres.map((g: any) => getText(g.noms) || g.text)
      : undefined;

    // Extract year
    const year = data.dates
      ? new Date(data.dates[0]).getFullYear()
      : undefined;

    // Extract platform
    const platform = data.systeme?.text || data.systeme?.nom;

    // Extract players
    const players = data.joueurs ? `1-${data.joueurs}` : undefined;

    // Extract rating (ScreenScraper uses 0-20 scale, convert to 0-100)
    const rating = data.note ? Math.round(parseFloat(data.note) * 5) : undefined;

    const sourceId =
      data.id ??
      data.idJeu ??
      data.id_jeu ??
      data.gameId ??
      data.jeu?.id ??
      data.jeu?.gameId;

    if (sourceId === undefined || sourceId === null) {
      throw new Error('ScreenScraper response missing required identifier field');
    }

    return {
      id: `SCREENSCRAPER${String(sourceId)}`,
      title: getText(data.noms) || 'Unknown',
      platform,
      year,
      publisher,
      developer,
      description: getText(data.synopsis),
      genres,
      players,
      images: images.length > 0 ? images : undefined,
      rating,
      source: 'screenscraper',
      raw: data,
    };
  }
}
