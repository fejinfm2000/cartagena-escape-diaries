/**
 * Cartagena: Escape Diaries - Responsive SVG Board Renderer (M3 & M4)
 * High performance, crisp vector graphics at any resolution.
 * Supports desktop horizontal panoramic path & mobile vertical snake path.
 */

import { SYMBOL_META, PLAYER_COLORS, JAIL_INDEX, BOAT_INDEX } from './engine-meta.js';

export class BoardRenderer {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.onPirateClick = options.onPirateClick || (() => {});
    this.onSpaceClick = options.onSpaceClick || (() => {});
    this.isMobile = window.innerWidth < 768;

    this.selectedPirateId = null;
    this.selectedCard = null;
    this.actionMode = null; // 'FORWARD' or 'BACKWARD'
    this.ghostPreview = null; // { spaceIndex, color, pirateId }

    this.currentState = null;
    this.myPlayerId = null;

    window.addEventListener('resize', () => {
      const mobileNow = window.innerWidth < 768;
      if (mobileNow !== this.isMobile) {
        this.isMobile = mobileNow;
        if (this.currentState) {
          this.render(this.currentState, this.myPlayerId);
        }
      }
    });
  }

  setSelection({ pirateId = null, card = null, mode = null }) {
    this.selectedPirateId = pirateId;
    this.selectedCard = card;
    this.actionMode = mode;
    this.updateHighlights();
  }

  setGhostPreview(preview) {
    this.ghostPreview = preview;
    this.updateGhostElement();
  }

  /**
   * Main render function
   */
  render(state, myPlayerId) {
    this.currentState = state;
    this.myPlayerId = myPlayerId;

    if (!state || !state.board) return;

    if (this.isMobile) {
      this._renderVerticalBoard(state);
    } else {
      this._renderHorizontalBoard(state);
    }

    this.updateHighlights();
  }

  _getCoordinatesHorizontal(spaceIndex) {
    // 38 spaces total: 0 = Jail, 1..36 = Path, 37 = Boat
    // Widescreen panoramic: 3 rows x 12 columns fills the full laptop section!
    // Row 0 (Top): Spaces 1 -> 12 (snaking left to right)
    // Row 1 (Mid): Spaces 13 -> 24 (snaking right to left)
    // Row 2 (Btm): Spaces 25 -> 36 (snaking left to right directly into Boat!)
    const cellWidth = 114;
    const cellHeight = 104;
    const startX = 155; // right after Jail
    const startY = 20;

    if (spaceIndex === JAIL_INDEX) {
      return { x: 75, y: 175, width: 120, height: 260, isJail: true };
    }
    if (spaceIndex === BOAT_INDEX) {
      return { x: 1595, y: 230, width: 140, height: 250, isBoat: true };
    }

    const pathIdx = spaceIndex - 1; // 0..35
    const row = Math.floor(pathIdx / 12); // 0, 1, 2
    const colInRow = pathIdx % 12; // 0..11
    // Snake pattern: Row 0 left->right, Row 1 right->left, Row 2 left->right
    const col = (row % 2 === 0) ? colInRow : (11 - colInRow);

    return {
      x: startX + col * cellWidth + cellWidth / 2,
      y: startY + row * cellHeight + cellHeight / 2,
      row,
      col
    };
  }

  _getCoordinatesVertical(spaceIndex) {
    // Mobile vertical snake layout: 3 columns x 12 rows gives maximum readable card width (104px) on phones!
    const cellWidth = 114;
    const cellHeight = 96;
    const startX = 16;
    const startY = 155;

    if (spaceIndex === JAIL_INDEX) {
      return { x: 187, y: 75, width: 340, height: 110, isJail: true };
    }
    if (spaceIndex === BOAT_INDEX) {
      return { x: 187, y: 1370, width: 340, height: 120, isBoat: true };
    }

    const pathIdx = spaceIndex - 1; // 0..35
    const row = Math.floor(pathIdx / 3); // 0..11
    const colInRow = pathIdx % 3; // 0..2
    // Snake pattern per row
    const col = (row % 2 === 0) ? colInRow : (2 - colInRow);

    return {
      x: startX + col * cellWidth + cellWidth / 2,
      y: startY + row * cellHeight + cellHeight / 2,
      row,
      col
    };
  }

  _renderHorizontalBoard(state) {
    const viewBoxWidth = 1680;
    const viewBoxHeight = 350;

    let svg = `
      <svg id="cartagena-board-svg" class="cartagena-board-svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <!-- Parchment filters and shadows -->
          <filter id="parchment-shadow" x="-10%" y="-10%" width="125%" height="125%">
            <feDropShadow dx="3" dy="5" stdDeviation="4" flood-color="#0B1F2A" flood-opacity="0.45"/>
          </filter>
          <filter id="gold-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <radialGradient id="water-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#196575"/>
            <stop offset="100%" stop-color="#0B1F2A"/>
          </radialGradient>
        </defs>

        <!-- Winding Tunnel Track -->
        ${this._buildConnectingTrackHorizontal()}

        <!-- Jail Area (Fortress Cartagena) -->
        ${this._renderJailAreaHorizontal(state.board[JAIL_INDEX])}

        <!-- Spaces 1 to 36 -->
        ${state.board.slice(1, 37).map(space => this._renderSpaceHorizontal(space)).join('')}

        <!-- Boat Area (The Escape Rowboat) -->
        ${this._renderBoatAreaHorizontal(state.board[BOAT_INDEX])}

        <!-- Ghost preview layer -->
        <g id="ghost-preview-layer"></g>
      </svg>
    `;

    this.container.innerHTML = svg;
    this._attachBoardEventListeners();
  }

  _renderVerticalBoard(state) {
    const viewBoxWidth = 375;
    const viewBoxHeight = 1500;

    let svg = `
      <svg id="cartagena-board-svg" class="cartagena-board-svg vertical-board" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="parchment-shadow" x="-10%" y="-10%" width="125%" height="125%">
            <feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="#0B1F2A" flood-opacity="0.4"/>
          </filter>
          <filter id="gold-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <radialGradient id="water-gradient-mobile" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#196575"/>
            <stop offset="100%" stop-color="#0B1F2A"/>
          </radialGradient>
        </defs>

        <!-- Connecting Tunnel Track -->
        ${this._buildConnectingTrackVertical()}

        <!-- Jail Area -->
        ${this._renderJailAreaVertical(state.board[JAIL_INDEX])}

        <!-- Spaces 1 to 36 -->
        ${state.board.slice(1, 37).map(space => this._renderSpaceVertical(space)).join('')}

        <!-- Boat Area -->
        ${this._renderBoatAreaVertical(state.board[BOAT_INDEX])}

        <g id="ghost-preview-layer"></g>
      </svg>
    `;

    this.container.innerHTML = svg;
    this._attachBoardEventListeners();
  }

  _buildConnectingTrackHorizontal() {
    let d = '';
    for (let i = 1; i <= 36; i++) {
      const coord = this._getCoordinatesHorizontal(i);
      if (i === 1) {
        d += `M ${coord.x} ${coord.y}`;
      } else {
        d += ` L ${coord.x} ${coord.y}`;
      }
    }
    return `
      <!-- Connecting path from Jail to Space 1 -->
      <line x1="135" y1="72" x2="160" y2="72" stroke="#D9BF86" stroke-width="28" stroke-linecap="round" opacity="0.5"/>
      <line x1="135" y1="72" x2="160" y2="72" stroke="#3B2A1A" stroke-width="3" stroke-dasharray="4,4" opacity="0.5"/>

      <!-- Main winding tunnel track -->
      <path d="${d}" fill="none" stroke="#D9BF86" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
      <path d="${d}" fill="none" stroke="#3B2A1A" stroke-width="4" stroke-dasharray="6,6" stroke-linecap="round" opacity="0.4"/>

      <!-- Connecting dock ramp from Space 36 into Boat -->
      <line x1="1466" y1="280" x2="1535" y2="255" stroke="#8B5A2B" stroke-width="26" stroke-linecap="round" opacity="0.6"/>
      <line x1="1466" y1="280" x2="1535" y2="255" stroke="#E0A82E" stroke-width="3" stroke-dasharray="5,4" opacity="0.6"/>
    `;
  }

  _buildConnectingTrackVertical() {
    let d = '';
    for (let i = 1; i <= 36; i++) {
      const coord = this._getCoordinatesVertical(i);
      if (i === 1) {
        d += `M ${coord.x} ${coord.y}`;
      } else {
        d += ` L ${coord.x} ${coord.y}`;
      }
    }
    return `
      <!-- Connecting path from Jail to Space 1 -->
      <line x1="187" y1="130" x2="187" y2="155" stroke="#D9BF86" stroke-width="26" stroke-linecap="round" opacity="0.5"/>
      <line x1="187" y1="130" x2="187" y2="155" stroke="#3B2A1A" stroke-width="3" stroke-dasharray="4,4" opacity="0.5"/>

      <!-- Main vertical winding snake track -->
      <path d="${d}" fill="none" stroke="#D9BF86" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
      <path d="${d}" fill="none" stroke="#3B2A1A" stroke-width="3" stroke-dasharray="5,5" stroke-linecap="round" opacity="0.4"/>

      <!-- Connecting dock path from Space 36 down to Boat -->
      <line x1="73" y1="1259" x2="135" y2="1300" stroke="#8B5A2B" stroke-width="26" stroke-linecap="round" opacity="0.6"/>
    `;
  }

  _renderSpaceHorizontal(space) {
    const { x, y } = this._getCoordinatesHorizontal(space.index);
    const meta = SYMBOL_META[space.symbol] || { icon: '❓', label: space.symbol };
    const pirates = space.pirates || [];
    const isFull = pirates.length >= 3;

    return `
      <g class="board-space-group" id="space-group-${space.index}" data-space-index="${space.index}" transform="translate(${x}, ${y})">
        <!-- Parchment space tile (Wide Rectangular Card) -->
        <rect class="space-rect ${isFull ? 'space-full' : ''}" x="-53" y="-36" width="106" height="72" rx="9" ry="9" 
              fill="#F4E6C5" stroke="#3B2A1A" stroke-width="2.5" filter="url(#parchment-shadow)"/>
        
        <!-- Decorative inner dashed border -->
        <rect x="-49" y="-32" width="98" height="64" rx="7" ry="7" 
              fill="none" stroke="#D3BD8E" stroke-width="1.2" stroke-dasharray="4,2" pointer-events="none"/>

        <!-- Tile space index badge in top-left -->
        <rect x="-47" y="-30" width="22" height="15" rx="3" fill="#E8D2A0" stroke="#7A5C38" stroke-width="0.8" pointer-events="none"/>
        <text class="space-number" x="-36" y="-22" text-anchor="middle" dominant-baseline="central" font-family="'Pirata One', cursive" font-size="11" fill="#5C3B1E" pointer-events="none">${space.index}</text>

        <!-- Big, prominent symbol icon in top/center - NEVER obscured by pirates! -->
        <text class="space-symbol-icon" x="4" y="-8" text-anchor="middle" dominant-baseline="central" font-size="38" pointer-events="none">${meta.icon}</text>

        <!-- Pirate Tokens Container (docked across bottom) -->
        <g class="pirates-container" id="space-pirates-${space.index}">
          ${this._renderPiratesOnSpace(pirates, false)}
        </g>

        <!-- Highlight ring (dynamic rectangular border) -->
        <rect class="space-highlight-ring" x="-56" y="-39" width="112" height="78" rx="11" ry="11" fill="none" stroke="#E0A82E" stroke-width="3.5" opacity="0" pointer-events="none"/>
      </g>
    `;
  }

  _renderSpaceVertical(space) {
    const { x, y } = this._getCoordinatesVertical(space.index);
    const meta = SYMBOL_META[space.symbol] || { icon: '❓', label: space.symbol };
    const pirates = space.pirates || [];
    const isFull = pirates.length >= 3;

    return `
      <g class="board-space-group" id="space-group-${space.index}" data-space-index="${space.index}" transform="translate(${x}, ${y})">
        <!-- Parchment space tile (Wide Rectangular Card for Mobile) -->
        <rect class="space-rect ${isFull ? 'space-full' : ''}" x="-49" y="-35" width="98" height="70" rx="9" ry="9" 
              fill="#F4E6C5" stroke="#3B2A1A" stroke-width="2.5" filter="url(#parchment-shadow)"/>
        
        <!-- Decorative inner dashed border -->
        <rect x="-45" y="-31" width="90" height="62" rx="7" ry="7" 
              fill="none" stroke="#D3BD8E" stroke-width="1.2" stroke-dasharray="3,2" pointer-events="none"/>

        <!-- Tile space index badge in top-left -->
        <rect x="-43" y="-29" width="22" height="15" rx="3" fill="#E8D2A0" stroke="#7A5C38" stroke-width="0.8" pointer-events="none"/>
        <text class="space-number" x="-32" y="-21" text-anchor="middle" dominant-baseline="central" font-family="'Pirata One', cursive" font-size="11" fill="#5C3B1E" pointer-events="none">${space.index}</text>

        <!-- Big, prominent symbol icon in top/center -->
        <text class="space-symbol-icon" x="4" y="-8" text-anchor="middle" dominant-baseline="central" font-size="38" pointer-events="none">${meta.icon}</text>

        <!-- Pirate Tokens Container (docked across bottom) -->
        <g class="pirates-container" id="space-pirates-${space.index}">
          ${this._renderPiratesOnSpace(pirates, true)}
        </g>

        <!-- Highlight ring -->
        <rect class="space-highlight-ring" x="-52" y="-38" width="104" height="76" rx="11" ry="11" fill="none" stroke="#E0A82E" stroke-width="3.5" opacity="0" pointer-events="none"/>
      </g>
    `;
  }

  _renderJailAreaHorizontal(jailSpace) {
    const coord = this._getCoordinatesHorizontal(JAIL_INDEX);
    const pirates = jailSpace.pirates || [];

    return `
      <g class="jail-area" id="space-group-0" data-space-index="0" transform="translate(${coord.x}, ${coord.y})">
        <!-- Fortress Stone Wall background -->
        <rect x="-60" y="-130" width="120" height="260" rx="14" fill="#2E333D" stroke="#1A1C22" stroke-width="3.5" filter="url(#parchment-shadow)" pointer-events="none"/>
        
        <!-- Jail bars -->
        <g stroke="#8A8F98" stroke-width="3.5" opacity="0.65" pointer-events="none">
          <line x1="-42" y1="-120" x2="-42" y2="120" />
          <line x1="-21" y1="-120" x2="-21" y2="120" />
          <line x1="0" y1="-120" x2="0" y2="120" />
          <line x1="21" y1="-120" x2="21" y2="120" />
          <line x1="42" y1="-120" x2="42" y2="120" />
        </g>

        <!-- Torch / Sign -->
        <rect x="-52" y="-120" width="104" height="28" rx="5" fill="#8F251E" stroke="#E0A82E" stroke-width="1.5" pointer-events="none"/>
        <text x="0" y="-102" text-anchor="middle" fill="#F2E2BA" font-family="'Pirata One', cursive" font-size="15" letter-spacing="1" pointer-events="none">CARTAGENA JAIL</text>

        <!-- Pirate tokens inside Jail (clustered grid) -->
        <g class="pirates-container jail-pirates" transform="translate(0, 10)">
          ${this._renderJailPirates(pirates, false)}
        </g>
      </g>
    `;
  }

  _renderJailAreaVertical(jailSpace) {
    const coord = this._getCoordinatesVertical(JAIL_INDEX);
    const pirates = jailSpace.pirates || [];

    return `
      <g class="jail-area" id="space-group-0" data-space-index="0" transform="translate(${coord.x}, ${coord.y})">
        <rect x="-165" y="-55" width="330" height="110" rx="14" fill="#2E333D" stroke="#1A1C22" stroke-width="3.5" filter="url(#parchment-shadow)" pointer-events="none"/>
        
        <!-- Jail bars -->
        <g stroke="#8A8F98" stroke-width="3" opacity="0.6" pointer-events="none">
          <line x1="-130" y1="-50" x2="-130" y2="50" />
          <line x1="-80" y1="-50" x2="-80" y2="50" />
          <line x1="-30" y1="-50" x2="-30" y2="50" />
          <line x1="20" y1="-50" x2="20" y2="50" />
          <line x1="70" y1="-50" x2="70" y2="50" />
          <line x1="120" y1="-50" x2="120" y2="50" />
        </g>

        <rect x="-90" y="-48" width="180" height="26" rx="5" fill="#8F251E" stroke="#E0A82E" stroke-width="1.2" pointer-events="none"/>
        <text x="0" y="-31" text-anchor="middle" fill="#F2E2BA" font-family="'Pirata One', cursive" font-size="15" pointer-events="none">CARTAGENA FORTRESS JAIL</text>

        <g class="pirates-container jail-pirates" transform="translate(0, 14)">
          ${this._renderJailPirates(pirates, true)}
        </g>
      </g>
    `;
  }

  _renderBoatAreaHorizontal(boatSpace) {
    const coord = this._getCoordinatesHorizontal(BOAT_INDEX);
    const pirates = boatSpace.pirates || [];

    return `
      <g class="boat-area" id="space-group-37" data-space-index="37" transform="translate(${coord.x}, ${coord.y})">
        <!-- Sea Water Lagoon -->
        <ellipse cx="0" cy="0" rx="65" ry="120" fill="url(#water-gradient)" stroke="#14505C" stroke-width="3"/>

        <!-- Wooden Rowboat silhouette -->
        <path d="M -38 -80 Q -52 0 -38 80 Q 0 105 38 80 Q 52 0 38 -80 Q 0 -105 -38 -80 Z" 
              fill="#5C3B1E" stroke="#E0A82E" stroke-width="2.5" filter="url(#parchment-shadow)"/>
        
        <!-- Oars -->
        <line x1="-50" y1="-28" x2="-75" y2="-55" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>
        <line x1="50" y1="-28" x2="75" y2="-55" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>
        <line x1="-50" y1="28" x2="-75" y2="55" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>
        <line x1="50" y1="28" x2="75" y2="55" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>

        <!-- Title -->
        <text x="0" y="-60" text-anchor="middle" fill="#E0A82E" font-family="'Pirata One', cursive" font-size="15">ESCAPE BOAT</text>

        <!-- Escaped Pirates on Boat -->
        <g class="pirates-container boat-pirates" transform="translate(0, 10)">
          ${this._renderBoatPirates(pirates, false)}
        </g>
      </g>
    `;
  }

  _renderBoatAreaVertical(boatSpace) {
    const coord = this._getCoordinatesVertical(BOAT_INDEX);
    const pirates = boatSpace.pirates || [];

    return `
      <g class="boat-area" id="space-group-37" data-space-index="37" transform="translate(${coord.x}, ${coord.y})">
        <rect x="-165" y="-60" width="330" height="120" rx="14" fill="#14505C" stroke="#0B1F2A" stroke-width="3"/>
        
        <path d="M -135 -20 Q 0 -35 135 -20 Q 145 15 125 35 Q 0 45 -125 35 Q -145 15 -135 -20 Z" 
              fill="#5C3B1E" stroke="#E0A82E" stroke-width="2.5"/>

        <text x="0" y="-36" text-anchor="middle" fill="#E0A82E" font-family="'Pirata One', cursive" font-size="16">ROWBOAT TO FREEDOM (ESCAPE!)</text>

        <g class="pirates-container boat-pirates" transform="translate(0, 10)">
          ${this._renderBoatPirates(pirates, true)}
        </g>
      </g>
    `;
  }

  _renderPiratesOnSpace(pirateIds, isVertical = false) {
    if (!pirateIds || pirateIds.length === 0) return '';
    const count = pirateIds.length;

    // Up to 3 pirates neatly docked across the bottom half of the rectangle card
    const offsets = count === 1 ? [{ x: 0, y: 18 }] :
                    count === 2 ? [{ x: -24, y: 18 }, { x: 24, y: 18 }] :
                    [{ x: -28, y: 18 }, { x: 0, y: 18 }, { x: 28, y: 18 }];
    const size = count === 3 ? 11.5 : count === 2 ? 12.5 : 13;

    return pirateIds.map((pid, idx) => {
      const pos = offsets[idx] || { x: 0, y: 18 };
      return this._renderPirateToken(pid, pos.x, pos.y, size);
    }).join('');
  }

  _renderJailPirates(pirateIds, isVertical = false) {
    if (!pirateIds || pirateIds.length === 0) return '';
    if (isVertical) {
      // Mobile vertical jail: 6 columns across width 330
      const cols = 6;
      const spacingX = 46;
      const spacingY = 32;
      return pirateIds.map((pid, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const x = (col - (cols - 1) / 2) * spacingX;
        const y = (row - 0.5) * spacingY;
        return this._renderPirateToken(pid, x, y, 14);
      }).join('');
    } else {
      // Laptop horizontal jail: 3 columns across width 120
      const cols = 3;
      const spacingX = 32;
      const spacingY = 30;
      return pirateIds.map((pid, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const x = (col - (cols - 1) / 2) * spacingX;
        const y = (row - 2) * spacingY + 10;
        return this._renderPirateToken(pid, x, y, 13);
      }).join('');
    }
  }

  _renderBoatPirates(pirateIds, isVertical = false) {
    if (!pirateIds || pirateIds.length === 0) return '';
    if (isVertical) {
      const cols = 6;
      const spacingX = 44;
      const spacingY = 30;
      return pirateIds.map((pid, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const x = (col - (cols - 1) / 2) * spacingX;
        const y = (row - 0.2) * spacingY;
        return this._renderPirateToken(pid, x, y, 13, true);
      }).join('');
    } else {
      const cols = 2;
      const spacingX = 30;
      const spacingY = 28;
      return pirateIds.map((pid, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const x = (col - (cols - 1) / 2) * spacingX;
        const y = (row - 1.5) * spacingY;
        return this._renderPirateToken(pid, x, y, 12.5, true);
      }).join('');
    }
  }

  _renderPirateToken(pirateId, x, y, size = 18, isOnBoat = false) {
    const pirate = this._findPirate(pirateId);
    const color = pirate ? this._getPlayerColor(pirate.owner) : '#D64545';
    const isMine = pirate && pirate.owner === this.myPlayerId;
    const isSelected = this.selectedPirateId === pirateId;
    const badgeR = Math.max(5, Math.round(size * 0.45));
    const badgeFont = Math.max(7, Math.round(size * 0.55));

    return `
      <g class="pirate-token ${isMine ? 'pirate-mine' : ''} ${isSelected ? 'pirate-selected' : ''}" 
         id="pirate-${pirateId}" data-pirate-id="${pirateId}" transform="translate(${x}, ${y})">
        
        <!-- Selection ring -->
        <circle class="pirate-selection-ring" cx="0" cy="0" r="${size + 4}" fill="none" stroke="#E0A82E" stroke-width="3" opacity="${isSelected ? 1 : 0}" pointer-events="none"/>

        <!-- Pirate Body / Badge -->
        <circle class="pirate-body" cx="0" cy="0" r="${size}" fill="${color}" stroke="#FFFFFF" stroke-width="2" filter="url(#parchment-shadow)"/>
        
        <!-- Pirate Emblems / Hat Silhouette -->
        <text class="pirate-icon" x="0" y="1" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 1.05)}" pointer-events="none">
          ${isOnBoat ? '🏆' : '☠️'}
        </text>

        <!-- Pirate Number indicator -->
        <circle cx="${Math.round(size * 0.75)}" cy="${-Math.round(size * 0.75)}" r="${badgeR}" fill="#0B1F2A" stroke="#FFFFFF" stroke-width="1" pointer-events="none"/>
        <text x="${Math.round(size * 0.75)}" y="${-Math.round(size * 0.75) + 1}" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" font-size="${badgeFont}" font-weight="bold" pointer-events="none">
          ${pirate?.indexNumber || 1}
        </text>
      </g>
    `;
  }

  _findPirate(pirateId) {
    if (!this.currentState?.players) return null;
    for (const player of this.currentState.players) {
      const p = player.pirates?.find(pir => pir.id === pirateId);
      if (p) return p;
    }
    return null;
  }

  _getPlayerColor(ownerId) {
    const player = this.currentState?.players?.find(p => p.id === ownerId);
    if (!player) return '#D64545';
    const colObj = PLAYER_COLORS.find(c => c.id === player.color);
    return colObj ? colObj.hex : player.color;
  }

  _attachBoardEventListeners() {
    // Click on pirate tokens
    const pirateNodes = this.container.querySelectorAll('.pirate-token');
    pirateNodes.forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const pirateId = node.getAttribute('data-pirate-id');
        this.onPirateClick(pirateId);
      });
    });

    // Click on spaces
    const spaceNodes = this.container.querySelectorAll('.board-space-group, .jail-area, .boat-area');
    spaceNodes.forEach(node => {
      node.addEventListener('click', (e) => {
        const spaceIndex = parseInt(node.getAttribute('data-space-index'), 10);
        this.onSpaceClick(spaceIndex);
      });
    });
  }

  updateHighlights() {
    if (!this.currentState) return;

    // Reset all highlights
    const rings = this.container.querySelectorAll('.space-highlight-ring');
    rings.forEach(r => r.setAttribute('opacity', '0'));

    const tokens = this.container.querySelectorAll('.pirate-token');
    tokens.forEach(t => {
      const isSel = t.getAttribute('data-pirate-id') === this.selectedPirateId;
      const ring = t.querySelector('.pirate-selection-ring');
      if (ring) {
        ring.setAttribute('opacity', isSel ? '1' : '0');
      }
    });

    // If a pirate and action/card are selected, highlight valid destination
    if (this.selectedPirateId) {
      const pirate = this._findPirate(this.selectedPirateId);
      if (!pirate) return;

      if (this.actionMode === 'FORWARD' && this.selectedCard) {
        const target = this._calculateForwardTarget(pirate, this.selectedCard.symbol);
        if (target !== null) {
          const targetGroup = this.container.querySelector(`#space-group-${target}`);
          const ring = targetGroup?.querySelector('.space-highlight-ring');
          if (ring) {
            ring.setAttribute('opacity', '1');
            ring.setAttribute('stroke', '#E0A82E');
          }
        }
      } else if (this.actionMode === 'BACKWARD') {
        const target = this._calculateBackwardTarget(pirate);
        if (target !== null) {
          const targetGroup = this.container.querySelector(`#space-group-${target}`);
          const ring = targetGroup?.querySelector('.space-highlight-ring');
          if (ring) {
            ring.setAttribute('opacity', '1');
            ring.setAttribute('stroke', '#3FA66B');
          }
        }
      }
    }
  }

  _calculateForwardTarget(pirate, symbol) {
    if (pirate.position === BOAT_INDEX) return null;
    for (let i = pirate.position + 1; i <= 36; i++) {
      const space = this.currentState.board[i];
      if (space.symbol === symbol && space.pirates.length === 0) {
        return i;
      }
    }
    return BOAT_INDEX;
  }

  _calculateBackwardTarget(pirate) {
    if (pirate.position === JAIL_INDEX || pirate.position === BOAT_INDEX) return null;
    for (let i = pirate.position - 1; i >= 1; i--) {
      const space = this.currentState.board[i];
      const count = space.pirates.length;
      if (count === 1 || count === 2) {
        return i;
      }
    }
    return null;
  }

  updateGhostElement() {
    const layer = this.container.querySelector('#ghost-preview-layer');
    if (!layer) return;

    if (!this.ghostPreview) {
      layer.innerHTML = '';
      return;
    }

    const { spaceIndex, color = '#E0A82E' } = this.ghostPreview;
    const coord = this.isMobile ? this._getCoordinatesVertical(spaceIndex) : this._getCoordinatesHorizontal(spaceIndex);
    const offsetY = (spaceIndex >= 1 && spaceIndex <= 36) ? 19 : 0;

    layer.innerHTML = `
      <g class="ghost-pirate-preview" transform="translate(${coord.x}, ${coord.y + offsetY})" opacity="0.8">
        <circle cx="0" cy="0" r="18" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4,4"/>
        <circle cx="0" cy="0" r="14" fill="${color}" opacity="0.45"/>
        <text x="0" y="1" text-anchor="middle" dominant-baseline="central" font-size="16">👻</text>
      </g>
    `;
  }

  highlightCrewBeacons(playerId) {
    if (!playerId || !this.currentState) return;
    const tokens = this.container.querySelectorAll('.pirate-token');
    tokens.forEach(t => {
      const pid = t.getAttribute('data-pirate-id');
      const pirate = this._findPirate(pid);
      if (pirate && pirate.owner === playerId) {
        t.classList.add('crew-beacon-pulse');
        setTimeout(() => t.classList.remove('crew-beacon-pulse'), 3800);
      }
    });
  }
}
