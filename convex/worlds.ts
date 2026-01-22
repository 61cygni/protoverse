import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')      // Trim leading/trailing hyphens
    .substring(0, 50);            // Limit length
}

/**
 * Generate a default description from name
 */
function generateDescription(name: string): string {
  return `A Protoverse world: ${name}`;
}

// ========== Queries ==========

/**
 * List all registered worlds
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const worlds = await ctx.db.query("worlds").collect();
    return worlds.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get a world by slug
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * Get a world by ID
 */
export const get = query({
  args: { id: v.id("worlds") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get a world with its services
 */
export const getWithServices = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (!world) return null;
    
    const services = await ctx.db
      .query("worldServices")
      .withIndex("by_world", (q) => q.eq("worldId", world._id))
      .collect();
    
    return { ...world, services };
  },
});

// ========== Mutations ==========

/**
 * Register a new world
 */
export const register = mutation({
  args: {
    name: v.string(),
    url: v.string(),
    rootWorld: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    cdnUrl: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Generate slug if not provided
    const slug = args.slug || generateSlug(args.name);
    
    // Check for duplicate slug
    const existing = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    
    if (existing) {
      throw new Error(`World with slug "${slug}" already exists`);
    }
    
    // Generate description if not provided
    const description = args.description || generateDescription(args.name);
    
    const worldId = await ctx.db.insert("worlds", {
      name: args.name,
      slug,
      description,
      url: args.url,
      rootWorld: args.rootWorld,
      cdnUrl: args.cdnUrl,
      thumbnail: args.thumbnail,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    });
    
    return { worldId, slug };
  },
});

/**
 * Update an existing world
 */
export const update = mutation({
  args: {
    slug: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    rootWorld: v.optional(v.string()),
    cdnUrl: v.optional(v.string()),
    thumbnail: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (!world) {
      throw new Error(`World with slug "${args.slug}" not found`);
    }
    
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };
    
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.url !== undefined) updates.url = args.url;
    if (args.rootWorld !== undefined) updates.rootWorld = args.rootWorld;
    if (args.cdnUrl !== undefined) updates.cdnUrl = args.cdnUrl;
    if (args.thumbnail !== undefined) updates.thumbnail = args.thumbnail;
    if (args.tags !== undefined) updates.tags = args.tags;
    
    await ctx.db.patch(world._id, updates);
    
    return { success: true };
  },
});

/**
 * Remove a world (hard delete)
 */
export const remove = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const world = await ctx.db
      .query("worlds")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (!world) {
      throw new Error(`World with slug "${args.slug}" not found`);
    }
    
    // Delete associated services first
    const services = await ctx.db
      .query("worldServices")
      .withIndex("by_world", (q) => q.eq("worldId", world._id))
      .collect();
    
    for (const service of services) {
      await ctx.db.delete(service._id);
    }
    
    // Delete the world
    await ctx.db.delete(world._id);
    
    return { success: true, deletedServices: services.length };
  },
});
