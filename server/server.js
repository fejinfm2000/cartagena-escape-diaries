/**
 * Cartagena: Escape Diaries - Full-Stack Express & WebSocket Server (M2)
 * High-performance, low-latency authoritative game coordinator.
 */

import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomManager } from './room.js';
import { SYMBOLS, SYMBOL_META, PLAYER_COLORS } from './engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const roomManager = new RoomManager();

// Enable CORS for cross-origin Netlify requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'allow' }));

// Health Check for Render & uptime monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: Date.now() });
});

// Google Play Store Digital Asset Links (Required for Trusted Web Activity verification)
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', '.well-known', 'assetlinks.json'));
});

// REST Endpoints
app.post('/api/rooms', (req, res) => {
  try {
    const { hostName, hostColor, settings } = req.body;
    const hostId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const hostPlayer = {
      id: hostId,
      name: hostName?.trim() || 'Captain Morgan',
      color: hostColor || 'red',
      isBot: false
    };

    const room = roomManager.createRoom(hostPlayer, settings || {});
    const token = room.generateToken(hostId);

    res.json({
      success: true,
      roomCode: room.code,
      hostId,
      token,
      settings: room.settings
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/rooms/:code', (req, res) => {
  const room = roomManager.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  res.json({
    success: true,
    roomCode: room.code,
    status: room.engine.status,
    playerCount: room.engine.players.length,
    maxSeats: room.settings.maxSeats,
    settings: room.settings,
    players: room.engine.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isBot: p.isBot
    }))
  });
});

app.get('/api/meta', (req, res) => {
  res.json({
    symbols: SYMBOLS,
    symbolMeta: SYMBOL_META,
    playerColors: PLAYER_COLORS
  });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// WebSocket Connection Management
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomCode = url.searchParams.get('room');
  let token = url.searchParams.get('token');
  const playerName = url.searchParams.get('name') || 'Wandering Sailor';
  const playerColor = url.searchParams.get('color') || 'blue';

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room does not exist' }));
    ws.close();
    return;
  }

  let player = null;

  // Try reconnect with token
  if (token) {
    player = room.getPlayerByToken(token);
  }

  // If not reconnecting existing player, join new
  if (!player) {
    try {
      const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      player = room.joinPlayer({
        id: newPlayerId,
        name: playerName,
        color: playerColor,
        isBot: false
      });
      token = room.generateToken(newPlayerId);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', code: 'JOIN_FAILED', message: err.message }));
      ws.close();
      return;
    }
  }

  // Register socket in room
  room.attachSocket(player.id, ws);

  // Send token for storage in client localStorage/session
  ws.send(JSON.stringify({
    type: 'AUTHENTICATED',
    token,
    playerId: player.id,
    roomCode: room.code
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case 'START_GAME':
          room.startGame(player.id);
          break;

        case 'ACTION':
        case 'PLAY_FORWARD':
        case 'MOVE_BACKWARD':
        case 'END_TURN':
        case 'UNDO':
          room.handlePlayerAction(player.id, msg);
          break;

        case 'ADD_BOT':
          if (room.hostId === player.id) {
            room.addBot(msg.difficulty || 'medium');
          }
          break;

        case 'CHAT_SEND':
          room.addChatMessage(player.id, msg.text);
          break;

        case 'LEAVE_GAME':
          room.removePlayer(player.id);
          break;

        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
          break;

        default:
          console.warn('Unknown message type:', msg.type);
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        code: 'ACTION_ERROR',
        message: err.message
      }));
    }
  });

  ws.on('close', () => {
    room.detachSocket(player.id, ws);
  });

  ws.on('error', (err) => {
    console.error(`Socket error for ${player.id}:`, err.message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🏴‍☠️ Cartagena: Escape Diaries server running at:`);
  console.log(`   - Local:   http://localhost:${PORT}`);
  console.log(`   - Local:   http://127.0.0.1:${PORT}`);
  console.log(`   - Network: http://10.40.95.224:${PORT}`);
});
