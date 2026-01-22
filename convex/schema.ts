import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ========== Theater Sessions (existing) ==========
  sessions: defineTable({
    // Session identification
    code: v.string(),           // "HYG2CQ" - the join code
    
    // Host info
    hostName: v.string(),       // "Martin"
    hostClientId: v.string(),   // Internal WS client ID
    
    // Movie info
    movieTitle: v.string(),     // "Big Trouble in Little China"
    worldUrl: v.string(),       // "/theatership/world.json"
    
    // Connection URLs
    flyApp: v.string(),         // "protoverse-bigtrouble"
    wsUrl: v.string(),          // "wss://protoverse-bigtrouble.fly.dev:8765"
    foundryUrl: v.string(),     // "wss://protoverse-bigtrouble.fly.dev/ws"
    
    // Session state
    viewerCount: v.number(),    // Current number of viewers
    maxViewers: v.number(),     // Max allowed viewers
    isMoviePlaying: v.boolean(), // Whether movie is currently playing
    
    // Timestamps
    createdAt: v.number(),      // When session was created
    lastHeartbeat: v.number(),  // Last heartbeat timestamp (for cleanup)
  })
    .index("by_code", ["code"])
    .index("by_flyApp", ["flyApp"])
    .index("by_lastHeartbeat", ["lastHeartbeat"]),

  // ========== World Registry ==========
  worlds: defineTable({
    // Identity
    name: v.string(),              // "Cozy Theatership"
    slug: v.string(),              // "cozy-theatership" (URL-safe, unique)
    description: v.optional(v.string()), // "A cozy spaceship for watching movies"
    
    // Deployment
    url: v.string(),               // "https://cozytheatership.netlify.app"
    
    // World configuration
    rootWorld: v.string(),         // "/theatership/world.json"
    cdnUrl: v.optional(v.string()), // CDN for assets (if different from main URL)
    
    // Metadata
    thumbnail: v.optional(v.string()),  // URL to preview image
    tags: v.optional(v.array(v.string())), // ["movie", "multiplayer", "social"]
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"]),

  // Associated services (Fly.io multiplayer, streaming, etc.)
  worldServices: defineTable({
    worldId: v.id("worlds"),
    
    // Service type
    type: v.union(
      v.literal("multiplayer"),    // WebSocket multiplayer server
      v.literal("streaming"),      // Foundry video streaming
      v.literal("ai")              // AI/NPC services
    ),
    
    // Connection info
    url: v.string(),               // "wss://protoverse-bigtrouble.fly.dev:8765"
    flyAppName: v.optional(v.string()),  // "protoverse-bigtrouble"
    
    // Metadata
    name: v.optional(v.string()),  // Display name for the service
    metadata: v.optional(v.any()), // Service-specific config
    
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_world", ["worldId"])
    .index("by_type", ["type"]),
});
