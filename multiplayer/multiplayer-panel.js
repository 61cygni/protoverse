/**
 * Multiplayer Panel
 * 
 * Right-side dropdown HUD for multiplayer logging and chat.
 * Desktop only (hidden in VR).
 */

import * as SessionManager from './session-manager.js';
import { handleYBotChatFromMultiplayer } from '../characters/ybot.js';

let panelContainer = null;
let panelContent = null;
let messagesContainer = null;
let chatInput = null;
let sessionInfoEl = null;
let viewerListEl = null;
let isExpanded = false;
let isInitialized = false;
let unsubscribers = [];

// Color palette for converting hex to CSS
function hexToColor(hex) {
  if (typeof hex === 'number') {
    return `#${hex.toString(16).padStart(6, '0')}`;
  }
  return hex || '#00d4ff';
}

// Format timestamp
function formatTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

/**
 * Initialize the multiplayer panel
 */
export function initMultiplayerPanel() {
  if (isInitialized) return;
  isInitialized = true;
  
  createPanel();
  attachEventListeners();
}

/**
 * Create the panel DOM structure
 */
function createPanel() {
  // Main container
  panelContainer = document.createElement('div');
  panelContainer.id = 'multiplayer-panel';
  panelContainer.innerHTML = `
    <style>
      #multiplayer-panel {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 320px;
        font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
        font-size: 12px;
        z-index: 1000;
        pointer-events: auto;
      }
      
      #multiplayer-panel * {
        box-sizing: border-box;
      }
      
      .mp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: linear-gradient(135deg, rgba(30, 30, 40, 0.95) 0%, rgba(20, 20, 30, 0.95) 100%);
        border: 1px solid rgba(100, 150, 255, 0.3);
        border-radius: 8px;
        cursor: pointer;
        user-select: none;
        backdrop-filter: blur(10px);
        transition: all 0.2s ease;
      }
      
      .mp-header:hover {
        border-color: rgba(100, 150, 255, 0.5);
        background: linear-gradient(135deg, rgba(40, 40, 55, 0.95) 0%, rgba(25, 25, 40, 0.95) 100%);
      }
      
      .mp-header.expanded {
        border-radius: 8px 8px 0 0;
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
      }
      
      .mp-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #e0e0e0;
        font-weight: 500;
      }
      
      .mp-status {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #555;
        transition: background 0.3s;
      }
      
      .mp-status.connected {
        background: #22c55e;
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
      }
      
      .mp-status.session {
        background: #3b82f6;
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
      }
      
      .mp-toggle {
        color: #888;
        font-size: 14px;
        transition: transform 0.2s;
      }
      
      .mp-toggle.expanded {
        transform: rotate(180deg);
      }
      
      .mp-content {
        display: none;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid rgba(100, 150, 255, 0.3);
        border-top: none;
        border-radius: 0 0 8px 8px;
        backdrop-filter: blur(10px);
        overflow: hidden;
      }
      
      .mp-content.expanded {
        display: block;
      }
      
      .mp-session-info {
        padding: 10px 12px;
        background: rgba(59, 130, 246, 0.1);
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
      }
      
      .mp-session-code {
        font-size: 18px;
        font-weight: bold;
        color: #3b82f6;
        letter-spacing: 3px;
        margin-bottom: 4px;
      }
      
      .mp-session-detail {
        color: #888;
        font-size: 11px;
      }
      
      .mp-viewer-list {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(100, 150, 255, 0.15);
        max-height: 80px;
        overflow-y: auto;
      }
      
      .mp-viewer {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        color: #ccc;
        font-size: 11px;
      }
      
      .mp-viewer-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      
      .mp-viewer-host {
        font-size: 9px;
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.2);
        padding: 1px 4px;
        border-radius: 3px;
        margin-left: 4px;
      }
      
      .mp-messages {
        height: 200px;
        overflow-y: auto;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .mp-message {
        padding: 4px 0;
        line-height: 1.4;
        word-wrap: break-word;
      }
      
      .mp-message-time {
        color: #555;
        margin-right: 6px;
      }
      
      .mp-message-name {
        font-weight: 500;
        margin-right: 4px;
      }
      
      .mp-message-text {
        color: #ddd;
      }
      
      .mp-message-system {
        color: #888;
        font-style: italic;
      }
      
      .mp-chat-input-container {
        display: flex;
        padding: 8px;
        gap: 6px;
        border-top: 1px solid rgba(100, 150, 255, 0.15);
        background: rgba(15, 15, 25, 0.5);
      }
      
      .mp-chat-input {
        flex: 1;
        background: rgba(30, 30, 45, 0.8);
        border: 1px solid rgba(100, 150, 255, 0.2);
        border-radius: 4px;
        padding: 6px 10px;
        color: #fff;
        font-family: inherit;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .mp-chat-input:focus {
        border-color: rgba(100, 150, 255, 0.5);
      }
      
      .mp-chat-input::placeholder {
        color: #555;
      }
      
      .mp-chat-send {
        background: rgba(59, 130, 246, 0.3);
        border: 1px solid rgba(59, 130, 246, 0.5);
        border-radius: 4px;
        padding: 6px 12px;
        color: #fff;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        transition: all 0.2s;
      }
      
      .mp-chat-send:hover {
        background: rgba(59, 130, 246, 0.5);
      }
      
      .mp-chat-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      /* Scrollbar styling */
      .mp-messages::-webkit-scrollbar,
      .mp-viewer-list::-webkit-scrollbar {
        width: 4px;
      }
      
      .mp-messages::-webkit-scrollbar-track,
      .mp-viewer-list::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .mp-messages::-webkit-scrollbar-thumb,
      .mp-viewer-list::-webkit-scrollbar-thumb {
        background: rgba(100, 150, 255, 0.3);
        border-radius: 2px;
      }
      
      /* No session state */
      .mp-no-session {
        padding: 16px 12px;
        text-align: center;
        color: #666;
      }
      
      .mp-no-session-hint {
        font-size: 10px;
        color: #555;
        margin-top: 8px;
      }
    </style>
    
    <div class="mp-header" id="mp-header">
      <div class="mp-title">
        <div class="mp-status" id="mp-status"></div>
        <span id="mp-title-text">Multiplayer</span>
      </div>
      <span class="mp-toggle" id="mp-toggle">▼</span>
    </div>
    
    <div class="mp-content" id="mp-content">
      <div class="mp-session-info" id="mp-session-info" style="display: none;">
        <div class="mp-session-code" id="mp-session-code"></div>
        <div class="mp-session-detail" id="mp-session-detail"></div>
      </div>
      
      <div class="mp-viewer-list" id="mp-viewer-list" style="display: none;"></div>
      
      <div class="mp-messages" id="mp-messages">
        <div class="mp-no-session">
          <div>Not in a session</div>
          <div class="mp-no-session-hint">Create or join a session to chat</div>
        </div>
      </div>
      
      <div class="mp-chat-input-container">
        <input type="text" class="mp-chat-input" id="mp-chat-input" placeholder="Type a message..." disabled>
        <button class="mp-chat-send" id="mp-chat-send" disabled>Send</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(panelContainer);
  
  // Get references
  const header = document.getElementById('mp-header');
  panelContent = document.getElementById('mp-content');
  messagesContainer = document.getElementById('mp-messages');
  chatInput = document.getElementById('mp-chat-input');
  sessionInfoEl = document.getElementById('mp-session-info');
  viewerListEl = document.getElementById('mp-viewer-list');
  
  // Toggle expansion
  header.addEventListener('click', () => {
    isExpanded = !isExpanded;
    panelContent.classList.toggle('expanded', isExpanded);
    header.classList.toggle('expanded', isExpanded);
    document.getElementById('mp-toggle').classList.toggle('expanded', isExpanded);
  });
  
  // Chat input
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      sendChatMessage();
    }
  });
  
  // Disable keyboard controls when chat input is focused
  chatInput.addEventListener('focus', () => {
    document.body.classList.add('chat-input-focused');
    // Dispatch custom event for other systems to listen to
    window.dispatchEvent(new CustomEvent('chat-focus', { detail: { focused: true } }));
  });
  
  chatInput.addEventListener('blur', () => {
    document.body.classList.remove('chat-input-focused');
    window.dispatchEvent(new CustomEvent('chat-focus', { detail: { focused: false } }));
  });
  
  document.getElementById('mp-chat-send').addEventListener('click', sendChatMessage);
}

/**
 * Send chat message
 */
function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;
  
  SessionManager.sendChat(message);
  chatInput.value = '';
}

function parseYBotMention(message) {
  const trimmed = (message || '').trim();
  const match = trimmed.match(/^@ybot\b[:,]?\s*(.*)$/i);
  if (!match) return null;
  const prompt = match[1]?.trim();
  return prompt || null;
}

/**
 * Attach event listeners to session manager
 */
function attachEventListeners() {
  unsubscribers.push(SessionManager.onOpen(() => {
    updateStatus('connected');
    addSystemMessage('Connected to server');
  }));
  
  unsubscribers.push(SessionManager.onClose(() => {
    updateStatus('disconnected');
    addSystemMessage('Disconnected from server');
  }));
  
  unsubscribers.push(SessionManager.onSessionCreated((data) => {
    updateStatus('session');
    updateSessionInfo(data.sessionCode, true);
    enableChat();
    clearMessages();
    addSystemMessage(`Session created: ${data.sessionCode}`);
  }));
  
  unsubscribers.push(SessionManager.onSessionJoined((data) => {
    updateStatus('session');
    updateSessionInfo(data.sessionCode, false);
    enableChat();
    clearMessages();
    addSystemMessage(`Joined session: ${data.sessionCode}`);
  }));
  
  unsubscribers.push(SessionManager.onSessionEnded((data) => {
    updateStatus('connected');
    hideSessionInfo();
    disableChat();
    addSystemMessage(`Session ended: ${data.reason}`);
  }));
  
  unsubscribers.push(SessionManager.onSessionInfo((data) => {
    updateViewerList(data.host, data.viewers);
  }));
  
  unsubscribers.push(SessionManager.onSessionError((data) => {
    addSystemMessage(`Error: ${data.error}`);
  }));
  
  unsubscribers.push(SessionManager.onJoin((data) => {
    addSystemMessage(`${data.name} joined`);
  }));
  
  unsubscribers.push(SessionManager.onLeave((data) => {
    addSystemMessage(`${data.name || 'Someone'} left`);
  }));
  
  unsubscribers.push(SessionManager.onChat((data) => {
    addChatMessage(data.name, data.message, data.color, data.t);

    const ybotPrompt = parseYBotMention(data.message);
    if (ybotPrompt && SessionManager.isHosting()) {
      handleYBotChatFromMultiplayer(ybotPrompt, data.name);
    }
  }));
}

/**
 * Update connection status indicator
 */
function updateStatus(status) {
  const statusEl = document.getElementById('mp-status');
  const titleEl = document.getElementById('mp-title-text');
  
  statusEl.className = 'mp-status';
  
  switch (status) {
    case 'connected':
      statusEl.classList.add('connected');
      titleEl.textContent = 'Multiplayer';
      break;
    case 'session':
      statusEl.classList.add('session');
      titleEl.textContent = 'Session Active';
      break;
    default:
      titleEl.textContent = 'Offline';
  }
}

/**
 * Update session info display
 */
function updateSessionInfo(code, isHost) {
  sessionInfoEl.style.display = 'block';
  document.getElementById('mp-session-code').textContent = code;
  document.getElementById('mp-session-detail').textContent = isHost ? 'You are hosting' : 'Viewing';
}

/**
 * Hide session info
 */
function hideSessionInfo() {
  sessionInfoEl.style.display = 'none';
  viewerListEl.style.display = 'none';
}

/**
 * Update viewer list
 */
function updateViewerList(host, viewers) {
  viewerListEl.style.display = 'block';
  
  let html = '';
  
  if (host) {
    html += `
      <div class="mp-viewer">
        <div class="mp-viewer-dot" style="background: ${hexToColor(host.color)}"></div>
        <span>${host.name}</span>
        <span class="mp-viewer-host">HOST</span>
      </div>
    `;
  }
  
  for (const viewer of viewers) {
    html += `
      <div class="mp-viewer">
        <div class="mp-viewer-dot" style="background: ${hexToColor(viewer.color)}"></div>
        <span>${viewer.name}</span>
      </div>
    `;
  }
  
  viewerListEl.innerHTML = html || '<div class="mp-viewer" style="color: #555;">No viewers yet</div>';
}

/**
 * Enable chat input
 */
function enableChat() {
  chatInput.disabled = false;
  document.getElementById('mp-chat-send').disabled = false;
  chatInput.placeholder = 'Type a message...';
}

/**
 * Disable chat input
 */
function disableChat() {
  chatInput.disabled = true;
  document.getElementById('mp-chat-send').disabled = true;
  chatInput.placeholder = 'Join a session to chat';
}

/**
 * Clear messages
 */
function clearMessages() {
  messagesContainer.innerHTML = '';
}

/**
 * Add a system message
 */
function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'mp-message';
  el.innerHTML = `
    <span class="mp-message-time">${formatTime()}</span>
    <span class="mp-message-system">${escapeHtml(text)}</span>
  `;
  messagesContainer.appendChild(el);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Add a chat message
 */
function addChatMessage(name, text, color, timestamp) {
  const el = document.createElement('div');
  el.className = 'mp-message';
  el.innerHTML = `
    <span class="mp-message-time">${formatTime(timestamp)}</span>
    <span class="mp-message-name" style="color: ${hexToColor(color)}">${escapeHtml(name)}:</span>
    <span class="mp-message-text">${escapeHtml(text)}</span>
  `;
  messagesContainer.appendChild(el);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Add a log message (for external use)
 */
export function addLogMessage(text, type = 'info') {
  addSystemMessage(text);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show the panel
 */
export function showPanel() {
  if (panelContainer) {
    panelContainer.style.display = 'block';
  }
}

/**
 * Hide the panel
 */
export function hidePanel() {
  if (panelContainer) {
    panelContainer.style.display = 'none';
  }
}

/**
 * Expand the panel
 */
export function expandPanel() {
  if (!isExpanded) {
    isExpanded = true;
    panelContent?.classList.add('expanded');
    document.getElementById('mp-header')?.classList.add('expanded');
    document.getElementById('mp-toggle')?.classList.add('expanded');
  }
}

/**
 * Collapse the panel
 */
export function collapsePanel() {
  if (isExpanded) {
    isExpanded = false;
    panelContent?.classList.remove('expanded');
    document.getElementById('mp-header')?.classList.remove('expanded');
    document.getElementById('mp-toggle')?.classList.remove('expanded');
  }
}

/**
 * Cleanup
 */
export function destroyMultiplayerPanel() {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers = [];
  
  if (panelContainer) {
    panelContainer.remove();
    panelContainer = null;
  }
  
  isInitialized = false;
}
