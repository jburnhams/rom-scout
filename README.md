# rom-scout

A JavaScript/TypeScript library for identifying ROM files and fetching metadata from various gaming databases. Works in both browser and Node.js environments.

## Features

- **Hash Calculation**: Calculate MD5, SHA-1, and CRC32 hashes for ROM files
- **Multiple Data Sources**: Support for Hasheous, IGDB, and ScreenScraper APIs
- **Browser & Node.js**: Works seamlessly in both environments
- **TypeScript**: Full TypeScript support with type definitions
- **Multi-format**: Available as ESM, CommonJS, and browser bundles

## TypeScript Support

rom-scout includes full TypeScript definitions. All public types are exported so
you can import them directly from the package:

```typescript
import {
  RomScout,
  RomMetadata,
  ImageMetadata,
  RomScoutConfig
} from 'rom-scout';
```

When working with image metadata you can take advantage of the richer
structure exposed by the `images` array. For example, to grab a game's box art
you can filter by the `type` property:

```typescript
const metadata = await scout.identify(file);

const boxArt = metadata?.images?.find((image) => image.type === 'boxart');
const firstImage = metadata?.images?.[0];
```

The array shape allows you to store multiple images (box art, screenshots,
title screens, etc.) alongside any metadata that accompanies each image.

## Installation

```bash
npm install rom-scout
```

## Quick Start

### Browser Usage

```html
<!-- Using ESM bundle -->
<script type="module">
  import { RomScout } from 'https://unpkg.com/rom-scout/dist/bundles/rom-scout.esm.js';

  const scout = new RomScout({
    provider: 'hasheous',
    hasheousUrl: 'https://your-hasheous-instance.com'
  });

  // Handle file input
  document.getElementById('rom-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];

    // Identify the ROM
    const metadata = await scout.identify(file);

    if (metadata) {
      console.log('Game:', metadata.title);
      console.log('Platform:', metadata.platform);
      console.log('Year:', metadata.year);
      console.log('Cover art:', metadata.images);
    }
  });
</script>

<!-- Or using IIFE bundle -->
<script src="https://unpkg.com/rom-scout/dist/browser/rom-scout.min.js"></script>
<script>
  const scout = new RomScout.RomScout({
    hasheousUrl: 'https://your-hasheous-instance.com'
  });
</script>
```

### Node.js Usage

```typescript
import { RomScout } from 'rom-scout';
import { readFileSync } from 'fs';

// Create a scout instance
const scout = new RomScout({
  provider: 'hasheous',
  hasheousUrl: 'https://your-hasheous-instance.com'
});

// Load a ROM file
const romData = readFileSync('pacman.zip');

// Identify the ROM
const metadata = await scout.identify(romData, 'pacman.zip');

console.log('Game:', metadata.title);
console.log('Platform:', metadata.platform);
console.log('Publisher:', metadata.publisher);
console.log('Year:', metadata.year);
console.log('Description:', metadata.description);

// Access cover art and screenshots
if (metadata.images) {
  for (const image of metadata.images) {
    console.log(`${image.type}: ${image.url}`);
  }
}
```

## Browser Build Warnings

rom-scout now detects the active runtime at execution time. When the Web Crypto
API is available (including modern browsers and recent versions of Node.js) it
is used automatically, preventing Node-specific modules from being bundled into
browser builds. If your tooling still surfaces a warning such as:

> Module "crypto" has been externalized for browser compatibility

the message can usually be ignored. Alternatively, configure your bundler to
externalize Node built-ins or provide a lightweight polyfill so that any
remaining dynamic imports resolve cleanly in browser-only builds.

## API Providers

### Hasheous

[Hasheous](https://github.com/Hasheous/Hasheous) is an open-source ROM metadata server.

```typescript
const scout = new RomScout({
  provider: 'hasheous',
  hasheousUrl: 'https://your-hasheous-instance.com',
  timeout: 30000 // optional, in milliseconds
});
```

### IGDB (Internet Game Database)

Requires API credentials from [IGDB](https://api-docs.igdb.com/).

```typescript
const scout = new RomScout({
  provider: 'igdb',
  igdb: {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret'
  }
});
```

**Note:** IGDB doesn't support hash-based lookups, so it uses filename matching.

### ScreenScraper

Requires account from [ScreenScraper](https://www.screenscraper.fr/).

```typescript
const scout = new RomScout({
  provider: 'screenscraper',
  screenscraper: {
    devId: 'your-dev-id',
    devPassword: 'your-dev-password',
    softwareName: 'your-app-name',
    username: 'optional-username',
    password: 'optional-password'
  }
});
```

## API Reference

### RomScout Class

#### `constructor(config?: RomScoutConfig)`

Create a new RomScout instance.

```typescript
interface RomScoutConfig {
  provider?: 'hasheous' | 'igdb' | 'screenscraper';
  hasheousUrl?: string;
  igdb?: {
    clientId: string;
    clientSecret: string;
  };
  screenscraper?: {
    devId: string;
    devPassword: string;
    softwareName: string;
    username?: string;
    password?: string;
  };
  timeout?: number;
}
```

#### `identify(data, filename?)`

Identify a ROM file and fetch metadata.

```typescript
async identify(
  data: File | Blob | ArrayBuffer | Uint8Array | Buffer,
  filename?: string
): Promise<RomMetadata | null>
```

**Parameters:**
- `data`: ROM file data
- `filename`: Optional filename (extracted from File object if not provided)

**Returns:** ROM metadata or null if not found

#### `hash(data)`

Calculate hashes for ROM data without fetching metadata.

```typescript
async hash(
  data: File | Blob | ArrayBuffer | Uint8Array | Buffer
): Promise<{ md5: string; sha1: string; crc32: string }>
```

#### `lookup(request)`

Look up ROM metadata using hash information.

```typescript
async lookup(request: HashLookupRequest): Promise<RomMetadata | null>

interface HashLookupRequest {
  md5?: string;
  sha1?: string;
  crc32?: string;
  size?: number;
  filename?: string;
}
```

#### `lookupMultiple(request, providers?)`

Try multiple providers in sequence until metadata is found.

```typescript
async lookupMultiple(
  request: HashLookupRequest,
  providers?: Array<'hasheous' | 'igdb' | 'screenscraper'>
): Promise<RomMetadata | null>
```

### Standalone Functions

#### `calculateHash(data, types?)`

Calculate hash(es) for data.

```typescript
async function calculateHash(
  data: Uint8Array | ArrayBuffer | Buffer,
  types?: ('md5' | 'sha1' | 'crc32')[]
): Promise<HashResult>

interface HashResult {
  md5?: string;
  sha1?: string;
  crc32?: string;
}
```

#### `calculateSingleHash(data, type)`

Calculate a single hash type.

```typescript
async function calculateSingleHash(
  data: Uint8Array | ArrayBuffer | Buffer,
  type: 'md5' | 'sha1' | 'crc32'
): Promise<string>
```

### Types

#### RomMetadata

```typescript
interface RomMetadata {
  title: string;
  platform?: string;
  year?: number;
  publisher?: string;
  developer?: string;
  description?: string;
  genres?: string[];
  players?: string;
  images?: ImageMetadata[];
  rating?: number;
  source: string;
  raw?: unknown;
}
```

#### ImageMetadata

```typescript
interface ImageMetadata {
  url: string;
  type: string;
  resolution?: string;
  thumbnail?: string;
}
```

## Examples

### Hash Only (No API Call)

```typescript
import { RomScout } from 'rom-scout';

const scout = new RomScout();
const romData = await fetch('rom.zip').then(r => r.arrayBuffer());

const hashes = await scout.hash(romData);
console.log('MD5:', hashes.md5);
console.log('SHA-1:', hashes.sha1);
console.log('CRC32:', hashes.crc32);
```

### Try Multiple Providers

```typescript
const scout = new RomScout({
  hasheousUrl: 'https://hasheous.example.com',
  igdb: {
    clientId: 'your-id',
    clientSecret: 'your-secret'
  }
});

const request = {
  md5: 'abc123...',
  sha1: 'def456...',
  filename: 'game.rom'
};

// Try Hasheous first, then IGDB if not found
const metadata = await scout.lookupMultiple(request, ['hasheous', 'igdb']);
```

### Browser File Upload Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>ROM Scout Demo</title>
</head>
<body>
  <input type="file" id="rom-file" accept=".zip,.rom,.nes,.snes,.gb,.gba">
  <div id="result"></div>

  <script type="module">
    import { RomScout } from 'https://unpkg.com/rom-scout/dist/bundles/rom-scout.esm.js';

    const scout = new RomScout({
      hasheousUrl: 'https://your-hasheous-instance.com'
    });

    document.getElementById('rom-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const result = document.getElementById('result');
      result.innerHTML = 'Processing...';

      try {
        const metadata = await scout.identify(file);

        if (metadata) {
          result.innerHTML = `
            <h2>${metadata.title}</h2>
            <p><strong>Platform:</strong> ${metadata.platform || 'Unknown'}</p>
            <p><strong>Year:</strong> ${metadata.year || 'Unknown'}</p>
            <p><strong>Publisher:</strong> ${metadata.publisher || 'Unknown'}</p>
            <p><strong>Description:</strong> ${metadata.description || 'No description'}</p>
            ${metadata.images && metadata.images.length > 0 ? `
              <img src="${metadata.images[0].url}" alt="Cover" style="max-width: 300px">
            ` : ''}
          `;
        } else {
          result.innerHTML = 'ROM not found in database';
        }
      } catch (error) {
        result.innerHTML = `Error: ${error.message}`;
      }
    });
  </script>
</body>
</html>
```

## Supported Hash Algorithms

- **MD5**: 128-bit hash, commonly used for ROM identification
- **SHA-1**: 160-bit hash, more secure than MD5
- **CRC32**: 32-bit checksum, fast and widely used

All hash calculations work in both browser (using Web Crypto API and pure JS) and Node.js (using crypto module).

## Browser Compatibility

- Chrome/Edge 37+
- Firefox 34+
- Safari 11+
- Any browser with Web Crypto API support

## Node.js Compatibility

- Node.js 20.0.0 or higher

## Development

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Run all tests (including browser)
npm run test:all

# Check bundle sizes
npm run size

# Generate coverage report
npm run coverage
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [Hasheous](https://github.com/Hasheous/Hasheous) - Open-source ROM metadata server
- [IGDB](https://www.igdb.com/) - Internet Game Database
- [ScreenScraper](https://www.screenscraper.fr/) - ROM metadata service
- [crc-32](https://github.com/SheetJS/js-crc32) - CRC32 implementation

## Related Projects

- [Hasheous](https://github.com/Hasheous/Hasheous) - Self-hosted ROM metadata server
- [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) - Browser-based emulation
- [RetroArch](https://www.retroarch.com/) - Multi-platform emulator frontend
