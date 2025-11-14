# rom-scout

rom-scout is an end-to-end toolkit for working with classic game ROMs. It
identifies files via hashing, fetches metadata from a Hasheous server, and can
boot games directly in the browser through the built-in EmulatorJS-powered
player.

## Highlights

- **File identification** – calculate MD5/SHA-1/CRC32 hashes for ROMs and zip
  archives.
- **Metadata lookup** – query Hasheous for titles, platforms, artwork, and more.
- **Emulator playback** – launch ROMs with the bundled `RomPlayer` class to
  embed EmulatorJS in a web page.
- **Universal delivery** – ship as ESM, CommonJS, and browser bundles with full
  TypeScript definitions.

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

## Quick start

### Identify a ROM (Node.js or browser bundler)

```ts
import { RomScout } from 'rom-scout';

const scout = new RomScout({
  provider: 'hasheous',
  hasheousUrl: 'https://your-hasheous-instance.com',
});

const metadata = await scout.identify(fileOrBuffer, 'optional-filename.zip');

console.log(metadata?.title);
console.log(metadata?.images?.map((image) => `${image.type}: ${image.url}`));
```

### Launch a ROM in the browser

```ts
import { RomPlayer } from 'rom-scout';

const player = await RomPlayer.start({
  romUrl: '/roms/super-mario-world.smc',
  metadata,
  mountNode: document.getElementById('player'),
});

// Persist manual saves in IndexedDB
await player.persistSave();

// Tear down when leaving the page
await player.destroy();
```

For zero-build sites you can load the browser bundle instead:

```html
<script type="module">
  import { RomScout, RomPlayer } from 'https://unpkg.com/rom-scout/dist/bundles/rom-scout.esm.js';

  const scout = new RomScout({ hasheousUrl: 'https://your-hasheous-instance.com' });
  const metadata = await scout.identify(file);

  await RomPlayer.start({
    romData: file,
    metadata,
    mountNode: document.querySelector('#player'),
  });
</script>
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

## API Reference

### RomScout Class

#### `constructor(config?: RomScoutConfig)`

Create a new RomScout instance.

```typescript
interface RomScoutConfig {
  provider?: 'hasheous';
  hasheousUrl?: string;
  corsProxy?: string;
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
  providers?: Array<'hasheous'>
): Promise<RomMetadata | null>
```

### RomPlayer class

`RomPlayer` wraps EmulatorJS with lifecycle helpers and IndexedDB persistence.

- `static async start(options: RomPlayerOptions): Promise<RomPlayerInstance>` –
  boot a ROM from a URL or binary blob and mount the emulator into a DOM node.
- `persistSave(options?)` – snapshot manual or auto saves into IndexedDB so they
  can be restored on the next launch.
- `destroy()` – tear down the EmulatorJS instance, remove listeners, and release
  persistent saves.

The `RomPlayerInstance` returned from `start` also surfaces helpers such as
`restart`, `clearPersistedSave`, and `exportSave` for advanced workflows.

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
  id: string;
  persistId?: string;
  alternateIds?: string[];
  title: string;
  platform?: string;
  publisher?: string;
  images?: ImageMetadata[];
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
            <p><strong>Publisher:</strong> ${metadata.publisher || 'Unknown'}</p>
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
- [crc-32](https://github.com/SheetJS/js-crc32) - CRC32 implementation

## Related Projects

- [Hasheous](https://github.com/Hasheous/Hasheous) - Self-hosted ROM metadata server
- [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) - Browser-based emulation
- [RetroArch](https://www.retroarch.com/) - Multi-platform emulator frontend
