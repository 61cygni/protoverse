import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { invoke, invokeStream, options as aiOptions } from "./ai";

const http = httpRouter();

/**
 * POST /session/register
 * Called by WS server when host creates a session
 */
http.route({
  path: "/session/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    
    const result = await ctx.runMutation(api.sessions.register, {
      code: body.code,
      hostName: body.hostName,
      hostClientId: body.hostClientId,
      movieTitle: body.movieTitle || "Unknown Movie",
      worldUrl: body.worldUrl,
      flyApp: body.flyApp,
      wsUrl: body.wsUrl,
      foundryUrl: body.foundryUrl,
      maxViewers: body.maxViewers || 8,
    });
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * POST /session/heartbeat
 * Called periodically by WS server to keep session alive
 */
http.route({
  path: "/session/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    
    const result = await ctx.runMutation(api.sessions.heartbeat, {
      code: body.code,
      viewerCount: body.viewerCount,
      isMoviePlaying: body.isMoviePlaying,
    });
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * POST /session/end
 * Called by WS server when host disconnects
 */
http.route({
  path: "/session/end",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    
    const result = await ctx.runMutation(api.sessions.end, {
      code: body.code,
    });
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

/**
 * GET /sessions
 * Get list of active sessions (can be called from anywhere)
 */
http.route({
  path: "/sessions",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const sessions = await ctx.runQuery(api.sessions.list, {});
    
    return new Response(JSON.stringify(sessions), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

/**
 * OPTIONS /sessions - CORS preflight
 */
http.route({
  path: "/sessions",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

/**
 * OPTIONS handler for CORS preflight
 */
http.route({
  path: "/session/register",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/session/heartbeat",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/session/end",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// ========== AI Chat Proxy ==========
// Routes NPC chat through Convex to keep Braintrust API key server-side

http.route({
  path: "/ai/invoke",
  method: "POST",
  handler: invoke,
});

http.route({
  path: "/ai/invoke",
  method: "OPTIONS",
  handler: aiOptions,
});

http.route({
  path: "/ai/stream",
  method: "POST",
  handler: invokeStream,
});

http.route({
  path: "/ai/stream",
  method: "OPTIONS",
  handler: aiOptions,
});

// ========== World Registry ==========
// Public endpoints for browsing registered Protoverse worlds

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * GET /worlds
 * List all registered worlds
 */
http.route({
  path: "/worlds",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const worlds = await ctx.runQuery(api.worlds.list, {});
    
    return new Response(JSON.stringify(worlds), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
});

/**
 * POST /worlds
 * Register a new world
 */
http.route({
  path: "/worlds",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      
      const result = await ctx.runMutation(api.worlds.register, {
        name: body.name,
        url: body.url,
        rootWorld: body.rootWorld,
        slug: body.slug,
        description: body.description,
        cdnUrl: body.cdnUrl,
        thumbnail: body.thumbnail,
        tags: body.tags,
      });
      
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});

http.route({
  path: "/worlds",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

/**
 * GET /worlds/:slug
 * Get a world by slug (with services)
 */
http.route({
  path: "/worlds/by-slug",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    
    if (!slug) {
      return new Response(JSON.stringify({ error: "slug parameter required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    const world = await ctx.runQuery(api.worlds.getWithServices, { slug });
    
    if (!world) {
      return new Response(JSON.stringify({ error: "World not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    return new Response(JSON.stringify(world), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
});

http.route({
  path: "/worlds/by-slug",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

/**
 * PATCH /worlds/by-slug?slug=xxx
 * Update a world
 */
http.route({
  path: "/worlds/by-slug",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");
      
      if (!slug) {
        return new Response(JSON.stringify({ error: "slug parameter required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const body = await request.json();
      
      const result = await ctx.runMutation(api.worlds.update, {
        slug,
        name: body.name,
        description: body.description,
        url: body.url,
        rootWorld: body.rootWorld,
        cdnUrl: body.cdnUrl,
        thumbnail: body.thumbnail,
        tags: body.tags,
      });
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});

/**
 * DELETE /worlds/by-slug?slug=xxx
 * Remove a world
 */
http.route({
  path: "/worlds/by-slug",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");
      
      if (!slug) {
        return new Response(JSON.stringify({ error: "slug parameter required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const result = await ctx.runMutation(api.worlds.remove, { slug });
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});

// ========== World Services ==========

/**
 * GET /worlds/services?slug=xxx
 * List services for a world
 */
http.route({
  path: "/worlds/services",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    
    if (!slug) {
      return new Response(JSON.stringify({ error: "slug parameter required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    const services = await ctx.runQuery(api.worldServices.listByWorld, { worldSlug: slug });
    
    return new Response(JSON.stringify(services), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
});

/**
 * POST /worlds/services?slug=xxx
 * Register a service for a world
 */
http.route({
  path: "/worlds/services",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");
      
      if (!slug) {
        return new Response(JSON.stringify({ error: "slug parameter required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const body = await request.json();
      
      const result = await ctx.runMutation(api.worldServices.register, {
        worldSlug: slug,
        type: body.type,
        url: body.url,
        flyAppName: body.flyAppName,
        name: body.name,
        metadata: body.metadata,
      });
      
      return new Response(JSON.stringify(result), {
        status: 201,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});

http.route({
  path: "/worlds/services",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

/**
 * DELETE /worlds/services?slug=xxx&type=yyy&url=zzz
 * Remove a service by type and URL
 */
http.route({
  path: "/worlds/services",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const slug = url.searchParams.get("slug");
      const type = url.searchParams.get("type") as "multiplayer" | "streaming" | "ai";
      const serviceUrl = url.searchParams.get("url");
      
      if (!slug || !type || !serviceUrl) {
        return new Response(JSON.stringify({ error: "slug, type, and url parameters required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      const result = await ctx.runMutation(api.worldServices.removeByTypeAndUrl, {
        worldSlug: slug,
        type,
        url: serviceUrl,
      });
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }),
});

export default http;
