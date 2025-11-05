/**
 * ROM Player - Interactive ROM player with automatic metadata fetching
 */

// Import the library from local build
let RomScout, extractZipFiles;
try {
  const module = await import('./rom-scout.esm.js');
  RomScout = module.RomScout;
  extractZipFiles = module.extractZipFiles;
  console.log('Loaded rom-scout from local build');
} catch (error) {
  console.error('Failed to load rom-scout library:', error);
  alert('Failed to load rom-scout library. Please ensure the library is built.');
  throw error;
}

// ROM storage
const roms = [];

// Initialize RomScout with Hasheous
const scout = new RomScout({
  provider: 'hasheous',
  hasheousUrl: 'https://hasheous.org',
  corsProxy: window.location.hostname.endsWith('.github.io') ? 'https://proxy.corsfix.com/?' : undefined
});

/**
 * Platform detection based on file extension and metadata
 */
function detectPlatform(filename, metadata) {
  if (metadata && metadata.platform) {
    // Map common platform names to EmulatorJS cores
    const platformMap = {
      'arcade': 'mame',
      'mame': 'mame',
      'sega master system': 'segaMS',
      'master system': 'segaMS',
      'sms': 'segaMS',
      'game gear': 'segaGG',
      'gg': 'segaGG',
      'genesis': 'segaMD',
      'mega drive': 'segaMD',
      'sega genesis': 'segaMD',
      'nes': 'nes',
      'nintendo entertainment system': 'nes',
      'snes': 'snes',
      'super nintendo': 'snes',
      'game boy': 'gb',
      'gameboy': 'gb',
      'game boy color': 'gbc',
      'gameboy color': 'gbc',
      'game boy advance': 'gba',
      'gameboy advance': 'gba',
    };

    const platformLower = metadata.platform.toLowerCase();
    for (const [key, value] of Object.entries(platformMap)) {
      if (platformLower.includes(key)) {
        return value;
      }
    }
  }

  // Fallback to extension-based detection
  const ext = filename.toLowerCase().split('.').pop();
  const extMap = {
    'nes': 'nes',
    'snes': 'snes',
    'smc': 'snes',
    'gba': 'gba',
    'gb': 'gb',
    'gbc': 'gbc',
    'bin': 'segaMS', // Could also be Genesis, but default to SMS
    'smd': 'segaMD',
    'md': 'segaMD',
    'gen': 'segaMD',
    'sms': 'segaMS',
    'gg': 'segaGG',
    'zip': 'mame', // Assume arcade for zips
  };

  return extMap[ext] || 'nes';
}

/**
 * Add a ROM to the grid
 */
function addRomCard(rom) {
  const grid = document.getElementById('rom-grid');

  // Remove add card temporarily
  const addCard = document.querySelector('.add-card');
  if (addCard) {
    addCard.remove();
  }

  const card = document.createElement('div');
  card.className = 'rom-card';
  card.dataset.romId = rom.id;

  // Add placeholder while loading
  card.innerHTML = `
    <div class="rom-placeholder">
      <div class="spinner-small"></div>
    </div>
    <div class="rom-title">${escapeHtml(rom.filename)}</div>
  `;

  // Add click handler to play ROM
  card.addEventListener('click', () => playRom(rom));

  grid.appendChild(card);

  // Re-add the add card
  addAddCard();

  // Load metadata asynchronously
  loadRomMetadata(rom);
}

/**
 * Load metadata for a ROM
 */
async function loadRomMetadata(rom) {
  try {
    console.log('Loading metadata for:', rom.filename);

    const metadata = await scout.identify(rom.file);

    if (metadata) {
      rom.metadata = metadata;
      rom.title = metadata.title || rom.filename;
      rom.platform = metadata.platform;
      rom.image = metadata.images && metadata.images.length > 0 ? metadata.images[0].url : null;

      console.log('Metadata loaded:', metadata);
    } else {
      rom.title = rom.filename;
      console.log('No metadata found for:', rom.filename);
    }

    // Update the card
    updateRomCard(rom);
  } catch (error) {
    console.error('Error loading metadata:', error);
    rom.title = rom.filename;
    updateRomCard(rom);
  }
}

/**
 * Update ROM card with metadata
 */
function updateRomCard(rom) {
  const card = document.querySelector(`[data-rom-id="${rom.id}"]`);
  if (!card) return;

  card.classList.remove('loading');

  let imageHtml;
  if (rom.image) {
    imageHtml = `<img src="${escapeHtml(rom.image)}" alt="${escapeHtml(rom.title)}" class="rom-image">`;
  } else {
    imageHtml = `<div class="rom-placeholder">🎮</div>`;
  }

  card.innerHTML = `
    ${imageHtml}
    <div class="rom-title">${escapeHtml(rom.title)}</div>
    ${rom.platform ? `<div class="rom-platform">${escapeHtml(rom.platform)}</div>` : ''}
  `;
}

/**
 * Add the "add ROM" card
 */
function addAddCard() {
  const grid = document.getElementById('rom-grid');

  const addCard = document.createElement('div');
  addCard.className = 'rom-card add-card';
  addCard.innerHTML = `
    <div class="add-icon">+</div>
    <div class="add-text">Drop ROM here<br>or click to select</div>
  `;

  // Click to select file
  addCard.addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  // Drag and drop
  addCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    addCard.classList.add('dragging-over');
  });

  addCard.addEventListener('dragleave', () => {
    addCard.classList.remove('dragging-over');
  });

  addCard.addEventListener('drop', (e) => {
    e.preventDefault();
    addCard.classList.remove('dragging-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addRomFromFile(files[0]);
    }
  });

  grid.appendChild(addCard);
}

/**
 * Add a ROM from a file
 */
function addRomFromFile(file) {
  const rom = {
    id: Date.now().toString(),
    filename: file.name,
    file: file,
    title: file.name,
    metadata: null,
    image: null,
    platform: null
  };

  roms.push(rom);
  addRomCard(rom);
}

/**
 * Play a ROM
 */
async function playRom(rom) {
  console.log('Playing ROM:', rom.title);

  try {
    // Detect platform/core
    const core = detectPlatform(rom.filename, rom.metadata);
    console.log('Using core:', core);

    // Handle ZIP files - extract contents for arcade ROMs
    let gameData;
    let isZip = rom.filename.toLowerCase().endsWith('.zip');

    if (isZip && core === 'mame') {
      // For MAME, we can pass the ZIP directly
      gameData = rom.file;
    } else if (isZip) {
      // For other emulators, extract the first ROM file
      console.log('Extracting ZIP file...');
      const arrayBuffer = await rom.file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const files = extractZipFiles(uint8Array);

      if (files.length === 0) {
        throw new Error('No files found in ZIP archive');
      }

      console.log('Extracted files:', files.map(f => f.name));

      // Find the first ROM file (not a directory or metadata)
      const romFile = files.find(f =>
        !f.name.endsWith('/') &&
        !f.name.startsWith('__MACOSX') &&
        /\.(bin|nes|snes|gba|gb|gbc|smd|md|gen|sms|gg)$/i.test(f.name)
      ) || files[0];

      // Create a blob from the extracted file
      gameData = new Blob([romFile.data], { type: 'application/octet-stream' });
      console.log('Using extracted file:', romFile.name);
    } else {
      gameData = rom.file;
    }

    // Create object URL for the game
    const gameUrl = URL.createObjectURL(gameData);

    // Show emulator overlay
    const overlay = document.getElementById('emulator-overlay');
    overlay.classList.add('active');

    // Clear previous emulator
    const emulatorDiv = document.getElementById('emulator-div');
    emulatorDiv.innerHTML = '';

    // Set EmulatorJS configuration
    window.EJS_gameUrl = gameUrl;
    window.EJS_core = core;
    window.EJS_gameName = rom.title;

    // Reload EmulatorJS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/EmulatorJS/EmulatorJS@latest/data/loader.js';
    document.body.appendChild(script);

    // Clean up object URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(gameUrl);
    }, 10000);

  } catch (error) {
    console.error('Error playing ROM:', error);
    alert(`Failed to play ROM: ${error.message}`);
  }
}

/**
 * Close emulator
 */
function closeEmulator() {
  const overlay = document.getElementById('emulator-overlay');
  overlay.classList.remove('active');

  // Clear emulator
  const emulatorDiv = document.getElementById('emulator-div');
  emulatorDiv.innerHTML = '';
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load initial ROMs
 */
async function loadInitialRoms() {
  // Load Pac-Man
  try {
    const response = await fetch('pacman.zip');
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const file = new File([arrayBuffer], 'pacman.zip', { type: 'application/zip' });
      const rom = {
        id: 'pacman',
        filename: 'pacman.zip',
        file: file,
        title: 'pacman.zip',
        metadata: null,
        image: null,
        platform: null
      };
      roms.push(rom);
      addRomCard(rom);
    }
  } catch (error) {
    console.error('Failed to load Pac-Man:', error);
  }

  // Load Sonic
  try {
    const response = await fetch('sonic.bin');
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const file = new File([arrayBuffer], 'sonic.bin', { type: 'application/octet-stream' });
      const rom = {
        id: 'sonic',
        filename: 'sonic.bin',
        file: file,
        title: 'sonic.bin',
        metadata: null,
        image: null,
        platform: null
      };
      roms.push(rom);
      addRomCard(rom);
    }
  } catch (error) {
    console.error('Failed to load Sonic:', error);
  }
}

/**
 * Initialize the player
 */
async function init() {
  console.log('Initializing ROM player...');

  // Set up close button
  document.getElementById('close-emulator').addEventListener('click', closeEmulator);

  // Set up file input
  document.getElementById('file-input').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      addRomFromFile(files[0]);
    }
    // Reset file input
    e.target.value = '';
  });

  // Load initial ROMs
  await loadInitialRoms();

  console.log('ROM player initialized');
}

// Start the app
init();
