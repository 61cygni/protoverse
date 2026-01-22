/**
 * Session Manager
 * 
 * Handles multiplayer session creation, joining, and state synchronization.
 * Host creates a session with a code, viewers join with that code.
 */

// Session state
let ws = null;
let wsUrl = null;
let sessionCode = null;
let isHost = false;
let worldUrl = null;
let foundryUrl = null;
let hostInfo = null;
let viewers = [];
let maxViewers = 8;
let localName = null;
let localColor = null;
let reconnectTimer = null;
let shouldReconnect = true;
let pendingJoin = null; // Queue join request if WS not ready yet

// Event listeners
const listeners = {
  onOpen: new Set(),
  onClose: new Set(),
  onSessionCreated: new Set(),
  onSessionJoined: new Set(),
  onSessionEnded: new Set(),
  onSessionInfo: new Set(),
  onSessionError: new Set(),
  onPeers: new Set(),
  onJoin: new Set(),
  onLeave: new Set(),
  onState: new Set(),
  onPlaybackSync: new Set(),
  onCharacterSync: new Set(),
  onFoundrySync: new Set(),
  onChat: new Set(),
  onRequestFullState: new Set(),  // Server requests host to send full state to new viewer
};

/**
 * Initialize the session manager
 * @param {string} url - WebSocket server URL
 */
export function initSessionManager(url) {
  wsUrl = url || "ws://localhost:8765";
  console.log(`[SessionManager] Initializing with wsUrl: ${wsUrl}`);
  connect();
}

/**
 * Connect to WebSocket server
 */
function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('[SessionManager] Connected to server, wsUrl:', wsUrl);
    emit('onOpen');
    
    // Execute pending create session if there is one (reconnected to new server for custom movie)
    if (pendingCreateSession) {
      console.log('[SessionManager] Found pending create session, executing...');
      const { world, foundry, name, color, max } = pendingCreateSession;
      pendingCreateSession = null;
      
      localName = name;
      localColor = color;
      worldUrl = world;
      foundryUrl = foundry;
      maxViewers = max || 8;
      
      console.log(`[SessionManager] Creating session: world="${world}", wsUrl=${wsUrl}`);
      ws.send(JSON.stringify({
        type: 'create-session',
        worldUrl: world,
        foundryUrl: foundry,
        name,
        color,
        maxViewers,
      }));
      return;
    }
    
    // Execute pending join if there is one (user clicked join before WS was ready)
    if (pendingJoin) {
      console.log('[SessionManager] Found pending join, executing for session:', pendingJoin.sessionCode);
      console.log('[SessionManager] pendingJoin data:', JSON.stringify(pendingJoin));
      const { sessionCode: code, name, color } = pendingJoin;
      pendingJoin = null;
      
      localName = name;
      localColor = color;
      sessionCode = code?.toUpperCase();
      
      const msg = {
        type: 'join-session',
        sessionCode,
        name,
        color,
      };
      console.log('[SessionManager] Sending pending join message:', JSON.stringify(msg));
      ws.send(JSON.stringify(msg));
      return; // Don't try to rejoin old session
    } else {
      console.log('[SessionManager] No pending join to execute');
    }
    
    // Rejoin session if we were in one
    if (sessionCode && isHost && worldUrl) {
      // Re-create session
      ws.send(JSON.stringify({
        type: 'create-session',
        worldUrl,
        foundryUrl,
        name: localName,
        color: localColor,
        maxViewers,
      }));
    } else if (sessionCode && !isHost) {
      // Rejoin as viewer
      ws.send(JSON.stringify({
        type: 'join-session',
        sessionCode,
        name: localName,
        color: localColor,
      }));
    }
  };
  
  ws.onclose = () => {
    console.log('[SessionManager] Disconnected');
    emit('onClose');
    
    if (shouldReconnect) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 2000);
    }
  };
  
  ws.onerror = (err) => {
    console.error('[SessionManager] WebSocket error:', err);
  };
  
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      console.warn('[SessionManager] Failed to parse message:', ev.data);
      return;
    }
    
    // Log session-related messages for debugging
    if (msg.type?.startsWith('session')) {
      console.log(`[SessionManager] Received: ${msg.type}`, msg);
    }
    
    handleMessage(msg);
  };
}

/**
 * Handle incoming messages
 */
function handleMessage(msg) {
  switch (msg.type) {
    case 'session-created':
      sessionCode = msg.sessionCode;
      worldUrl = msg.worldUrl;
      foundryUrl = msg.foundryUrl;
      maxViewers = msg.maxViewers;
      isHost = true;
      console.log(`[SessionManager] Created session: ${sessionCode}`);
      emit('onSessionCreated', msg);
      break;
      
    case 'session-joined':
      sessionCode = msg.sessionCode;
      worldUrl = msg.worldUrl;
      foundryUrl = msg.foundryUrl;
      isHost = false;
      console.log(`[SessionManager] SUCCESS - Joined session: ${sessionCode}`);
      console.log(`[SessionManager] Session details: worldUrl=${worldUrl}, foundryUrl=${foundryUrl}, isMoviePlaying=${msg.isMoviePlaying}`);
      emit('onSessionJoined', msg);
      break;
      
    case 'session-ended':
      console.log(`[SessionManager] Session ended: ${msg.reason}`);
      const endedCode = sessionCode;
      sessionCode = null;
      isHost = false;
      emit('onSessionEnded', { ...msg, sessionCode: endedCode });
      break;
      
    case 'session-info':
      hostInfo = msg.host;
      viewers = msg.viewers;
      maxViewers = msg.maxViewers;
      emit('onSessionInfo', msg);
      break;
      
    case 'session-error':
      console.error(`[SessionManager] Error: ${msg.error}`);
      pendingJoin = null; // Clear any pending join on error
      emit('onSessionError', msg);
      break;
      
    case 'debug-sessions-response':
      console.log('[SessionManager] Debug - Active Sessions on Server:');
      console.table(msg.sessions);
      console.log(`[SessionManager] Total sessions: ${msg.totalSessions}`);
      break;
      
    case 'peers':
      emit('onPeers', msg.peers);
      break;
      
    case 'join':
      emit('onJoin', msg);
      break;
      
    case 'leave':
      emit('onLeave', msg);
      break;
      
    case 'state':
      emit('onState', msg);
      break;
      
    case 'playback-sync':
      emit('onPlaybackSync', msg);
      break;
      
    case 'character-sync':
      emit('onCharacterSync', msg);
      break;
    
    case 'foundry-sync':
      emit('onFoundrySync', msg);
      break;
      
    case 'chat':
      emit('onChat', msg);
      break;
      
    case 'request-full-state':
      // Server is asking host to send full state (new viewer joined)
      console.log(`[SessionManager] Server requested full state for viewer: ${msg.viewerName}`);
      emit('onRequestFullState', msg);
      break;
  }
}

/**
 * Emit event to listeners
 */
function emit(event, data) {
  for (const fn of listeners[event] || []) {
    try {
      fn(data);
    } catch (e) {
      console.error(`[SessionManager] Error in ${event} listener:`, e);
    }
  }
}

// ============ PUBLIC API ============

/**
 * Join a world directly (legacy mode, no session required)
 * Players in the same world will see each other's avatars
 * @param {string} world - World URL
 * @param {string} name - Display name
 * @param {number} color - Avatar color
 */
export function joinWorld(world, name, color) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[SessionManager] Not connected');
    return false;
  }
  
  localName = name;
  localColor = color;
  worldUrl = world;
  
  ws.send(JSON.stringify({
    type: 'join',
    world,
    name,
    color,
  }));
  
  console.log(`[SessionManager] Joined world: ${world}`);
  return true;
}

/**
 * Send state in legacy mode (no session)
 */
export function sendStateLegacy(pos, rot, meta) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !worldUrl) return;
  
  ws.send(JSON.stringify({
    type: 'state',
    pos,
    rot,
    meta: { ...meta, color: localColor },
  }));
}

/**
 * Check if in a world (legacy or session)
 */
export function inWorld() {
  return !!worldUrl;
}

// Pending create session (used when reconnecting to new server)
let pendingCreateSession = null;

/**
 * Reconnect to a different WebSocket server
 * @param {string} newWsUrl - New WebSocket server URL
 */
export function reconnect(newWsUrl) {
  if (newWsUrl === wsUrl && ws && ws.readyState === WebSocket.OPEN) {
    console.log('[SessionManager] Already connected to:', wsUrl);
    return;
  }
  
  console.log(`[SessionManager] Reconnecting to new server: ${newWsUrl}`);
  
  // Close existing connection
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Update URL and connect
  wsUrl = newWsUrl;
  connect();
}

/**
 * Create a new session as host
 * @param {Object} options
 * @param {string} options.worldUrl - World URL
 * @param {string} options.foundryUrl - Foundry streaming URL (optional)
 * @param {string} options.wsUrl - Custom WebSocket server URL (optional)
 * @param {string} options.name - Host display name
 * @param {number} options.color - Host color
 * @param {number} options.maxViewers - Max viewers (default 8)
 */
export function createSession({ worldUrl: world, foundryUrl: foundry, wsUrl: customWsUrl, name, color, maxViewers: max }) {
  // If custom WS URL provided, reconnect first
  if (customWsUrl && customWsUrl !== wsUrl) {
    console.log(`[SessionManager] Custom WS URL provided, reconnecting to: ${customWsUrl}`);
    pendingCreateSession = { world, foundry, name, color, max };
    reconnect(customWsUrl);
    return true; // Will create session after reconnect
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[SessionManager] Not connected');
    return false;
  }
  
  localName = name;
  localColor = color;
  worldUrl = world;
  foundryUrl = foundry;
  maxViewers = max || 8;
  
  console.log(`[SessionManager] Creating session: world="${world}", wsUrl=${wsUrl}`);
  
  ws.send(JSON.stringify({
    type: 'create-session',
    worldUrl: world,
    foundryUrl: foundry,
    name,
    color,
    maxViewers,
  }));
  
  return true;
}

/**
 * Join an existing session as viewer
 * @param {Object} options
 * @param {string} options.sessionCode - Session code to join
 * @param {string} options.name - Viewer display name
 * @param {number} options.color - Viewer color
 */
export function joinSession({ sessionCode: code, name, color }) {
  const wsState = ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] : 'NULL';
  console.log(`[SessionManager] joinSession called: code="${code}", wsState=${wsState}, wsUrl=${wsUrl}`);
  
  // If not connected yet, queue the join for when connection opens
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('[SessionManager] Not connected yet, queuing join for session:', code);
    console.log(`[SessionManager] pendingJoin set to:`, { sessionCode: code, name, color });
    pendingJoin = { sessionCode: code, name, color };
    
    // If WS doesn't exist or is closed, try to connect
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      console.log('[SessionManager] WS is null or closed, initiating connect()');
      connect();
    } else {
      console.log('[SessionManager] WS is connecting, waiting for onopen');
    }
    return true; // Return true since we queued it
  }
  
  localName = name;
  localColor = color;
  sessionCode = code?.toUpperCase();
  
  console.log(`[SessionManager] Sending join-session: code="${sessionCode}" (original: "${code}")`);
  
  const msg = {
    type: 'join-session',
    sessionCode,
    name,
    color,
  };
  console.log('[SessionManager] Sending message:', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
  
  return true;
}

/**
 * Leave the current session
 */
export function leaveSession() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const wasInSession = !!sessionCode;
  const oldSessionCode = sessionCode;
  
  ws.send(JSON.stringify({ type: 'leave-session' }));
  sessionCode = null;
  isHost = false;
  hostInfo = null;
  viewers = [];
  worldUrl = null; // Clear world so we don't see anything
  
  // Emit session ended so multiplayer clears all peers
  if (wasInSession) {
    emit('onSessionEnded', { sessionCode: oldSessionCode, reason: 'You left the session' });
  }
}

/**
 * Send player state (position, rotation)
 */
export function sendState(pos, rot, meta) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !sessionCode) return;
  
  ws.send(JSON.stringify({
    type: 'state',
    pos,
    rot,
    meta: { ...meta, color: localColor },
  }));
}

/**
 * Send playback sync (host only)
 */
export function sendPlaybackSync(isPaused, timestamp) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !isHost) return;
  
  ws.send(JSON.stringify({
    type: 'playback-sync',
    isPaused,
    timestamp,
  }));
}

/**
 * Send character/AI sync (host only)
 * @param {Array} characters - Array of { id, position, rotation, animation, comment }
 */
export function sendCharacterSync(characters) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !isHost) return;
  
  ws.send(JSON.stringify({
    type: 'character-sync',
    characters,
  }));
}

/**
 * Send Foundry connection sync (host only)
 * @param {boolean} isConnected - Whether Foundry is connected
 * @param {string} foundryUrlToShare - Foundry URL for viewers to connect to
 */
export function sendFoundrySync(isConnected, foundryUrlToShare = null) {
  console.log(`[SessionManager] sendFoundrySync called: isConnected=${isConnected}, ws=${!!ws}, wsReady=${ws?.readyState === WebSocket.OPEN}, isHost=${isHost}`);
  
  if (!ws || ws.readyState !== WebSocket.OPEN || !isHost) {
    console.warn(`[SessionManager] sendFoundrySync aborted: ws=${!!ws}, wsReady=${ws?.readyState === WebSocket.OPEN}, isHost=${isHost}`);
    return;
  }
  
  const msg = {
    type: 'foundry-sync',
    isConnected,
    foundryUrl: foundryUrlToShare,
  };
  console.log(`[SessionManager] Sending foundry-sync:`, msg);
  ws.send(JSON.stringify(msg));
}

/**
 * Send chat message
 */
export function sendChat(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  ws.send(JSON.stringify({
    type: 'chat',
    message,
  }));
}

/**
 * Disconnect and cleanup
 */
export function disconnect() {
  shouldReconnect = false;
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
  sessionCode = null;
  isHost = false;
}

// ============ EVENT SUBSCRIPTION ============

export function onOpen(fn) { listeners.onOpen.add(fn); return () => listeners.onOpen.delete(fn); }
export function onClose(fn) { listeners.onClose.add(fn); return () => listeners.onClose.delete(fn); }
export function onSessionCreated(fn) { listeners.onSessionCreated.add(fn); return () => listeners.onSessionCreated.delete(fn); }
export function onSessionJoined(fn) { listeners.onSessionJoined.add(fn); return () => listeners.onSessionJoined.delete(fn); }
export function onSessionEnded(fn) { listeners.onSessionEnded.add(fn); return () => listeners.onSessionEnded.delete(fn); }
export function onSessionInfo(fn) { listeners.onSessionInfo.add(fn); return () => listeners.onSessionInfo.delete(fn); }
export function onSessionError(fn) { listeners.onSessionError.add(fn); return () => listeners.onSessionError.delete(fn); }
export function onPeers(fn) { listeners.onPeers.add(fn); return () => listeners.onPeers.delete(fn); }
export function onJoin(fn) { listeners.onJoin.add(fn); return () => listeners.onJoin.delete(fn); }
export function onLeave(fn) { listeners.onLeave.add(fn); return () => listeners.onLeave.delete(fn); }
export function onState(fn) { listeners.onState.add(fn); return () => listeners.onState.delete(fn); }
export function onPlaybackSync(fn) { listeners.onPlaybackSync.add(fn); return () => listeners.onPlaybackSync.delete(fn); }
export function onCharacterSync(fn) { listeners.onCharacterSync.add(fn); return () => listeners.onCharacterSync.delete(fn); }
export function onFoundrySync(fn) { listeners.onFoundrySync.add(fn); return () => listeners.onFoundrySync.delete(fn); }
export function onChat(fn) { listeners.onChat.add(fn); return () => listeners.onChat.delete(fn); }
export function onRequestFullState(fn) { listeners.onRequestFullState.add(fn); return () => listeners.onRequestFullState.delete(fn); }

// ============ GETTERS ============

export function getSessionCode() { return sessionCode; }
export function isHosting() { return isHost; }
export function inSession() { return !!sessionCode; }
export function getWorldUrl() { return worldUrl; }
export function getFoundryUrl() { return foundryUrl; }
export function getHostInfo() { return hostInfo; }

/**
 * Debug: Request list of active sessions from server
 */
export function debugListSessions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('[SessionManager] Debug: Not connected to server');
    return;
  }
  console.log('[SessionManager] Debug: Requesting session list from server...');
  ws.send(JSON.stringify({ type: 'debug-sessions' }));
}

/**
 * Debug: Get current client state
 */
export function debugClientState() {
  const wsState = ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState] : 'NULL';
  console.log('[SessionManager] Debug - Client State:');
  console.log('  wsUrl:', wsUrl);
  console.log('  wsState:', wsState);
  console.log('  sessionCode:', sessionCode);
  console.log('  isHost:', isHost);
  console.log('  worldUrl:', worldUrl);
  console.log('  foundryUrl:', foundryUrl);
  console.log('  pendingJoin:', pendingJoin);
  console.log('  localName:', localName);
  return { wsUrl, wsState, sessionCode, isHost, worldUrl, foundryUrl, pendingJoin, localName };
}
export function getViewers() { return viewers; }
export function getMaxViewers() { return maxViewers; }
export function getLocalName() { return localName; }
export function getLocalColor() { return localColor; }
export function isConnected() { return ws && ws.readyState === WebSocket.OPEN; }
