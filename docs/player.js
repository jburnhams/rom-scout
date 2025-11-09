/**
 * ROM Player - Interactive ROM player with automatic metadata fetching
 */

// Import the library from local build
let RomScout, startRomPlayer;
let activePlayerInstance = null;
let currentSaveHandler = null;
let currentLoadHandler = null;
try {
  const module = await import('./rom-scout.esm.js');
  RomScout = module.RomScout;
  startRomPlayer = module.startRomPlayer;
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
  corsProxy: window.location.hostname ? 'https://proxy.jonathanburnhams.com/proxy/' : undefined
});

/**
 * Platform detection based on file extension and metadata
 */
function detectPlatform(filename, metadata) {
  if (metadata && metadata.platform) {
    // Map common platform names to EmulatorJS cores
    const platformMap = {
      'arcade': 'arcade',
      'mame': 'arcade',
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
    'zip': 'arcade', // Assume arcade for zips
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
 * Update the save state dropdown with available saves
 */
async function updateSaveStateDropdown(playerInstance) {
  const dropdown = document.getElementById('save-state-selector');

  if (!playerInstance) {
    dropdown.innerHTML = '<option value="">No saves available</option>';
    dropdown.disabled = true;
    return;
  }

  try {
    const saves = await playerInstance.listSaves();

    dropdown.innerHTML = '';

    if (saves.length === 0) {
      dropdown.innerHTML = '<option value="">No saves available</option>';
      dropdown.disabled = true;
    } else {
      dropdown.disabled = false;

      saves.forEach((save, index) => {
        const option = document.createElement('option');
        option.value = save.timestamp;
        option.textContent = `${save.formattedTimestamp} - CRC32: ${save.crc32}`;

        // Select the most recent save by default
        if (index === 0) {
          option.selected = true;
        }

        dropdown.appendChild(option);
      });
    }

    console.log('[ROM Scout Demo] Dropdown updated with', saves.length, 'save states');
  } catch (error) {
    console.error('[ROM Scout Demo] Failed to list saves:', error);
    dropdown.innerHTML = '<option value="">Error loading saves</option>';
    dropdown.disabled = true;
  }
}

/**
 * Bind save/load buttons to the current player instance
 */
function bindSaveLoadButtons(playerInstance) {
  const saveButton = document.getElementById('save-emulator-save');
  const loadButton = document.getElementById('load-emulator-save');

  // Remove previous handlers if they exist
  if (currentSaveHandler) {
    saveButton.removeEventListener('click', currentSaveHandler);
  }
  if (currentLoadHandler) {
    loadButton.removeEventListener('click', currentLoadHandler);
  }

  // Create new handlers bound to the current instance
  currentSaveHandler = async () => {
    if (!playerInstance) {
      console.log('[ROM Scout Demo] No active player available for manual save');
      return;
    }

    console.log('[ROM Scout Demo] Manual save requested (creating new state)');
    try {
      // Pass true to create a new save state instead of overwriting
      const saved = await playerInstance.persistSave(true);
      if (saved) {
        console.log('[ROM Scout Demo] Manual save completed successfully');
        // Refresh the dropdown to show the new save
        await updateSaveStateDropdown(playerInstance);
      } else {
        console.log('[ROM Scout Demo] Manual save finished without new data');
      }
    } catch (error) {
      console.error('[ROM Scout Demo] Manual save failed:', error);
    }
  };

  currentLoadHandler = async () => {
    if (!playerInstance) {
      console.log('[ROM Scout Demo] No active player available for manual load');
      return;
    }

    const dropdown = document.getElementById('save-state-selector');
    const selectedTimestamp = dropdown.value;

    if (!selectedTimestamp) {
      console.log('[ROM Scout Demo] No save state selected');
      return;
    }

    console.log('[ROM Scout Demo] Manual load requested for timestamp:', selectedTimestamp);
    try {
      const timestamp = parseInt(selectedTimestamp, 10);
      const restored = await playerInstance.loadSaveByTimestamp(timestamp);
      if (restored) {
        console.log('[ROM Scout Demo] Manual load restored save data');
      } else {
        console.log('[ROM Scout Demo] Manual load completed but no save data was restored');
      }
    } catch (error) {
      console.error('[ROM Scout Demo] Manual load failed:', error);
    }
  };

  // Attach new handlers
  saveButton.addEventListener('click', currentSaveHandler);
  loadButton.addEventListener('click', currentLoadHandler);

  // Update the dropdown with available saves
  updateSaveStateDropdown(playerInstance);

  console.log('[ROM Scout Demo] Save/Load buttons bound to current player instance');
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

    // Show emulator overlay
    const overlay = document.getElementById('emulator-overlay');
    overlay.classList.add('active');

    // Clear previous emulator
    const emulatorDiv = document.getElementById('emulator-div');
    const metadata = rom.metadata ? { ...rom.metadata } : {};
    if (!metadata.title) {
      metadata.title = rom.title;
    }
    if (!metadata.platform && rom.platform) {
      metadata.platform = rom.platform;
    }

    if (activePlayerInstance) {
      await activePlayerInstance.destroy();
      activePlayerInstance = null;
    }

    activePlayerInstance = await startRomPlayer({
      target: emulatorDiv,
      file: rom.file,
      filename: rom.filename,
      metadata,
      core,
      loaderUrl: 'https://cdn.emulatorjs.org/stable/data/loader.js',
      dataPath: 'https://cdn.emulatorjs.org/stable/data/',
      startOnLoaded: true,
      disableDatabases: true,
      threads: false,
    });

    // Bind save/load buttons to this new instance
    bindSaveLoadButtons(activePlayerInstance);

  } catch (error) {
    console.error('Error playing ROM:', error);
    alert(`Failed to play ROM: ${error.message}`);
  }
}

/**
 * Close emulator
 */
async function closeEmulator() {
  const overlay = document.getElementById('emulator-overlay');
  const emulatorDiv = document.getElementById('emulator-div');

  if (activePlayerInstance) {
    await activePlayerInstance.destroy();
    activePlayerInstance = null;
  } else {
    emulatorDiv.innerHTML = '';
  }

  overlay.classList.remove('active');
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
  document.getElementById('close-emulator').addEventListener('click', () => {
    void closeEmulator();
  });

  // Note: Save/Load buttons are bound when a ROM is played to ensure
  // they always reference the current emulator instance

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
