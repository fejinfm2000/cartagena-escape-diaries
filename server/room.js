/**
 * Cartagena: Escape Diaries - Room & Session Orchestration (M2)
 * Manages multiplayer rooms, WebSockets, player reconnects, chat, bots, and timers.
 */

import { CartagenaEngine, PLAYER_COLORS } from './engine.js';
import { CartagenaBot } from './bot.js';
import crypto from 'node:crypto';

export class Room {
  constructor(code, hostPlayer, settings = {}) {
    this.code = code.toUpperCase();
    this.hostId = hostPlayer.id;
    this.createdAt = Date.now();
    this.settings = {
      maxSeats: settings.maxSeats || 4,
      quickGame: !!settings.quickGame, // 4 pirates instead of 6
      turnTimer: settings.turnTimer || 0, // 0 = off, 30, 60, 90
      allowUndo: !!settings.allowUndo,
      botDifficulty: settings.botDifficulty || 'medium',
      isPassAndPlay: !!settings.isPassAndPlay
    };

    this.engine = new CartagenaEngine({
      quickGame: this.settings.quickGame,
      turnTimer: this.settings.turnTimer,
      allowUndo: this.settings.allowUndo
    });

    // Sockets map: playerId -> Set of WebSocket instances (supports multiple tabs / reconnects)
    this.clients = new Map();
    // Reconnect tokens: token -> playerId
    this.tokens = new Map();

    // Chat messages buffer (last 200)
    this.messages = [];
    this.chatRateLimits = new Map(); // playerId -> timestamps[]

    // Timers
    this.turnTimerInterval = null;
    this.turnDeadline = null;
    this.botTimerTimeout = null;

    // Add host as first player
    this._addPlayerInternal(hostPlayer);

    // If Pass & Play mode, add all additional local players
    if (this.settings.isPassAndPlay && Array.isArray(settings.passAndPlayPlayers)) {
      const colors = ['red', 'blue', 'green', 'yellow', 'purple'];
      for (let i = 1; i < settings.passAndPlayPlayers.length; i++) {
        const pName = settings.passAndPlayPlayers[i];
        const pId = `local_p${i + 1}_${Date.now()}`;
        this._addPlayerInternal({
          id: pId,
          name: pName || `Player ${i + 1}`,
          color: colors[i % colors.length],
          isBot: false
        });
      }
    }
  }

  generateToken(playerId) {
    const token = crypto.randomBytes(16).toString('hex');
    this.tokens.set(token, playerId);
    return token;
  }

  getPlayerByToken(token) {
    const playerId = this.tokens.get(token);
    return playerId ? this.engine.players.find(p => p.id === playerId) : null;
  }

  _addPlayerInternal(playerInfo) {
    return this.engine.addPlayer({
      id: playerInfo.id,
      name: playerInfo.name,
      isBot: !!playerInfo.isBot,
      botDifficulty: playerInfo.botDifficulty || this.settings.botDifficulty,
      color: playerInfo.color
    });
  }

  joinPlayer(playerInfo) {
    if (this.engine.status !== 'WAITING') {
      throw new Error('Game already in progress. Cannot join room.');
    }
    if (this.engine.players.length >= this.settings.maxSeats) {
      throw new Error('Room is full.');
    }

    const player = this._addPlayerInternal(playerInfo);
    this.addSystemMessage(`${player.name} boarded the ship!`);
    return player;
  }

  addBot(difficulty = 'medium', name = null) {
    if (this.engine.status !== 'WAITING') {
      throw new Error('Cannot add bot while game is in progress');
    }
    if (this.engine.players.length >= this.settings.maxSeats) {
      throw new Error('Room is full');
    }

    const botNumber = this.engine.players.filter(p => p.isBot).length + 1;
    const botName = name || `Bot ${['Barnaby', 'Calico', 'Pegleg', 'One-Eye', 'Morgan'][botNumber - 1] || 'Pirate'} (${difficulty.toUpperCase()})`;
    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const bot = this._addPlayerInternal({
      id: botId,
      name: botName,
      isBot: true,
      botDifficulty: difficulty
    });

    this.addSystemMessage(`${bot.name} was hired to fill the crew!`);
    this.broadcastState();
    return bot;
  }

  removePlayer(playerId) {
    if (this.engine.status === 'WAITING') {
      const idx = this.engine.players.findIndex(p => p.id === playerId);
      if (idx !== -1) {
        const removed = this.engine.players.splice(idx, 1)[0];
        // Reassign host if host left
        if (this.hostId === playerId && this.engine.players.length > 0) {
          this.hostId = this.engine.players[0].id;
          this.addSystemMessage(`${this.engine.players[0].name} is now the Captain (Host)!`);
        }
        this.addSystemMessage(`${removed.name} walked the plank (left the room).`);
        this.broadcastState();
      }
    } else {
      // In progress: mark as disconnected
      const player = this.engine.players.find(p => p.id === playerId);
      if (player) {
        player.connected = false;
        this.addSystemMessage(`${player.name} lost connection to the fortress.`);
        this.broadcastState();
        // If it was this player's turn, auto-play with bot after grace
        if (this.engine.getCurrentPlayer()?.id === playerId) {
          this._scheduleBotTurn(1500);
        }
      }
    }
  }

  attachSocket(playerId, socket) {
    if (!this.clients.has(playerId)) {
      this.clients.set(playerId, new Set());
    }
    this.clients.get(playerId).add(socket);

    const player = this.engine.players.find(p => p.id === playerId);
    if (player) {
      player.connected = true;
    }

    // Send private snapshot to connecting socket
    this.sendToSocket(socket, {
      type: 'ROOM_JOINED',
      roomCode: this.code,
      playerId,
      hostId: this.hostId,
      settings: this.settings,
      state: this.engine.getStateView(playerId),
      messages: this.messages.slice(-50)
    });

    this.broadcastState();
  }

  detachSocket(playerId, socket) {
    const playerSockets = this.clients.get(playerId);
    if (playerSockets) {
      playerSockets.delete(socket);
      if (playerSockets.size === 0) {
        this.clients.delete(playerId);
        const player = this.engine.players.find(p => p.id === playerId);
        if (player) {
          player.connected = false;
          this.broadcastState();
        }
      }
    }
  }

  startGame(requestingPlayerId) {
    if (this.hostId !== requestingPlayerId) {
      throw new Error('Only the room Captain (host) can start the game');
    }
    if (this.engine.players.length < 2) {
      throw new Error('At least 2 players are needed to escape Cartagena!');
    }

    this.engine.start();
    this.addSystemMessage('🏴‍☠️ The escape has begun! Sneak your pirates onto the rowboat!');
    this._startTurnTimer();
    this.broadcastState();

    // Check if initial player is a bot
    const current = this.engine.getCurrentPlayer();
    if (current && (current.isBot || !current.connected)) {
      this._scheduleBotTurn(800);
    }
  }

  handlePlayerAction(playerId, message) {
    const action = message.action || message.type;
    const { pirateId, cardId, symbol } = message;

    if (this.engine.status !== 'IN_PROGRESS') {
      throw new Error('Game is not currently active');
    }

    const current = this.engine.getCurrentPlayer();
    let effectivePlayerId = playerId;
    if (this.settings.isPassAndPlay && playerId === this.hostId) {
      effectivePlayerId = current.id;
    } else if (current.id !== playerId) {
      throw new Error('It is not your turn');
    }

    let result = null;

    switch (action) {
      case 'FORWARD':
      case 'PLAY_FORWARD':
        result = this.engine.playForward({ playerId: effectivePlayerId, pirateId, cardId, symbol });
        this.addSystemMessage(`${current.name} dashed forward using a ${result.event.card}!`);
        break;

      case 'BACKWARD':
      case 'MOVE_BACKWARD':
        result = this.engine.moveBackward({ playerId: effectivePlayerId, pirateId });
        this.addSystemMessage(`${current.name} retreated a pirate to gather ${result.drawnCardsCount} card(s)!`);
        break;

      case 'END_TURN':
        result = this.engine.endTurn(effectivePlayerId);
        this.addSystemMessage(`${current.name} concluded their turn.`);
        break;

      case 'UNDO':
        result = this.engine.undo(effectivePlayerId);
        this.addSystemMessage(`${current.name} undid their last action.`);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    this._resetTurnTimer();
    this.broadcastState();

    // Check if next/current player is a bot or disconnected
    const nextPlayer = this.engine.getCurrentPlayer();
    if (this.engine.status === 'IN_PROGRESS' && nextPlayer && (nextPlayer.isBot || !nextPlayer.connected)) {
      this._scheduleBotTurn(700);
    }

    return result;
  }

  _scheduleBotTurn(delayMs = 700) {
    if (this.botTimerTimeout) {
      clearTimeout(this.botTimerTimeout);
    }

    this.botTimerTimeout = setTimeout(() => {
      if (this.engine.status !== 'IN_PROGRESS') return;
      const current = this.engine.getCurrentPlayer();
      if (!current || (!current.isBot && current.connected)) return;

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
        this.addSystemMessage(`${current.name} moved forward with ${decision.move.symbol}!`);
      } else if (decision.action === 'BACKWARD') {
        const res = this.engine.moveBackward({
          playerId: current.id,
          pirateId: decision.move.pirateId
        });
        this.addSystemMessage(`${current.name} moved backward to draw ${res.drawnCardsCount} card(s)!`);
      }

      this._resetTurnTimer();
      this.broadcastState();

      // If next player is still bot/disconnected, continue
      const next = this.engine.getCurrentPlayer();
      if (this.engine.status === 'IN_PROGRESS' && next && (next.isBot || !next.connected)) {
        this._scheduleBotTurn(800);
      }
    }, delayMs);
  }

  _startTurnTimer() {
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
    }

    if (this.settings.turnTimer <= 0) return;

    this.turnDeadline = Date.now() + this.settings.turnTimer * 1000;

    this.turnTimerInterval = setInterval(() => {
      if (this.engine.status !== 'IN_PROGRESS') {
        clearInterval(this.turnTimerInterval);
        return;
      }

      if (Date.now() >= this.turnDeadline) {
        const current = this.engine.getCurrentPlayer();
        this.addSystemMessage(`⏰ Time expired for ${current?.name}! Turn passed.`);
        this.engine.endTurn(current?.id);
        this._resetTurnTimer();
        this.broadcastState();

        const next = this.engine.getCurrentPlayer();
        if (next && (next.isBot || !next.connected)) {
          this._scheduleBotTurn(600);
        }
      }
    }, 1000);
  }

  _resetTurnTimer() {
    if (this.settings.turnTimer > 0) {
      this.turnDeadline = Date.now() + this.settings.turnTimer * 1000;
    }
  }

  addChatMessage(playerId, text) {
    const cleanText = (text || '').trim();
    if (!cleanText) return null;
    if (cleanText.length > 300) {
      throw new Error('Message too long (max 300 characters)');
    }

    // Rate limiting: max 5 messages per 5 seconds
    const now = Date.now();
    const stamps = this.chatRateLimits.get(playerId) || [];
    const recent = stamps.filter(t => now - t < 5000);
    if (recent.length >= 5) {
      throw new Error('Shiver me timbers! You are sending messages too quickly.');
    }
    recent.push(now);
    this.chatRateLimits.set(playerId, recent);

    const sender = this.engine.players.find(p => p.id === playerId);
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'USER',
      playerId,
      senderName: sender ? sender.name : 'Unknown Pirate',
      senderColor: sender ? sender.color : 'red',
      text: cleanText,
      timestamp: now
    };

    this.messages.push(message);
    if (this.messages.length > 200) {
      this.messages.shift();
    }

    this.broadcast({
      type: 'CHAT_MESSAGE',
      message
    });

    return message;
  }

  addSystemMessage(text) {
    const message = {
      id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'SYSTEM',
      text,
      timestamp: Date.now()
    };
    this.messages.push(message);
    if (this.messages.length > 200) {
      this.messages.shift();
    }
    this.broadcast({
      type: 'CHAT_MESSAGE',
      message
    });
  }

  broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const [_, sockets] of this.clients) {
      for (const ws of sockets) {
        if (ws.readyState === 1) { // OPEN
          ws.send(data);
        }
      }
    }
  }

  broadcastState() {
    // Send customized privacy-safe state projection to each client
    for (const [playerId, sockets] of this.clients) {
      const targetPlayerId = (this.settings.isPassAndPlay && playerId === this.hostId)
        ? (this.engine.getCurrentPlayer()?.id || playerId)
        : playerId;
      const stateView = this.engine.getStateView(targetPlayerId);
      const payload = JSON.stringify({
        type: 'STATE_UPDATE',
        hostId: this.hostId,
        settings: this.settings,
        turnDeadline: this.turnDeadline,
        state: stateView
      });
      for (const ws of sockets) {
        if (ws.readyState === 1) {
          ws.send(payload);
        }
      }
    }
  }

  sendToSocket(socket, payload) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(payload));
    }
  }
}

/**
 * Global Room Registry
 */
export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostPlayer, settings = {}) {
    const code = this._generateUniqueCode();
    const room = new Room(code, hostPlayer, settings);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toUpperCase()) || null;
  }

  _generateUniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }
}
