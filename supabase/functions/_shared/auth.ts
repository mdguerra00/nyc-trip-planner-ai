import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

// Allowed origins for CORS - restricts API access to known domains
const ALLOWED_ORIGINS = [
  "https://810e8379-52d7-40a9-8298-05975cd4fcf6.lovableproject.com",
  "https://nyc-trip-planner-ai.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

/**
 * Returns CORS headers with origin validation
 * Falls back to first allowed origin if request origin is not in whitelist
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) 
    ? requestOrigin 
    : ALLOWED_ORIGINS[0];
    
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

// Legacy export for backward compatibility - will be phased out
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  return { supabase, supabaseUrl, supabaseKey };
}

type AuthHandlerContext = {
  req: Request;
  supabase: any;
  supabaseUrl: string;
  supabaseKey: string;
  user: { id: string };
  corsHeaders: Record<string, string>;
};

type AuthHandler = (context: AuthHandlerContext) => Promise<Response>;

export function withAuth(handler: AuthHandler) {
  return async (req: Request) => {
    const origin = req.headers.get("Origin");
    const headers = getCorsHeaders(origin);
    
    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    try {
      const { supabase, supabaseKey, supabaseUrl } = createSupabaseClient();
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      return handler({ req, supabase, supabaseKey, supabaseUrl, user: { id: data.user.id }, corsHeaders: headers });
    } catch (error) {
      console.error("Authentication error:", error);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
      );
    }
  };
}
