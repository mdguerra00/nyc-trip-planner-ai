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
    const { program, userId } = await req.json();
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
        program.date
      );
      
      const specificContext = `
O usuário planejou a seguinte atividade:

ATIVIDADE: ${program.title}
LOCAL: ${program.address || "Não especificado"}
DATA: ${program.date}
HORÁRIO: ${program.start_time || "Não especificado"} até ${program.end_time || "Não especificado"}
${program.description ? `DESCRIÇÃO: ${program.description}` : ""}
${program.notes ? `NOTAS: ${program.notes}` : ""}

Forneça informações úteis e práticas sobre este local e seus arredores, incluindo:

📍 **Sobre o Local**:
- Contexto e história interessante
- Características únicas
- Como chegar (transporte recomendado considerando hotel se disponível)

🎯 **Arredores** (raio de 10-15 minutos):
- 3-4 pontos de interesse próximos alinhados com preferências
- Parques, monumentos ou locais fotogênicos

🍽️ **Onde Comer**:
- Restaurantes recomendados que atendam às restrições alimentares (máximo 3)
- Mencione explicitamente se atendem às restrições: ${travelContext.profile?.dietary_restrictions?.join(", ") || "nenhuma restrição"}

💡 **Dicas Práticas**:
- Tempo de visita recomendado
- Melhor horário considerando a estação
- O que vestir/levar considerando o clima
- Cuidados importantes

Seja específico, factual e considere TODO o perfil do viajante. Organize com markdown.
`;
      
      contextualPrompt = buildContextualPrompt(travelContext, specificContext);
    } else {
      // Fallback if no userId
      contextualPrompt = `Você é um guia turístico especializado em Nova York. Forneça informações sobre:

${program.title} - ${program.address || ""}
Data: ${program.date}

Seja factual e verificável.`;
    }

    console.log("Generating suggestions for:", program.title);

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
    const suggestions = data.choices[0].message.content;

    console.log("AI response received successfully");

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in ai-suggestions function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
