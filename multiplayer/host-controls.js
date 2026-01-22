/**
 * Host Controls
 * 
 * UI for creating and managing multiplayer sessions.
 * Only available on desktop (not VR).
 */

import * as SessionManager from './session-manager.js';
import { addLogMessage } from './multiplayer-panel.js';

let controlsContainer = null;
let isInitialized = false;
let currentWorldUrl = null;
let currentFoundryUrl = null;
let unsubscribers = [];
let isCollapsed = false; // Start expanded

/**
 * Initialize host controls
 * @param {Object} options
 * @param {string} options.worldUrl - Current world URL
 * @param {string} options.foundryUrl - Foundry streaming URL (optional)
 */
export function initHostControls({ worldUrl, foundryUrl } = {}) {
  currentWorldUrl = worldUrl;
  currentFoundryUrl = foundryUrl;
  
  if (isInitialized) {
    updateWorldInfo(worldUrl, foundryUrl);
    return;
  }
  
  isInitialized = true;
  createControls();
  attachEventListeners();
  
  // Check URL for session code
  checkUrlForSession();
}

/**
 * Update world info (when changing worlds)
 */
export function updateWorldInfo(worldUrl, foundryUrl) {
  currentWorldUrl = worldUrl;
  currentFoundryUrl = foundryUrl;
}

/**
 * Check URL for session code to join
 */
function checkUrlForSession() {
  const params = new URLSearchParams(window.location.search);
  const sessionCode = params.get('session');
  
  if (sessionCode) {
    console.log(`[HostControls] Found session code in URL: ${sessionCode}`);
    
    // Auto-join: if session code is present, automatically join
    // Use stored name or generate a random one
    const name = localStorage.getItem('protoverse-name') || getDefaultName();
    localStorage.setItem('protoverse-name', name);
    
    // Set the name input for display
    setTimeout(() => {
      const nameInput = document.getElementById('hc-name-input');
      if (nameInput) {
        nameInput.value = name;
      }
    }, 100);
    
    console.log(`[HostControls] Auto-joining session ${sessionCode} as "${name}"`);
    
    // Join the session automatically
    SessionManager.joinSession({
      sessionCode: sessionCode,
      name,
      color: getRandomColor(),
    });
  }
}

/**
 * Get a default name for the player
 */
function getDefaultName() {
  const storedName = localStorage.getItem('protoverse-name');
  if (storedName) return storedName;
  
  const adjectives = ['Swift', 'Cosmic', 'Stellar', 'Quantum', 'Nebula', 'Solar', 'Lunar', 'Nova'];
  const nouns = ['Traveler', 'Explorer', 'Voyager', 'Pioneer', 'Wanderer', 'Seeker'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
}

/**
 * Get random avatar color
 */
function getRandomColor() {
  const colors = [0x00d4ff, 0x22c55e, 0xf59e0b, 0xef4444, 0xa855f7, 0x06b6d4, 0xec4899];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Create the controls DOM structure
 */
function createControls() {
  controlsContainer = document.createElement('div');
  controlsContainer.id = 'host-controls';
  controlsContainer.innerHTML = `
    <style>
      #host-controls {
        position: fixed;
        bottom: 10px;
        right: 10px;
        font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
        font-size: 12px;
        z-index: 1000;
        pointer-events: auto;
      }
      
      #host-controls * {
        box-sizing: border-box;
      }
      
      .hc-panel {
        min-width: 200px;
      }
      
      .hc-title {
        color: #e0e0e0;
        font-weight: 500;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .hc-title-icon {
        font-size: 14px;
      }
      
      .hc-input-group {
        margin-bottom: 10px;
      }
      
      .hc-label {
        display: block;
        color: #888;
        font-size: 10px;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .hc-input {
        width: 100%;
        background: rgba(30, 30, 45, 0.8);
        border: 1px solid rgba(100, 150, 255, 0.2);
        border-radius: 4px;
        padding: 8px 10px;
        color: #fff;
        font-family: inherit;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .hc-input:focus {
        border-color: rgba(100, 150, 255, 0.5);
      }
      
      .hc-btn {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s;
        margin-bottom: 6px;
      }
      
      .hc-btn:last-child {
        margin-bottom: 0;
      }
      
      .hc-btn-primary {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
      }
      
      .hc-btn-primary:hover {
        background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
      }
      
      .hc-btn-secondary {
        background: rgba(60, 60, 80, 0.8);
        color: #ccc;
        border: 1px solid rgba(100, 150, 255, 0.2);
      }
      
      .hc-btn-secondary:hover {
        background: rgba(80, 80, 100, 0.8);
        border-color: rgba(100, 150, 255, 0.4);
      }
      
      .hc-btn-danger {
        background: rgba(239, 68, 68, 0.3);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      
      .hc-btn-danger:hover {
        background: rgba(239, 68, 68, 0.5);
      }
      
      .hc-session-active {
        text-align: center;
      }
      
      .hc-session-code {
        font-size: 24px;
        font-weight: bold;
        color: #3b82f6;
        letter-spacing: 4px;
        margin: 10px 0;
      }
      
      .hc-session-url {
        font-size: 10px;
        color: #666;
        word-break: break-all;
        background: rgba(0, 0, 0, 0.3);
        padding: 6px 8px;
        border-radius: 4px;
        margin-bottom: 10px;
      }
      
      .hc-copy-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(59, 130, 246, 0.2);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 4px;
        color: #60a5fa;
        font-size: 10px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .hc-copy-btn:hover {
        background: rgba(59, 130, 246, 0.3);
      }
      
      .hc-copy-btn.copied {
        background: rgba(34, 197, 94, 0.2);
        border-color: rgba(34, 197, 94, 0.3);
        color: #22c55e;
      }
      
      .hc-btn-row {
        display: flex;
        gap: 8px;
        justify-content: center;
      }
      
      .hc-quest-btn {
        background: rgba(168, 85, 247, 0.2);
        border-color: rgba(168, 85, 247, 0.3);
        color: #c084fc;
      }
      
      .hc-quest-btn:hover {
        background: rgba(168, 85, 247, 0.3);
      }
      
      .hc-divider {
        height: 1px;
        background: rgba(100, 150, 255, 0.15);
        margin: 10px 0;
      }
      
      .hc-or {
        text-align: center;
        color: #555;
        font-size: 10px;
        margin: 8px 0;
      }
      
      .hc-hidden {
        display: none;
      }
      
      .hc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        padding: 8px 12px;
        background: linear-gradient(135deg, rgba(30, 30, 40, 0.95) 0%, rgba(20, 20, 30, 0.95) 100%);
        border: 1px solid rgba(100, 150, 255, 0.3);
        border-radius: 8px;
        backdrop-filter: blur(10px);
        min-width: 160px;
        transition: border-radius 0.2s;
      }
      
      .hc-header:hover {
        background: linear-gradient(135deg, rgba(40, 40, 55, 0.95) 0%, rgba(30, 30, 40, 0.95) 100%);
      }
      
      .hc-header.expanded {
        border-radius: 8px 8px 0 0;
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
      }
      
      .hc-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #e0e0e0;
        font-weight: 500;
        font-size: 12px;
      }
      
      .hc-header-icon {
        font-size: 14px;
      }
      
      .hc-toggle {
        color: #888;
        font-size: 10px;
        transition: transform 0.2s;
      }
      
      .hc-toggle.expanded {
        transform: rotate(180deg);
      }
      
      .hc-content {
        display: none;
        background: linear-gradient(135deg, rgba(30, 30, 40, 0.95) 0%, rgba(20, 20, 30, 0.95) 100%);
        border: 1px solid rgba(100, 150, 255, 0.3);
        border-top: none;
        border-radius: 0 0 8px 8px;
        backdrop-filter: blur(10px);
      }
      
      .hc-content.expanded {
        display: block;
      }
      
      .hc-panel {
        padding: 12px;
        min-width: 200px;
      }
      
      .hc-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #666;
      }
      
      .hc-status-dot.connected {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
      }
      
      .hc-status-dot.hosting {
        background: #3b82f6;
        box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
      }
    </style>
    
    <div class="hc-header expanded" id="hc-header">
      <div class="hc-header-title">
        <span class="hc-header-icon" id="hc-header-icon">🎬</span>
        <span id="hc-header-text">Create/Join</span>
        <span class="hc-status-dot" id="hc-status-dot"></span>
      </div>
      <span class="hc-toggle expanded" id="hc-toggle">▼</span>
    </div>
    
    <div class="hc-content expanded" id="hc-content">
      <div class="hc-panel" id="hc-panel-idle">
        <div class="hc-input-group">
          <label class="hc-label">Your Name</label>
          <input type="text" class="hc-input" id="hc-name-input" placeholder="Enter your name...">
        </div>
        
        <div class="hc-input-group">
          <label class="hc-label">Movie URL (optional)</label>
          <input type="text" class="hc-input" id="hc-movie-url-input" placeholder="e.g., protoverse-holygrail">
          <div style="color: #666; font-size: 10px; margin-top: 4px;">
            Enter app name (e.g., protoverse-holygrail) or full wss:// URL
          </div>
        </div>
        
        <button class="hc-btn hc-btn-primary" id="hc-create-btn">
          Create Session
        </button>
        
        <div class="hc-or">— or —</div>
        
        <div class="hc-input-group">
          <label class="hc-label">Session Code</label>
          <input type="text" class="hc-input" id="hc-join-code-input" placeholder="XXXXXX" maxlength="6" style="text-transform: uppercase; letter-spacing: 2px; text-align: center;">
        </div>
        
        <button class="hc-btn hc-btn-secondary" id="hc-join-btn">
          Join Session
        </button>
      </div>
      
      <div class="hc-panel hc-hidden" id="hc-panel-hosting">
        <div class="hc-session-active">
          <div class="hc-session-code" id="hc-active-code"></div>
          <div class="hc-session-url" id="hc-share-url"></div>
          <div class="hc-btn-row">
            <button class="hc-copy-btn" id="hc-copy-url-btn">
              📋 Copy
            </button>
            <button class="hc-copy-btn hc-quest-btn" id="hc-quest-btn-host">
              🥽 Quest
            </button>
          </div>
        </div>
        
        <div class="hc-divider"></div>
        
        <button class="hc-btn hc-btn-danger" id="hc-end-session-btn">
          End Session
        </button>
      </div>
      
      <div class="hc-panel hc-hidden" id="hc-panel-viewing">
        <div class="hc-session-active">
          <div class="hc-session-code" id="hc-viewing-code"></div>
          <div style="color: #888; font-size: 11px; margin-bottom: 10px;">
            Host: <span id="hc-host-name">-</span>
          </div>
          <button class="hc-copy-btn hc-quest-btn" id="hc-quest-btn-viewer">
            🥽 Send to Quest
          </button>
        </div>
        
        <button class="hc-btn hc-btn-danger" id="hc-leave-session-btn">
          Leave Session
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(controlsContainer);
  
  // Load saved name
  const savedName = localStorage.getItem('protoverse-name');
  if (savedName) {
    document.getElementById('hc-name-input').value = savedName;
  }
  
  // Save name on change
  document.getElementById('hc-name-input').addEventListener('change', (e) => {
    localStorage.setItem('protoverse-name', e.target.value);
  });
  
  // Create session
  document.getElementById('hc-create-btn').addEventListener('click', createSession);
  
  // Join session
  document.getElementById('hc-join-btn').addEventListener('click', () => {
    const code = document.getElementById('hc-join-code-input').value.trim();
    if (code.length !== 6) {
      alert('Please enter a 6-character session code');
      return;
    }
    joinSession(code);
  });
  
  // Join on Enter key
  document.getElementById('hc-join-code-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('hc-join-btn').click();
    }
  });
  
  // Copy URL
  document.getElementById('hc-copy-url-btn').addEventListener('click', copyShareUrl);
  
  // Send to Quest (host)
  document.getElementById('hc-quest-btn-host').addEventListener('click', () => {
    const shareUrl = document.getElementById('hc-share-url').textContent;
    sendToQuest(shareUrl);
  });
  
  // Send to Quest (viewer)
  document.getElementById('hc-quest-btn-viewer').addEventListener('click', () => {
    sendToQuest(window.location.href);
  });
  
  // End session
  document.getElementById('hc-end-session-btn').addEventListener('click', () => {
    SessionManager.leaveSession();
    showIdlePanel();
  });
  
  // Leave session
  document.getElementById('hc-leave-session-btn').addEventListener('click', () => {
    SessionManager.leaveSession();
    showIdlePanel();
    // Remove session from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('session');
    window.history.replaceState({}, '', url);
  });
  
  // Disable keyboard controls when inputs are focused (prevents WASM keys from interfering)
  const inputs = [
    document.getElementById('hc-name-input'),
    document.getElementById('hc-movie-url-input'),
    document.getElementById('hc-join-code-input')
  ];
  
  for (const input of inputs) {
    input.addEventListener('focus', () => {
      document.body.classList.add('chat-input-focused');
      window.dispatchEvent(new CustomEvent('chat-focus', { detail: { focused: true } }));
    });
    
    input.addEventListener('blur', () => {
      document.body.classList.remove('chat-input-focused');
      window.dispatchEvent(new CustomEvent('chat-focus', { detail: { focused: false } }));
    });
  }
  
  // Header toggle for collapse/expand
  document.getElementById('hc-header').addEventListener('click', toggleCollapse);
}

/**
 * Attach session manager event listeners
 */
function attachEventListeners() {
  unsubscribers.push(SessionManager.onSessionCreated((data) => {
    showHostingPanel(data.sessionCode);
  }));
  
  unsubscribers.push(SessionManager.onSessionJoined((data) => {
    showViewingPanel(data.sessionCode, data.hostName);
  }));
  
  unsubscribers.push(SessionManager.onSessionEnded(() => {
    showIdlePanel();
  }));
  
  unsubscribers.push(SessionManager.onSessionError((data) => {
    alert(`Session error: ${data.error}`);
  }));
  
  unsubscribers.push(SessionManager.onSessionInfo((data) => {
    if (data.host) {
      document.getElementById('hc-host-name').textContent = data.host.name;
    }
  }));
}

// Track active custom URLs for share URL generation
let activeWsUrl = null;
let activeFoundryUrl = null;

/**
 * Create a new session
 */
function createSession() {
  const nameInput = document.getElementById('hc-name-input');
  const name = nameInput.value.trim() || getDefaultName();
  nameInput.value = name;
  localStorage.setItem('protoverse-name', name);
  
  // Check for custom movie URL
  const movieUrlInput = document.getElementById('hc-movie-url-input');
  let movieUrl = movieUrlInput?.value.trim() || '';
  
  // Parse movie URL - support shorthand like "protoverse-bigtrouble"
  if (movieUrl) {
    if (!movieUrl.includes('://') && !movieUrl.includes('.')) {
      // Just app name like "protoverse-holygrail"
      movieUrl = `wss://${movieUrl}.fly.dev`;
    } else if (!movieUrl.includes('://')) {
      // Domain without protocol
      movieUrl = `wss://${movieUrl}`;
    }
  }
  
  // Derive foundry URL from movie URL (WS on :8765, Foundry on /ws)
  let foundryUrl = currentFoundryUrl;
  let wsUrl = null;
  
  if (movieUrl) {
    // Parse the base URL and derive both endpoints
    const baseUrl = movieUrl.replace(/:\d+$/, '').replace(/\/ws$/, '');
    wsUrl = `${baseUrl}:8765`;
    foundryUrl = `${baseUrl}/ws`;
    console.log(`[HostControls] Using custom movie: ws=${wsUrl}, foundry=${foundryUrl}`);
  }
  
  // Store active URLs for share URL generation
  activeWsUrl = wsUrl;
  activeFoundryUrl = foundryUrl;
  
  // Set the Foundry URL override so Foundry connects to the right server
  if (foundryUrl && movieUrl) {
    window.FOUNDRY_URL_OVERRIDE = foundryUrl;
  }
  
  SessionManager.createSession({
    worldUrl: currentWorldUrl,
    foundryUrl: foundryUrl,
    wsUrl: wsUrl, // Pass custom WS URL if using custom movie
    name,
    color: getRandomColor(),
    maxViewers: 8,
  });
}

/**
 * Join an existing session
 */
function joinSession(code) {
  const nameInput = document.getElementById('hc-name-input');
  const name = nameInput.value.trim() || getDefaultName();
  nameInput.value = name;
  localStorage.setItem('protoverse-name', name);
  
  SessionManager.joinSession({
    sessionCode: code,
    name,
    color: getRandomColor(),
  });
}

/**
 * Toggle collapse state
 */
function toggleCollapse() {
  isCollapsed = !isCollapsed;
  const header = document.getElementById('hc-header');
  const content = document.getElementById('hc-content');
  const toggle = document.getElementById('hc-toggle');
  
  if (isCollapsed) {
    header.classList.remove('expanded');
    content.classList.remove('expanded');
    toggle.classList.remove('expanded');
  } else {
    header.classList.add('expanded');
    content.classList.add('expanded');
    toggle.classList.add('expanded');
  }
}

/**
 * Expand the panel (for programmatic use)
 */
export function expandPanel() {
  if (isCollapsed) {
    isCollapsed = false;
    document.getElementById('hc-header')?.classList.add('expanded');
    document.getElementById('hc-content')?.classList.add('expanded');
    document.getElementById('hc-toggle')?.classList.add('expanded');
  }
}

/**
 * Update header to reflect current state
 */
function updateHeader(icon, text, status = 'idle') {
  document.getElementById('hc-header-icon').textContent = icon;
  document.getElementById('hc-header-text').textContent = text;
  
  const dot = document.getElementById('hc-status-dot');
  dot.classList.remove('connected', 'hosting');
  if (status === 'hosting') {
    dot.classList.add('hosting');
  } else if (status === 'connected') {
    dot.classList.add('connected');
  }
}

/**
 * Show idle panel (no session)
 */
function showIdlePanel() {
  document.getElementById('hc-panel-idle').classList.remove('hc-hidden');
  document.getElementById('hc-panel-hosting').classList.add('hc-hidden');
  document.getElementById('hc-panel-viewing').classList.add('hc-hidden');
  updateHeader('🎬', 'Create/Join', 'idle');
}

/**
 * Show hosting panel
 */
function showHostingPanel(code) {
  document.getElementById('hc-panel-idle').classList.add('hc-hidden');
  document.getElementById('hc-panel-hosting').classList.remove('hc-hidden');
  document.getElementById('hc-panel-viewing').classList.add('hc-hidden');
  updateHeader('📡', `Hosting: ${code}`, 'hosting');
  expandPanel(); // Auto-expand when session starts
  
  document.getElementById('hc-active-code').textContent = code;
  
  // Generate share URL - preserve ws/foundry params for remote sharing
  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set('session', code);
  
  const hostname = shareUrl.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && !isLocalhost;
  
  // If custom movie URLs were used, include them in share URL
  if (activeWsUrl) {
    shareUrl.searchParams.set('ws', activeWsUrl);
    console.log(`[HostControls] Share URL using custom ws: ${activeWsUrl}`);
  } else if (isLanIp && !shareUrl.searchParams.has('ws')) {
    // If we're on a LAN IP, add ws/foundry params pointing to the same IP
    shareUrl.searchParams.set('ws', `ws://${hostname}:8765`);
  }
  
  if (activeFoundryUrl && activeWsUrl) {
    // Only add foundry param if we're using a custom movie (activeWsUrl is set)
    shareUrl.searchParams.set('foundry', activeFoundryUrl);
    console.log(`[HostControls] Share URL using custom foundry: ${activeFoundryUrl}`);
  } else if (isLanIp && !shareUrl.searchParams.has('foundry')) {
    shareUrl.searchParams.set('foundry', `ws://${hostname}:23646/ws`);
  }
  // For localhost or Netlify+Fly.io, params are passed in URL or auto-detected
  
  document.getElementById('hc-share-url').textContent = shareUrl.toString();
}

/**
 * Show viewing panel
 */
function showViewingPanel(code, hostName) {
  document.getElementById('hc-panel-idle').classList.add('hc-hidden');
  document.getElementById('hc-panel-hosting').classList.add('hc-hidden');
  document.getElementById('hc-panel-viewing').classList.remove('hc-hidden');
  updateHeader('👁️', `Viewing: ${code}`, 'connected');
  expandPanel(); // Auto-expand when session starts
  
  document.getElementById('hc-viewing-code').textContent = code;
  document.getElementById('hc-host-name').textContent = hostName || '-';
}

/**
 * Copy share URL to clipboard
 */
async function copyShareUrl() {
  const urlEl = document.getElementById('hc-share-url');
  const btnEl = document.getElementById('hc-copy-url-btn');
  
  try {
    await navigator.clipboard.writeText(urlEl.textContent);
    btnEl.textContent = '✓ Copied!';
    btnEl.classList.add('copied');
    
    setTimeout(() => {
      btnEl.textContent = '📋 Copy';
      btnEl.classList.remove('copied');
    }, 2000);
  } catch (err) {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = urlEl.textContent;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    btnEl.textContent = '✓ Copied!';
    setTimeout(() => {
      btnEl.textContent = '📋 Copy';
    }, 2000);
  }
}

/**
 * Send URL to Quest via Meta WebLaunch
 * https://developers.meta.com/horizon/documentation/web/web-launch/
 */
function sendToQuest(url) {
  const sendToQuestUrl = new URL("https://oculus.com/open_url/");
  sendToQuestUrl.searchParams.set("url", url);
  window.open(sendToQuestUrl.toString(), '_blank');
}

/**
 * Show the controls
 */
export function showHostControls() {
  if (controlsContainer) {
    controlsContainer.style.display = 'block';
  }
}

/**
 * Hide the controls
 */
export function hideHostControls() {
  if (controlsContainer) {
    controlsContainer.style.display = 'none';
  }
}

/**
 * Check if we're hosting a session
 */
export function isHosting() {
  return SessionManager.isHosting();
}

/**
 * Cleanup
 */
export function destroyHostControls() {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers = [];
  
  if (controlsContainer) {
    controlsContainer.remove();
    controlsContainer = null;
  }
  
  isInitialized = false;
}
