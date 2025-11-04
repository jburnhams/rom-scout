# JavaScript/TypeScript Library Template

A production-ready template for creating npm libraries with TypeScript, comprehensive testing, and automated CI/CD.

## Features

- **TypeScript** with strict mode and multiple build targets
- **Multi-format distribution**: ESM, CommonJS, and Browser bundles
- **Testing**: Node.js built-in test framework with coverage reporting
- **Browser testing**: Automated browser bundle validation
- **GitHub Actions CI/CD**:
  - Multi-version Node.js testing (20.x, 22.x, 24.x, 25.x)
  - Automated version bumping and releases
  - NPM publishing with OIDC (no stored credentials)
  - GitHub Pages deployment for documentation
  - Dependency review for security
- **Bundle size enforcement**: Automated size budget checks
- **Smoke tests**: Validate ESM and CJS exports

## Getting Started

### 1. Clone this template

```bash
git clone <this-repo> my-new-library
cd my-new-library
```

### 2. Customize for your project

Update the following in `package.json`:
- `name`: Your library name
- `version`: Start version (e.g., "0.1.0")
- `description`: What your library does
- `repository.url`: Your GitHub repository URL
- `keywords`: Relevant keywords
- `author`: Your name
- `dependencies`: Add any runtime dependencies you need

Update bundle size limits in `scripts/check-bundle-size.mjs` if needed:
- `BUNDLE_LIMIT`: Default 100KB for browser bundle
- `GZIP_LIMIT`: Default 50KB for gzipped bundle
- `ESM_LIMIT`: Default 200KB for ESM bundle

### 3. Update exports

Edit `scripts/smoke-esm.mjs` and `scripts/smoke-cjs.cjs` to match your library's exports.

Example:
```javascript
// Change this:
assert.strictEqual(typeof mod.hello, 'function', 'ESM build should export hello');

// To match your exports:
assert.strictEqual(typeof mod.myFunction, 'function', 'ESM build should export myFunction');
```

### 4. Write your code

Replace the example code in `src/index.ts` with your library code.
Add tests alongside your source files as `*.test.ts`.

### 5. Install dependencies

```bash
npm install
```

### 6. Build and test

```bash
# Run all tests (unit + browser)
npm run test:all

# Run just unit tests
npm test

# Run with coverage
npm run coverage

# Build the library
npm run build

# Check bundle sizes
npm run size
```

## Project Structure

```
.
├── .github/workflows/    # GitHub Actions workflows
│   ├── ci.yml           # Continuous integration
│   ├── release.yml      # Version bumping and releases
│   ├── npm-publish.yml  # NPM publishing
│   ├── github-pages.yml # Documentation deployment
│   └── dependency-review.yml
├── scripts/             # Build and utility scripts
│   ├── clean.mjs        # Clean build artifacts
│   ├── build-bundles.mjs # Generate ESM and browser bundles
│   ├── build-browser-bundle.js # Package docs
│   ├── check-bundle-size.mjs # Enforce size budgets
│   ├── smoke-esm.mjs    # Test ESM exports
│   └── smoke-cjs.cjs    # Test CJS exports
├── src/                 # Source code
│   ├── index.ts         # Main entry point
│   └── *.test.ts        # Unit tests
├── tests/               # Additional tests
│   └── browser.test.ts  # Browser bundle tests
├── docs/                # Documentation (optional)
├── tsconfig.*.json      # TypeScript configurations
├── package.json         # Project metadata
└── .gitignore          # Git ignore rules
```

## Available Scripts

- `npm run clean` - Remove build artifacts
- `npm run build` - Build all formats (ESM, CJS, bundles)
- `npm run build:esm` - Build ESM only
- `npm run build:cjs` - Build CommonJS only
- `npm run build:bundles` - Build browser bundles
- `npm run build:docs` - Build documentation assets
- `npm test` - Run unit tests
- `npm run test:browser` - Run browser tests
- `npm run test:all` - Run all tests
- `npm run coverage` - Generate coverage report
- `npm run smoke` - Run smoke tests
- `npm run size` - Check bundle sizes
- `npm run prepublishOnly` - Pre-publish checks (runs automatically)

## GitHub Actions Setup

### Required Secrets

For automated releases and NPM publishing, configure these secrets in your GitHub repository:

1. **RELEASE_TOKEN**: A GitHub Personal Access Token with `repo` and `packages:write` permissions
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Create a token with appropriate permissions
   - Add it to your repository secrets as `RELEASE_TOKEN`

2. **NPM Publishing**: This template uses OIDC for npm publishing (no token storage required)
   - Configure your npm account for provenance: https://docs.npmjs.com/generating-provenance-statements
   - No additional secrets needed!

### Automated Version Bumping

Commits to `main` trigger automatic version bumping based on commit messages:

- **Patch** (0.0.x): Include `patch`, `fix`, or `fixes` in commit message
- **Minor** (0.x.0): Include `minor`, `feat`, or `feature` in commit message
- **Major** (x.0.0): Include `major` or `breaking` in commit message
- **Pre-release**: Include `rc`, `pre`, `beta`, or `alpha` in commit message

Example:
```bash
git commit -m "feat: add new feature"  # Bumps minor version
git commit -m "fix: resolve bug"       # Bumps patch version
```

### GitHub Pages

To enable GitHub Pages:
1. Go to repository Settings → Pages
2. Set Source to "GitHub Actions"
3. The workflow will deploy `docs-dist/` to GitHub Pages

Add your documentation HTML/assets to a `docs/` directory, and they'll be copied to the deployment.

## Distribution Formats

### ESM (ES Modules)
```javascript
import { hello, Greeter } from 'my-library';
```

### CommonJS
```javascript
const { hello, Greeter } = require('my-library');
```

### Browser (IIFE)
```html
<script src="https://unpkg.com/my-library/dist/browser/my-library.min.js"></script>
<script>
  const greeting = MyLibrary.hello('World');
</script>
```

### Browser (ESM)
```html
<script type="module">
  import { hello } from 'https://unpkg.com/my-library/dist/bundles/my-library.esm.js';
  console.log(hello('World'));
</script>
```

## Testing

This template uses Node.js built-in test framework (no Jest, Mocha, etc. required).

### Writing Tests

Create test files alongside your source code:

```typescript
// src/mymodule.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { myFunction } from './mymodule.js';

describe('myFunction', () => {
  it('should work correctly', () => {
    assert.strictEqual(myFunction(), 'expected result');
  });
});
```

### Browser Testing

Browser tests validate that your bundles work in browser environments:

```typescript
// tests/browser.test.ts
import { test } from 'node:test';
import assert from 'node:assert';

test('bundle exports work', async () => {
  const mod = await import('./dist/bundles/my-library.esm.js');
  assert.strictEqual(typeof mod.myFunction, 'function');
});
```

## Dependencies

- **Development**:
  - `typescript` - TypeScript compiler
  - `@types/node` - Node.js type definitions
  - `c8` - Code coverage tool
  - `happy-dom` - Lightweight DOM for browser testing

- **Production**: Add your runtime dependencies to `package.json`

## Customization

### Change Bundle Size Limits

Edit `scripts/check-bundle-size.mjs`:

```javascript
const BUNDLE_LIMIT = 100 * 1024;  // 100KB
const GZIP_LIMIT = 50 * 1024;     // 50KB
const ESM_LIMIT = 200 * 1024;     // 200KB
```

### Add Linting

This template doesn't include ESLint/Prettier by default. To add them:

```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

Then configure `.eslintrc.json` and `.prettierrc` to your preferences.

### Customize TypeScript

The template includes 5 TypeScript configurations:
- `tsconfig.base.json` - Shared base configuration
- `tsconfig.json` - Root config (type checking only)
- `tsconfig.esm.json` - ESM build
- `tsconfig.cjs.json` - CommonJS build
- `tsconfig.tests.json` - Test build

Modify these to match your needs (e.g., change target, add paths, etc.).

## Publishing

### Manual Publishing

```bash
npm run build
npm test
npm publish
```

### Automated Publishing

When you create a GitHub release (triggered automatically by version bump), the library is automatically published to npm via GitHub Actions.

## License

MIT (or update to your preferred license in `package.json`)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass: `npm run test:all`
5. Submit a pull request

## Troubleshooting

### Tests fail with "Module not found"

Run `npm run build` before running tests. The tests import from the built output.

### Bundle size check fails

Either optimize your code or update the limits in `scripts/check-bundle-size.mjs`.

### GitHub Actions fail on release

Ensure `RELEASE_TOKEN` is configured in repository secrets with appropriate permissions.

### NPM publish fails

1. Check that your npm account has 2FA enabled
2. Verify OIDC is configured: https://docs.npmjs.com/generating-provenance-statements
3. Ensure package name is available on npm
