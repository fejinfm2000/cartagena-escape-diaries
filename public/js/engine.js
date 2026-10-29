/**
 * Cartagena: Escape Diaries - Authoritative Rules Engine (M1)
 * Enforces all game rules, state transitions, validation, and deterministic replays.
 */

export const SYMBOLS = ['BOTTLE', 'PISTOL', 'KEY', 'SKULL', 'SWORD', 'HAT'];

export const SYMBOL_META = {
  BOTTLE: { id: 'BOTTLE', name: 'Rum Bottle', icon: '🍾', label: 'Bottle' },
  PISTOL: { id: 'PISTOL', name: 'Flintlock Pistol', icon: '🔫', label: 'Pistol' },
  KEY: { id: 'KEY', name: 'Jail Key', icon: '🗝️', label: 'Key' },
  SKULL: { id: 'SKULL', name: 'Pirate Skull', icon: '💀', label: 'Skull' },
  SWORD: { id: 'SWORD', name: 'Cutlass Dagger', icon: '⚔️', label: 'Sword' },
  HAT: { id: 'HAT', name: 'Tricorn Hat', icon: '🎩', label: 'Hat' }
};

export const PLAYER_COLORS = [
  { id: 'red', name: 'Crimson Buccaneer', hex: '#D64545', hatType: 'tricorn' },
  { id: 'blue', name: 'Deep Sea Raider', hex: '#3F7CD8', hatType: 'bandana' },
  { id: 'green', name: 'Tortuga Smuggler', hex: '#3FA66B', hatType: 'bicorne' },
  { id: 'yellow', name: 'Golden Galleon', hex: '#E5B93B', hatType: 'feather' },
  { id: 'purple', name: 'Shadow Corsair', hex: '#8E5BC9', hatType: 'beret' },
  { id: 'orange', name: 'Wildfire Swashbuckler', hex: '#FF7A30', hatType: 'tricorn' },
  { id: 'teal', name: 'Kraken Hunter', hex: '#14B8A6', hatType: 'bandana' },
  { id: 'pink', name: 'Siren Corsair', hex: '#E64980', hatType: 'feather' }
];

export const JAIL_INDEX = 0;
export const PATH_LENGTH = 36;
export const BOAT_INDEX = 37;
export const MAX_PIRATES_PER_SPACE = 3;
export const HAND_LIMIT = 6;
export const ACTIONS_PER_TURN = 3;
export const DEFAULT_PIRATES_PER_PLAYER = 6;

/**
 * Seeded PRNG (Mulberry32) for deterministic board and card shuffles
 */
export class PRNG {
  constructor(seed = Date.now()) {
    this.seed = (seed >>> 0) || 123456789;
  }

  next() {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/**
 * Generates the Cartagena 36-space board consisting of 6 tiles of 6 spaces each.
 * Each tile contains each of the 6 symbols exactly once, in random order.
 */
export function generateBoard(prng = new PRNG()) {
  const board = [];

  // Index 0: Jail
  board.push({
    index: JAIL_INDEX,
    symbol: 'JAIL',
    name: 'Cartagena Fortress (Jail)',
    pirates: []
  });

  // 6 tiles of 6 symbols
  const tiles = [];
  for (let t = 0; t < 6; t++) {
    tiles.push(prng.shuffle([...SYMBOLS]));
  }

  // Shuffle tile order as well
  const shuffledTiles = prng.shuffle(tiles);

  let spaceIndex = 1;
  for (const tile of shuffledTiles) {
    for (const sym of tile) {
      board.push({
        index: spaceIndex++,
        symbol: sym,
        name: `Space ${spaceIndex - 1}`,
        pirates: []
      });
    }
  }

  // Index 37: Boat
  board.push({
    index: BOAT_INDEX,
    symbol: 'BOAT',
    name: 'Rowboat to Freedom',
    pirates: []
  });

  return board;
}

/**
 * Builds the standard 102-card Cartagena deck:
 * 17 cards of each of the 6 symbols.
 */
export function generateDeck(prng = new PRNG()) {
  const cards = [];
  let idCounter = 1;
  for (const symbol of SYMBOLS) {
    for (let i = 0; i < 17; i++) {
      cards.push({
        id: `${symbol}_${String(idCounter++).padStart(3, '0')}`,
        symbol
      });
    }
  }
  return prng.shuffle(cards);
}

/**
 * Authoritative Game Engine
 */
export class CartagenaEngine {
  constructor(options = {}) {
    this.seed = options.seed !== undefined ? options.seed : Math.floor(Math.random() * 10000000);
    this.prng = new PRNG(this.seed);
    this.quickGame = !!options.quickGame; // 4 pirates instead of 6
    this.piratesPerPlayer = this.quickGame ? 4 : (options.piratesCount || DEFAULT_PIRATES_PER_PLAYER);
    this.turnTimerSeconds = options.turnTimer || 0; // 0 = off
    this.allowUndo = !!options.allowUndo;
    this.casualMode = !!options.casualMode;

    this.status = 'WAITING'; // WAITING, IN_PROGRESS, FINISHED
    this.board = generateBoard(this.prng);
    this.drawPile = generateDeck(this.prng);
    this.discardPile = [];
    this.players = [];
    this.currentPlayerIndex = 0;
    this.actionsLeft = ACTIONS_PER_TURN;
    this.turnNumber = 1;
    this.winnerId = null;
    this.rankings = [];
    this.history = [];
    this.turnHistory = []; // for undo support if enabled
    this.version = 1;
  }

  /**
   * Add a player to the game before start
   */
  addPlayer({ id, name, isBot = false, botDifficulty = 'medium', color = null }) {
    if (this.status !== 'WAITING') {
      throw new Error('Cannot add player: Game has already started');
    }
    if (this.players.length >= 5) {
      throw new Error('Cannot add player: Maximum 5 players allowed');
    }
    if (this.players.some(p => p.id === id)) {
      throw new Error(`Player with ID ${id} is already in the game`);
    }

    const assignedColor = color || PLAYER_COLORS[this.players.length % PLAYER_COLORS.length].id;
    const player = {
      id,
      name: name || `Pirate ${this.players.length + 1}`,
      color: assignedColor,
      isBot: !!isBot,
      botDifficulty,
      hand: [],
      pirates: [],
      connected: true
    };

    // Initialize pirates in Jail
    for (let i = 1; i <= this.piratesPerPlayer; i++) {
      const pirateId = `${player.id}_pirate_${i}`;
      const pirate = {
        id: pirateId,
        owner: player.id,
        indexNumber: i,
        position: JAIL_INDEX
      };
      player.pirates.push(pirate);
      this.board[JAIL_INDEX].pirates.push(pirateId);
    }

    this.players.push(player);
    return player;
  }

  /**
   * Start the game
   */
  start() {
    if (this.players.length < 2) {
      throw new Error('Cannot start: Minimum 2 players required');
    }
    if (this.status === 'IN_PROGRESS') {
      return;
    }

    // Deal 6 cards to each player
    for (const player of this.players) {
      player.hand = [];
      for (let i = 0; i < HAND_LIMIT; i++) {
        if (this.drawPile.length === 0) {
          this._reshuffleDiscard();
        }
        if (this.drawPile.length > 0) {
          player.hand.push(this.drawPile.pop());
        }
      }
    }

    this.status = 'IN_PROGRESS';
    this.currentPlayerIndex = 0;
    this.actionsLeft = ACTIONS_PER_TURN;
    this.turnNumber = 1;
    this.version++;
    this._recordHistory({ type: 'GAME_STARTED', seed: this.seed });

    // Check if initial player has no legal moves (rare, but handled)
    this._checkAndAutoSkipIfNeeded();
  }

  /**
   * Return current player object
   */
  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex] || null;
  }

  /**
   * Find pirate object by id
   */
  getPirate(pirateId) {
    for (const p of this.players) {
      const found = p.pirates.find(pir => pir.id === pirateId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Calculate valid forward destination space index for a pirate with a given symbol.
   * Nearest space ahead that shows symbol and has < 3 pirates.
   * If none ahead, returns BOAT_INDEX (37).
   */
  getValidForwardTarget(pirate, symbol) {
    if (pirate.position === BOAT_INDEX) {
      return null; // Pirate already on boat cannot move
    }

    const startPos = pirate.position;
    for (let i = startPos + 1; i <= PATH_LENGTH; i++) {
      const space = this.board[i];
      if (space.symbol === symbol && space.pirates.length === 0) {
        return i;
      }
    }

    // If no free space with that symbol exists ahead, goes to Boat
    return BOAT_INDEX;
  }

  /**
   * Calculate valid backward destination space index for a pirate.
   * Nearest space behind it that holds exactly 1 or 2 pirates.
   * Jail (0), empty spaces, and spaces with 3 pirates are skipped.
   * If none exists, returns null.
   */
  getValidBackwardTarget(pirate) {
    if (pirate.position === JAIL_INDEX || pirate.position === BOAT_INDEX) {
      return null; // Cannot move backward from Jail or Boat
    }

    for (let i = pirate.position - 1; i >= 1; i--) {
      const space = this.board[i];
      const count = space.pirates.length;
      if (count === 1 || count === 2) {
        return i;
      }
    }

    return null;
  }

  /**
   * Get all legal moves currently available for the active player.
   */
  getLegalMoves(playerId = null) {
    const active = this.getCurrentPlayer();
    if (!active || this.status !== 'IN_PROGRESS') return [];
    if (playerId && active.id !== playerId) return [];
    if (this.actionsLeft <= 0) return [];

    const moves = [];

    // Forward moves: for each pirate not on boat, for each unique symbol in hand
    const movablePirates = active.pirates.filter(p => p.position !== BOAT_INDEX);
    const uniqueSymbolsInHand = [...new Set(active.hand.map(c => c.symbol))];

    for (const pirate of movablePirates) {
      for (const symbol of uniqueSymbolsInHand) {
        const card = active.hand.find(c => c.symbol === symbol);
        const target = this.getValidForwardTarget(pirate, symbol);
        if (target !== null) {
          moves.push({
            type: 'FORWARD',
            pirateId: pirate.id,
            cardId: card.id,
            symbol,
            from: pirate.position,
            to: target
          });
        }
      }
    }

    // Backward moves: for each pirate in tunnel (not Jail, not Boat)
    const tunnelPirates = active.pirates.filter(p => p.position >= 1 && p.position <= PATH_LENGTH);
    for (const pirate of tunnelPirates) {
      const target = this.getValidBackwardTarget(pirate);
      if (target !== null) {
        const cardsToGain = this.board[target].pirates.length;
        moves.push({
          type: 'BACKWARD',
          pirateId: pirate.id,
          from: pirate.position,
          to: target,
          cardsGained: cardsToGain
        });
      }
    }

    return moves;
  }

  /**
   * Action A: Move Forward
   */
  playForward({ playerId, pirateId, cardId, symbol = null }) {
    this._validateTurn(playerId);

    const player = this.getCurrentPlayer();
    const pirate = player.pirates.find(p => p.id === pirateId);
    if (!pirate) {
      throw new Error(`Pirate ${pirateId} does not belong to active player`);
    }
    if (pirate.position === BOAT_INDEX) {
      throw new Error('Pirate is already on the boat and cannot move');
    }

    // Identify card
    let cardIndex = -1;
    if (cardId) {
      cardIndex = player.hand.findIndex(c => c.id === cardId);
    } else if (symbol) {
      cardIndex = player.hand.findIndex(c => c.symbol === symbol);
    }

    if (cardIndex === -1) {
      throw new Error(`Player does not have required card`);
    }

    const card = player.hand[cardIndex];
    const targetSpaceIndex = this.getValidForwardTarget(pirate, card.symbol);

    if (targetSpaceIndex === null) {
      throw new Error('No valid destination ahead');
    }

    // Save snapshot for potential undo
    const preActionState = this._captureActionSnapshot();

    // Remove card from hand -> discard pile
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);

    // Move pirate
    const fromIndex = pirate.position;
    this._movePirateInternal(pirate, targetSpaceIndex);

    this.actionsLeft--;
    this.version++;

    const event = {
      type: 'PIRATE_MOVED',
      via: 'FORWARD',
      playerId: player.id,
      pirateId: pirate.id,
      card: card.symbol,
      cardId: card.id,
      from: fromIndex,
      to: targetSpaceIndex,
      actionsLeft: this.actionsLeft,
      timestamp: Date.now()
    };
    this._recordHistory(event);
    this.turnHistory.push(preActionState);

    // Check win condition
    const won = this._checkWin(player);
    if (!won && this.actionsLeft === 0) {
      this.endTurn(player.id);
    }

    return { success: true, event, won };
  }

  /**
   * Action B: Move Backward
   */
  moveBackward({ playerId, pirateId }) {
    this._validateTurn(playerId);

    const player = this.getCurrentPlayer();
    const pirate = player.pirates.find(p => p.id === pirateId);
    if (!pirate) {
      throw new Error(`Pirate ${pirateId} does not belong to active player`);
    }
    if (pirate.position === JAIL_INDEX) {
      throw new Error('Pirate is still in Jail and cannot move backward');
    }
    if (pirate.position === BOAT_INDEX) {
      throw new Error('Pirate is on the Boat and cannot move');
    }

    const targetSpaceIndex = this.getValidBackwardTarget(pirate);
    if (targetSpaceIndex === null) {
      throw new Error('No valid backward space available (must have 1 or 2 pirates)');
    }

    const targetSpace = this.board[targetSpaceIndex];
    const cardsToDrawCount = targetSpace.pirates.length; // 1 or 2

    // Save snapshot for potential undo
    const preActionState = this._captureActionSnapshot();

    // Move pirate
    const fromIndex = pirate.position;
    this._movePirateInternal(pirate, targetSpaceIndex);

    // Draw cards equal to pirates that were there
    const drawnCards = this._drawCards(player, cardsToDrawCount);

    this.actionsLeft--;
    this.version++;

    const event = {
      type: 'PIRATE_MOVED',
      via: 'BACKWARD',
      playerId: player.id,
      pirateId: pirate.id,
      from: fromIndex,
      to: targetSpaceIndex,
      cardsGained: cardsToDrawCount,
      drawnCount: drawnCards.length,
      actionsLeft: this.actionsLeft,
      timestamp: Date.now()
    };
    this._recordHistory(event);
    this.turnHistory.push(preActionState);

    if (this.actionsLeft === 0) {
      this.endTurn(player.id);
    }

    return { success: true, event, drawnCardsCount: drawnCards.length };
  }

  /**
   * Action C: End Turn
   */
  endTurn(playerId) {
    // endTurn is valid even when actionsLeft === 0 (auto-end-turn after 3rd action)
    if (this.status !== 'IN_PROGRESS') {
      throw new Error('Game is not in progress');
    }
    const current = this.getCurrentPlayer();
    if (!current || current.id !== playerId) {
      throw new Error(`Not player ${playerId}'s turn (current: ${current?.id})`);
    }

    const player = this.getCurrentPlayer();

    // Refill hand up to 6 cards if player holds fewer than 6
    let drawn = [];
    if (player.hand.length < HAND_LIMIT) {
      const needed = HAND_LIMIT - player.hand.length;
      drawn = this._drawCards(player, needed);
    }

    const previousPlayerId = player.id;
    this.turnHistory = []; // Clear undo history on turn end

    // Move to next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.actionsLeft = ACTIONS_PER_TURN;
    this.turnNumber++;
    this.version++;

    const nextPlayer = this.getCurrentPlayer();
    const event = {
      type: 'TURN_CHANGED',
      previousPlayerId,
      currentPlayerId: nextPlayer.id,
      turnNumber: this.turnNumber,
      cardsRefilled: drawn.length,
      actionsLeft: ACTIONS_PER_TURN,
      timestamp: Date.now()
    };
    this._recordHistory(event);

    // Auto skip if next player has no legal moves
    this._checkAndAutoSkipIfNeeded();

    return { success: true, event, nextPlayerId: nextPlayer.id };
  }

  /**
   * Undo last action on current turn (if allowUndo is active and no draw occurred)
   */
  undo(playerId) {
    if (!this.allowUndo) {
      throw new Error('Undo is disabled in this match');
    }
    this._validateTurn(playerId);
    if (this.turnHistory.length === 0) {
      throw new Error('No actions to undo on this turn');
    }

    const previousSnapshot = this.turnHistory.pop();
    this._restoreActionSnapshot(previousSnapshot);
    this.version++;

    const event = {
      type: 'ACTION_UNDONE',
      playerId,
      actionsLeft: this.actionsLeft,
      timestamp: Date.now()
    };
    this._recordHistory(event);
    return { success: true, event };
  }

  // --- Internal Helpers ---

  _validateTurn(playerId) {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error('Game is not in progress');
    }
    const current = this.getCurrentPlayer();
    if (!current || current.id !== playerId) {
      throw new Error(`Not player ${playerId}'s turn (current: ${current?.id})`);
    }
    if (this.actionsLeft <= 0) {
      throw new Error('ACTION_LIMIT_REACHED');
    }
  }

  _movePirateInternal(pirate, destinationIndex) {
    const originSpace = this.board[pirate.position];
    const destSpace = this.board[destinationIndex];

    // Remove from origin space
    const idx = originSpace.pirates.indexOf(pirate.id);
    if (idx !== -1) {
      originSpace.pirates.splice(idx, 1);
    }

    // Add to destination space
    destSpace.pirates.push(pirate.id);
    pirate.position = destinationIndex;
  }

  _drawCards(player, count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        this._reshuffleDiscard();
      }
      if (this.drawPile.length > 0) {
        const card = this.drawPile.pop();
        player.hand.push(card);
        drawn.push(card);
      } else {
        break; // No cards left anywhere
      }
    }
    return drawn;
  }

  _reshuffleDiscard() {
    if (this.discardPile.length === 0) return;
    this.drawPile = this.prng.shuffle([...this.discardPile]);
    this.discardPile = [];
  }

  _checkWin(player) {
    const piratesOnBoat = player.pirates.filter(p => p.position === BOAT_INDEX).length;
    if (piratesOnBoat >= this.piratesPerPlayer) {
      this.status = 'FINISHED';
      this.winnerId = player.id;
      this._calculateRankings();
      this.version++;
      const event = {
        type: 'GAME_OVER',
        winnerId: player.id,
        rankings: this.rankings,
        timestamp: Date.now()
      };
      this._recordHistory(event);
      return true;
    }
    return false;
  }

  _calculateRankings() {
    // Ranking criteria:
    // 1. Most pirates on boat (descending)
    // 2. Tie-break 1: Furthest advanced remaining pirate position (descending)
    // 3. Tie-break 2: Fewest cards in hand (ascending)
    const scoredPlayers = this.players.map(p => {
      const onBoat = p.pirates.filter(pir => pir.position === BOAT_INDEX).length;
      const remainingPirates = p.pirates.filter(pir => pir.position !== BOAT_INDEX);
      const furthestRemaining = remainingPirates.length > 0
        ? Math.max(...remainingPirates.map(pir => pir.position))
        : BOAT_INDEX;
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        piratesOnBoat: onBoat,
        furthestRemaining,
        cardsCount: p.hand.length,
        isWinner: p.id === this.winnerId
      };
    });

    scoredPlayers.sort((a, b) => {
      if (b.piratesOnBoat !== a.piratesOnBoat) {
        return b.piratesOnBoat - a.piratesOnBoat;
      }
      if (b.furthestRemaining !== a.furthestRemaining) {
        return b.furthestRemaining - a.furthestRemaining;
      }
      return a.cardsCount - b.cardsCount;
    });

    this.rankings = scoredPlayers.map((sp, idx) => ({
      rank: idx + 1,
      ...sp
    }));
  }

  _checkAndAutoSkipIfNeeded() {
    if (this.status !== 'IN_PROGRESS') return;
    const legalMoves = this.getLegalMoves();
    if (legalMoves.length === 0) {
      const player = this.getCurrentPlayer();
      this._recordHistory({
        type: 'TURN_AUTO_SKIPPED',
        playerId: player.id,
        reason: 'NO_LEGAL_ACTIONS'
      });
      // Refill hand up to 6 if needed, then pass
      if (player.hand.length < HAND_LIMIT) {
        this._drawCards(player, HAND_LIMIT - player.hand.length);
      }
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      this.actionsLeft = ACTIONS_PER_TURN;
      this.turnNumber++;
    }
  }

  _recordHistory(event) {
    this.history.push({ ...event, version: this.version });
  }

  _captureActionSnapshot() {
    return {
      boardPirates: this.board.map(s => [...s.pirates]),
      players: this.players.map(p => ({
        id: p.id,
        hand: [...p.hand],
        pirates: p.pirates.map(pir => ({ ...pir }))
      })),
      drawPile: [...this.drawPile],
      discardPile: [...this.discardPile],
      actionsLeft: this.actionsLeft
    };
  }

  _restoreActionSnapshot(snapshot) {
    snapshot.boardPirates.forEach((pirates, idx) => {
      this.board[idx].pirates = [...pirates];
    });
    snapshot.players.forEach(pSnap => {
      const player = this.players.find(p => p.id === pSnap.id);
      if (player) {
        player.hand = [...pSnap.hand];
        player.pirates = pSnap.pirates.map(pir => ({ ...pir }));
      }
    });
    this.drawPile = [...snapshot.drawPile];
    this.discardPile = [...snapshot.discardPile];
    this.actionsLeft = snapshot.actionsLeft;
  }

  /**
   * Generates public state view safe to broadcast to any client.
   * Hands are masked to only counts; if forPlayerId is provided,
   * only that player's private hand cards are revealed.
   */
  getStateView(forPlayerId = null) {
    return {
      status: this.status,
      seed: this.seed,
      version: this.version,
      quickGame: this.quickGame,
      piratesPerPlayer: this.piratesPerPlayer,
      turnNumber: this.turnNumber,
      currentPlayerId: this.getCurrentPlayer()?.id || null,
      actionsLeft: this.actionsLeft,
      drawPileCount: this.drawPile.length,
      discardTop: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
      discardCount: this.discardPile.length,
      winnerId: this.winnerId,
      rankings: this.rankings,
      board: this.board.map(s => ({
        index: s.index,
        symbol: s.symbol,
        pirates: [...s.pirates]
      })),
      players: this.players.map(p => {
        const isSelf = p.id === forPlayerId;
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          isBot: p.isBot,
          botDifficulty: p.botDifficulty,
          connected: p.connected,
          cardCount: p.hand.length,
          hand: isSelf ? [...p.hand] : undefined, // STRICT PRIVACY ENFORCEMENT
          piratesOnBoat: p.pirates.filter(pir => pir.position === BOAT_INDEX).length,
          pirates: p.pirates.map(pir => ({
            id: pir.id,
            owner: pir.owner,
            position: pir.position,
            indexNumber: pir.indexNumber
          }))
        };
      })
    };
  }

  serialize() {
    return {
      seed: this.seed,
      quickGame: this.quickGame,
      piratesPerPlayer: this.piratesPerPlayer,
      turnTimerSeconds: this.turnTimerSeconds,
      allowUndo: this.allowUndo,
      casualMode: this.casualMode,
      status: this.status,
      board: this.board,
      drawPile: this.drawPile,
      discardPile: this.discardPile,
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      actionsLeft: this.actionsLeft,
      turnNumber: this.turnNumber,
      winnerId: this.winnerId,
      rankings: this.rankings,
      history: this.history,
      turnHistory: this.turnHistory,
      version: this.version
    };
  }

  static deserialize(data) {
    if (!data) return null;
    const engine = new CartagenaEngine({
      seed: data.seed,
      quickGame: data.quickGame,
      piratesCount: data.piratesPerPlayer,
      turnTimer: data.turnTimerSeconds,
      allowUndo: data.allowUndo,
      casualMode: data.casualMode
    });
    engine.status = data.status;
    engine.board = data.board;
    engine.drawPile = data.drawPile;
    engine.discardPile = data.discardPile;
    engine.players = data.players;
    engine.currentPlayerIndex = data.currentPlayerIndex;
    engine.actionsLeft = data.actionsLeft;
    engine.turnNumber = data.turnNumber;
    engine.winnerId = data.winnerId;
    engine.rankings = data.rankings;
    engine.history = data.history;
    engine.turnHistory = data.turnHistory;
    engine.version = data.version;
    return engine;
  }
}
