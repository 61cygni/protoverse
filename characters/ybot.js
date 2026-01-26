/**
 * Y-Bot Character Definition
 * 
 * A character that wanders between waypoints using a graph structure.
 * The waypointGraph is a DAG defined in world.json with nodes and edges.
 * At each node, it picks a random direction but avoids going back
 * the way it came unless it's the only option.
 * 
 * Chat System:
 * - When player approaches Y-Bot (non-VR only), chat UI opens
 * - Uses BrainTrust for AI responses with streaming
 * - Falls back to stock responses if AI unavailable
 * 
 * Cinema Mode:
 * - When cinema mode is enabled, Y-Bot walks to the "bed" waypoint
 * - It sits and watches the movie with you
 * - Periodically captures frames and makes AI-generated comments
 * - Normal chat is disabled during cinema mode
 */

import * as THREE from "three";
import { showChat, hideChat, isChatVisible, addMessage, startStreamingMessage, appendToStreamingMessage, endStreamingMessage, initChatUI, showChatToggle, hideChatToggle, isChatToggleVisible } from "../chat-ui.js";
import { initChatProvider, getChatResponse, getVisionCommentary } from "../ai/chat-provider.js";
import { stopPlayerMovement } from "../physics.js";
import { 
    startVRChat, 
    endVRChat, 
    startVRChatStreaming, 
    appendVRChatStreaming, 
    endVRChatStreaming 
} from "../vr/vr-chat.js";
import { onCinemaModeChange, offCinemaModeChange, captureFoundryFrame, isCinemaModeActive, getFoundryScreenPosition, getFoundryScreenRotation, getFoundryMovieConfig, getFoundryDisplayConfig, getFoundryDisplayType, isFoundryDisplayPaused, isFoundryConnected } from "../foundry-share.js";
import { showSplatCommentary, hideSplatCommentary } from "../splat-dialog-box.js";

const forwardDir = new THREE.Vector3();
const targetDir = new THREE.Vector3();

/**
 * Character States
 */
export const YBotStates = {
    WALKING: 'walking',
    IDLE: 'idle',
    SITTING: 'sitting',  // For cinema mode (placeholder)
    LAYING: 'laying',    // For cinema mode on bed
};

/**
 * Character name
 */
const CHARACTER_NAME = "Y-Bot";

/**
 * Movement settings
 */
const MOVEMENT = {
    speed: 0.8,              // Units per second
    turnSpeed: 2.0,          // Radians per second
    arrivalDistance: 0.3,    // How close to waypoint before considering "arrived"
    waitTimeMin: 1.0, // Minimum wait at waypoint (seconds)
    waitTimeMax: 3.0,        // Maximum wait at waypoint (seconds)
    greetingDuration: 5.0,   // How long to stay idle when greeting player (seconds)
    idleChance: 0.2,         // 20% chance to pause at a node instead of moving
    idleTimeMin: 2.0,        // Minimum idle time when randomly pausing
    idleTimeMax: 5.0,        // Maximum idle time when randomly pausing
    maxWalkDistance: 50,     // Safety: max distance to walk without reaching target
};

/**
 * Chat settings
 */
const CHAT = {
    promptSlug: "ybot-hello-444b",  // BrainTrust prompt slug for regular chat
};

/**
 * Cinema mode settings (defaults, can be overridden in world.json)
 */
const CINEMA_DEFAULTS = {
    commentaryEnabled: true,
    commentIntervalMin: 30000,   // Minimum ms between comments (30 seconds)
    commentIntervalMax: 90000,   // Maximum ms between comments (90 seconds)
    commentarySlug: "ybot-movie-frame-a6c8",  // BrainTrust prompt for movie commentary
};

// Track conversation history per session
let conversationHistory = [];

// Track if we're in VR mode (set by external code)
let isInVRMode = false;

// Track if we're in cinema mode
let isInCinemaMode = false;

// Track active Y-Bot instance for cinema mode callbacks
let activeYBotInstance = null;
let activeYBotManager = null;

// Cinema commentary state
let commentaryTimer = null;
// Note: SplatDialogBox is used for all commentary display (initialized in main.js)

// Helper to start commentary only once when ready (must be in watching phase)
function maybeStartCommentary(instance, worldUrl) {
    const state = instance?.stateData;
    if (!state || state.commentaryStarted) return;
    
    // Only start commentary when actually laying down and watching
    if (state.phase !== 'watching') {
        console.log(`[${state.displayName}] maybeStartCommentary called but phase=${state.phase}, waiting...`);
        return;
    }
    
    console.log(`[${state.displayName}] Starting commentary (phase=watching)`);
    startCommentaryTimer(instance, worldUrl);
    state.commentaryStarted = true;
}

/**
 * Set VR mode state (call from main.js when entering/exiting VR)
 */
export function setVRMode(inVR) {
    isInVRMode = inVR;
}

/**
 * Check if currently in VR mode
 */
export function getVRMode() {
    return isInVRMode;
}

/**
 * Build a waypoint graph from the world.json format
 * @param {Array} graphData - Array of {id, pos, edges} objects
 * @returns {Map} Map of node id -> {id, position: Vector3, edges: string[]}
 */
function buildWaypointGraph(graphData) {
    const graph = new Map();
    
    for (const node of graphData) {
        graph.set(node.id, {
            id: node.id,
            position: new THREE.Vector3(node.pos[0], node.pos[1], node.pos[2]),
            edges: node.edges || [],
        });
    }
    
    return graph;
}

/**
 * Pick the next node to walk to
 * NEVER goes back to previousNode unless it's the only option
 * NEVER goes to cinemaSpotId unless inCinemaMode is true
 * @param {Map} graph - The waypoint graph
 * @param {string} currentNodeId - Current node id
 * @param {string|null} previousNodeId - Previous node id (to avoid)
 * @param {string|null} cinemaSpotId - Cinema/bed waypoint to avoid when not in cinema mode
 * @param {boolean} inCinemaMode - Whether cinema mode is active
 * @returns {string} Next node id
 */
function pickNextNode(graph, currentNodeId, previousNodeId, cinemaSpotId = null, inCinemaMode = false) {
    const currentNode = graph.get(currentNodeId);
    if (!currentNode || currentNode.edges.length === 0) {
        return currentNodeId; // No edges, stay put
    }
    
    // Start with all edges
    let candidates = [...currentNode.edges];
    
    // First, filter out cinema spot (bed) if not in cinema mode - this takes priority
    if (cinemaSpotId && !inCinemaMode) {
        const filtered = candidates.filter(id => id !== cinemaSpotId);
        if (filtered.length > 0) {
            candidates = filtered;
        }
        // Only keep cinema spot if it's literally the only edge
    }
    
    // Then filter out the previous node (never backtrack) - but only if we have other options
    if (previousNodeId) {
        const filtered = candidates.filter(id => id !== previousNodeId);
        if (filtered.length > 0) {
            candidates = filtered;
        }
        // If previous node is the only option (after cinema filtering), backtrack is allowed
    }
    
    // If in cinema mode and we have a cinema spot, prefer nodes closer to it
    if (inCinemaMode && cinemaSpotId && candidates.length > 1) {
        const cinemaNode = graph.get(cinemaSpotId);
        if (cinemaNode) {
            // Calculate distances to cinema spot for each candidate
            const candidatesWithDistance = candidates.map(id => {
                const node = graph.get(id);
                if (!node) return { id, distance: Infinity };
                const dx = node.position.x - cinemaNode.position.x;
                const dz = node.position.z - cinemaNode.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                return { id, distance };
            });
            
            // Sort by distance (closest first)
            candidatesWithDistance.sort((a, b) => a.distance - b.distance);
            
            // If cinema spot is directly connected, always prefer it
            if (candidates.includes(cinemaSpotId)) {
                return cinemaSpotId;
            }
            
            // Prefer the closest node, but with some randomness (70% chance for closest, 30% for others)
            if (Math.random() < 0.7) {
                return candidatesWithDistance[0].id;
            } else {
                // Pick randomly from top 3 closest
                const topCandidates = candidatesWithDistance.slice(0, Math.min(3, candidatesWithDistance.length));
                const randomIndex = Math.floor(Math.random() * topCandidates.length);
                return topCandidates[randomIndex].id;
            }
        }
    }
    
    // Pick a random candidate
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
}

/**
 * Find a shortest path in the waypoint graph (BFS). Assumes small graphs.
 * @returns {string[]|null} Array of node ids from start -> goal (inclusive), or null if unreachable
 */
function findShortestPath(graph, startId, goalId) {
    if (!graph.has(startId) || !graph.has(goalId)) return null;
    if (startId === goalId) return [startId];

    const queue = [startId];
    const visited = new Set([startId]);
    const parent = new Map();

    while (queue.length > 0) {
        const nodeId = queue.shift();
        const node = graph.get(nodeId);
        if (!node) continue;

        // Treat edges as directed; most worlds define bidirectional edges explicitly.
        for (const neighbor of node.edges) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            parent.set(neighbor, nodeId);
            if (neighbor === goalId) {
                // Reconstruct path
                const path = [goalId];
                let cur = nodeId;
                while (cur) {
                    path.unshift(cur);
                    cur = parent.get(cur);
                }
                return path;
            }
            queue.push(neighbor);
        }
    }

    return null;
}

// ============================================
// Cinema Mode Functions
// ============================================

/**
 * Handle cinema mode state changes
 */
function handleCinemaModeChange(instance, manager, isActive, worldUrl) {
    const state = instance?.stateData;
    if (!state) return;
    
    console.log(`[${state.displayName}] Cinema mode ${isActive ? 'ON' : 'OFF'}`);
    
    if (isActive) {
        // Cinema mode started - walk to cinema spot (bed)
        state.inCinemaMode = true;
        isInCinemaMode = true;
        state.cinemaPath = [];
        state.commentaryStarted = false;
        
        // Remember where we were
        state.lastNodeBeforeCinema = state.currentNodeId;
        
        // Get and store the screen position and rotation to face when laying down
        state.screenPosition = getFoundryScreenPosition(worldUrl);
        state.screenRotation = getFoundryScreenRotation(worldUrl);
        state.movieConfig = getFoundryMovieConfig(worldUrl);
        state.displayConfig = getFoundryDisplayConfig(worldUrl);
        console.log(`[${state.displayName}] Display config:`, state.displayConfig);
        console.log(`[${state.displayName}] Movie config:`, state.movieConfig);
        if (state.movieConfig?.title) {
            console.log(`[${state.displayName}] Watching: "${state.movieConfig.title}"${state.movieConfig.year ? ` (${state.movieConfig.year})` : ''}`);
        } else {
            console.log(`[${state.displayName}] No movie info available yet (may load when connected to foundry)`);
        }
        
        // If we have a cinema spot, navigate to it via waypoints
        if (state.cinemaSpotId && state.graph.has(state.cinemaSpotId)) {
            // FIX: If Y-Bot was mid-walk when cinema mode activated, find the closest node
            // to its current position to use as the starting point for pathfinding
            const actualPos = state.controlledPosition || instance.model.position;
            let closestNodeId = state.currentNodeId;
            let closestDist = Infinity;
            
            for (const [nodeId, node] of state.graph) {
                const dx = node.position.x - actualPos.x;
                const dz = node.position.z - actualPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestNodeId = nodeId;
                }
            }
            
            // Update currentNodeId to the closest node
            if (closestNodeId !== state.currentNodeId) {
                console.log(`[${state.displayName}] Cinema mode: Adjusted starting node from "${state.currentNodeId}" to closest "${closestNodeId}" (dist=${closestDist.toFixed(2)})`);
                state.currentNodeId = closestNodeId;
            }
            
            // Check if already at cinema spot
            if (state.currentNodeId === state.cinemaSpotId) {
                // Already there - lay down immediately
                state.phase = 'watching';
                
                // Rotate to face the screen
                if (state.screenPosition && instance.model) {
                    const dx = state.screenPosition.x - instance.model.position.x;
                    const dz = state.screenPosition.z - instance.model.position.z;
                    state.currentRotation = Math.atan2(dx, dz);
                    instance.model.rotation.set(0, state.currentRotation, 0);
                }
                
                if (manager && instance.currentState !== YBotStates.LAYING) {
                    manager.transitionToState(instance, YBotStates.LAYING);
                }
                
                console.log(`[${state.displayName}] Already at cinema spot - laying down`);
                maybeStartCommentary(instance, worldUrl);
            } else {
            // Navigate to cinema spot via waypoints
                // Compute shortest path in graph to cinema spot
                const path = findShortestPath(state.graph, state.currentNodeId, state.cinemaSpotId);
                if (path && path.length > 1) {
                    // Drop current node, keep remaining path
                    state.cinemaPath = path.slice(1);
                    const nextNodeId = state.cinemaPath.shift();
                    const nextNode = state.graph.get(nextNodeId);
                    
                    if (nextNode) {
                        state.previousNodeId = state.currentNodeId;
                        state.targetNodeId = nextNodeId;
                        state.targetPosition = nextNode.position.clone();
                        
                        // Calculate rotation to face next waypoint
                        const dx = state.targetPosition.x - state.controlledPosition.x;
                        const dz = state.targetPosition.z - state.controlledPosition.z;
                        state.targetRotation = Math.atan2(dx, dz);
                        
                        state.phase = 'turning';
                        
                        // Switch to walking animation
                        if (manager && instance.currentState !== YBotStates.WALKING) {
                            manager.transitionToState(instance, YBotStates.WALKING);
                        }
                        
                        console.log(`[${state.displayName}] Cinema path computed -> dest: "${state.cinemaSpotId}", path: ${JSON.stringify(path)}`);
                        console.log(`[${state.displayName}] Navigating via shortest path (next: "${nextNodeId}")`);
                    }
                } else {
                    // No path found; fall back to a random neighbor (still in cinema mode biasing toward cinema spot)
                    const nextNodeId = pickNextNode(state.graph, state.currentNodeId, state.previousNodeId, state.cinemaSpotId, true);
                    const nextNode = state.graph.get(nextNodeId);
                    if (nextNode) {
                        state.previousNodeId = state.currentNodeId;
                        state.targetNodeId = nextNodeId;
                        state.targetPosition = nextNode.position.clone();
                        
                        const dx = state.targetPosition.x - state.controlledPosition.x;
                        const dz = state.targetPosition.z - state.controlledPosition.z;
                        state.targetRotation = Math.atan2(dx, dz);
                        
                        state.phase = 'turning';
                        if (manager && instance.currentState !== YBotStates.WALKING) {
                            manager.transitionToState(instance, YBotStates.WALKING);
                        }
                        console.log(`[${state.displayName}] No path found to "${state.cinemaSpotId}"; walking toward "${nextNodeId}"`);
                    }
                }
            }
        } else {
            // No cinema spot - just lay down where we are
            state.phase = 'watching';
            
            // Rotate to face the screen
            if (state.screenPosition && instance.model) {
                const dx = state.screenPosition.x - instance.model.position.x;
                const dz = state.screenPosition.z - instance.model.position.z;
                state.currentRotation = Math.atan2(dx, dz);
                instance.model.rotation.set(0, state.currentRotation, 0);
            }
            
            if (manager && instance.currentState !== YBotStates.LAYING) {
                manager.transitionToState(instance, YBotStates.LAYING);
            }
            
            maybeStartCommentary(instance, worldUrl);
        }
        
        // Create commentary display element
        createCommentaryDisplay();
        
    } else {
        // Cinema mode ended - resume wandering
        state.inCinemaMode = false;
        isInCinemaMode = false;
        state.cinemaPath = [];
        state.commentaryStarted = false;
        
        // Stop commentary
        stopCommentaryTimer();
        removeCommentaryDisplay();
        
        // Resume from where we were or go back to last position
        if (state.lastNodeBeforeCinema && state.graph.has(state.lastNodeBeforeCinema)) {
            const returnNode = state.graph.get(state.lastNodeBeforeCinema);
            state.targetNodeId = state.lastNodeBeforeCinema;
            state.targetPosition = returnNode.position.clone();
            
            const dx = state.targetPosition.x - state.controlledPosition.x;
            const dz = state.targetPosition.z - state.controlledPosition.z;
            state.targetRotation = Math.atan2(dx, dz);
        }
        
        state.phase = 'turning';
        
        // Switch to walking
        if (manager && instance.currentState !== YBotStates.WALKING) {
            manager.transitionToState(instance, YBotStates.WALKING);
        }
        
        console.log(`[${state.displayName}] Resuming normal wandering`);
    }
}

/**
 * Create the commentary display - now uses SplatDialogBox
 * The old HTML overlay is no longer used.
 */
function createCommentaryDisplay() {
    // SplatDialogBox is initialized in main.js and created on-demand
    // No need to create anything here anymore
    console.log('[Y-Bot] Commentary display ready (using SplatDialogBox)');
}

/**
 * Remove the commentary display
 */
function removeCommentaryDisplay() {
    // SplatDialogBox handles its own cleanup via hideSplatCommentary
    hideSplatCommentary();
}

/**
 * Show Y-Bot's commentary using SplatDialogBox (works in both VR and non-VR)
 * @param {string} text - Commentary text
 * @param {THREE.Vector3} screenPosition - Screen position for dialog positioning
 * @param {THREE.Quaternion} screenRotation - Screen rotation for dialog orientation
 * @param {Object} panelConfig - Panel config {width, height, offsetY, offsetZ}
 */
function showCommentary(text, screenPosition = null, screenRotation = null, panelConfig = null, instance = null) {
    // Store comment in stateData for sync to viewers
    if (instance?.stateData) {
        instance.stateData.lastComment = text;
        instance.stateData.lastCommentTime = Date.now();
        // Also store positioning info for sync
        instance.stateData.screenPosition = screenPosition;
        instance.stateData.screenRotation = screenRotation;
        instance.stateData.panelConfig = panelConfig;
    }
    
    // Always use SplatDialogBox for 3D commentary display
    showSplatCommentary(text, CHARACTER_NAME, screenPosition, screenRotation, panelConfig);
}

/**
 * Start the random commentary timer
 */
function startCommentaryTimer(instance, worldUrl) {
    stopCommentaryTimer();
    
    const state = instance?.stateData;
    if (!state) return;
    
    // Only start timer if in watching phase
    if (state.phase !== 'watching') {
        console.log(`[${state.displayName}] startCommentaryTimer called but phase=${state.phase}, aborting`);
        return;
    }
    
    // Check if commentary is enabled
    if (!state.commentaryEnabled) {
        console.log(`[${state.displayName}] Commentary disabled in config`);
        return;
    }
    
    // Skip commentary for screen displays (only movies get AI commentary)
    const displayType = getFoundryDisplayType(worldUrl);
    if (displayType === "screen") {
        console.log(`[${state.displayName}] Commentary disabled for screen display type`);
        return;
    }
    
    const intervalMin = state.commentIntervalMin || CINEMA_DEFAULTS.commentIntervalMin;
    const intervalMax = state.commentIntervalMax || CINEMA_DEFAULTS.commentIntervalMax;
    
    console.log(`[${state.displayName}] Commentary enabled, interval: ${intervalMin/1000}s - ${intervalMax/1000}s`);
    
    const scheduleNextComment = () => {
        const delay = intervalMin + Math.random() * (intervalMax - intervalMin);
        
        commentaryTimer = setTimeout(async () => {
            if (!isInCinemaMode) return;
            
            await generateCommentary(instance, worldUrl);
            
            // Schedule next comment
            if (isInCinemaMode) {
                scheduleNextComment();
            }
        }, delay);
    };
    
    // Start with first comment after a shorter delay
    commentaryTimer = setTimeout(async () => {
        if (!isInCinemaMode) return;
        await generateCommentary(instance, worldUrl);
        if (isInCinemaMode) {
            scheduleNextComment();
        }
    }, 10000); // First comment after 10 seconds
}

/**
 * Stop the commentary timer
 */
function stopCommentaryTimer() {
    if (commentaryTimer) {
        clearTimeout(commentaryTimer);
        commentaryTimer = null;
    }
}

/**
 * Generate a commentary based on the current frame
 * Uses vision AI to analyze the frame and generate contextual commentary
 */
async function generateCommentary(instance, worldUrl) {
    const state = instance?.stateData;
    if (!state || !isInCinemaMode) return;
    
    // Only comment when actually watching (laying down at cinema spot)
    if (state.phase !== 'watching') {
        console.log(`[${state.displayName}] Not in watching phase (phase=${state.phase}), skipping commentary`);
        return;
    }
    
    // Don't comment when movie is not connected or paused
    if (!isFoundryConnected(worldUrl)) {
        console.log(`[${state.displayName}] Movie not connected, skipping commentary`);
        return;
    }
    if (isFoundryDisplayPaused(worldUrl)) {
        console.log(`[${state.displayName}] Movie paused, skipping commentary`);
        return;
    }
    
    console.log(`[${state.displayName}] Capturing frame for commentary...`);
    
    // Get screen position and rotation for VR positioning
    const screenPosition = state.screenPosition;
    const screenRotation = state.screenRotation;
    const panelConfig = state.displayConfig?.vrCommentaryPanel || null;
    console.log(`[${state.displayName}] VR panel config for commentary:`, panelConfig);
    
    // Capture current frame as base64 data URL
    const frameDataUrl = captureFoundryFrame(worldUrl);
    
    if (!frameDataUrl) {
        console.log(`[${state.displayName}] No frame available for commentary`);
        // Show a generic comment instead
        const genericComments = [
            "This is a good part!",
            "Ooh, I love this scene.",
            "What do you think is going to happen next?",
            "The cinematography here is beautiful.",
            "I've seen this before, but it's still great.",
        ];
        const comment = genericComments[Math.floor(Math.random() * genericComments.length)];
        showCommentary(comment, screenPosition, screenRotation, panelConfig, instance);
        return;
    }
    
    try {
        // Get AI commentary based on the frame using vision model
        const movieTitle = state.movieConfig?.title || null;
        console.log(`[${state.displayName}] Requesting AI commentary for movie: "${movieTitle || 'Unknown'}"`);
        
        const comment = await getVisionCommentary({
            characterName: state.displayName,
            imageDataUrl: frameDataUrl,
            slug: state.commentarySlug || CINEMA_DEFAULTS.commentarySlug,
            movieTitle: movieTitle,
            botPrompt: state.botPrompt,
        });
        
        showCommentary(comment, screenPosition, screenRotation, panelConfig, instance);
        console.log(`[${state.displayName}] Commentary: "${comment}"`);
        
    } catch (error) {
        console.error(`[${state.displayName}] Commentary error:`, error);
        // Fallback to generic comment on error
        showCommentary("Hmm, interesting...", screenPosition, screenRotation, panelConfig, instance);
    }
}

/**
 * Start chat engagement with the player
 * Extracted from onProximityEnter so it can be triggered by the chat toggle
 */
function startChatEngagement(instance, manager, playerPosition, name, state) {
    if (!state) return;
    
    // Already engaged
    if (state.inChat) return;
    
    state.hasGreeted = true;
    
    // Face the player
    if (instance.model && playerPosition) {
        const charPos = instance.model.position;
        const dx = playerPosition.x - charPos.x;
        const dz = playerPosition.z - charPos.z;
        state.currentRotation = Math.atan2(dx, dz);
        instance.model.rotation.set(0, state.currentRotation, 0);
    }
    
    // Switch to idle animation
    if (manager && instance.currentState !== YBotStates.IDLE) {
        manager.transitionToState(instance, YBotStates.IDLE);
    }
    
    // Play greeting sound
    if (manager) {
        manager.playSound(instance, 'heyThere');
    }
    
    console.log(`[${name}] Starting chat engagement!`);
    
    // Stop player movement (so they don't drift past)
    stopPlayerMovement();
    
    // Enter chatting phase
    state.phase = 'chatting';
    state.inChat = true;
    
    // Clear conversation history for new conversation
    conversationHistory = [];
    
    // Add Y-Bot's greeting to history
    const greeting = "Hey there! Nice to see you!";
    conversationHistory.push({
        role: 'character',
        content: greeting
    });
    
    // Message handler (shared between desktop and VR)
    const handleUserMessage = async (userMessage) => {
        console.log(`[${name}] User said: ${userMessage}`);
        
        // Add to history
        conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        
        // Start streaming response
        if (isInVRMode) {
            startVRChatStreaming();
        } else {
            startStreamingMessage();
        }
        
        // Get AI response
        await getChatResponse({
            characterName: name,
            userMessage,
            conversationHistory,
            slug: CHAT.promptSlug,
            onToken: (token) => {
                if (isInVRMode) {
                    appendVRChatStreaming(token);
                } else {
                    appendToStreamingMessage(token);
                }
            },
            onComplete: (fullResponse) => {
                if (isInVRMode) {
                    endVRChatStreaming();
                } else {
                    endStreamingMessage();
                }
                // Add to history
                conversationHistory.push({
                    role: 'character',
                    content: fullResponse
                });
                console.log(`[${name}] Response: ${fullResponse}`);
            },
            onError: (error) => {
                console.error(`[${name}] Chat error:`, error);
                if (isInVRMode) {
                    endVRChatStreaming();
                } else {
                    endStreamingMessage();
                }
            }
        });
    };
    
    // Exit handler (shared between desktop and VR)
    const handleChatExit = () => {
        console.log(`[${name}] Chat ended`);
        state.phase = 'turning';
        state.inChat = false;
        
        // Re-target current destination
        const targetNode = state.graph.get(state.targetNodeId);
        if (targetNode) {
            const dx = targetNode.position.x - state.controlledPosition.x;
            const dz = targetNode.position.z - state.controlledPosition.z;
            state.targetRotation = Math.atan2(dx, dz);
        }
    };
    
    if (isInVRMode) {
        // VR mode: use VR keyboard and floating chat panel
        const charPos = instance.model.position.clone();
        startVRChat(
            name,
            charPos,
            handleUserMessage,
            handleChatExit,
            greeting
        );
    } else {
        // Desktop mode: use 2D chat UI at bottom of screen
        showChat(name, handleUserMessage, handleChatExit);
        addMessage(greeting, 'character');
    }
}

/**
 * Y-Bot Character Definition
 */
export const YBotCharacter = {
    id: "ybot",
    name: CHARACTER_NAME,
    
    // Available animations
    // Paths are relative to public/ root
    animations: {
        walking: { 
            file: "/characters/ybot/ybot-walking.fbx",
            loop: true,
            timeScale: 0.6,  // Slow down walking to match movement speed
        },
        idle: {
            file: "/characters/ybot/ybot-idle.fbx",
            loop: true,
        },
        // TODO: Replace with actual sitting animation
        sitting: {
            file: "/characters/ybot/ybot-idle.fbx",  // Placeholder - use idle for now
            loop: true,
        },
        laying: {
            file: "/characters/ybot/ybot-laying.fbx",
            loop: true,
        },
    },
    
    // Audio
    sounds: {
        heyThere: {
            file: "/characters/ybot/yes.mp3",
            refDistance: 5,
            rolloffFactor: 1,
            maxDistance: 50,
            volume: 1.0,
            loop: false,
            positional: false,  // Set to true if spatial audio works well
        },
    },
    
    // Default settings
    defaultState: YBotStates.WALKING,
    defaultScale: 0.01,
    proximityDistance: 3.0,  // How close player needs to be to trigger greeting (default is 5.0)
    
    /**
     * State machine definition
     */
    states: {
        [YBotStates.WALKING]: {
            animation: 'walking',
            transitions: [],
        },
        [YBotStates.IDLE]: {
            animation: 'idle',
            transitions: [],
        },
        [YBotStates.SITTING]: {
            animation: 'sitting',
            transitions: [],
        },
        [YBotStates.LAYING]: {
            animation: 'laying',
            transitions: [],
        },
    },
    
    /**
     * Called when character is first spawned
     */
    onSpawn: (instance, manager) => {
        const model = instance.model;
        if (!model) return;
        
        // Get display name for logging
        const displayName = instance.instanceData?.name || CHARACTER_NAME;
        
        // Check for waypointGraph (DAG format) or fall back to waypoints (linear)
        const waypointGraphData = instance.instanceData?.waypointGraph;
        let graph = null;
        let currentNodeId = null;
        let targetNodeId = null;
        
        if (waypointGraphData && waypointGraphData.length > 0) {
            // Use graph-based waypoints
            graph = buildWaypointGraph(waypointGraphData);
            currentNodeId = waypointGraphData[0].id; // Start at first node
            
            // Pick initial target (first edge of starting node)
            const startNode = graph.get(currentNodeId);
            if (startNode && startNode.edges.length > 0) {
                targetNodeId = startNode.edges[0];
            } else {
                targetNodeId = currentNodeId;
            }
            
            console.log(`[${displayName}] Using waypoint graph with ${graph.size} nodes`);
        } else {
            // No waypointGraph defined - create a simple square patrol around spawn point
            const spawnPos = model.position.clone();
            const patrolRadius = 2; // 2 unit square around spawn
            
            // Create a simple square patrol path relative to spawn position
            graph = new Map();
            graph.set('wp0', {
                id: 'wp0',
                position: new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z),
                edges: ['wp1'],
            });
            graph.set('wp1', {
                id: 'wp1',
                position: new THREE.Vector3(spawnPos.x + patrolRadius, spawnPos.y, spawnPos.z),
                edges: ['wp2'],
            });
            graph.set('wp2', {
                id: 'wp2',
                position: new THREE.Vector3(spawnPos.x + patrolRadius, spawnPos.y, spawnPos.z + patrolRadius),
                edges: ['wp3'],
            });
            graph.set('wp3', {
                id: 'wp3',
                position: new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z + patrolRadius),
                edges: ['wp0'],
            });
            
            currentNodeId = 'wp0';
            targetNodeId = 'wp1';
            
            console.log(`[${displayName}] No waypointGraph - using default patrol around spawn (${patrolRadius}m radius)`);
        }
        
        // Get target position
        const targetNode = graph.get(targetNodeId);
        const targetPosition = targetNode ? targetNode.position.clone() : model.position.clone();
        
        // Find cinema spot (node with isCinemaSpot: true)
        let cinemaSpotId = null;
        if (waypointGraphData) {
            const cinemaNode = waypointGraphData.find(n => n.isCinemaSpot);
            if (cinemaNode) {
                cinemaSpotId = cinemaNode.id;
                console.log(`[${displayName}] Found cinema spot: "${cinemaSpotId}"`);
            }
        }
        
        // Get cinema commentary config from instance data
        const commentaryConfig = instance.instanceData?.commentary || {};
        const commentarySlug = instance.instanceData?.cinemaCommentarySlug || CINEMA_DEFAULTS.commentarySlug;
        
        instance.stateData = {
            displayName,
            // Waypoint graph
            graph,
            currentNodeId,        // Node we're currently at (or just left)
            targetNodeId,         // Node we're walking toward
            previousNodeId: null, // Node we came from (to avoid backtracking)
            targetPosition,       // Vector3 position we're walking to
            // Movement
            currentRotation: model.rotation.y,
            targetRotation: model.rotation.y,
            controlledPosition: model.position.clone(),
            // State
            phase: 'turning', // 'walking', 'turning', 'waiting', 'greeting', 'chatting', 'watching'
            waitEndTime: 0,
            // Greeting
            hasGreeted: false,
            greetingEndTime: 0,
            // Chat
            inChat: false,
            // Cinema mode
            cinemaSpotId,          // Waypoint to go to when watching movies
            inCinemaMode: false,   // Currently in cinema watching mode
            commentarySlug,        // BrainTrust slug for commentary
            lastNodeBeforeCinema: null,  // Remember where we were
            cinemaPath: [],        // Planned path to cinema spot (sequence of node ids)
            commentaryStarted: false, // Ensures commentary starts only when laying down
            // Commentary config
            commentaryEnabled: commentaryConfig.enabled ?? CINEMA_DEFAULTS.commentaryEnabled,
            commentIntervalMin: (commentaryConfig.intervalMinSec ?? 30) * 1000,  // Convert to ms
            commentIntervalMax: (commentaryConfig.intervalMaxSec ?? 90) * 1000,  // Convert to ms
            botPrompt: commentaryConfig.botPrompt || null,
        };
        
        // Calculate initial rotation to face target
        if (targetNode) {
            const dx = targetPosition.x - model.position.x;
            const dz = targetPosition.z - model.position.z;
            instance.stateData.targetRotation = Math.atan2(dx, dz);
            instance.stateData.currentRotation = instance.stateData.targetRotation;
            model.rotation.set(0, instance.stateData.currentRotation, 0);
        }
        
        // Initialize chat systems
        initChatUI();
        initChatProvider().then(() => {
            console.log(`[${displayName}] Chat provider ready`);
        });
        
        // Store reference for cinema mode callbacks
        activeYBotInstance = instance;
        activeYBotManager = manager;
        
        // Register for cinema mode changes
        onCinemaModeChange((isActive, worldUrl) => {
            handleCinemaModeChange(instance, manager, isActive, worldUrl);
        });
        
        console.log(`[${displayName}] Starting at node "${currentNodeId}", heading to "${targetNodeId}"`);
    },
    
    /**
     * Called every frame
     */
    onUpdate: (instance, deltaTime, context) => {
        const model = instance.model;
        const state = instance.stateData;
        const manager = context.manager;
        
        if (!model || !state || !state.graph) return;
        
        // ===== CHATTING PHASE (in conversation with player) =====
        if (state.phase === 'chatting') {
            // Stay idle while chatting - don't do anything else
            return;
        }
        
        // ===== WATCHING PHASE (cinema mode - sitting and watching) =====
        if (state.phase === 'watching') {
            // Stay sitting while watching - commentary is handled by timer
            return;
        }
        
        // ===== GREETING PHASE (player approached) =====
        if (state.phase === 'greeting') {
            if (performance.now() >= state.greetingEndTime) {
                // Done greeting, resume walking
                state.phase = 'turning';
                
                // Switch to walking animation
                if (manager && instance.currentState !== YBotStates.WALKING) {
                    manager.transitionToState(instance, YBotStates.WALKING);
                }
            }
            return;
        }
        
        // ===== WAITING PHASE (idle animation at waypoint) =====
        if (state.phase === 'waiting') {
            if (performance.now() >= state.waitEndTime) {
                // Pick next destination (avoid backtracking and bed unless in cinema mode)
                const nextNodeId = pickNextNode(state.graph, state.currentNodeId, state.previousNodeId, state.cinemaSpotId, state.inCinemaMode);
                const nextNode = state.graph.get(nextNodeId);
                
                if (nextNode) {
                    state.previousNodeId = state.currentNodeId;
                    state.targetNodeId = nextNodeId;
                    state.targetPosition = nextNode.position.clone();
                    
                    // Calculate rotation to face next waypoint
                    const dx = state.targetPosition.x - state.controlledPosition.x;
                    const dz = state.targetPosition.z - state.controlledPosition.z;
                    state.targetRotation = Math.atan2(dx, dz);
                    
                    console.log(`[${state.displayName}] Moving from "${state.currentNodeId}" to "${nextNodeId}"`);
                }
                
                state.phase = 'turning';
                
                // Switch to walking animation
                if (manager && instance.currentState !== YBotStates.WALKING) {
                    manager.transitionToState(instance, YBotStates.WALKING);
                }
            }
            return;
        }
        
        // ===== TURNING PHASE (rotating to face target) =====
        if (state.phase === 'turning') {
            // Calculate shortest rotation direction
            let rotationDiff = state.targetRotation - state.currentRotation;
            
            // Normalize to [-PI, PI]
            while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
            while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
            
            const turnAmount = MOVEMENT.turnSpeed * deltaTime;
            
            if (Math.abs(rotationDiff) < turnAmount) {
                // Finished turning
                state.currentRotation = state.targetRotation;
                state.phase = 'walking';
            } else {
                // Keep turning
                state.currentRotation += Math.sign(rotationDiff) * turnAmount;
            }
            
            model.rotation.set(0, state.currentRotation, 0);
            return;
        }
        
        // ===== WALKING PHASE =====
        
        // Calculate direction to target waypoint
        targetDir.set(
            state.targetPosition.x - state.controlledPosition.x,
            0,
            state.targetPosition.z - state.controlledPosition.z
        );
        const distanceToTarget = targetDir.length();
        
        // SAFETY CHECK: Detect if we're walking away from target or walked too far
        // Track initial distance when we start walking to a target
        if (state.initialDistanceToTarget === undefined || state.targetNodeId !== state.lastTrackedTarget) {
            state.initialDistanceToTarget = distanceToTarget;
            state.lastTrackedTarget = state.targetNodeId;
            state.totalWalkedDistance = 0;
        }
        
        // If we've walked more than 50% past the initial distance, something is wrong
        // OR if total walked distance exceeds safety limit
        state.totalWalkedDistance = (state.totalWalkedDistance || 0) + MOVEMENT.speed * deltaTime;
        const walkingAway = distanceToTarget > state.initialDistanceToTarget * 1.5;
        const walkedTooFar = state.totalWalkedDistance > MOVEMENT.maxWalkDistance;
        
        if ((walkingAway || walkedTooFar) && distanceToTarget > MOVEMENT.arrivalDistance * 2) {
            console.warn(`[${state.displayName}] SAFETY: Walking in wrong direction! dist=${distanceToTarget.toFixed(2)}, initial=${state.initialDistanceToTarget?.toFixed(2)}, walked=${state.totalWalkedDistance?.toFixed(2)}`);
            console.warn(`[${state.displayName}] Recalculating rotation toward target "${state.targetNodeId}"`);
            
            // Recalculate rotation to actually face the target
            const dx = state.targetPosition.x - state.controlledPosition.x;
            const dz = state.targetPosition.z - state.controlledPosition.z;
            state.targetRotation = Math.atan2(dx, dz);
            state.currentRotation = state.targetRotation; // Snap rotation immediately
            model.rotation.set(0, state.currentRotation, 0);
            
            // Reset tracking
            state.initialDistanceToTarget = distanceToTarget;
            state.totalWalkedDistance = 0;
            
            // Go back to turning phase to properly align
            state.phase = 'turning';
            return;
        }
        
        // Check if arrived at waypoint
        if (distanceToTarget < MOVEMENT.arrivalDistance) {
            // Update current node
            state.currentNodeId = state.targetNodeId;
            
            // Reset walking safety tracking
            state.initialDistanceToTarget = undefined;
            state.totalWalkedDistance = 0;
            
            // Check if we arrived at cinema spot during cinema mode
            if (state.inCinemaMode && state.currentNodeId === state.cinemaSpotId) {
                // Arrived at cinema spot - lay down and watch
                state.phase = 'watching';
                
                // Snap to the waypoint's exact position (especially Y for bed height)
                const cinemaNode = state.graph.get(state.cinemaSpotId);
                if (cinemaNode) {
                    state.controlledPosition.copy(cinemaNode.position);
                    model.position.copy(cinemaNode.position);
                }
                
                // Rotate to face the screen
                if (state.screenPosition) {
                    const dx = state.screenPosition.x - state.controlledPosition.x;
                    const dz = state.screenPosition.z - state.controlledPosition.z;
                    state.currentRotation = Math.atan2(dx, dz);
                    model.rotation.set(0, state.currentRotation, 0);
                    console.log(`[${state.displayName}] Rotating to face screen`);
                }
                
                // Switch to laying animation
                if (manager && instance.currentState !== YBotStates.LAYING) {
                    manager.transitionToState(instance, YBotStates.LAYING);
                }
                
                maybeStartCommentary(instance, context.worldUrl);
                console.log(`[${state.displayName}] Arrived at cinema spot - laying down to watch`);
                return;
            }
            
            // Decide: pause or continue?
            // In cinema mode, never pause so we reach the cinema spot quickly
            const shouldPause = state.inCinemaMode ? false : (Math.random() < MOVEMENT.idleChance);
            
            if (shouldPause) {
                // Random pause
                state.phase = 'waiting';
                const waitTime = MOVEMENT.idleTimeMin + Math.random() * (MOVEMENT.idleTimeMax - MOVEMENT.idleTimeMin);
                state.waitEndTime = performance.now() + waitTime * 1000;
                
                // Switch to idle animation
                if (manager && instance.currentState !== YBotStates.IDLE) {
                    manager.transitionToState(instance, YBotStates.IDLE);
                }
                
                console.log(`[${state.displayName}] Pausing at "${state.currentNodeId}" for ${waitTime.toFixed(1)}s`);
            } else {
                // Continue immediately - pick next destination
                let nextNodeId = null;
                
                // If in cinema mode and path is empty, recompute a shortest path from current position
                if (state.inCinemaMode && state.currentNodeId !== state.cinemaSpotId) {
                    if (!state.cinemaPath || state.cinemaPath.length === 0) {
                        const path = findShortestPath(state.graph, state.currentNodeId, state.cinemaSpotId);
                        if (path && path.length > 1) {
                            state.cinemaPath = path.slice(1);
                            console.log(`[${state.displayName}] Recomputed cinema path -> dest: "${state.cinemaSpotId}", path: ${JSON.stringify(path)}`);
                        } else {
                            console.log(`[${state.displayName}] Recompute failed: no path from "${state.currentNodeId}" to "${state.cinemaSpotId}"`);
                        }
                    }
                }
                
                // If we have a planned cinema path, follow it
                if (state.inCinemaMode && state.cinemaPath && state.cinemaPath.length > 0) {
                    nextNodeId = state.cinemaPath.shift();
                }
                
                // Otherwise pick next node (will bias toward cinema spot in cinema mode)
                if (!nextNodeId) {
                    nextNodeId = pickNextNode(state.graph, state.currentNodeId, state.previousNodeId, state.cinemaSpotId, state.inCinemaMode);
                }
                let nextNode = state.graph.get(nextNodeId);
                
                // Fallback if invalid
                if (!nextNode) {
                    nextNodeId = pickNextNode(state.graph, state.currentNodeId, state.previousNodeId, state.cinemaSpotId, state.inCinemaMode);
                    nextNode = state.graph.get(nextNodeId);
                }
                
                if (nextNode) {
                    state.previousNodeId = state.currentNodeId;
                    state.targetNodeId = nextNodeId;
                    state.targetPosition = nextNode.position.clone();
                    
                    // Calculate rotation to face next waypoint
                    const dx = state.targetPosition.x - state.controlledPosition.x;
                    const dz = state.targetPosition.z - state.controlledPosition.z;
                    state.targetRotation = Math.atan2(dx, dz);
                    
                    console.log(`[${state.displayName}] Continuing from "${state.currentNodeId}" to "${nextNodeId}"`);
                }
                
                state.phase = 'turning';
            }
            return;
        }
        
        // Move towards waypoint
        forwardDir.set(Math.sin(state.currentRotation), 0, Math.cos(state.currentRotation));
        const moveDistance = MOVEMENT.speed * deltaTime;
        state.controlledPosition.addScaledVector(forwardDir, moveDistance);
        
        // Apply position (override animation root motion)
        model.position.copy(state.controlledPosition);
        model.rotation.set(0, state.currentRotation, 0);
    },
    
    /**
     * Called when player enters proximity
     */
    onProximityEnter: (instance, manager, playerPosition) => {
        const name = instance.instanceData?.name || instance.definition.name;
        const state = instance.stateData;
        
        console.log(`Player approached ${name}`);
        
        // Don't interrupt cinema mode with chat
        if (state?.inCinemaMode) {
            console.log(`[${name}] In cinema mode - skipping chat toggle`);
            return;
        }
        
        // Skip chat engagement entirely in VR mode
        if (isInVRMode) {
            console.log(`[${name}] In VR mode - skipping chat engagement`);
            return;
        }
        
        // Desktop mode: Show chat toggle button instead of auto-engaging
        if (state && !state.chatToggleShown) {
            state.chatToggleShown = true;
            
            // Store reference for when toggle is clicked
            state.pendingPlayerPosition = playerPosition?.clone?.() || playerPosition;
            
            // Show the toggle button
            showChatToggle(name, () => {
                // Toggle clicked - start the chat engagement
                startChatEngagement(instance, manager, state.pendingPlayerPosition, name, state);
            });
            
            console.log(`[${name}] Showing chat toggle for player`);
        }
    },
    
    /**
     * Called when player exits proximity
     */
    onProximityExit: (instance, manager, playerPosition) => {
        const name = instance.instanceData?.name || instance.definition.name;
        const state = instance.stateData;
        
        console.log(`Player left ${name}`);
        
        // Hide chat toggle if shown
        if (isChatToggleVisible()) {
            hideChatToggle();
        }
        
        // Close chat if open
        if (state && state.inChat) {
            // Close both VR and desktop chat
            if (isInVRMode) {
                endVRChat();
            } else {
                hideChat();
            }
            
            state.inChat = false;
            state.phase = 'turning';
            
            // Re-target current destination
            const targetNode = state.graph.get(state.targetNodeId);
            if (targetNode) {
                const dx = targetNode.position.x - state.controlledPosition.x;
                const dz = targetNode.position.z - state.controlledPosition.z;
                state.targetRotation = Math.atan2(dx, dz);
            }
            
            // Switch to walking animation
            if (manager && instance.currentState !== YBotStates.WALKING) {
                manager.transitionToState(instance, YBotStates.WALKING);
            }
        }
        
        // Reset flags so it can show toggle/greet again next time
        if (state) {
            state.hasGreeted = false;
            state.chatToggleShown = false;
            state.pendingPlayerPosition = null;
        }
    },
};
