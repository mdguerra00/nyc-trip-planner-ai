import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

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
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  supabaseKey: string;
  user: { id: string };
};

type AuthHandler = (context: AuthHandlerContext) => Promise<Response>;

export function withAuth(handler: AuthHandler) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    try {
      const { supabase, supabaseKey, supabaseUrl } = createSupabaseClient();
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return handler({ req, supabase, supabaseKey, supabaseUrl, user: { id: data.user.id } });
    } catch (error) {
      console.error("Authentication error:", error);
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  };
}
