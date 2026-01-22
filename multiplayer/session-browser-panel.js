/**
 * Session Browser Panel
 * 
 * Collapsible panel that shows active sessions from Convex registry.
 * Allows users to browse and join sessions directly from the scene.
 */

import { config } from '../config.js';

let panelElement = null;
let isExpanded = false;
let sessions = [];
let onJoinCallback = null;
let refreshInterval = null;

/**
 * Initialize the session browser panel
 * @param {Object} options
 * @param {string} options.convexUrl - Convex deployment URL
 * @param {Function} options.onJoin - Callback when user joins a session
 */
export function initSessionBrowserPanel({ convexUrl, onJoin }) {
  onJoinCallback = onJoin;
  
  // Use provided URL or fallback to known Convex deployment
  const effectiveUrl = convexUrl || 'https://ardent-chameleon-122.convex.site';
  
  createPanel();
  attachEventListeners();
  
  // Initial fetch
  fetchSessions(effectiveUrl);
  
  // Refresh every 30 seconds
  refreshInterval = setInterval(() => fetchSessions(effectiveUrl), 30000);
  
  console.log(`[SessionBrowser] Initialized with Convex URL: ${effectiveUrl}`);
}

/**
 * Create the panel DOM
 */
function createPanel() {
  panelElement = document.createElement('div');
  panelElement.id = 'session-browser-panel';
  panelElement.innerHTML = `
    <style>
      #session-browser-panel {
        position: fixed;
        top: 320px;
        right: 20px;
        z-index: 1000;
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        user-select: none;
        max-width: 300px;
      }
      
      .sb-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(20, 20, 30, 0.9);
        border: 1px solid rgba(100, 100, 120, 0.3);
        border-radius: 8px;
        cursor: pointer;
        backdrop-filter: blur(10px);
        transition: all 0.2s ease;
      }
      
      .sb-header:hover {
        background: rgba(30, 30, 45, 0.95);
        border-color: rgba(100, 150, 255, 0.4);
      }
      
      .sb-header.expanded {
        border-radius: 8px 8px 0 0;
        border-bottom: none;
      }
      
      .sb-header-icon {
        font-size: 16px;
      }
      
      .sb-header-text {
        color: #ddd;
        font-size: 12px;
        font-weight: 500;
      }
      
      .sb-count {
        background: rgba(100, 150, 255, 0.3);
        color: #8af;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
      }
      
      .sb-toggle {
        color: #666;
        font-size: 10px;
        margin-left: auto;
        transition: transform 0.2s ease;
      }
      
      .sb-toggle.expanded {
        transform: rotate(180deg);
      }
      
      .sb-content {
        display: none;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid rgba(100, 100, 120, 0.3);
        border-top: none;
        border-radius: 0 0 8px 8px;
        max-height: 400px;
        overflow-y: auto;
        backdrop-filter: blur(10px);
      }
      
      .sb-content.expanded {
        display: block;
      }
      
      .sb-session {
        padding: 12px;
        border-bottom: 1px solid rgba(100, 100, 120, 0.2);
        cursor: pointer;
        transition: background 0.15s ease;
      }
      
      .sb-session:hover {
        background: rgba(100, 150, 255, 0.1);
      }
      
      .sb-session:last-child {
        border-bottom: none;
      }
      
      .sb-session-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      
      .sb-session-code {
        color: #8af;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 1px;
      }
      
      .sb-session-host {
        color: #888;
        font-size: 11px;
      }
      
      .sb-session-movie {
        color: #6c6;
        font-size: 11px;
        margin-top: 4px;
      }
      
      .sb-session-viewers {
        color: #666;
        font-size: 10px;
        margin-top: 2px;
      }
      
      .sb-empty {
        padding: 20px;
        text-align: center;
        color: #666;
        font-size: 12px;
      }
      
      .sb-refresh-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px;
        background: rgba(100, 100, 120, 0.2);
        border: none;
        color: #888;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
        width: 100%;
      }
      
      .sb-refresh-btn:hover {
        background: rgba(100, 150, 255, 0.2);
        color: #aaa;
      }
      
      .sb-loading {
        padding: 20px;
        text-align: center;
        color: #666;
        font-size: 12px;
      }
    </style>
    
    <div class="sb-header" id="sb-header">
      <span class="sb-header-icon">🎬</span>
      <span class="sb-header-text">Watch Parties</span>
      <span class="sb-count" id="sb-count">0</span>
      <span class="sb-toggle" id="sb-toggle">▼</span>
    </div>
    
    <div class="sb-content" id="sb-content">
      <div class="sb-loading" id="sb-loading">Loading sessions...</div>
      <div id="sb-sessions"></div>
      <button class="sb-refresh-btn" id="sb-refresh-btn">
        ↻ Refresh
      </button>
    </div>
  `;
  
  document.body.appendChild(panelElement);
}

/**
 * Attach event listeners
 */
function attachEventListeners() {
  // Toggle panel
  document.getElementById('sb-header').addEventListener('click', togglePanel);
  
  // Refresh button
  document.getElementById('sb-refresh-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const convexUrl = config.multiplayer?.convexUrl || import.meta.env.VITE_CONVEX_HTTP_URL;
    fetchSessions(convexUrl);
  });
}

/**
 * Toggle panel expanded state
 */
function togglePanel() {
  isExpanded = !isExpanded;
  
  const header = document.getElementById('sb-header');
  const content = document.getElementById('sb-content');
  const toggle = document.getElementById('sb-toggle');
  
  if (isExpanded) {
    header.classList.add('expanded');
    content.classList.add('expanded');
    toggle.classList.add('expanded');
  } else {
    header.classList.remove('expanded');
    content.classList.remove('expanded');
    toggle.classList.remove('expanded');
  }
}

/**
 * Fetch sessions from Convex
 */
async function fetchSessions(convexUrl) {
  if (!convexUrl) {
    console.warn('[SessionBrowser] No Convex URL configured');
    return;
  }
  
  const loading = document.getElementById('sb-loading');
  const sessionsContainer = document.getElementById('sb-sessions');
  
  loading.style.display = 'block';
  
  try {
    // Use the Convex HTTP endpoint: GET /sessions
    const response = await fetch(`${convexUrl}/sessions`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    sessions = await response.json();
    console.log(`[SessionBrowser] Fetched ${sessions.length} session(s)`);
    
    renderSessions();
  } catch (err) {
    console.error('[SessionBrowser] Failed to fetch sessions:', err);
    sessionsContainer.innerHTML = `
      <div class="sb-empty">Failed to load sessions</div>
    `;
  } finally {
    loading.style.display = 'none';
  }
}

/**
 * Render sessions list
 */
function renderSessions() {
  const sessionsContainer = document.getElementById('sb-sessions');
  const countEl = document.getElementById('sb-count');
  
  countEl.textContent = sessions.length;
  
  if (sessions.length === 0) {
    sessionsContainer.innerHTML = `
      <div class="sb-empty">No active sessions</div>
    `;
    return;
  }
  
  sessionsContainer.innerHTML = sessions.map(session => {
    // Use movieTitle from Convex, or extract from foundryUrl as fallback
    const movieName = session.movieTitle || extractMovieName(session.foundryUrl);
    const isPlaying = session.isMoviePlaying;
    
    return `
      <div class="sb-session" data-code="${session.code}" data-ws="${session.wsUrl || ''}" data-foundry="${session.foundryUrl || ''}">
        <div class="sb-session-header">
          <span class="sb-session-code">${session.code}</span>
          <span class="sb-session-host">hosted by ${session.hostName || 'Unknown'}</span>
        </div>
        ${movieName ? `<div class="sb-session-movie">${isPlaying ? '▶️' : '🎬'} ${movieName}</div>` : ''}
        <div class="sb-session-viewers">👥 ${session.viewerCount || 0} viewer${(session.viewerCount || 0) !== 1 ? 's' : ''}</div>
      </div>
    `;
  }).join('');
  
  // Add click listeners
  sessionsContainer.querySelectorAll('.sb-session').forEach(el => {
    el.addEventListener('click', () => {
      const code = el.dataset.code;
      const wsUrl = el.dataset.ws;
      const foundryUrl = el.dataset.foundry;
      joinSession(code, wsUrl, foundryUrl);
    });
  });
}

/**
 * Extract movie name from foundry URL
 */
function extractMovieName(foundryUrl) {
  if (!foundryUrl) return null;
  
  // Extract from URLs like wss://protoverse-bigtrouble.fly.dev/ws
  const match = foundryUrl.match(/protoverse-([^.]+)/);
  if (match) {
    // Capitalize first letter
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  
  return null;
}

/**
 * Join a session
 */
function joinSession(code, wsUrl, foundryUrl) {
  console.log(`[SessionBrowser] Joining session: ${code}`);
  console.log(`[SessionBrowser]   wsUrl: ${wsUrl}`);
  console.log(`[SessionBrowser]   foundryUrl: ${foundryUrl}`);
  
  if (onJoinCallback) {
    onJoinCallback({
      code,
      wsUrl,
      foundryUrl,
    });
  }
}

/**
 * Cleanup
 */
export function destroySessionBrowserPanel() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  
  if (panelElement) {
    panelElement.remove();
    panelElement = null;
  }
}
