/**
 * Interactive demo for rom-scout library
 */

// Import the library from local build
let RomScout;
try {
  const module = await import('./rom-scout.esm.js');
  RomScout = module.RomScout;
  console.log('Loaded rom-scout from local build');
} catch (error) {
  console.error('Failed to load rom-scout library:', error);

  // Show error on page
  document.body.insertAdjacentHTML('afterbegin', `
    <div style="background-color: #fee; border: 2px solid #c33; padding: 1rem; margin: 1rem; border-radius: 4px;">
      <h3 style="color: #c33; margin-top: 0;">⚠️ Library Load Error</h3>
      <p><strong>Failed to load rom-scout library:</strong></p>
      <pre style="background: white; padding: 0.5rem; border-radius: 4px; overflow-x: auto;">${escapeHtml(error.message)}</pre>
      <p style="margin-bottom: 0;">Please ensure the library is built. Run <code>npm run build:docs</code> to generate the required files.</p>
    </div>
  `);

  throw error;
}

// Global state
let pacmanFile = null;
let sonicFile = null;
let currentRomFile = null;

/**
 * Load the pacman.zip file
 */
async function loadPacmanFile() {
  try {
    const response = await fetch('pacman.zip');
    if (!response.ok) {
      throw new Error('Failed to load pacman.zip');
    }
    const arrayBuffer = await response.arrayBuffer();
    // Create a File-like object
    pacmanFile = new File([arrayBuffer], 'pacman.zip', { type: 'application/zip' });
    console.log('Loaded pacman.zip:', pacmanFile.size, 'bytes');
  } catch (error) {
    console.error('Error loading pacman.zip:', error);
    showError('Failed to load Pac-Man ROM file');
  }
}

/**
 * Load the sonic.bin file
 */
async function loadSonicFile() {
  try {
    const response = await fetch('sonic.bin');
    if (!response.ok) {
      throw new Error('Failed to load sonic.bin');
    }
    const arrayBuffer = await response.arrayBuffer();
    // Create a File-like object
    sonicFile = new File([arrayBuffer], 'sonic.bin', { type: 'application/octet-stream' });
    console.log('Loaded sonic.bin:', sonicFile.size, 'bytes');
  } catch (error) {
    console.error('Error loading sonic.bin:', error);
    showError('Failed to load Sonic ROM file');
  }
}

/**
 * Show loading state in result area
 */
function showLoading(resultId) {
  const resultEl = document.getElementById(resultId);
  resultEl.className = 'result loading';
  resultEl.innerHTML = '<span class="spinner"></span> Processing...';
}

/**
 * Show success result
 */
function showSuccess(resultId, content) {
  const resultEl = document.getElementById(resultId);
  resultEl.className = 'result success';
  resultEl.innerHTML = content;
}

/**
 * Show error result
 */
function showError(resultId, error) {
  const resultEl = document.getElementById(resultId);
  resultEl.className = 'result error';
  const message = error instanceof Error ? error.message : String(error);
  resultEl.innerHTML = `<strong>Error:</strong> ${escapeHtml(message)}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format hash results as HTML
 */
function formatHashResult(hashes, filename = '') {
  return `
    <div class="result-title">Hash Calculation Results${filename ? ` - ${escapeHtml(filename)}` : ''}</div>
    <div class="result-field"><strong>MD5:</strong> ${hashes.md5}</div>
    <div class="result-field"><strong>SHA-1:</strong> ${hashes.sha1}</div>
    <div class="result-field"><strong>CRC32:</strong> ${hashes.crc32}</div>
    <div class="result-field" style="margin-top: 1rem; color: #059669;">
      ✓ Hashes calculated successfully
    </div>
  `;
}

/**
 * Format metadata results as HTML
 */
function formatMetadataResult(metadata) {
  if (!metadata) {
    return `
      <div class="result-title">No Results Found</div>
      <p>The ROM was not found in the database.</p>
    `;
  }

  let html = `<div class="result-title">${escapeHtml(metadata.title)}</div>`;

  if (metadata.platform) {
    html += `<div class="result-field"><strong>Platform:</strong> ${escapeHtml(metadata.platform)}</div>`;
  }

  if (metadata.year) {
    html += `<div class="result-field"><strong>Year:</strong> ${metadata.year}</div>`;
  }

  if (metadata.publisher) {
    html += `<div class="result-field"><strong>Publisher:</strong> ${escapeHtml(metadata.publisher)}</div>`;
  }

  if (metadata.developer) {
    html += `<div class="result-field"><strong>Developer:</strong> ${escapeHtml(metadata.developer)}</div>`;
  }

  if (metadata.genres && metadata.genres.length > 0) {
    html += `<div class="result-field"><strong>Genres:</strong> ${metadata.genres.map(escapeHtml).join(', ')}</div>`;
  }

  if (metadata.players) {
    html += `<div class="result-field"><strong>Players:</strong> ${escapeHtml(metadata.players)}</div>`;
  }

  if (metadata.rating) {
    html += `<div class="result-field"><strong>Rating:</strong> ${metadata.rating}/100</div>`;
  }

  if (metadata.description) {
    const truncated = metadata.description.length > 200
      ? metadata.description.substring(0, 200) + '...'
      : metadata.description;
    html += `<div class="result-field" style="margin-top: 0.5rem;"><strong>Description:</strong><br>${escapeHtml(truncated)}</div>`;
  }

  html += `<div class="result-field" style="margin-top: 1rem; color: #6b7280;"><strong>Source:</strong> ${escapeHtml(metadata.source)}</div>`;

  // Display images if available
  if (metadata.images && metadata.images.length > 0) {
    html += '<div class="result-images">';
    for (const image of metadata.images.slice(0, 3)) {
      html += `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.type)}" class="result-image" />`;
    }
    html += '</div>';
  }

  return html;
}

/**
 * Get the selected ROM file
 */
function getSelectedRomFile(resultId) {
  const romSelect = document.querySelector(`[data-result="${resultId}"] select`);
  if (!romSelect) {
    // Fallback to pacman if no selector
    return pacmanFile;
  }

  const selectedRom = romSelect.value;
  if (selectedRom === 'sonic') {
    return sonicFile;
  }
  return pacmanFile;
}

/**
 * Example 1: Calculate hashes
 */
async function runHashExample() {
  const romFile = getSelectedRomFile('result-hash');

  if (!romFile) {
    showError('result-hash', 'ROM file not loaded');
    return;
  }

  showLoading('result-hash');

  try {
    const scout = new RomScout();
    const hashes = await scout.hash(romFile);

    console.log('Hash results:', hashes);
    showSuccess('result-hash', formatHashResult(hashes, romFile.name));
  } catch (error) {
    console.error('Hash calculation error:', error);
    showError('result-hash', error);
  }
}

/**
 * Example 2: Hasheous API
 */
async function runHasheousExample() {
  // Check if custom file is selected
  const romSelect = document.getElementById('hasheous-rom-select');
  let romFile;

  if (romSelect && romSelect.value === 'custom') {
    const fileInput = document.getElementById('hasheous-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      showError('result-hasheous', 'Please select a file');
      return;
    }
    romFile = fileInput.files[0];
  } else {
    romFile = getSelectedRomFile('result-hasheous');
  }

  if (!romFile) {
    showError('result-hasheous', 'ROM file not loaded');
    return;
  }

  const hasheousUrl = document.getElementById('hasheous-url').value.trim();
  if (!hasheousUrl) {
    showError('result-hasheous', 'Please enter a Hasheous URL');
    return;
  }

  showLoading('result-hasheous');

  try {
    // Detect if we're on GitHub Pages and need a CORS proxy
    const isGitHubPages = window.location.hostname.endsWith('.github.io');
    const corsProxy = isGitHubPages ? 'https://proxy.corsfix.com/?' : undefined;

    if (corsProxy) {
      console.log('GitHub Pages detected, using CORS proxy:', corsProxy);
    }

    const scout = new RomScout({
      provider: 'hasheous',
      hasheousUrl: hasheousUrl,
      corsProxy: corsProxy
    });

    const metadata = await scout.identify(romFile);

    console.log('Hasheous result:', metadata);
    showSuccess('result-hasheous', formatMetadataResult(metadata));
  } catch (error) {
    console.error('Hasheous API error:', error);
    showError('result-hasheous', error);
  }
}

/**
 * Example 3: IGDB API
 */
async function runIgdbExample() {
  const romFile = getSelectedRomFile('result-igdb');

  if (!romFile) {
    showError('result-igdb', 'ROM file not loaded');
    return;
  }

  const clientId = document.getElementById('igdb-client-id').value.trim();
  const clientSecret = document.getElementById('igdb-client-secret').value.trim();

  if (!clientId || !clientSecret) {
    showError('result-igdb', 'Please enter both Client ID and Client Secret');
    return;
  }

  showLoading('result-igdb');

  try {
    const scout = new RomScout({
      provider: 'igdb',
      igdb: {
        clientId: clientId,
        clientSecret: clientSecret
      }
    });

    const metadata = await scout.identify(romFile);

    console.log('IGDB result:', metadata);
    showSuccess('result-igdb', formatMetadataResult(metadata));
  } catch (error) {
    console.error('IGDB API error:', error);
    showError('result-igdb', error);
  }
}

/**
 * Example 4: ScreenScraper API
 */
async function runScreenScraperExample() {
  const romFile = getSelectedRomFile('result-screenscraper');

  if (!romFile) {
    showError('result-screenscraper', 'ROM file not loaded');
    return;
  }

  const devId = document.getElementById('ss-dev-id').value.trim();
  const devPassword = document.getElementById('ss-dev-password').value.trim();
  const username = document.getElementById('ss-username').value.trim();
  const password = document.getElementById('ss-password').value.trim();

  if (!devId || !devPassword) {
    showError('result-screenscraper', 'Please enter both Dev ID and Dev Password');
    return;
  }

  showLoading('result-screenscraper');

  try {
    const config = {
      provider: 'screenscraper',
      screenscraper: {
        devId: devId,
        devPassword: devPassword,
        softwareName: 'rom-scout-demo'
      }
    };

    // Add optional credentials if provided
    if (username) config.screenscraper.username = username;
    if (password) config.screenscraper.password = password;

    const scout = new RomScout(config);
    const metadata = await scout.identify(romFile);

    console.log('ScreenScraper result:', metadata);
    showSuccess('result-screenscraper', formatMetadataResult(metadata));
  } catch (error) {
    console.error('ScreenScraper API error:', error);
    showError('result-screenscraper', error);
  }
}

/**
 * Initialize the demo
 */
async function init() {
  try {
    console.log('Initializing rom-scout demo...');

    // Load the test ROM files
    await Promise.all([
      loadPacmanFile(),
      loadSonicFile()
    ]);

    // Set up event listener for Hasheous ROM select
    const hasheousRomSelect = document.getElementById('hasheous-rom-select');
    const hasheousCustomFile = document.getElementById('hasheous-custom-file');
    if (hasheousRomSelect && hasheousCustomFile) {
      hasheousRomSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          hasheousCustomFile.style.display = 'block';
        } else {
          hasheousCustomFile.style.display = 'none';
        }
      });
    }

    // Set up event listeners for run buttons
    const runButtons = document.querySelectorAll('.run-btn');
    runButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const example = e.target.dataset.example;
        console.log('Running example:', example);

        // Disable button during execution
        button.disabled = true;

        try {
          switch (example) {
            case 'hash':
              await runHashExample();
              break;
            case 'hasheous':
              await runHasheousExample();
              break;
            case 'igdb':
              await runIgdbExample();
              break;
            case 'screenscraper':
              await runScreenScraperExample();
              break;
            default:
              console.error('Unknown example:', example);
          }
        } catch (error) {
          console.error(`Error running example ${example}:`, error);
          // Error will be displayed in the result area by the individual example functions
        } finally {
          // Re-enable button
          button.disabled = false;
        }
      });
    });

    console.log('Demo initialized successfully');
  } catch (error) {
    console.error('Failed to initialize demo:', error);

    // Show initialization error on page
    document.body.insertAdjacentHTML('afterbegin', `
      <div style="background-color: #fee; border: 2px solid #c33; padding: 1rem; margin: 1rem; border-radius: 4px;">
        <h3 style="color: #c33; margin-top: 0;">⚠️ Initialization Error</h3>
        <p><strong>Failed to initialize demo:</strong></p>
        <pre style="background: white; padding: 0.5rem; border-radius: 4px; overflow-x: auto;">${escapeHtml(error.message)}</pre>
      </div>
    `);

    throw error;
  }
}

// Global error handler to catch and display unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);

  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'background-color: #fee; border: 2px solid #c33; padding: 1rem; margin: 1rem; border-radius: 4px; position: fixed; top: 10px; right: 10px; max-width: 400px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
  errorDiv.innerHTML = `
    <h3 style="color: #c33; margin-top: 0; font-size: 1rem;">⚠️ Error</h3>
    <pre style="background: white; padding: 0.5rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; margin: 0;">${escapeHtml(event.error?.message || event.message || 'Unknown error')}</pre>
    <button onclick="this.parentElement.remove()" style="margin-top: 0.5rem; padding: 0.25rem 0.5rem; background: #c33; color: white; border: none; border-radius: 4px; cursor: pointer;">Dismiss</button>
  `;
  document.body.appendChild(errorDiv);
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);

  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'background-color: #fee; border: 2px solid #c33; padding: 1rem; margin: 1rem; border-radius: 4px; position: fixed; top: 10px; right: 10px; max-width: 400px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
  errorDiv.innerHTML = `
    <h3 style="color: #c33; margin-top: 0; font-size: 1rem;">⚠️ Promise Rejection</h3>
    <pre style="background: white; padding: 0.5rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; margin: 0;">${escapeHtml(event.reason?.message || String(event.reason) || 'Unknown error')}</pre>
    <button onclick="this.parentElement.remove()" style="margin-top: 0.5rem; padding: 0.25rem 0.5rem; background: #c33; color: white; border: none; border-radius: 4px; cursor: pointer;">Dismiss</button>
  `;
  document.body.appendChild(errorDiv);
});

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
