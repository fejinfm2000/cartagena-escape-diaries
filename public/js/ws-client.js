/**
 * Cartagena: Escape Diaries - WebSocket Client (M2)
 * Robust realtime client with auto-reconnect, token authentication, and event pub/sub.
 */

export class WSClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.token = localStorage.getItem('cartagena_token') || null;
    this.roomCode = null;
    this.playerName = null;
    this.playerColor = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.connected = false;
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
          console.error(`Error in WS handler for ${eventType}:`, err);
        }
      });
    }
  }

  connect({ roomCode, name, color, token = null }) {
    if (this.ws) {
      this.disconnect();
    }

    this.roomCode = roomCode;
    this.playerName = name || 'Pirate';
    this.playerColor = color || 'red';
    if (token) this.token = token;

    const params = new URLSearchParams({
      room: this.roomCode,
      name: this.playerName,
      color: this.playerColor,
      token: this.token || ''
    });

    let wsUrl;
    const backend = window.__ENV__?.BACKEND_URL;
    if (backend && backend.trim()) {
      const wsBase = backend.replace(/^http/i, 'ws').replace(/\/$/, '');
      wsUrl = `${wsBase}/ws?${params.toString()}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?${params.toString()}`;
    }
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this._startHeartbeat();
      this.emit('CONNECTED', { roomCode: this.roomCode });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'AUTHENTICATED') {
          this.token = msg.token;
          localStorage.setItem('cartagena_token', msg.token);
          this.emit('AUTHENTICATED', msg);
        } else if (msg.type === 'PONG') {
          // heartbeat acknowledged
        } else {
          this.emit(msg.type, msg);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onclose = (event) => {
      this.connected = false;
      this._stopHeartbeat();
      this.emit('DISCONNECTED', { code: event.code, reason: event.reason });
      this._attemptReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket connection error:', err);
      this.emit('ERROR', { message: 'Connection lost' });
    };
  }

  disconnect() {
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message, WebSocket not connected:', type);
      return false;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _attemptReconnect() {
    if (this.reconnectAttempts >= 8) {
      this.emit('RECONNECT_FAILED');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);

    this.reconnectTimer = setTimeout(() => {
      console.log(`Attempting reconnect #${this.reconnectAttempts} to room ${this.roomCode}...`);
      this.connect({
        roomCode: this.roomCode,
        name: this.playerName,
        color: this.playerColor,
        token: this.token
      });
    }, delay);
  }
}
