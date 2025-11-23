import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, context: attractionContext, userId, programDate } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Required environment variables not configured");
    }

    // Build travel context if userId is provided
    let contextualPrompt = "";
    if (userId) {
      const travelContext = await buildTravelContext(
        userId,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        programDate
      );
      
      const specificContext = `
Um turista quer saber mais detalhes sobre o seguinte tópico:

TÓPICO: ${topic}

CONTEXTO DA ATRAÇÃO:
${attractionContext}

Forneça informações adicionais detalhadas e práticas sobre este tópico específico. Seja informativo mas conciso e considere o perfil do viajante.
`;
      
      contextualPrompt = buildContextualPrompt(travelContext, specificContext);
    } else {
      // Fallback
      contextualPrompt = `Você é um guia turístico especializado em Nova York. Forneça informações sobre: ${topic}

Contexto: ${attractionContext}

Seja factual e verificável.`;
    }

    console.log("Exploring topic:", topic);

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: contextualPrompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const details = data.choices[0].message.content;

    console.log("Topic exploration completed successfully");

    return new Response(JSON.stringify({ details }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in explore-topic function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
