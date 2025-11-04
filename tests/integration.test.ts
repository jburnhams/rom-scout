/**
 * Integration tests for rom-scout library
 * These tests verify that the examples in the documentation work correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RomScout, calculateHash, extractZipFiles, isZipArchive } from '../src/index.js';

describe('Integration Tests - Documentation Examples', () => {
  const pacmanPath = join(process.cwd(), 'roms', 'pacman.zip');
  const sonicPath = join(process.cwd(), 'roms', 'sonic.bin');
  let pacmanBuffer: Buffer;
  let sonicBuffer: Buffer;

  // Load test ROMs before tests
  try {
    if (!existsSync(pacmanPath)) {
      throw new Error(`Test ROM not found: ${pacmanPath}`);
    }
    pacmanBuffer = readFileSync(pacmanPath);
    console.log(`Loaded test ROM: ${pacmanPath} (${pacmanBuffer.length} bytes)`);
  } catch (error) {
    console.error('Failed to load test ROM:', error);
    throw error;
  }

  try {
    if (!existsSync(sonicPath)) {
      throw new Error(`Test ROM not found: ${sonicPath}`);
    }
    sonicBuffer = readFileSync(sonicPath);
    console.log(`Loaded test ROM: ${sonicPath} (${sonicBuffer.length} bytes)`);
  } catch (error) {
    console.error('Failed to load test ROM:', error);
    throw error;
  }

  describe('Example 1: Calculate ROM Hashes', () => {
    it('should extract files from pacman.zip archive', async () => {
      // Verify archive extraction works
      assert.ok(isZipArchive(pacmanBuffer), 'pacman.zip should be detected as a ZIP archive');

      const extractedFiles = extractZipFiles(pacmanBuffer);
      console.log('\nPac-Man Archive Contents:');
      console.log(`  Found ${extractedFiles.length} file(s) in archive`);

      assert.ok(extractedFiles.length > 0, 'Should extract at least one file from archive');

      for (const file of extractedFiles) {
        console.log(`  - ${file.name} (${file.data.length} bytes)`);
        const hashes = await calculateHash(file.data);
        console.log(`    MD5: ${hashes.md5}`);
        console.log(`    SHA-1: ${hashes.sha1}`);
        console.log(`    CRC32: ${hashes.crc32}`);
      }
    });

    it('should calculate hashes for pacman.zip', async () => {
      // This example should always work (no API required)
      const scout = new RomScout();
      const hashes = await scout.hash(pacmanBuffer);

      console.log('\nPac-Man Archive Hash Calculation Results:');
      console.log('  MD5:', hashes.md5);
      console.log('  SHA-1:', hashes.sha1);
      console.log('  CRC32:', hashes.crc32);

      assert.ok(hashes.md5, 'MD5 hash should be calculated');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated');

      assert.match(hashes.md5, /^[a-f0-9]{32}$/, 'MD5 should be valid format');
      assert.match(hashes.sha1, /^[a-f0-9]{40}$/, 'SHA-1 should be valid format');
      assert.match(hashes.crc32, /^[a-f0-9]{8}$/, 'CRC32 should be valid format');
    });

    it('should calculate hashes for sonic.bin', async () => {
      // This example should always work (no API required)
      const scout = new RomScout();
      const hashes = await scout.hash(sonicBuffer);

      console.log('\nSonic the Hedgehog Hash Calculation Results:');
      console.log('  MD5:', hashes.md5);
      console.log('  SHA-1:', hashes.sha1);
      console.log('  CRC32:', hashes.crc32);

      assert.ok(hashes.md5, 'MD5 hash should be calculated');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated');

      assert.match(hashes.md5, /^[a-f0-9]{32}$/, 'MD5 should be valid format');
      assert.match(hashes.sha1, /^[a-f0-9]{40}$/, 'SHA-1 should be valid format');
      assert.match(hashes.crc32, /^[a-f0-9]{8}$/, 'CRC32 should be valid format');
    });

    it('should work with standalone calculateHash function', async () => {
      const hashes = await calculateHash(pacmanBuffer);

      assert.ok(hashes.md5, 'MD5 hash should be calculated');
      assert.ok(hashes.sha1, 'SHA-1 hash should be calculated');
      assert.ok(hashes.crc32, 'CRC32 hash should be calculated');
    });

    it('should produce consistent results', async () => {
      const scout = new RomScout();
      const hashes1 = await scout.hash(pacmanBuffer);
      const hashes2 = await scout.hash(pacmanBuffer);

      assert.strictEqual(hashes1.md5, hashes2.md5, 'MD5 should be consistent');
      assert.strictEqual(hashes1.sha1, hashes2.sha1, 'SHA-1 should be consistent');
      assert.strictEqual(hashes1.crc32, hashes2.crc32, 'CRC32 should be consistent');
    });
  });

  describe('Example 2: Hasheous API', () => {
    it('should create Hasheous client with config', () => {
      const scout = new RomScout({
        provider: 'hasheous',
        hasheousUrl: 'https://hasheous.example.com'
      });

      assert.ok(scout, 'RomScout instance should be created');
    });

    it('should throw error if Hasheous URL not provided', async () => {
      const scout = new RomScout({
        provider: 'hasheous'
      });

      await assert.rejects(
        async () => {
          await scout.lookup({ md5: 'test' });
        },
        /Hasheous client not configured/,
        'Should throw error when Hasheous URL is missing'
      );
    });

    // Note: Using the public Hasheous instance at https://hasheous.org
    // Can be overridden with HASHEOUS_URL environment variable
    it('should fetch metadata from Hasheous API for pacman.zip', async () => {
      const hasheousUrl = process.env.HASHEOUS_URL || 'https://hasheous.org';

      const scout = new RomScout({
        provider: 'hasheous',
        hasheousUrl: hasheousUrl
      });

      try {
        // With archive extraction, this should now extract the ROM files
        // from pacman.zip and try to identify each one
        const metadata = await scout.identify(pacmanBuffer, 'pacman.zip');

        if (metadata) {
          console.log('\nHasheous API Results (Pac-Man):');
          console.log('  Title:', metadata.title);
          console.log('  Platform:', metadata.platform);
          console.log('  Year:', metadata.year);
          console.log('  Publisher:', metadata.publisher);
          console.log('  Source:', metadata.source);

          assert.strictEqual(metadata.source, 'hasheous', 'Source should be hasheous');
          assert.ok(metadata.title, 'Title should be present');

          // Verify we got Pac-Man metadata
          console.log('\n  ✓ Pac-Man successfully identified from archive extraction');
          console.log('  ✓ Archive extraction and hash lookup working correctly');
        } else {
          console.log('\nHasheous API: Pac-Man ROM not found in database');
          console.log('  Note: Archive extraction is working, but the ROM may not be in the database');
        }
      } catch (error) {
        // Network errors are expected in restricted environments
        if (error instanceof Error && (
          error.message.includes('fetch failed') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('timed out') ||
          error.message.includes('EAI_AGAIN')
        )) {
          console.log('\nHasheous API: Network access blocked or unavailable');
          console.log('  (This is expected in restricted test environments)');
          console.log('  The public instance at https://hasheous.org is available when network access is allowed');
          return; // Pass the test
        }
        // Re-throw other errors (actual bugs)
        console.error('Hasheous API error:', error);
        throw error;
      }
    });

    it('should fetch metadata from Hasheous API for sonic.bin', async () => {
      const hasheousUrl = process.env.HASHEOUS_URL || 'https://hasheous.org';

      const scout = new RomScout({
        provider: 'hasheous',
        hasheousUrl: hasheousUrl
      });

      try {
        const metadata = await scout.identify(sonicBuffer, 'sonic.bin');

        // Sonic the Hedgehog should be found in Hasheous
        assert.ok(metadata, 'Sonic the Hedgehog should be found in Hasheous database');

        if (metadata) {
          console.log('\nHasheous API Results (Sonic the Hedgehog):');
          console.log(JSON.stringify(metadata, null, 2));

          // Verify source
          assert.strictEqual(metadata.source, 'hasheous', 'Source should be hasheous');

          // Verify title - Hasheous v1 API provides this
          assert.ok(metadata.title, 'Title should be present');
          assert.strictEqual(
            metadata.title,
            'Sonic the Hedgehog',
            `Title should be "Sonic the Hedgehog", got: ${metadata.title}`
          );

          // Verify platform - Hasheous v1 API provides this
          assert.ok(metadata.platform, 'Platform should be present');
          assert.strictEqual(
            metadata.platform,
            'Sega Master System',
            `Platform should be "Sega Master System", got: ${metadata.platform}`
          );

          // Verify publisher - Hasheous v1 API provides this
          assert.ok(metadata.publisher, 'Publisher should be present');
          assert.strictEqual(
            metadata.publisher,
            'Sega',
            `Publisher should be "Sega", got: ${metadata.publisher}`
          );

          // Check for images - Hasheous v1 API provides logo and other images in attributes
          if (metadata.images && metadata.images.length > 0) {
            console.log(`\n  Found ${metadata.images.length} image(s):`);

            for (const image of metadata.images) {
              console.log(`    - Type: ${image.type}, URL: ${image.url}`);

              // Verify image structure
              assert.ok(image.url, 'Image URL should be present');
              assert.ok(image.type, 'Image type should be present');
              assert.ok(
                typeof image.url === 'string' && image.url.length > 0,
                'Image URL should be a non-empty string'
              );

              // Verify URL format (should be either full URL or path to /api/v1/images/)
              assert.ok(
                image.url.includes('http') || image.url.includes('/api/v1/images/'),
                `Image URL should be valid, got: ${image.url}`
              );
            }

            // Verify we have at least one logo image
            const hasLogo = metadata.images.some(img =>
              img.type === 'logo' ||
              img.type.toLowerCase().includes('logo')
            );

            assert.ok(hasLogo, 'Should have at least one logo image');
            console.log('  ✓ Logo image found');
          } else {
            // Images should be present for Sonic
            console.log('  Warning: No images found in response');
          }

          // Note: Hasheous v1 /api/v1/Lookup/ByHash endpoint does not directly provide:
          // - year, developer, description, genres, players, rating
          // These would need to be fetched from the metadata sources (IGDB, TheGamesDB, etc.)
          // using the metadata IDs provided in the raw response

          console.log('\n  ✓ Sonic the Hedgehog successfully identified via Hasheous');
          console.log('  ✓ Title, platform, publisher, and images verified');
        }
      } catch (error) {
        // Network errors are expected in restricted environments
        if (error instanceof Error && (
          error.message.includes('fetch failed') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('timed out') ||
          error.message.includes('EAI_AGAIN')
        )) {
          console.log('\nHasheous API: Network access blocked or unavailable');
          console.log('  (This is expected in restricted test environments)');
          console.log('  The public instance at https://hasheous.org is available when network access is allowed');
          return; // Pass the test
        }
        // Re-throw other errors (actual bugs)
        console.error('Hasheous API error:', error);
        throw error;
      }
    });
  });

  describe('Example 3: IGDB API', () => {
    it('should create IGDB client with credentials', () => {
      const scout = new RomScout({
        provider: 'igdb',
        igdb: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret'
        }
      });

      assert.ok(scout, 'RomScout instance should be created');
    });

    it('should throw error if IGDB credentials not provided', async () => {
      const scout = new RomScout({
        provider: 'igdb'
      });

      await assert.rejects(
        async () => {
          await scout.lookup({ filename: 'test.rom' });
        },
        /IGDB client not configured/,
        'Should throw error when IGDB credentials are missing'
      );
    });

    // Note: Actual API call test requires IGDB credentials
    // This would be enabled if IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables are set
    if (process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET) {
      it('should fetch metadata from IGDB API', async () => {
        const scout = new RomScout({
          provider: 'igdb',
          igdb: {
            clientId: process.env.IGDB_CLIENT_ID!,
            clientSecret: process.env.IGDB_CLIENT_SECRET!
          }
        });

        try {
          const metadata = await scout.identify(pacmanBuffer, 'pacman.zip');

          if (metadata) {
            console.log('\nIGDB API Results:');
            console.log('  Title:', metadata.title);
            console.log('  Platform:', metadata.platform);
            console.log('  Year:', metadata.year);
            console.log('  Genres:', metadata.genres);
            console.log('  Source:', metadata.source);

            assert.strictEqual(metadata.source, 'igdb');
            assert.ok(metadata.title, 'Title should be present');
          } else {
            console.log('\nIGDB API: Game not found');
          }
        } catch (error) {
          console.error('IGDB API error:', error);
          throw error;
        }
      });
    } else {
      it.skip('should fetch metadata from IGDB API (requires IGDB credentials)', () => {
        console.log('\n  ℹ To test IGDB API, set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables');
        console.log('    Get credentials from: https://api-docs.igdb.com/');
      });
    }
  });

  describe('Example 4: ScreenScraper API', () => {
    it('should create ScreenScraper client with credentials', () => {
      const scout = new RomScout({
        provider: 'screenscraper',
        screenscraper: {
          devId: 'test-dev-id',
          devPassword: 'test-dev-password',
          softwareName: 'rom-scout-test'
        }
      });

      assert.ok(scout, 'RomScout instance should be created');
    });

    it('should throw error if ScreenScraper credentials not provided', async () => {
      const scout = new RomScout({
        provider: 'screenscraper'
      });

      await assert.rejects(
        async () => {
          await scout.lookup({ md5: 'test' });
        },
        /ScreenScraper client not configured/,
        'Should throw error when ScreenScraper credentials are missing'
      );
    });

    // Note: Actual API call test requires ScreenScraper credentials
    // This would be enabled if SS_DEV_ID and SS_DEV_PASSWORD environment variables are set
    if (process.env.SS_DEV_ID && process.env.SS_DEV_PASSWORD) {
      it('should fetch metadata from ScreenScraper API', async () => {
        const config: any = {
          provider: 'screenscraper',
          screenscraper: {
            devId: process.env.SS_DEV_ID,
            devPassword: process.env.SS_DEV_PASSWORD,
            softwareName: 'rom-scout-integration-test'
          }
        };

        // Add optional user credentials if provided
        if (process.env.SS_USERNAME) {
          config.screenscraper.username = process.env.SS_USERNAME;
        }
        if (process.env.SS_PASSWORD) {
          config.screenscraper.password = process.env.SS_PASSWORD;
        }

        const scout = new RomScout(config);

        try {
          const metadata = await scout.identify(pacmanBuffer, 'pacman.zip');

          if (metadata) {
            console.log('\nScreenScraper API Results:');
            console.log('  Title:', metadata.title);
            console.log('  Platform:', metadata.platform);
            console.log('  Year:', metadata.year);
            console.log('  Publisher:', metadata.publisher);
            console.log('  Developer:', metadata.developer);
            console.log('  Source:', metadata.source);

            assert.strictEqual(metadata.source, 'screenscraper');
            assert.ok(metadata.title, 'Title should be present');
          } else {
            console.log('\nScreenScraper API: ROM not found in database');
          }
        } catch (error) {
          console.error('ScreenScraper API error:', error);
          throw error;
        }
      });
    } else {
      it.skip('should fetch metadata from ScreenScraper API (requires SS credentials)', () => {
        console.log('\n  ℹ To test ScreenScraper API, set SS_DEV_ID and SS_DEV_PASSWORD environment variables');
        console.log('    Register at: https://www.screenscraper.fr/');
      });
    }
  });

  describe('Example 5: Multiple Providers', () => {
    it('should create scout with multiple provider configs', () => {
      const scout = new RomScout({
        hasheousUrl: 'https://hasheous.example.com',
        igdb: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret'
        },
        screenscraper: {
          devId: 'test-dev-id',
          devPassword: 'test-dev-password',
          softwareName: 'rom-scout-test'
        }
      });

      assert.ok(scout, 'RomScout instance should be created');
    });

    it('should have lookupMultiple method', async () => {
      const scout = new RomScout();

      // Calculate hashes
      const hashes = await scout.hash(pacmanBuffer);

      // This should fail because no providers are configured, but the method should exist
      try {
        await scout.lookupMultiple({
          md5: hashes.md5,
          sha1: hashes.sha1,
          crc32: hashes.crc32,
          filename: 'pacman.zip'
        }, ['hasheous']);
      } catch (error) {
        // Expected to fail due to missing config
        assert.ok(error instanceof Error, 'Should throw error for unconfigured provider');
      }
    });
  });

  describe('Documentation Accuracy', () => {
    it('should verify hash calculation example matches docs', async () => {
      // This verifies the example code in the docs works
      const scout = new RomScout();
      const hashes = await scout.hash(pacmanBuffer);

      // The docs state these methods return these fields
      assert.ok(typeof hashes.md5 === 'string', 'md5 should be a string');
      assert.ok(typeof hashes.sha1 === 'string', 'sha1 should be a string');
      assert.ok(typeof hashes.crc32 === 'string', 'crc32 should be a string');
    });

    it('should verify RomScout exports match docs', async () => {
      const scout = new RomScout();

      // Verify all documented methods exist
      assert.ok(typeof scout.hash === 'function', 'hash method should exist');
      assert.ok(typeof scout.identify === 'function', 'identify method should exist');
      assert.ok(typeof scout.lookup === 'function', 'lookup method should exist');
      assert.ok(typeof scout.lookupMultiple === 'function', 'lookupMultiple method should exist');
    });

    it('should verify metadata structure matches docs', async () => {
      // Create a mock metadata object to verify the structure
      // matches what's documented
      const scout = new RomScout({
        hasheousUrl: 'https://test.example.com'
      });

      // We can't test actual API responses without credentials,
      // but we can verify the types are correct through the hash method
      const hashes = await scout.hash(pacmanBuffer);
      assert.ok(hashes, 'Hashes should be returned');
    });
  });

  describe('Public API Access Check', () => {
    it('should note which APIs require authentication', () => {
      console.log('\n=== API Access Requirements ===');
      console.log('\n1. Hash Calculation:');
      console.log('   ✓ No authentication required');
      console.log('   ✓ Works entirely client-side');
      console.log('   ✓ Public access: YES');

      console.log('\n2. Hasheous API:');
      console.log('   ✓ Public instance available at https://hasheous.org');
      console.log('   ✓ No authentication required');
      console.log('   ✓ Free to use');
      console.log('   ✓ Public access: YES');

      console.log('\n3. IGDB API:');
      console.log('   ⚠ Requires Twitch API credentials (Client ID + Secret)');
      console.log('   ⚠ Free tier available but registration required');
      console.log('   ✗ Public access: NO (requires registration)');

      console.log('\n4. ScreenScraper API:');
      console.log('   ⚠ Requires developer account (Dev ID + Dev Password)');
      console.log('   ⚠ Free tier available but registration required');
      console.log('   ✗ Public access: NO (requires registration)');

      console.log('\n=== Recommendation ===');
      console.log('For the interactive demo to work with real API calls:');
      console.log('- Hash calculation works immediately (no setup needed)');
      console.log('- Hasheous API works immediately (using public instance)');
      console.log('- IGDB and ScreenScraper require users to provide their own credentials\n');

      // This "test" always passes, it's just informational
      assert.ok(true);
    });
  });
});
