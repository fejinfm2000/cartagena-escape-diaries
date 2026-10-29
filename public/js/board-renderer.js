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
    // 6 rows of 6 spaces snake path + Jail on top-left + Boat on bottom-right
    // Grid: 6 columns x 6 rows
    // Col 0..5, Row 0..5
    const cellWidth = 120;
    const cellHeight = 100;
    const startX = 220; // after Jail
    const startY = 40;

    if (spaceIndex === JAIL_INDEX) {
      return { x: 70, y: 190, width: 130, height: 260, isJail: true };
    }
    if (spaceIndex === BOAT_INDEX) {
      return { x: 990, y: 280, width: 140, height: 280, isBoat: true };
    }

    const pathIdx = spaceIndex - 1; // 0..35
    const row = Math.floor(pathIdx / 6); // 0..5
    const colInRow = pathIdx % 6; // 0..5
    // Snake pattern: even rows left->right, odd rows right->left
    const col = (row % 2 === 0) ? colInRow : (5 - colInRow);

    return {
      x: startX + col * cellWidth + cellWidth / 2,
      y: startY + row * cellHeight + cellHeight / 2,
      row,
      col
    };
  }

  _getCoordinatesVertical(spaceIndex) {
    // Vertical snake layout for mobile screens
    // 3 columns x 12 rows or 4 columns x 9 rows
    // 4 columns: 4 x 9 = 36 path spaces
    const cellWidth = 85;
    const cellHeight = 85;
    const startX = 25;
    const startY = 160;

    if (spaceIndex === JAIL_INDEX) {
      return { x: 195, y: 70, width: 340, height: 110, isJail: true };
    }
    if (spaceIndex === BOAT_INDEX) {
      return { x: 195, y: 1010, width: 340, height: 120, isBoat: true };
    }

    const pathIdx = spaceIndex - 1;
    const row = Math.floor(pathIdx / 4); // 0..8 (9 rows)
    const colInRow = pathIdx % 4; // 0..3
    // Snake pattern per row
    const col = (row % 2 === 0) ? colInRow : (3 - colInRow);

    return {
      x: startX + col * cellWidth + cellWidth / 2,
      y: startY + row * cellHeight + cellHeight / 2,
      row,
      col
    };
  }

  _renderHorizontalBoard(state) {
    const viewBoxWidth = 1160;
    const viewBoxHeight = 660;

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
    const viewBoxWidth = 390;
    const viewBoxHeight = 1160;

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
      <path d="${d}" fill="none" stroke="#D9BF86" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
      <path d="${d}" fill="none" stroke="#3B2A1A" stroke-width="4" stroke-dasharray="6,6" stroke-linecap="round" opacity="0.4"/>
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
      <path d="${d}" fill="none" stroke="#D9BF86" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
      <path d="${d}" fill="none" stroke="#3B2A1A" stroke-width="3" stroke-dasharray="5,5" stroke-linecap="round" opacity="0.4"/>
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
        <rect class="space-rect ${isFull ? 'space-full' : ''}" x="-57" y="-36" width="114" height="72" rx="9" ry="9" 
              fill="#F4E6C5" stroke="#3B2A1A" stroke-width="2.5" filter="url(#parchment-shadow)"/>
        
        <!-- Decorative inner dashed border -->
        <rect x="-53" y="-32" width="106" height="64" rx="7" ry="7" 
              fill="none" stroke="#D3BD8E" stroke-width="1.2" stroke-dasharray="4,2" pointer-events="none"/>

        <!-- Tile space index badge in top-left -->
        <rect x="-51" y="-30" width="22" height="15" rx="3" fill="#E8D2A0" stroke="#7A5C38" stroke-width="0.8" pointer-events="none"/>
        <text class="space-number" x="-40" y="-22" text-anchor="middle" dominant-baseline="central" font-family="'Pirata One', cursive" font-size="11" fill="#5C3B1E" pointer-events="none">${space.index}</text>

        <!-- Big, prominent symbol icon in top/center - NEVER obscured by pirates! -->
        <text class="space-symbol-icon" x="2" y="-9" text-anchor="middle" dominant-baseline="central" font-size="40" pointer-events="none">${meta.icon}</text>

        <!-- Pirate Tokens Container (docked across bottom) -->
        <g class="pirates-container" id="space-pirates-${space.index}">
          ${this._renderPiratesOnSpace(pirates, false)}
        </g>

        <!-- Highlight ring (dynamic rectangular border) -->
        <rect class="space-highlight-ring" x="-60" y="-39" width="120" height="78" rx="11" ry="11" fill="none" stroke="#E0A82E" stroke-width="3.5" opacity="0" pointer-events="none"/>
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
        <!-- Parchment space tile (Wide Rectangular Card) -->
        <rect class="space-rect ${isFull ? 'space-full' : ''}" x="-40" y="-34" width="80" height="68" rx="8" ry="8" 
              fill="#F4E6C5" stroke="#3B2A1A" stroke-width="2" filter="url(#parchment-shadow)"/>
        
        <!-- Decorative inner dashed border -->
        <rect x="-36" y="-30" width="72" height="60" rx="6" ry="6" 
              fill="none" stroke="#D3BD8E" stroke-width="1" stroke-dasharray="3,2" pointer-events="none"/>

        <!-- Tile space index badge in top-left -->
        <rect x="-35" y="-29" width="18" height="13" rx="3" fill="#E8D2A0" stroke="#7A5C38" stroke-width="0.7" pointer-events="none"/>
        <text class="space-number" x="-26" y="-22" text-anchor="middle" dominant-baseline="central" font-family="'Pirata One', cursive" font-size="10" fill="#5C3B1E" pointer-events="none">${space.index}</text>

        <!-- Big, prominent symbol icon in top/center -->
        <text class="space-symbol-icon" x="2" y="-8" text-anchor="middle" dominant-baseline="central" font-size="34" pointer-events="none">${meta.icon}</text>

        <!-- Pirate Tokens Container (docked across bottom) -->
        <g class="pirates-container" id="space-pirates-${space.index}">
          ${this._renderPiratesOnSpace(pirates, true)}
        </g>

        <!-- Highlight ring (dynamic rectangular border) -->
        <rect class="space-highlight-ring" x="-43" y="-37" width="86" height="74" rx="10" ry="10" fill="none" stroke="#E0A82E" stroke-width="3" opacity="0" pointer-events="none"/>
      </g>
    `;
  }

  _renderJailAreaHorizontal(jailSpace) {
    const coord = this._getCoordinatesHorizontal(JAIL_INDEX);
    const pirates = jailSpace.pirates || [];

    return `
      <g class="jail-area" id="space-group-0" data-space-index="0" transform="translate(${coord.x}, ${coord.y})">
        <!-- Fortress Stone Wall background -->
        <rect x="-65" y="-130" width="130" height="260" rx="14" fill="#2E333D" stroke="#1A1C22" stroke-width="4" filter="url(#parchment-shadow)" pointer-events="none"/>
        
        <!-- Jail bars -->
        <g stroke="#8A8F98" stroke-width="4" opacity="0.65" pointer-events="none">
          <line x1="-50" y1="-120" x2="-50" y2="120" />
          <line x1="-25" y1="-120" x2="-25" y2="120" />
          <line x1="0" y1="-120" x2="0" y2="120" />
          <line x1="25" y1="-120" x2="25" y2="120" />
          <line x1="50" y1="-120" x2="50" y2="120" />
        </g>

        <!-- Torch / Sign -->
        <rect x="-55" y="-120" width="110" height="32" rx="6" fill="#8F251E" stroke="#E0A82E" stroke-width="1.5" pointer-events="none"/>
        <text x="0" y="-100" text-anchor="middle" fill="#F2E2BA" font-family="'Pirata One', cursive" font-size="16" letter-spacing="1" pointer-events="none">CARTAGENA JAIL</text>

        <!-- Pirate tokens inside Jail (clustered grid) -->
        <g class="pirates-container jail-pirates" transform="translate(0, 10)">
          ${this._renderJailPirates(pirates)}
        </g>
      </g>
    `;
  }

  _renderJailAreaVertical(jailSpace) {
    const coord = this._getCoordinatesVertical(JAIL_INDEX);
    const pirates = jailSpace.pirates || [];

    return `
      <g class="jail-area" id="space-group-0" data-space-index="0" transform="translate(${coord.x}, ${coord.y})">
        <rect x="-170" y="-55" width="340" height="110" rx="12" fill="#2E333D" stroke="#1A1C22" stroke-width="3" filter="url(#parchment-shadow)" pointer-events="none"/>
        
        <rect x="-80" y="-48" width="160" height="24" rx="4" fill="#8F251E" stroke="#E0A82E" stroke-width="1" pointer-events="none"/>
        <text x="0" y="-32" text-anchor="middle" fill="#F2E2BA" font-family="'Pirata One', cursive" font-size="14" pointer-events="none">CARTAGENA FORTRESS JAIL</text>

        <g class="pirates-container jail-pirates" transform="translate(0, 12)">
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
        <ellipse cx="0" cy="0" rx="70" ry="140" fill="url(#water-gradient)" stroke="#14505C" stroke-width="3"/>

        <!-- Wooden Rowboat silhouette -->
        <path d="M -40 -90 Q -55 0 -40 90 Q 0 115 40 90 Q 55 0 40 -90 Q 0 -115 -40 -90 Z" 
              fill="#5C3B1E" stroke="#E0A82E" stroke-width="2.5" filter="url(#parchment-shadow)"/>
        
        <!-- Oars -->
        <line x1="-55" y1="-30" x2="-80" y2="-60" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>
        <line x1="55" y1="-30" x2="80" y2="-60" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>
        <line x1="-55" y1="30" x2="-80" y2="60" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>
        <line x1="55" y1="30" x2="80" y2="60" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>

        <!-- Title -->
        <text x="0" y="-70" text-anchor="middle" fill="#E0A82E" font-family="'Pirata One', cursive" font-size="15">ESCAPE BOAT</text>

        <!-- Escaped Pirates on Boat -->
        <g class="pirates-container boat-pirates" transform="translate(0, 10)">
          ${this._renderBoatPirates(pirates)}
        </g>
      </g>
    `;
  }

  _renderBoatAreaVertical(boatSpace) {
    const coord = this._getCoordinatesVertical(BOAT_INDEX);
    const pirates = boatSpace.pirates || [];

    return `
      <g class="boat-area" id="space-group-37" data-space-index="37" transform="translate(${coord.x}, ${coord.y})">
        <rect x="-170" y="-60" width="340" height="120" rx="12" fill="#14505C" stroke="#0B1F2A" stroke-width="3"/>
        
        <path d="M -140 -20 Q 0 -35 140 -20 Q 150 15 130 35 Q 0 45 -130 35 Q -150 15 -140 -20 Z" 
              fill="#5C3B1E" stroke="#E0A82E" stroke-width="2"/>

        <text x="0" y="-38" text-anchor="middle" fill="#E0A82E" font-family="'Pirata One', cursive" font-size="15">ROWBOAT TO FREEDOM (ESCAPE!)</text>

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
    if (isVertical) {
      const offsets = count === 1 ? [{ x: 0, y: 16 }] :
                      count === 2 ? [{ x: -20, y: 16 }, { x: 20, y: 16 }] :
                      [{ x: -26, y: 16 }, { x: 0, y: 16 }, { x: 26, y: 16 }];
      const size = count === 3 ? 10.5 : count === 2 ? 11.5 : 12;

      return pirateIds.map((pid, idx) => {
        const pos = offsets[idx] || { x: 0, y: 16 };
        return this._renderPirateToken(pid, pos.x, pos.y, size);
      }).join('');
    } else {
      const offsets = count === 1 ? [{ x: 0, y: 17 }] :
                      count === 2 ? [{ x: -26, y: 17 }, { x: 26, y: 17 }] :
                      [{ x: -32, y: 17 }, { x: 0, y: 17 }, { x: 32, y: 17 }];
      const size = count === 3 ? 12 : count === 2 ? 13 : 13.5;

      return pirateIds.map((pid, idx) => {
        const pos = offsets[idx] || { x: 0, y: 17 };
        return this._renderPirateToken(pid, pos.x, pos.y, size);
      }).join('');
    }
  }

  _renderJailPirates(pirateIds, isHorizontalLayout = false) {
    if (!pirateIds || pirateIds.length === 0) return '';
    // Grid display of pirates in Jail
    const cols = isHorizontalLayout ? 6 : 3;
    const spacingX = isHorizontalLayout ? 36 : 38;
    const spacingY = isHorizontalLayout ? 30 : 34;

    return pirateIds.map((pid, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = (col - (cols - 1) / 2) * spacingX;
      const y = (row - 1) * spacingY;
      return this._renderPirateToken(pid, x, y, 16);
    }).join('');
  }

  _renderBoatPirates(pirateIds, isHorizontalLayout = false) {
    if (!pirateIds || pirateIds.length === 0) return '';
    const cols = isHorizontalLayout ? 6 : 2;
    const spacingX = 34;
    const spacingY = 28;

    return pirateIds.map((pid, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = (col - (cols - 1) / 2) * spacingX;
      const y = (row - 1) * spacingY;
      return this._renderPirateToken(pid, x, y, 16, true);
    }).join('');
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
