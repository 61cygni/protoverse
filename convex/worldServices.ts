import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ========== Queries ==========

/**
 * List all services for a world
 */
export const listByWorld = query({
  args: { worldSlug: v.string() },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.worldSlug))
      .unique();
    
    if (!world) {
      return [];
    }
    
    return await ctx.db
      .query("worldServices")
      .withIndex("by_world", (q) => q.eq("worldId", world._id))
      .collect();
  },
});

/**
 * List all services of a specific type
 */
export const listByType = query({
  args: { type: v.union(v.literal("multiplayer"), v.literal("streaming"), v.literal("ai")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("worldServices")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();
  },
});

// ========== Mutations ==========

/**
 * Register a service for a world
 */
export const register = mutation({
  args: {
    worldSlug: v.string(),
    type: v.union(v.literal("multiplayer"), v.literal("streaming"), v.literal("ai")),
    url: v.string(),
    flyAppName: v.optional(v.string()),
    name: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.worldSlug))
      .unique();
    
    if (!world) {
      throw new Error(`World with slug "${args.worldSlug}" not found`);
    }
    
    // Check if service of this type already exists for this world
    const existingServices = await ctx.db
      .query("worldServices")
      .withIndex("by_world", (q) => q.eq("worldId", world._id))
      .collect();
    
    const existingOfType = existingServices.find(s => s.type === args.type && s.url === args.url);
    if (existingOfType) {
      // Update existing service instead of creating duplicate
      await ctx.db.patch(existingOfType._id, {
        flyAppName: args.flyAppName,
        name: args.name,
        metadata: args.metadata,
      });
      return { serviceId: existingOfType._id, updated: true };
    }
    
    const serviceId = await ctx.db.insert("worldServices", {
      worldId: world._id,
      type: args.type,
      url: args.url,
      flyAppName: args.flyAppName,
      name: args.name,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    
    return { serviceId, updated: false };
  },
});

/**
 * Remove a service
 */
export const remove = mutation({
  args: { 
    worldSlug: v.string(),
    serviceId: v.id("worldServices"),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.worldSlug))
      .unique();
    
    if (!world) {
      throw new Error(`World with slug "${args.worldSlug}" not found`);
    }
    
    const service = await ctx.db.get(args.serviceId);
    
    if (!service) {
      throw new Error(`Service not found`);
    }
    
    if (service.worldId !== world._id) {
      throw new Error(`Service does not belong to world "${args.worldSlug}"`);
    }
    
    await ctx.db.delete(args.serviceId);
    
    return { success: true };
  },
});

/**
 * Remove a service by type and URL
 */
export const removeByTypeAndUrl = mutation({
  args: { 
    worldSlug: v.string(),
    type: v.union(v.literal("multiplayer"), v.literal("streaming"), v.literal("ai")),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.worldSlug))
      .unique();
    
    if (!world) {
      throw new Error(`World with slug "${args.worldSlug}" not found`);
    }
    
    const services = await ctx.db
      .query("worldServices")
      .withIndex("by_world", (q) => q.eq("worldId", world._id))
      .collect();
    
    const service = services.find(s => s.type === args.type && s.url === args.url);
    
    if (!service) {
      throw new Error(`Service not found`);
    }
    
    await ctx.db.delete(service._id);
    
    return { success: true };
  },
});
