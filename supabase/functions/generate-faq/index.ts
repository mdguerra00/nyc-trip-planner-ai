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
    const { suggestions, userId, programDate } = await req.json();
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
Com base nas seguintes informações sobre uma atração em Nova York, crie um FAQ (Perguntas e Respostas Frequentes) com 4-6 perguntas relevantes que um turista poderia ter.

INFORMAÇÕES:
${suggestions}

Gere um JSON array com o seguinte formato:
[
  {
    "question": "Pergunta aqui?",
    "answer": "Resposta clara e objetiva aqui"
  }
]

IMPORTANTE:
- Considere o perfil do viajante ao criar as perguntas
- Inclua perguntas sobre acessibilidade se houver necessidades de mobilidade
- Inclua perguntas sobre opções de alimentação se houver restrições
- Seja factual e preciso
- Não invente informações
- Retorne APENAS o JSON, sem texto adicional
`;
      
      contextualPrompt = buildContextualPrompt(travelContext, specificContext);
    } else {
      // Fallback
      contextualPrompt = `Com base nas seguintes informações sobre uma atração em Nova York, crie um FAQ com 4-6 perguntas relevantes:

${suggestions}

Retorne apenas JSON array válido.`;
    }

    console.log("Generating FAQ from suggestions");

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
    let faqText = data.choices[0].message.content;
    
    // Remove markdown code blocks if present
    faqText = faqText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const faq = JSON.parse(faqText);

    console.log("FAQ generated successfully");

    return new Response(JSON.stringify({ faq }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-faq function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
