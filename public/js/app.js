/**
 * Cartagena: Escape Diaries - Main Application Controller
 * Coordinates Views, WebSocket communication, User Input, and Audio.
 */

import { WSClient } from './ws-client.js';
import { LocalCoordinator } from './local-coordinator.js';
import { AudioManager } from './audio.js';
import { BoardRenderer } from './board-renderer.js';
import { Tutorial } from './tutorial.js';
import { SYMBOL_META, PLAYER_COLORS, JAIL_INDEX, BOAT_INDEX } from './engine-meta.js';

class CartagenaApp {
  constructor() {
    this.ws = new WSClient();
    this.localCoordinator = new LocalCoordinator();
    this.isLocalSession = false;
    this.audio = new AudioManager();
    this.boardRenderer = null;
    this.tutorial = null;

    this.currentView = 'landing';
    this.myPlayerId = null;
    this.roomCode = null;
    this.isHost = false;
    this.gameState = null;
    this.roomSettings = null;

    // Selection state for turn actions
    this.selectedCard = null;
    this.selectedPirateId = null;
    this.actionMode = null; // 'FORWARD' or 'BACKWARD'

    // Chat
    this.unreadChatCount = 0;
    this.isChatOpen = false;

    this._initElements();
    this._attachEventListeners();
    this._setupWebSocketHandlers();
    this._checkUrlParams();
    this._checkActiveSession();
    this._checkServerStatus();
  }

  _initElements() {
    // Views
    this.views = {
      landing: document.getElementById('landing-view'),
      lobby: document.getElementById('lobby-view'),
      game: document.getElementById('game-view'),
      gameover: document.getElementById('gameover-modal')
    };

    // Modals
    this.modals = {
      createRoom: document.getElementById('create-room-modal'),
      joinRoom: document.getElementById('join-room-modal'),
      botSetup: document.getElementById('bot-setup-modal'),
      passPlay: document.getElementById('pass-play-modal'),
      passDeviceOverlay: document.getElementById('pass-device-overlay'),
      tutorial: document.getElementById('tutorial-modal'),
      endGameConfirm: document.getElementById('end-game-confirm-modal'),
      serverConfig: document.getElementById('server-config-modal'),
      theme: document.getElementById('theme-modal'),
      boatRoster: document.getElementById('boat-roster-modal')
    };

    // End Game button in header
    this.btnEndGameHeader = document.getElementById('btn-end-game-header');
    this.btnThemeToggle = document.getElementById('theme-toggle-btn');
    this.btnThemeQuickToggle = document.getElementById('theme-quick-toggle');

    // Atmosphere & Theme Customization (§4)
    this.currentTheme = localStorage.getItem('cartagena_theme') || 'midnight';
    this.preferredColor = localStorage.getItem('cartagena_preferred_color') || 'red';
    this._applyTheme(this.currentTheme);

    this.isPassAndPlay = false;
    this.lastPassTurnPlayerId = null;

    // Components
    this.boardViewport = document.getElementById('board-container');
    this.boardContainer = document.getElementById('board-svg-wrapper') || this.boardViewport;
    this.handContainer = document.getElementById('hand-cards-container');
    this.opponentsContainer = document.getElementById('opponents-container');
    this.turnBanner = document.getElementById('turn-banner');
    this.actionPips = document.getElementById('action-pips');
    this.turnTimerDisplay = document.getElementById('turn-timer-display');
    this.btnForward = document.getElementById('btn-action-forward');
    this.btnBackward = document.getElementById('btn-action-backward');
    this.btnEndTurn = document.getElementById('btn-action-endturn');
    this.btnUndo = document.getElementById('btn-action-undo');

    // Laptop Layout & Sidebar Toggles (§3 & §4)
    this.gameTableLayout = document.querySelector('.game-table-layout');
    this.btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    this.btnToggleNextStep = document.getElementById('btn-toggle-next-step');
    this.nextStepCard = document.getElementById('next-step-card');
    this.btnToggleSidebarChat = document.getElementById('btn-toggle-sidebar-chat');
    this.sidebarChatBox = document.getElementById('sidebar-chat-box');

    // Crew Locator (§1)
    this.btnCrewLocator = document.getElementById('btn-crew-locator');
    this.crewLocatorPopover = document.getElementById('crew-locator-popover');
    this.crewPopoverClose = document.getElementById('crew-popover-close');
    this.crewPiratesList = document.getElementById('crew-pirates-list');
    this.crewCountSummary = document.getElementById('crew-count-summary');

    // Chat & Sidebar
    this.chatDrawer = document.getElementById('chat-drawer');
    this.chatMessagesContainer = document.getElementById('chat-messages-container');
    this.chatInput = document.getElementById('chat-input');
    this.chatSendBtn = document.getElementById('chat-send-btn');
    this.chatToggleBtn = document.getElementById('chat-toggle-btn');
    this.chatBadge = document.getElementById('chat-unread-badge');

    // Sidebar Next Step & Chat + Mobile Instruction
    this.nextStepBody = document.getElementById('next-step-body');
    this.mobileInstructionText = document.getElementById('mobile-instruction-text');
    this.sidebarChatMessages = document.getElementById('sidebar-chat-messages');
    this.sidebarChatInput = document.getElementById('sidebar-chat-input');
    this.sidebarChatSendBtn = document.getElementById('sidebar-chat-send-btn');

    // Initialize Board Renderer & Tutorial
    this.boardRenderer = new BoardRenderer(this.boardContainer, {
      onPirateClick: (pirateId) => this._handlePirateSelected(pirateId),
      onSpaceClick: (spaceIndex) => this._handleSpaceSelected(spaceIndex)
    });

    this.tutorial = new Tutorial(this.modals.tutorial);
  }

  _attachEventListeners() {
    // Audio mute toggle
    document.querySelectorAll('.mute-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const isMuted = this.audio.toggleMute();
        btn.textContent = isMuted ? '🔇' : '🔊';
        this._showToast(isMuted ? 'Sound muted' : 'Sound active');
      });
    });

    // Landing View buttons
    document.getElementById('btn-show-create')?.addEventListener('click', () => {
      this._showModal('createRoom');
    });

    document.getElementById('btn-show-join')?.addEventListener('click', () => {
      this._showModal('joinRoom');
    });

    document.getElementById('btn-show-bot-setup')?.addEventListener('click', () => {
      this._showModal('botSetup');
    });

    document.getElementById('btn-show-pass-play')?.addEventListener('click', () => {
      this._showModal('passPlay');
    });

    document.getElementById('btn-quick-solo')?.addEventListener('click', () => {
      this._showModal('botSetup');
    });

    document.getElementById('btn-how-to-play')?.addEventListener('click', () => {
      this.tutorial.show();
    });

    // Create Room Submit (Simplified Name-only)
    document.getElementById('form-create-room')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hostName = document.getElementById('create-player-name').value.trim() || 'Captain Morgan';
      const maxSeats = parseInt(document.getElementById('create-seats')?.value, 10) || 4;
      const quickGame = !!document.getElementById('create-quick-mode')?.checked;
      const turnTimer = parseInt(document.getElementById('create-timer')?.value, 10) || 0;

      await this._createRoom({ hostName, hostColor: this.preferredColor || 'red', settings: { maxSeats, quickGame, turnTimer, allowUndo: true } });
    });

    // Join Room Submit (Simplified Name & Code only)
    document.getElementById('form-join-room')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = document.getElementById('join-room-code').value.trim().toUpperCase();
      const name = document.getElementById('join-player-name').value.trim() || 'Buccaneer';

      if (!code) return;
      this._joinRoom(code, name, this.preferredColor || 'blue');
    });

    // Bot Setup Submit (§1 & §4: Choose Difficulty & Bot Count)
    document.getElementById('form-bot-setup')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('bot-player-name').value.trim() || 'Captain';
      const difficulty = document.querySelector('input[name="bot-difficulty"]:checked')?.value || 'medium';
      const botCount = parseInt(document.getElementById('bot-count-select').value, 10) || 1;
      await this._startCustomSolo({ name, difficulty, botCount, hostColor: this.preferredColor || 'red' });
    });

    // Pass & Play Player Count Change (§2)
    document.getElementById('pnp-player-count')?.addEventListener('change', (e) => {
      const count = parseInt(e.target.value, 10) || 2;
      const container = document.getElementById('pnp-names-container');
      if (container) {
        const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple'];
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
          const div = document.createElement('div');
          div.className = 'form-group';
          div.innerHTML = `
            <label class="form-label">Player ${i + 1} Name (${colors[i % colors.length]})</label>
            <input type="text" class="form-input pnp-name-input" value="Captain ${colors[i % colors.length]}" required maxlength="20">
          `;
          container.appendChild(div);
        }
      }
    });

    // Pass & Play Submit (§2)
    document.getElementById('form-pass-play')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.pnp-name-input'));
      const names = inputs.map((inp, idx) => inp.value.trim() || `Captain ${idx + 1}`);
      await this._startPassAndPlay(names);
    });

    // Pass Device Reveal Button (§2)
    document.getElementById('btn-reveal-turn')?.addEventListener('click', () => {
      this.modals.passDeviceOverlay?.classList.remove('active');
      this.audio.playFanfare();
    });

    // Server Configuration Modal
    document.getElementById('btn-config-server')?.addEventListener('click', () => {
      const input = document.getElementById('server-url-input');
      if (input) {
        input.value = localStorage.getItem('cartagena_backend_url') || window.__ENV__?.BACKEND_URL || '';
      }
      const testResult = document.getElementById('server-test-result');
      if (testResult) testResult.style.display = 'none';
      this._showModal('serverConfig');
    });

    document.getElementById('btn-test-server-url')?.addEventListener('click', async () => {
      const input = document.getElementById('server-url-input');
      const testResult = document.getElementById('server-test-result');
      if (!input || !testResult) return;
      let url = input.value.trim().replace(/\/$/, '');
      if (!url) {
        testResult.style.display = 'block';
        testResult.style.background = 'rgba(0,0,0,0.06)';
        testResult.style.color = '#5C3B1E';
        testResult.textContent = 'ℹ️ Default relative server will be used.';
        return;
      }
      testResult.style.display = 'block';
      testResult.style.background = 'rgba(224, 168, 46, 0.2)';
      testResult.style.color = '#8C6415';
      testResult.textContent = '⏳ Testing connection to server...';

      try {
        const start = Date.now();
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(6000) });
        const latency = Date.now() - start;
        if (res.ok) {
          testResult.style.background = 'rgba(63, 166, 107, 0.2)';
          testResult.style.color = '#1E5C38';
          testResult.textContent = `✅ Connected successfully! (${latency}ms latency) Server is ready for multiplayer.`;
        } else {
          testResult.style.background = 'rgba(179, 38, 30, 0.2)';
          testResult.style.color = '#B3261E';
          testResult.textContent = `⚠️ Server returned HTTP ${res.status}. Check URL.`;
        }
      } catch (err) {
        testResult.style.background = 'rgba(179, 38, 30, 0.2)';
        testResult.style.color = '#B3261E';
        testResult.textContent = '❌ Could not connect. Note: Free Render servers spin down after inactivity and may take 30-50s to wake up.';
      }
    });

    document.getElementById('form-server-config')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('server-url-input');
      let url = input?.value.trim().replace(/\/$/, '') || '';
      if (url) {
        localStorage.setItem('cartagena_backend_url', url);
        this._showToast('🌐 Cloud server URL saved!');
      } else {
        localStorage.removeItem('cartagena_backend_url');
        this._showToast('🌐 Reset to default local server');
      }
      this.modals.serverConfig?.classList.remove('active');
      await this._checkServerStatus();
    });

    // Mobile Board Quick Jump Navigation
    document.getElementById('btn-jump-jail')?.addEventListener('click', () => {
      this.boardViewport?.scrollTo({ top: 0, behavior: 'smooth' });
      this.audio.playPop();
    });

    document.getElementById('btn-jump-boat')?.addEventListener('click', () => {
      if (this.boardViewport) {
        this.boardViewport.scrollTo({ top: this.boardViewport.scrollHeight, behavior: 'smooth' });
      }
      this.audio.playPop();
    });

    document.getElementById('btn-jump-crew')?.addEventListener('click', () => {
      if (!this.boardViewport || !this.gameState) return;
      const myPirates = this.gameState.players.find(p => p.id === this.myPlayerId)?.pirates || [];
      const onPath = myPirates.filter(p => p.position >= 1 && p.position <= 36);
      if (onPath.length > 0) {
        const targetPos = onPath[0].position;
        const targetEl = document.getElementById(`space-group-${targetPos}`);
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          const parentRect = this.boardViewport.getBoundingClientRect();
          this.boardViewport.scrollBy({ top: rect.top - parentRect.top - 80, behavior: 'smooth' });
          this.audio.playPop();
          return;
        }
      }
      const onBoat = myPirates.filter(p => p.position === 37);
      if (onBoat.length === myPirates.length && myPirates.length > 0) {
        this.boardViewport.scrollTo({ top: this.boardViewport.scrollHeight, behavior: 'smooth' });
      } else {
        this.boardViewport.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.audio.playPop();
    });

    // Close Modals
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-container');
        if (modal) modal.classList.remove('active');
      });
    });

    // Lobby buttons
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      this.audio.playHop();
      this._send('START_GAME');
    });

    document.getElementById('btn-add-easy-bot')?.addEventListener('click', () => {
      this._send('ADD_BOT', { difficulty: 'easy' });
    });

    document.getElementById('btn-add-med-bot')?.addEventListener('click', () => {
      this._send('ADD_BOT', { difficulty: 'medium' });
    });

    document.getElementById('btn-add-hard-bot')?.addEventListener('click', () => {
      this._send('ADD_BOT', { difficulty: 'hard' });
    });

    document.getElementById('btn-copy-room-code')?.addEventListener('click', () => {
      if (this.roomCode) {
        navigator.clipboard.writeText(this.roomCode);
        this._showToast(`Room code ${this.roomCode} copied to clipboard!`);
      }
    });

    document.getElementById('btn-copy-room-link')?.addEventListener('click', () => {
      if (this.roomCode) {
        const url = `${window.location.origin}?room=${this.roomCode}`;
        navigator.clipboard.writeText(url);
        this._showToast('Invitation link copied! Share with your crew.');
      }
    });

    // Action Controls
    this.btnForward?.addEventListener('click', () => {
      this.actionMode = 'FORWARD';
      this._updateActionBar();
      this._updateTargetHighlights();
      this._updateNextStepInstructions();
      this._showToast('Select a card and target pirate to move forward');
    });

    this.btnBackward?.addEventListener('click', () => {
      this.actionMode = 'BACKWARD';
      this.selectedCard = null; // Card not needed for backward move
      this._updateActionBar();
      this._updateTargetHighlights();
      this._updateNextStepInstructions();
      this._showToast('Select a pirate to retreat and draw cards (+1 or +2)');
    });

    this.btnEndTurn?.addEventListener('click', () => {
      this.audio.playHop();
      this._send('END_TURN');
      this._resetSelection();
    });

    this.btnUndo?.addEventListener('click', () => {
      this._send('UNDO');
      this._resetSelection();
    });

    // Laptop Maximize Board / Sidebar Toggle (§3 & §4)
    this.btnToggleSidebar?.addEventListener('click', () => {
      const isHidden = this.gameTableLayout?.classList.toggle('sidebar-hidden');
      if (this.btnToggleSidebar) {
        this.btnToggleSidebar.textContent = isHidden ? '🧭 Show Sidebar' : '⛶ Maximize Board';
      }
      this.audio.playPop();
      setTimeout(() => {
        if (this.gameState) {
          this.boardRenderer.render(this.gameState, this.myPlayerId);
        }
      }, 260);
    });

    // Captain's Next Step Collapse Toggle (§3)
    this.btnToggleNextStep?.addEventListener('click', () => {
      const isCollapsed = this.nextStepCard?.classList.toggle('collapsed');
      if (this.btnToggleNextStep) {
        this.btnToggleNextStep.textContent = isCollapsed ? '▲' : '▼';
        this.btnToggleNextStep.setAttribute('title', isCollapsed ? 'Expand Captain\'s Next Step' : 'Collapse Captain\'s Next Step');
      }
      this.audio.playPop();
    });

    // Crew Chat Collapse Toggle (§3)
    this.btnToggleSidebarChat?.addEventListener('click', () => {
      const isCollapsed = this.sidebarChatBox?.classList.toggle('collapsed');
      if (this.btnToggleSidebarChat) {
        this.btnToggleSidebarChat.textContent = isCollapsed ? '▲' : '▼';
        this.btnToggleSidebarChat.setAttribute('title', isCollapsed ? 'Expand Crew Chat' : 'Collapse Crew Chat');
      }
      this.audio.playPop();
    });

    // Crew Locator Toggle & Popover (§1)
    this.btnCrewLocator?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = this.crewLocatorPopover?.classList.toggle('active');
      if (isActive) {
        this.boardRenderer.highlightCrewBeacons(this.myPlayerId);
        this.audio.playPop();
      }
    });

    this.crewPopoverClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.crewLocatorPopover?.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.crew-locator-wrapper')) {
        this.crewLocatorPopover?.classList.remove('active');
      }
    });

    // Chat controls
    this.chatToggleBtn?.addEventListener('click', () => {
      this._toggleChat();
    });

    document.getElementById('chat-close-btn')?.addEventListener('click', () => {
      this._toggleChat(false);
    });

    this.chatSendBtn?.addEventListener('click', () => this._sendChatMessage());
    this.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._sendChatMessage();
    });

    this.sidebarChatSendBtn?.addEventListener('click', () => this._sendChatMessage(true));
    this.sidebarChatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._sendChatMessage(true);
    });

    // Quick emoji reactions
    document.querySelectorAll('.quick-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-phrase') || btn.textContent.trim();
        this._send('CHAT_SEND', { text });
        this.audio.playPop();
      });
    });

    // Rematch / Back to Lobby
    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      this.modals.gameover?.classList.remove('active');
      localStorage.removeItem('cartagena_saved_session');
      if (this.isLocalSession) {
        this._switchView('landing');
      } else {
        this._switchView('lobby');
      }
    });
    document.getElementById('btn-exit-lobby')?.addEventListener('click', () => {
      this.modals.gameover?.classList.remove('active');
      localStorage.removeItem('cartagena_saved_session');
      if (!this.isLocalSession) {
        this.ws.disconnect();
      }
      this.isLocalSession = false;
      this._switchView('landing');
    });

    // End Game buttons (header icon + turn banner button)
    document.getElementById('btn-end-game-header')?.addEventListener('click', () => {
      this._showEndGameConfirm();
    });
    document.getElementById('btn-end-game-banner')?.addEventListener('click', () => {
      this._showEndGameConfirm();
    });

    // End Game Confirmation Modal buttons
    document.getElementById('btn-cancel-end-game')?.addEventListener('click', () => {
      this.modals.endGameConfirm?.classList.remove('active');
    });
    document.getElementById('btn-confirm-end-game')?.addEventListener('click', () => {
      this._confirmEndGame();
    });

    // Theme & Atmosphere Selector (§4)
    this.btnThemeToggle?.addEventListener('click', () => {
      this._renderThemeSwatches();
      this._applyTheme(this.currentTheme);
      this._showModal('theme');
      this.audio.playPop();
    });

    // 1-Click Light / Dark Quick Toggle
    this.btnThemeQuickToggle?.addEventListener('click', () => {
      const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
      this._applyTheme(nextTheme);
      this.audio.playHop();
      this._showToast(`Atmosphere switched to: ${nextTheme === 'light' ? '☀️ Port Royal (Light)' : '🌙 Fortress (Dark)'}`);
    });

    document.querySelectorAll('#theme-options-grid .theme-card').forEach(card => {
      card.addEventListener('click', () => {
        const themeId = card.getAttribute('data-theme');
        if (themeId) {
          this._applyTheme(themeId);
          this.audio.playHop();
          this._showToast(`Atmosphere set to: ${card.querySelector('.theme-title')?.textContent || themeId}`);
        }
      });
    });
  }

  _send(type, payload = {}) {
    if (this.isLocalSession) {
      this.localCoordinator.send(type, payload);
    } else {
      this.ws.send(type, payload);
    }
  }

  _setupWebSocketHandlers() {
    const bindTransport = (source) => {
      source.on('ROOM_JOINED', (data) => {
        this.roomCode = data.roomCode;
        this.myPlayerId = data.playerId;
        this.isHost = data.hostId === data.playerId;
        this.gameState = data.state;
        this.roomSettings = data.settings || {};

        if (data.state.status === 'IN_PROGRESS') {
          this._switchView('game');
        } else {
          this._switchView('lobby');
        }
        this._renderLobby();
        this._renderGame();

        // Render past messages
        if (data.messages) {
          this.chatMessagesContainer.innerHTML = '';
          data.messages.forEach(msg => this._appendChatMessage(msg));
        }
      });

      source.on('STATE_UPDATE', (data) => {
        this.isHost = data.hostId === this.myPlayerId;
        if (data.settings) this.roomSettings = data.settings;
        const prevEscapedIds = new Set((this.gameState?.escapedWinners || []).map(w => w.id));
        const prevPlayerId = this.gameState?.currentPlayerId;
        this.gameState = data.state;

        // Announce new podium escapees (1st, 2nd, 3rd Winner)
        if (data.state.escapedWinners && data.state.escapedWinners.length > 0) {
          data.state.escapedWinners.forEach(w => {
            if (!prevEscapedIds.has(w.id)) {
              const isMe = w.id === this.myPlayerId;
              const rankName = w.rank === 1 ? '🥇 1st Place Winner' : w.rank === 2 ? '🥈 2nd Place Winner' : w.rank === 3 ? '🥉 3rd Place Winner' : `🏅 #${w.rank} Escaped`;
              if (isMe) {
                this.audio.playCannon();
                this.audio.playFanfare();
                this._showToast(`🎉 HUZZAH! You won ${rankName}! Your crew is safe on the rowboat!`);
              } else {
                this.audio.playCannon();
                this._showToast(`⛵ Captain ${w.name} secured ${rankName}! Race continues for remaining crew!`);
              }
            }
          });
        }

        // Check view transition
        if (data.state.status === 'IN_PROGRESS' && this.currentView !== 'game') {
          this._switchView('game');
          this.audio.playFanfare();
        }

        // Pass & Play Turn Transition (§2)
        if (this.isPassAndPlay && data.state.status === 'IN_PROGRESS') {
          const currentTurnId = data.state.currentPlayerId;
          if (currentTurnId && this.lastPassTurnPlayerId && currentTurnId !== this.lastPassTurnPlayerId) {
            const nextPlayer = data.state.players.find(p => p.id === currentTurnId);
            if (nextPlayer) {
              const nextNameElem = document.getElementById('pass-device-next-name');
              const btnNameElem = document.getElementById('btn-reveal-name');
              if (nextNameElem) nextNameElem.textContent = nextPlayer.name;
              if (btnNameElem) btnNameElem.textContent = nextPlayer.name;
              this.modals.passDeviceOverlay?.classList.add('active');
              this.audio.playPop();
            }
          }
          this.lastPassTurnPlayerId = currentTurnId;
          this.myPlayerId = currentTurnId;
        }

        this._renderLobby();
        this._renderGame();

        // Turn notification
        if (data.state.status === 'IN_PROGRESS' && data.state.currentPlayerId === this.myPlayerId && prevPlayerId !== this.myPlayerId) {
          this.audio.playCard();
          this.audio.vibrate([100, 50, 100]);
          this._showToast(`🏴‍☠️ ${this.isPassAndPlay ? this.gameState.players.find(p=>p.id===this.myPlayerId)?.name : 'Captain'}! It is your turn! Take up to 3 actions.`);
        }

        // Persist active local session to localStorage
        if (this.isLocalSession && data.state.status === 'IN_PROGRESS') {
          try {
            localStorage.setItem('cartagena_saved_session', JSON.stringify(this.localCoordinator.serialize()));
          } catch (e) {
            console.warn('Could not save session to localStorage:', e);
          }
        }

        // Game Over check
        if (data.state.status === 'FINISHED') {
          localStorage.removeItem('cartagena_saved_session');
          this._showGameOver(data.state);
        }
      });

      source.on('CHAT_MESSAGE', (data) => {
        this._appendChatMessage(data.message);
        this.audio.playPop();
        if (!this.isChatOpen) {
          this.unreadChatCount++;
          this._updateChatBadge();
        }
      });

      source.on('ERROR', (data) => {
        this._showToast(`⚠️ ${data.message || 'Error occurred'}`);
      });
    };

    bindTransport(this.ws);
    bindTransport(this.localCoordinator);
  }

  _checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      document.getElementById('join-room-code').value = room.toUpperCase();
      this._showModal('joinRoom');
    }
  }

  _getApiUrl(path) {
    const backend = localStorage.getItem('cartagena_backend_url') || window.__ENV__?.BACKEND_URL;
    if (backend && backend.trim()) {
      return `${backend.replace(/\/$/, '')}${path}`;
    }
    return path;
  }

  async _checkServerStatus() {
    const statusText = document.getElementById('server-status-text');
    if (!statusText) return;
    try {
      const url = this._getApiUrl('/health');
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        statusText.innerHTML = '🟢 <span style="color:#287A4C; font-weight:700;">Cloud Server Online</span> (Multiplayer Ready)';
      } else {
        statusText.innerHTML = '⚪ <span>Server Offline / Standby</span>';
      }
    } catch {
      statusText.innerHTML = '⚪ <span>Pass & Play / Bots Ready</span> (No Cloud Server)';
    }
  }

  async _createRoom({ hostName, hostColor, settings }) {
    this.isLocalSession = false;
    try {
      const res = await fetch(this._getApiUrl('/api/rooms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName, hostColor, settings })
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.success) {
        this._showToast(data.error);
        return;
      }

      this._hideAllModals();
      this.roomCode = data.roomCode;
      this.myPlayerId = data.hostId;
      this.isHost = true;
      this.isPassAndPlay = false;

      this.ws.connect({
        roomCode: data.roomCode,
        name: hostName,
        color: hostColor,
        token: data.token
      });
    } catch (err) {
      this._showToast('⚠️ Online Multiplayer requires a live game server. For instant play with no server, choose "Play vs Bots" or "Local Pass & Play"!');
    }
  }

  _joinRoom(code, name, color) {
    this.isLocalSession = false;
    this._hideAllModals();
    this.ws.connect({ roomCode: code, name, color });
  }

  _startCustomSolo({ name, difficulty, botCount, hostColor }) {
    this._hideAllModals();
    this.isLocalSession = true;
    this.isPassAndPlay = false;
    this.lastPassTurnPlayerId = null;
    this.localCoordinator.startSoloGame({ hostName: name, hostColor: hostColor || this.preferredColor || 'red', difficulty, botCount });
  }

  _startPassAndPlay(playerNames) {
    this._hideAllModals();
    this.isLocalSession = true;
    this.isPassAndPlay = true;
    this.lastPassTurnPlayerId = null;
    this.localCoordinator.startPassAndPlay(playerNames);
  }

  _startQuickSolo() {
    this._startCustomSolo({ name: 'You (Captain)', difficulty: 'medium', botCount: 1 });
  }

  _switchView(viewName) {
    this.currentView = viewName;
    Object.keys(this.views).forEach(key => {
      if (this.views[key]) {
        this.views[key].classList.toggle('active', key === viewName);
      }
    });

    // Show/hide End Game button in header based on view
    if (this.btnEndGameHeader) {
      this.btnEndGameHeader.style.display = (viewName === 'game') ? 'flex' : 'none';
    }

    if (viewName === 'game') {
      if (window.location.hash !== '#play') {
        window.history.replaceState(null, '', '#play');
      }
      setTimeout(() => {
        if (this.gameState) {
          this.boardRenderer.render(this.gameState, this.myPlayerId);
        }
      }, 100);
    } else if (viewName === 'landing') {
      if (window.location.hash === '#play') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }

  _checkActiveSession() {
    const savedStr = localStorage.getItem('cartagena_saved_session');
    if (savedStr) {
      try {
        const saved = JSON.parse(savedStr);
        if (saved && saved.engineState && saved.engineState.status === 'IN_PROGRESS') {
          this.isLocalSession = true;
          this.isPassAndPlay = !!saved.isPassAndPlay;
          this.myPlayerId = saved.hostId || 'player_host';
          const restored = this.localCoordinator.restore(saved);
          if (restored) {
            this._switchView('game');
            this._showToast('🏴‍☠️ Welcome back, Captain! Your escape diary has been resumed.');
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to restore active session:', err);
        localStorage.removeItem('cartagena_saved_session');
      }
    }

    if (window.location.hash === '#play') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  _showModal(modalName) {
    if (this.modals[modalName]) {
      this.modals[modalName].classList.add('active');
    }
  }

  _hideAllModals() {
    Object.values(this.modals).forEach(m => m?.classList.remove('active'));
  }

  // --- Atmosphere & Theme Customization (§4) ---

  _applyTheme(themeId) {
    this.currentTheme = themeId;
    if (themeId === 'midnight') {
      document.body.removeAttribute('data-theme');
    } else {
      document.body.setAttribute('data-theme', themeId);
    }
    localStorage.setItem('cartagena_theme', themeId);

    if (this.btnThemeQuickToggle) {
      this.btnThemeQuickToggle.textContent = themeId === 'light' ? '☀️' : '🌙';
      this.btnThemeQuickToggle.title = themeId === 'light' ? 'Current: Light. Click for Dark Theme' : 'Current: Dark. Click for Light Theme';
    }

    // Update active state in theme modal cards
    document.querySelectorAll('#theme-options-grid .theme-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-theme') === themeId);
    });
  }

  _setPreferredColor(colorId) {
    this.preferredColor = colorId;
    localStorage.setItem('cartagena_preferred_color', colorId);

    // Update active state in swatches
    document.querySelectorAll('.crew-color-swatches .color-swatch-btn').forEach(swatch => {
      swatch.classList.toggle('selected', swatch.getAttribute('data-color') === colorId);
    });
    const colName = PLAYER_COLORS.find(c => c.id === colorId)?.name || colorId;
    this._showToast(`🏴‍☠️ Preferred crew color: ${colName}`);
    this.audio.playPop();
  }

  _renderThemeSwatches() {
    const container = document.getElementById('theme-color-swatches');
    if (!container) return;
    container.innerHTML = '';
    PLAYER_COLORS.forEach(col => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `color-swatch-btn ${col.id === this.preferredColor ? 'selected' : ''}`;
      btn.setAttribute('data-color', col.id);
      btn.title = col.name;
      btn.style.backgroundColor = col.hex;
      btn.addEventListener('click', () => this._setPreferredColor(col.id));
      container.appendChild(btn);
    });
  }

  // --- Rendering UI Sections ---

  _renderLobby() {
    if (!this.gameState || this.currentView !== 'lobby') return;

    document.getElementById('lobby-room-code-display').textContent = this.roomCode;

    // Player slots
    const slotsContainer = document.getElementById('lobby-player-slots');
    slotsContainer.innerHTML = '';

    const maxSeats = this.roomSettings?.maxSeats || (this.gameState.players.length >= 4 ? 5 : 4);
    for (let i = 0; i < maxSeats; i++) {
      const player = this.gameState.players[i];
      const slot = document.createElement('div');
      slot.className = `lobby-slot ${player ? 'occupied' : 'empty'}`;

      if (player) {
        const colMeta = PLAYER_COLORS.find(c => c.id === player.color) || { hex: '#D64545' };
        slot.innerHTML = `
          <div class="slot-badge" style="background-color: ${colMeta.hex}">🏴‍☠️</div>
          <div class="slot-info">
            <span class="slot-name">${player.name} ${player.id === this.myPlayerId ? '(You)' : ''}</span>
            <span class="slot-type">${player.isBot ? `🤖 Bot (${player.botDifficulty})` : '👤 Crew Member'}</span>
          </div>
          ${player.id === this.gameState.players[0].id ? '<span class="crown-badge">👑 Captain</span>' : ''}
        `;
      } else {
        slot.innerHTML = `
          <div class="slot-badge empty-badge">+</div>
          <div class="slot-info">
            <span class="slot-name">Waiting for Pirate ${i + 1}...</span>
            <span class="slot-type">Invite a friend or recruit a bot</span>
          </div>
        `;
      }
      slotsContainer.appendChild(slot);
    }

    // Host controls
    const startBtn = document.getElementById('btn-start-game');
    const botControls = document.getElementById('lobby-bot-controls');
    if (this.isHost) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = this.gameState.players.length < 2;
      const isRoomFull = this.gameState.players.length >= maxSeats;
      botControls.style.display = isRoomFull ? 'none' : 'flex';
    } else {
      startBtn.style.display = 'none';
      botControls.style.display = 'none';
    }
  }

  _renderGame() {
    if (!this.gameState || this.currentView !== 'game') return;

    const isMyTurn = this.gameState.currentPlayerId === this.myPlayerId;
    const activePlayer = this.gameState.players.find(p => p.id === this.gameState.currentPlayerId);
    const myEscape = (this.gameState.escapedWinners || []).find(w => w.id === this.myPlayerId);

    // Update Turn Banner safely without erasing action-pips or toggle button
    const turnHighlight = this.turnBanner.querySelector('.turn-highlight');
    if (myEscape) {
      this.turnBanner.className = 'turn-banner other-turn-banner';
      if (turnHighlight) {
        const medal = myEscape.rank === 1 ? '🥇 1st Place Winner' : myEscape.rank === 2 ? '🥈 2nd Place Winner' : '🥉 3rd Place Winner';
        turnHighlight.innerHTML = `🎉 <strong>${medal}!</strong> Your crew is aboard the rowboat! Watching remaining captains race...`;
      }
    } else if (isMyTurn) {
      this.turnBanner.className = 'turn-banner my-turn-banner';
      if (turnHighlight) {
        turnHighlight.innerHTML = `⭐ IT'S YOUR TURN! <span class="turn-instructions" style="font-size:0.9rem; font-family:var(--font-diary); color:#F2E2BA; font-weight:normal; margin-left:0.4rem;">${this.actionMode === 'BACKWARD' ? 'Retreat pirate for cards' : 'Play card & leap forward'}</span>`;
      }
    } else {
      this.turnBanner.className = 'turn-banner other-turn-banner';
      if (turnHighlight) {
        turnHighlight.innerHTML = `Waiting for <strong>${activePlayer?.name || 'Captain'}</strong>...`;
      }
    }

    // Update Action Pips (●●●)
    const actionsLeft = this.gameState.actionsLeft || 0;
    if (this.actionPips) {
      this.actionPips.innerHTML = `
        <span class="pip ${actionsLeft >= 1 ? 'filled' : ''}">●</span>
        <span class="pip ${actionsLeft >= 2 ? 'filled' : ''}">●</span>
        <span class="pip ${actionsLeft >= 3 ? 'filled' : ''}">●</span>
        <span class="pip-label">${actionsLeft} action${actionsLeft === 1 ? '' : 's'} left</span>
      `;
    }

    // Render Opponents Strip
    this._renderOpponentsStrip();

    // Render Player's Private Hand
    this._renderHand();

    // Update Board SVG
    this.boardRenderer.render(this.gameState, this.myPlayerId);

    // Update Action buttons state & Crew Locator (§1)
    this._updateActionBar();
    this._updateNextStepInstructions();
    this._updateCrewLocator();
  }

  _showBoatRoster() {
    if (!this.gameState || !this.gameState.players) return;
    const listEl = document.getElementById('boat-roster-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const escapedWinners = this.gameState.escapedWinners || [];
    const targetCount = this.gameState.piratesPerPlayer || (this.gameState.settings?.quickGame ? 4 : 6);

    // Sort players: finished winners first by rank, then by boatCount descending
    const sorted = [...this.gameState.players].sort((a, b) => {
      const aWinner = escapedWinners.find(w => w.id === a.id);
      const bWinner = escapedWinners.find(w => w.id === b.id);
      if (aWinner && bWinner) return aWinner.rank - bWinner.rank;
      if (aWinner) return -1;
      if (bWinner) return 1;
      const aBoat = (a.pirates || []).filter(p => p.position === BOAT_INDEX).length;
      const bBoat = (b.pirates || []).filter(p => p.position === BOAT_INDEX).length;
      return bBoat - aBoat;
    });

    sorted.forEach((player) => {
      const winner = escapedWinners.find(w => w.id === player.id);
      const onBoat = (player.pirates || []).filter(p => p.position === BOAT_INDEX).length;
      const total = player.pirates?.length || targetCount;
      const isMe = player.id === this.myPlayerId;
      const rankTag = winner
        ? (winner.rank === 1 ? '🥇 1st Place Winner' : winner.rank === 2 ? '🥈 2nd Place Winner' : winner.rank === 3 ? '🥉 3rd Place Winner' : `🏅 #${winner.rank} Escaped`)
        : (onBoat === total ? '✅ Fully Boarded' : `${onBoat}/${total} Boarded`);

      const colMeta = PLAYER_COLORS.find(c => c.id === player.color) || { hex: player.colorHex || '#D64545' };

      const row = document.createElement('div');
      row.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:0.65rem 0.9rem; border-radius:8px; background:${isMe ? 'rgba(218, 165, 32, 0.15)' : 'rgba(0, 0, 0, 0.04)'}; border:1.5px solid ${isMe ? '#DAA520' : 'rgba(0, 0, 0, 0.08)'};`;

      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${colMeta.hex}; border:1.5px solid #333;"></span>
          <strong style="color:#2D1E12; font-size:0.95rem;">${player.name} ${isMe ? '<span style="font-size:0.75rem; color:#DAA520; font-weight:normal;">(You)</span>' : ''}</strong>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span style="font-weight:700; font-size:0.9rem; color:${winner ? '#B8860B' : '#5C3B1E'};">${rankTag}</span>
          <span style="font-size:0.82rem; background:rgba(0,0,0,0.06); padding:2px 7px; border-radius:10px; font-weight:600;">⛵ ${onBoat}/${total}</span>
        </div>
      `;
      listEl.appendChild(row);
    });

    this._showModal('boatRoster');
  }

  _updateCrewLocator() {
    if (!this.gameState || !this.myPlayerId) return;
    const myPlayer = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (!myPlayer || !myPlayer.pirates) return;

    const total = myPlayer.pirates.length;
    const onBoat = myPlayer.pirates.filter(p => p.position === BOAT_INDEX).length;

    if (this.crewCountSummary) {
      this.crewCountSummary.textContent = `${onBoat}/${total} ⛵`;
    }

    if (this.crewPiratesList) {
      this.crewPiratesList.innerHTML = '';

      // Render all players' crews so every player can see where everyone is!
      this.gameState.players.forEach(player => {
        const isSelf = player.id === this.myPlayerId;
        const colMeta = PLAYER_COLORS.find(c => c.id === player.color) || { hex: '#D64545' };

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'crew-roster-player-header';
        sectionHeader.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:0.4rem 0.6rem; margin-top:0.4rem; background:rgba(0,0,0,0.06); border-radius:5px; border-left:4px solid ${colMeta.hex}; font-weight:700; font-size:0.88rem; cursor:pointer;`;
        sectionHeader.title = 'Click to beacon this player on board';
        sectionHeader.innerHTML = `
          <span>🏴‍☠️ ${player.name} ${isSelf ? '(You)' : ''}</span>
          <span style="font-size:0.75rem; color:#6D4C2B;">🃏 ${player.cardCount} | ⛵ ${player.piratesOnBoat}/${this.gameState.piratesPerPlayer}</span>
        `;
        sectionHeader.addEventListener('click', () => {
          this.boardRenderer.highlightCrewBeacons(player.id);
          this.audio.playPop();
        });
        this.crewPiratesList.appendChild(sectionHeader);

        (player.pirates || []).forEach(pirate => {
          const item = document.createElement('div');
          const isSelected = this.selectedPirateId === pirate.id;
          item.className = `crew-pirate-item ${isSelected ? 'selected' : ''}`;
          
          let locBadge = '';
          let locText = '';
          if (pirate.position === JAIL_INDEX) {
            locBadge = `<span class="crew-loc-badge crew-loc-jail">🔒 Jail</span>`;
            locText = 'Dungeon (Start)';
          } else if (pirate.position === BOAT_INDEX) {
            locBadge = `<span class="crew-loc-badge crew-loc-boat">⛵ Escaped</span>`;
            locText = 'Safe on Boat!';
          } else {
            const space = this.gameState.board[pirate.position];
            const symMeta = SYMBOL_META[space?.symbol] || { icon: '❓', label: space?.symbol || '' };
            locBadge = `<span class="crew-loc-badge crew-loc-tunnel">${symMeta.icon} #${pirate.position}</span>`;
            locText = `${symMeta.label}`;
          }

          item.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span style="color:${colMeta.hex};">☠️ <strong>#${pirate.indexNumber || 1}</strong></span>
              <span style="font-size:0.8rem; color:#6D4C2B;">(${locText})</span>
            </div>
            <div>${locBadge}</div>
          `;

          item.addEventListener('click', () => {
            if (isSelf) {
              if (pirate.position === BOAT_INDEX) {
                this._showToast('This pirate is already safe on the escape boat! ⛵');
                return;
              }
              this._handlePirateSelected(pirate.id);
              this.crewLocatorPopover?.classList.remove('active');
            } else {
              // Highlight opponent pirate on board and scroll to it
              const targetEl = document.getElementById(`space-group-${pirate.position}`);
              if (targetEl && this.boardViewport) {
                const rect = targetEl.getBoundingClientRect();
                const parentRect = this.boardViewport.getBoundingClientRect();
                this.boardViewport.scrollBy({ top: rect.top - parentRect.top - 80, behavior: 'smooth' });
              }
              this.boardRenderer.highlightCrewBeacons(player.id);
              this._showToast(`Locating ${player.name}'s pirate #${pirate.indexNumber || 1} at ${locText}`);
              this.audio.playPop();
            }
          });

          this.crewPiratesList.appendChild(item);
        });
      });
    }
  }

  _renderOpponentsStrip() {
    this.opponentsContainer.innerHTML = '';
    this.gameState.players.forEach(p => {
      const isCurrent = p.id === this.gameState.currentPlayerId;
      const isMe = p.id === this.myPlayerId;
      const colMeta = PLAYER_COLORS.find(c => c.id === p.color) || { hex: '#D64545' };
      const pirates = p.pirates || [];
      const inJail = pirates.filter(pir => pir.position === JAIL_INDEX).length;
      const onBoat = pirates.filter(pir => pir.position === BOAT_INDEX).length;
      const onPath = pirates.filter(pir => pir.position > JAIL_INDEX && pir.position < BOAT_INDEX);
      const pathLocs = onPath.map(pir => `#${pir.position}`).join(', ');

      const escapeWinner = (this.gameState.escapedWinners || []).find(w => w.id === p.id);
      const podiumBadge = escapeWinner
        ? `<span class="stat-badge winner-podium-badge" style="background: rgba(218,165,32,0.25); color: #B8860B; font-weight: 700; border: 1px solid #DAA520;">${escapeWinner.rank === 1 ? '🥇 1st' : escapeWinner.rank === 2 ? '🥈 2nd' : '🥉 3rd'}</span>`
        : '';

      const card = document.createElement('div');
      card.className = `opponent-card ${isCurrent ? 'active-turn' : ''} ${isMe ? 'is-self' : ''} ${escapeWinner ? 'escaped-winner-card' : ''}`;
      card.title = `Click to locate & beacon ${p.name}'s crew across the tunnel`;
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="opponent-avatar" style="border-color: ${colMeta.hex}; background-color: ${colMeta.hex}22;">
          <span style="color: ${colMeta.hex}">${escapeWinner ? (escapeWinner.rank === 1 ? '🥇' : escapeWinner.rank === 2 ? '🥈' : '🥉') : '🏴‍☠️'}</span>
        </div>
        <div class="opponent-details">
          <span class="opponent-name">${p.name} ${isMe ? '(You)' : ''}</span>
          <div class="opponent-stats">
            ${podiumBadge}
            <span class="stat-badge" title="Cards in hand">🃏 ${p.cardCount}</span>
            <span class="stat-badge" title="Pirates in Jail">🔒 ${inJail}</span>
            <span class="stat-badge" title="Pirates in tunnel: ${pathLocs || 'none'}">🏃 ${onPath.length}</span>
            <span class="stat-badge" title="Escaped to boat">⛵ ${onBoat}/${this.gameState.piratesPerPlayer}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.boardRenderer.highlightCrewBeacons(p.id);
        const locDesc = onPath.length > 0 ? `Tunnel: ${pathLocs}` : inJail > 0 ? 'All in Jail' : 'All Escaped!';
        this._showToast(`🔍 Showing ${p.name}'s crew: ${locDesc}`);
        this.audio.playPop();
      });

      this.opponentsContainer.appendChild(card);
    });
  }

  _renderHand() {
    this.handContainer.innerHTML = '';
    const myPlayer = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (!myPlayer || !myPlayer.hand) return;

    myPlayer.hand.forEach(card => {
      const meta = SYMBOL_META[card.symbol] || { icon: '❓', label: card.symbol, color: '#3FA66B' };
      const isSelected = this.selectedCard && this.selectedCard.id === card.id;

      const cardEl = document.createElement('div');
      cardEl.className = `pirate-card ${isSelected ? 'card-selected' : ''}`;
      cardEl.style.setProperty('--card-accent', meta.color);
      cardEl.innerHTML = `
        <div class="card-inner">
          <div class="card-corner top-left">${meta.icon}</div>
          <div class="card-center">
            <span class="card-icon">${meta.icon}</span>
            <span class="card-name">${meta.label}</span>
          </div>
          <div class="card-corner bottom-right">${meta.icon}</div>
        </div>
      `;

      cardEl.addEventListener('click', () => {
        this._handleCardSelected(card);
      });

      this.handContainer.appendChild(cardEl);
    });
  }

  // --- Interaction & Moves Logic ---

  _handleCardSelected(card) {
    const isMyTurn = this.gameState.currentPlayerId === this.myPlayerId;
    if (!isMyTurn || this.gameState.actionsLeft <= 0) return;

    this.audio.playCard();
    this.actionMode = 'FORWARD';

    if (this.selectedCard && this.selectedCard.id === card.id) {
      // Unselect if clicked again
      this.selectedCard = null;
    } else {
      this.selectedCard = card;
    }

    this._updateActionBar();
    this._renderHand();
    this._updateTargetHighlights();
    this._updateNextStepInstructions();

    // If both pirate and card are selected, execute forward move!
    if (this.selectedPirateId && this.selectedCard) {
      this._executeForwardMove(this.selectedPirateId, this.selectedCard.id);
    }
  }

  _handlePirateSelected(pirateId) {
    const isMyTurn = this.gameState.currentPlayerId === this.myPlayerId;
    if (!isMyTurn || this.gameState.actionsLeft <= 0) return;

    const myPlayer = this.gameState.players.find(p => p.id === this.myPlayerId);
    const pirate = myPlayer?.pirates?.find(p => p.id === pirateId);

    if (!pirate) {
      this._showToast("That pirate doesn't belong to your crew!");
      return;
    }

    if (pirate.position === BOAT_INDEX) {
      this._showToast('This pirate is already safely aboard the boat!');
      return;
    }

    this.audio.playHop();
    this.selectedPirateId = pirateId;

    if (this.actionMode === 'BACKWARD') {
      // Execute backward move!
      this._executeBackwardMove(pirateId);
    } else if (this.actionMode === 'FORWARD' && this.selectedCard) {
      // Execute forward move!
      this._executeForwardMove(pirateId, this.selectedCard.id);
    } else {
      this.actionMode = 'FORWARD';
      this._updateActionBar();
      this._updateTargetHighlights();
      this._updateNextStepInstructions();
      this._showToast('Now choose a card from your hand to dash forward!');
    }
  }

  _handleSpaceSelected(spaceIndex) {
    // If a space is tapped while a pirate and card are selected and matches target
    if (this.selectedPirateId && this.actionMode === 'FORWARD' && this.selectedCard) {
      this._executeForwardMove(this.selectedPirateId, this.selectedCard.id);
      return;
    } else if (this.selectedPirateId && this.actionMode === 'BACKWARD') {
      this._executeBackwardMove(this.selectedPirateId);
      return;
    }

    // Tapping the Escape Rowboat opens the Roster Modal (§2)
    if (spaceIndex === BOAT_INDEX) {
      this._showBoatRoster();
      this.audio.playPop();
    }
  }

  _executeForwardMove(pirateId, cardId) {
    this.audio.playHop();
    this._send('PLAY_FORWARD', {
      action: 'FORWARD',
      pirateId,
      cardId
    });
    this._resetSelection();
  }

  _executeBackwardMove(pirateId) {
    this.audio.playCoinClink(2);
    this._send('MOVE_BACKWARD', {
      action: 'BACKWARD',
      pirateId
    });
    this._resetSelection();
  }

  _resetSelection() {
    this.selectedCard = null;
    this.selectedPirateId = null;
    this.actionMode = null;
    this.boardRenderer.setSelection({ pirateId: null, card: null, mode: null });
    this.boardRenderer.setGhostPreview(null);
    this._updateActionBar();
    this._renderHand();
    this._updateNextStepInstructions();
  }

  _updateTargetHighlights() {
    this.boardRenderer.setSelection({
      pirateId: this.selectedPirateId,
      card: this.selectedCard,
      mode: this.actionMode
    });

    // Compute ghost preview if both pirate and action are determined
    if (this.selectedPirateId) {
      const myPlayer = this.gameState.players.find(p => p.id === this.myPlayerId);
      const pirate = myPlayer?.pirates?.find(p => p.id === this.selectedPirateId);
      if (!pirate) return;

      if (this.actionMode === 'FORWARD' && this.selectedCard) {
        const target = this._calculateForwardTarget(pirate, this.selectedCard.symbol);
        this.boardRenderer.setGhostPreview({
          spaceIndex: target,
          color: '#E0A82E'
        });
      } else if (this.actionMode === 'BACKWARD') {
        const target = this._calculateBackwardTarget(pirate);
        if (target !== null) {
          this.boardRenderer.setGhostPreview({
            spaceIndex: target,
            color: '#3FA66B'
          });
        }
      }
    }
  }

  _calculateForwardTarget(pirate, symbol) {
    if (pirate.position === BOAT_INDEX) return null;
    for (let i = pirate.position + 1; i <= 36; i++) {
      const space = this.gameState.board[i];
      if (space.symbol === symbol && space.pirates.length === 0) {
        return i;
      }
    }
    return BOAT_INDEX;
  }

  _calculateBackwardTarget(pirate) {
    if (pirate.position === JAIL_INDEX || pirate.position === BOAT_INDEX) return null;
    for (let i = pirate.position - 1; i >= 1; i--) {
      const space = this.gameState.board[i];
      const count = space.pirates.length;
      if (count === 1 || count === 2) {
        return i;
      }
    }
    return null;
  }

  _updateActionBar() {
    const isMyTurn = this.gameState?.currentPlayerId === this.myPlayerId && this.gameState?.status === 'IN_PROGRESS';

    this.btnForward.disabled = !isMyTurn;
    this.btnBackward.disabled = !isMyTurn;
    this.btnEndTurn.disabled = !isMyTurn;
    this.btnUndo.disabled = !isMyTurn || !this.gameState?.settings?.allowUndo;

    this.btnForward.classList.toggle('active-action', this.actionMode === 'FORWARD');
    this.btnBackward.classList.toggle('active-action', this.actionMode === 'BACKWARD');
  }

  // --- Chat ---

  _toggleChat(forceOpen = null) {
    this.isChatOpen = forceOpen !== null ? forceOpen : !this.isChatOpen;
    this.chatDrawer.classList.toggle('open', this.isChatOpen);
    if (this.isChatOpen) {
      this.unreadChatCount = 0;
      this._updateChatBadge();
      this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }
  }

  _updateChatBadge() {
    if (this.unreadChatCount > 0) {
      this.chatBadge.textContent = this.unreadChatCount > 9 ? '9+' : this.unreadChatCount;
      this.chatBadge.style.display = 'block';
    } else {
      this.chatBadge.style.display = 'none';
    }
  }

  _sendChatMessage(isSidebar = false) {
    const inputEl = isSidebar ? this.sidebarChatInput : this.chatInput;
    const text = inputEl ? inputEl.value.trim() : '';
    if (!text) return;
    this._send('CHAT_SEND', { text });
    if (inputEl) inputEl.value = '';
    this.audio.playPop();
  }

  _appendChatMessage(msg) {
    const createRow = () => {
      const row = document.createElement('div');
      if (msg.type === 'SYSTEM') {
        row.className = 'chat-msg chat-system-msg';
        row.textContent = msg.text;
      } else {
        const isMine = msg.playerId === this.myPlayerId;
        row.className = `chat-msg chat-user-msg ${isMine ? 'mine' : ''}`;
        row.innerHTML = `
          <span class="chat-sender" style="color: ${this._getColorHex(msg.senderColor)}">${this._escapeHtml(msg.senderName)}:</span>
          <span class="chat-text">${this._escapeHtml(msg.text)}</span>
        `;
      }
      return row;
    };

    if (this.chatMessagesContainer) {
      this.chatMessagesContainer.appendChild(createRow());
      this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }
    if (this.sidebarChatMessages) {
      this.sidebarChatMessages.appendChild(createRow());
      this.sidebarChatMessages.scrollTop = this.sidebarChatMessages.scrollHeight;
    }
  }

  _updateNextStepInstructions() {
    if (!this.nextStepBody && !this.mobileInstructionText) return;
    if (!this.gameState || this.gameState.status !== 'IN_PROGRESS') {
      if (this.nextStepBody) {
        this.nextStepBody.innerHTML = `
          <div class="next-step-prompt">Awaiting Escape Charter...</div>
          <div class="next-step-detail">Join or start a match to break out of Cartagena Fortress!</div>
        `;
      }
      if (this.mobileInstructionText) {
        this.mobileInstructionText.textContent = '⚓ Cartagena Escape in session. Waiting for game start...';
      }
      return;
    }

    const isMyTurn = this.gameState.currentPlayerId === this.myPlayerId;
    const activePlayer = this.gameState.players.find(p => p.id === this.gameState.currentPlayerId);
    const actionsLeft = this.gameState.actionsLeft || 0;
    const activeName = activePlayer?.name || 'Matey';

    let mobileText = '';

    if (!isMyTurn) {
      if (this.nextStepBody) {
        this.nextStepBody.innerHTML = `
          <div class="next-step-action-tag" style="background:#14505C; color:#F2E2BA;">WAITING FOR CREWMATE</div>
          <div class="next-step-prompt">Captain ${this._escapeHtml(activeName)} is acting...</div>
          <div class="next-step-detail">Watch their moves on the board tunnel. Prepare your strategy!</div>
        `;
      }
      mobileText = `⏳ Waiting for Captain ${activeName} to take their turn...`;
    } else {
      // It's my turn!
      const myPlayer = this.gameState.players.find(p => p.id === this.myPlayerId);
      const myHand = myPlayer?.hand || [];

      let html = `
        <div class="next-step-action-tag">ACTION ${4 - actionsLeft} OF 3 (${actionsLeft} LEFT)</div>
      `;

      if (this.actionMode === 'BACKWARD') {
        if (this.selectedPirateId) {
          html += `
            <div class="next-step-prompt">↩️ Pirate Selected!</div>
            <div class="next-step-detail">Retreating to nearest space with 1 or 2 pirates to gather fresh cards!</div>
          `;
          mobileText = '↩️ Pirate selected! Retreating to gather fresh cards...';
        } else {
          html += `
            <div class="next-step-prompt">👉 Step 1: Select a Pirate to Retreat</div>
            <div class="next-step-detail">Click any of your pirates in the tunnel. It will retreat to the nearest space holding 1 or 2 pirates and gain you 1 or 2 free cards!</div>
          `;
          mobileText = '↩️ Tap one of your pirates in the tunnel to retreat & draw cards!';
        }
      } else if (this.selectedCard && this.selectedPirateId) {
        const cardMeta = SYMBOL_META[this.selectedCard.symbol] || { label: this.selectedCard.symbol, icon: '❓' };
        html += `
          <div class="next-step-prompt">🏃 Ready to Leap!</div>
          <div class="next-step-detail">Dashing forward with <strong>${cardMeta.icon} ${cardMeta.label}</strong> to the highlighted destination!</div>
        `;
        mobileText = `🏃 Ready! Dashing with ${cardMeta.icon} ${cardMeta.label} to highlighted space!`;
      } else if (this.selectedCard) {
        const cardMeta = SYMBOL_META[this.selectedCard.symbol] || { label: this.selectedCard.symbol, icon: '❓' };
        html += `
          <div class="next-step-prompt">👉 Step 2: Choose a Pirate to Move</div>
          <div class="next-step-detail">Card <strong>${cardMeta.icon} ${cardMeta.label}</strong> is chosen. Click one of your pirates to dash forward!</div>
        `;
        mobileText = `👉 Card ${cardMeta.icon} ${cardMeta.label} selected! Now tap your pirate on the board!`;
      } else if (this.selectedPirateId) {
        html += `
          <div class="next-step-prompt">👉 Step 2: Pick a Card to Dash</div>
          <div class="next-step-detail">Your pirate is selected. Click any card in your hand below to leap forward, or click <strong>"Retreat (+1/+2)"</strong>!</div>
        `;
        mobileText = '👉 Pirate selected! Tap a card in your hand below to dash forward!';
      } else {
        // Nothing selected yet
        if (myHand.length === 0) {
          html += `
            <div class="next-step-prompt">⚠️ Hand is Empty!</div>
            <div class="next-step-detail">Click <strong>"Retreat (+1/+2)"</strong> then select a pirate in the tunnel to draw cards, or click <strong>"End Turn"</strong>!</div>
          `;
          mobileText = '⚠️ Hand is empty! Tap "Retreat (+1/+2)" to move back and draw cards!';
        } else {
          html += `
            <div class="next-step-prompt">👉 Step 1: Choose Your Move</div>
            <div class="next-step-detail">
              &bull; <strong>Option A:</strong> Click a <strong>Card</strong> below to Dash Forward.<br>
              &bull; <strong>Option B:</strong> Click <strong>"Retreat (+1/+2)"</strong> to move back and draw cards.<br>
              ${actionsLeft < 3 ? '&bull; <strong>Option C:</strong> Click <strong>"End Turn"</strong> to draw up to 6 cards.' : ''}
            </div>
          `;
          mobileText = `👉 Action ${4 - actionsLeft}/3: Tap a card to Dash, or tap "Retreat" to draw cards!`;
        }
      }

      if (this.nextStepBody) {
        this.nextStepBody.innerHTML = html;
      }
    }

    if (this.mobileInstructionText) {
      this.mobileInstructionText.textContent = mobileText;
    }
  }

  _getColorHex(colorId) {
    const col = PLAYER_COLORS.find(c => c.id === colorId);
    return col ? col.hex : '#E0A82E';
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _showGameOver(state) {
    const isWinner = this.myPlayerId === state.winnerId;
    const winner = state.players.find(p => p.id === state.winnerId);
    const myPlayer = state.players.find(p => p.id === this.myPlayerId);
    const myEscape = (state.escapedWinners || []).find(w => w.id === this.myPlayerId);

    if (isWinner || myEscape) {
      this.audio.playCannon();
      this.audio.playFanfare();
    } else {
      this.audio.playCannon();
    }

    const dialog = document.getElementById('gameover-dialog');
    const badge = document.getElementById('gameover-outcome-badge');
    const icon = document.getElementById('gameover-outcome-icon');
    const headline = document.getElementById('gameover-headline');
    const subline = document.getElementById('gameover-subline');
    const personalCard = document.getElementById('personal-result-card');

    if (dialog && badge && icon && headline && subline && personalCard) {
      if (isWinner || (myEscape && myEscape.rank === 1)) {
        dialog.className = 'parchment-modal-dialog gameover-dialog victory-theme';
        badge.className = 'gameover-outcome-badge victory-badge';
        icon.textContent = '👑 ⛵';
        headline.textContent = '🏆 1st PLACE VICTORY! CARTAGENA CONQUEROR!';
        subline.textContent = 'Huzzah! All your crew boarded the sloop rowboat first to freedom!';
        personalCard.className = 'personal-result-card victory-card';
        personalCard.innerHTML = `
          <div class="result-badge">🥇 1st Place Winner - Gold Laurels</div>
          <div class="result-desc">You successfully smuggled your entire crew through the 36-space tunnel onto the rowboat ahead of everyone else. Tortuga and glory await!</div>
        `;
      } else if (myEscape && myEscape.rank === 2) {
        dialog.className = 'parchment-modal-dialog gameover-dialog victory-theme';
        badge.className = 'gameover-outcome-badge victory-badge';
        icon.textContent = '🥈 ⛵';
        headline.textContent = '🥈 2nd PLACE WINNER! DARING ESCAPE!';
        subline.textContent = 'Splendid rowing! All your crew made it safely onto the rowboat in 2nd place!';
        personalCard.className = 'personal-result-card victory-card';
        personalCard.innerHTML = `
          <div class="result-badge">🥈 2nd Place Winner - Silver Laurels</div>
          <div class="result-desc">You successfully guided your complete crew onto the escape rowboat right behind the leader. Freedom is yours!</div>
        `;
      } else if (myEscape && myEscape.rank === 3) {
        dialog.className = 'parchment-modal-dialog gameover-dialog victory-theme';
        badge.className = 'gameover-outcome-badge victory-badge';
        icon.textContent = '🥉 ⛵';
        headline.textContent = '🥉 3rd PLACE WINNER! PODIUM FINISH!';
        subline.textContent = 'Courageous flight! You secured the 3rd podium place to freedom!';
        personalCard.className = 'personal-result-card victory-card';
        personalCard.innerHTML = `
          <div class="result-badge">🥉 3rd Place Winner - Bronze Laurels</div>
          <div class="result-desc">You claimed the final winner's podium spot and escaped the Spanish fortress with your full crew!</div>
        `;
      } else {
        const myRank = (state.rankings || []).find(r => r.id === this.myPlayerId)?.rank || 2;
        dialog.className = 'parchment-modal-dialog gameover-dialog defeat-theme';
        badge.className = 'gameover-outcome-badge defeat-badge';
        icon.textContent = '⛓️ 💀 🔒';
        headline.textContent = '☠️ DEFEAT! LEFT IN THE DUNGEON!';
        subline.textContent = `${winner ? winner.name : 'Another captain'} rowed away to safety while your crew remains behind!`;
        personalCard.className = 'personal-result-card defeat-card';
        personalCard.innerHTML = `
          <div class="result-badge">Rank #${myRank} - Trapped in Cartagena</div>
          <div class="result-desc">${winner ? winner.name : 'The winner'} escaped first! You managed to board ${myPlayer?.piratesOnBoat || 0} pirate(s), but Spanish fortress guards recaptured the rest in the dungeon!</div>
        `;
      }
    }

    const rankingsContainer = document.getElementById('rankings-list');
    if (rankingsContainer) {
      rankingsContainer.innerHTML = '';
      (state.rankings || []).forEach(rank => {
        const isMe = rank.id === this.myPlayerId;
        const isWin = rank.id === state.winnerId;
        const row = document.createElement('div');
        row.className = `ranking-row rank-${rank.rank} ${isMe ? 'mine' : ''} ${isWin ? 'winner-row' : ''}`;
        row.innerHTML = `
          <div class="rank-pos">
            <span class="rank-badge">${rank.rank === 1 ? '🥇' : rank.rank === 2 ? '🥈' : rank.rank === 3 ? '🥉' : `#${rank.rank}`}</span>
          </div>
          <div class="rank-user">
            <span class="rank-swatch" style="background:${this._getColorHex(rank.color)}"></span>
            <span class="rank-name">${this._escapeHtml(rank.name)} ${isMe ? '<strong>(You)</strong>' : ''}</span>
          </div>
          <div class="rank-stats">
            <span class="rank-stat-pill boat-stat">⛵ ${rank.piratesOnBoat} Escaped</span>
            <span class="rank-stat-pill cards-stat">🃏 ${rank.cardsCount} Cards</span>
          </div>
        `;
        rankingsContainer.appendChild(row);
      });
    }

    this.modals.gameover.classList.add('active');
  }

  _showToast(message) {
    let toast = document.getElementById('cartagena-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cartagena-toast';
      toast.className = 'cartagena-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  _showEndGameConfirm() {
    this.modals.endGameConfirm?.classList.add('active');
    this.audio.playPop();
  }

  _confirmEndGame() {
    // Notify room/peers before closing session
    this._send('LEAVE_GAME', { playerId: this.myPlayerId });

    // Close confirmation modal
    this.modals.endGameConfirm?.classList.remove('active');
    // Close game over modal if open
    this.modals.gameover?.classList.remove('active');

    // Clear saved session
    localStorage.removeItem('cartagena_saved_session');

    // Disconnect online session if applicable
    if (!this.isLocalSession) {
      setTimeout(() => this.ws.disconnect(), 100);
    }

    // Reset state
    this.isLocalSession = false;
    this.isPassAndPlay = false;
    this.gameState = null;
    this.myPlayerId = null;
    this.roomCode = null;
    this.selectedCard = null;
    this.selectedPirateId = null;
    this.actionMode = null;

    // Navigate to landing
    this._switchView('landing');
    this._showToast('🏴‍☠️ You have abandoned the escape. Return to try again, Captain!');
    this.audio.playCannon();
  }
}

// Boot application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new CartagenaApp();
});
