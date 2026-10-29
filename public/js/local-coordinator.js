/**
 * Cartagena: Escape Diaries - Local Game Coordinator
 * Powers instant Solo vs Bots and Local Pass & Play entirely in-browser.
 * Enables 100% offline gameplay, works on Netlify, mobile PWA, and Play Store with 0 latency.
 */

import { CartagenaEngine, PLAYER_COLORS } from './engine.js';
import { CartagenaBot } from './bot.js';

export class LocalCoordinator {
  constructor() {
    this.engine = null;
    this.handlers = new Map();
    this.roomCode = 'LOCAL';
    this.hostId = null;
    this.isPassAndPlay = false;
    this.messages = [];
    this.botTimer = null;
    this.settings = {
      maxSeats: 4,
      quickGame: false,
      turnTimer: 0,
      allowUndo: true,
      isPassAndPlay: false
    };
  }

  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType).add(handler);
    return () => this.off(eventType, handler);
  }

  off(eventType, handler) {
    const set = this.handlers.get(eventType);
    if (set) set.delete(handler);
  }

  emit(eventType, data) {
    const set = this.handlers.get(eventType);
    if (set) {
      set.forEach(fn => {
        try {
          fn(data);
        } catch (err) {
          console.error(`LocalCoordinator error in ${eventType} handler:`, err);
        }
      });
    }
  }

  startSoloGame({ hostName = 'Captain', difficulty = 'medium', botCount = 2 }) {
    if (this.botTimer) clearTimeout(this.botTimer);

    this.isPassAndPlay = false;
    this.roomCode = 'SOLO_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    this.hostId = 'player_host';
    this.messages = [];

    this.settings = {
      maxSeats: botCount + 1,
      quickGame: false,
      turnTimer: 0,
      allowUndo: true,
      isPassAndPlay: false
    };

    this.engine = new CartagenaEngine({
      maxSeats: this.settings.maxSeats,
      allowUndo: true
    });

    // 1. Add human host
    this.engine.addPlayer({
      id: this.hostId,
      name: hostName || 'Captain',
      color: 'red',
      isBot: false
    });

    // 2. Add bots with chosen difficulty
    const botNames = ['Barnaby', 'Calico', 'Pegleg', 'One-Eye', 'Morgan'];
    const colors = ['blue', 'green', 'yellow', 'purple'];
    for (let i = 0; i < botCount; i++) {
      const bId = `bot_${i + 1}`;
      const diffTag = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
      this.engine.addPlayer({
        id: bId,
        name: `Bot ${botNames[i % botNames.length]} (${diffTag})`,
        color: colors[i % colors.length],
        isBot: true,
        botDifficulty: difficulty
      });
    }

    this._broadcastRoomJoined(this.hostId);

    // Auto-start game
    setTimeout(() => {
      this.send('START_GAME');
    }, 150);
  }

  startPassAndPlay(playerNames = ['Captain Red', 'Captain Blue']) {
    if (this.botTimer) clearTimeout(this.botTimer);

    this.isPassAndPlay = true;
    this.roomCode = 'LOCAL_PASS';
    this.hostId = 'player_host';
    this.messages = [];

    this.settings = {
      maxSeats: playerNames.length,
      quickGame: false,
      turnTimer: 0,
      allowUndo: true,
      isPassAndPlay: true
    };

    this.engine = new CartagenaEngine({
      maxSeats: playerNames.length,
      allowUndo: true
    });

    const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
    playerNames.forEach((name, idx) => {
      this.engine.addPlayer({
        id: idx === 0 ? this.hostId : `p_${idx + 1}`,
        name: name || `Player ${idx + 1}`,
        color: colors[idx % colors.length],
        isBot: false
      });
    });

    this._broadcastRoomJoined(this.hostId);

    // Auto-start game
    setTimeout(() => {
      this.send('START_GAME');
    }, 150);
  }

  send(type, payload = {}) {
    if (!this.engine) return;

    try {
      const action = payload.action || type;

      switch (type) {
        case 'START_GAME':
          if (this.engine.status === 'WAITING') {
            this.engine.start();
            this.addSystemMessage('🏴‍☠️ All hands on deck! The great Cartagena Fortress escape has begun!');
            this._broadcastState();

            // If first player is bot, trigger bot
            const first = this.engine.getCurrentPlayer();
            if (first && first.isBot) {
              this._scheduleBotTurn(800);
            }
          }
          break;

        case 'PLAY_FORWARD':
        case 'FORWARD':
          {
            const current = this.engine.getCurrentPlayer();
            const effId = this.isPassAndPlay ? current.id : this.hostId;
            const res = this.engine.playForward({
              playerId: effId,
              pirateId: payload.pirateId,
              cardId: payload.cardId
            });
            this.addSystemMessage(`${current.name} dashed forward using a ${res.event.card}!`);
            this._broadcastState();
            this._checkNextTurn();
          }
          break;

        case 'MOVE_BACKWARD':
        case 'BACKWARD':
          {
            const current = this.engine.getCurrentPlayer();
            const effId = this.isPassAndPlay ? current.id : this.hostId;
            const res = this.engine.moveBackward({
              playerId: effId,
              pirateId: payload.pirateId
            });
            this.addSystemMessage(`${current.name} retreated a pirate to gather ${res.drawnCardsCount} card(s)!`);
            this._broadcastState();
            this._checkNextTurn();
          }
          break;

        case 'END_TURN':
          {
            const current = this.engine.getCurrentPlayer();
            const effId = this.isPassAndPlay ? current.id : this.hostId;
            this.engine.endTurn(effId);
            this.addSystemMessage(`${current.name} concluded their turn.`);
            this._broadcastState();
            this._checkNextTurn();
          }
          break;

        case 'UNDO':
          {
            const current = this.engine.getCurrentPlayer();
            const effId = this.isPassAndPlay ? current.id : this.hostId;
            this.engine.undo(effId);
            this.addSystemMessage(`${current.name} undid their last action.`);
            this._broadcastState();
          }
          break;

        case 'CHAT_SEND':
          if (payload.text) {
            const current = this.engine.getCurrentPlayer();
            const name = this.isPassAndPlay ? current.name : (this.engine.players.find(p => p.id === this.hostId)?.name || 'Captain');
            const chatMsg = {
              id: `msg_${Date.now()}`,
              playerId: this.hostId,
              playerName: name,
              text: payload.text.trim(),
              timestamp: Date.now()
            };
            this.messages.push(chatMsg);
            this.emit('CHAT_MESSAGE', { message: chatMsg });
          }
          break;

        default:
          console.warn('LocalCoordinator: unhandled message type', type);
      }
    } catch (err) {
      console.warn('LocalCoordinator action error:', err.message);
      this.emit('ERROR', { message: err.message });
    }
  }

  _checkNextTurn() {
    if (this.engine.status !== 'IN_PROGRESS') return;
    const current = this.engine.getCurrentPlayer();
    if (current && current.isBot) {
      this._scheduleBotTurn(800);
    }
  }

  _scheduleBotTurn(delayMs = 800) {
    if (this.botTimer) clearTimeout(this.botTimer);

    this.botTimer = setTimeout(() => {
      if (!this.engine || this.engine.status !== 'IN_PROGRESS') return;
      const current = this.engine.getCurrentPlayer();
      if (!current || !current.isBot) return;

      const difficulty = current.botDifficulty || 'medium';
      const decision = CartagenaBot.chooseAction(this.engine, current.id, difficulty);

      if (!decision || decision.action === 'END_TURN') {
        this.engine.endTurn(current.id);
        this.addSystemMessage(`${current.name} concluded their turn.`);
      } else if (decision.action === 'FORWARD') {
        const res = this.engine.playForward({
          playerId: current.id,
          pirateId: decision.move.pirateId,
          cardId: decision.move.cardId
        });
        this.addSystemMessage(`${current.name} dashed forward with ${decision.move.symbol}!`);
      } else if (decision.action === 'BACKWARD') {
        const res = this.engine.moveBackward({
          playerId: current.id,
          pirateId: decision.move.pirateId
        });
        this.addSystemMessage(`${current.name} moved backward to draw ${res.drawnCardsCount} card(s)!`);
      }

      this._broadcastState();

      // If next is still a bot, trigger next bot action
      const next = this.engine.getCurrentPlayer();
      if (this.engine.status === 'IN_PROGRESS' && next && next.isBot) {
        this._scheduleBotTurn(750);
      }
    }, delayMs);
  }

  addSystemMessage(text) {
    const msg = {
      id: `sys_${Date.now()}`,
      playerId: 'system',
      playerName: 'Captain Morgan',
      text,
      timestamp: Date.now(),
      isSystem: true
    };
    this.messages.push(msg);
    this.emit('CHAT_MESSAGE', { message: msg });
  }

  _broadcastRoomJoined(targetPlayerId) {
    const currentTurn = this.engine.getCurrentPlayer();
    const activeViewId = this.isPassAndPlay && currentTurn ? currentTurn.id : targetPlayerId;
    const state = this.engine.getStateView(activeViewId);

    this.emit('ROOM_JOINED', {
      roomCode: this.roomCode,
      playerId: targetPlayerId,
      hostId: this.hostId,
      state,
      messages: this.messages
    });
  }

  _broadcastState() {
    if (!this.engine) return;
    const currentTurn = this.engine.getCurrentPlayer();
    const activeViewId = this.isPassAndPlay && currentTurn ? currentTurn.id : this.hostId;
    const state = this.engine.getStateView(activeViewId);

    this.emit('STATE_UPDATE', {
      hostId: this.hostId,
      state
    });
  }

  serialize() {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      isPassAndPlay: this.isPassAndPlay,
      settings: this.settings,
      messages: this.messages,
      engineState: this.engine ? this.engine.serialize() : null
    };
  }

  restore(saved) {
    if (!saved || !saved.engineState) return false;
    try {
      this.roomCode = saved.roomCode || 'LOCAL';
      this.hostId = saved.hostId || 'player_host';
      this.isPassAndPlay = !!saved.isPassAndPlay;
      this.settings = saved.settings || this.settings;
      this.messages = saved.messages || [];
      this.engine = CartagenaEngine.deserialize(saved.engineState);
      if (!this.engine) return false;

      this._broadcastRoomJoined(this.hostId);
      this._broadcastState();
      this._checkNextTurn();
      return true;
    } catch (err) {
      console.warn('Failed to restore local session:', err);
      return false;
    }
  }
}
