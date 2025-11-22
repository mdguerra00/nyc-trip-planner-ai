import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { program } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const prompt = `Você é um guia turístico local especializado em Nova York com conhecimento profundo sobre bairros, atrações e experiências autênticas da cidade.

Um turista planejou a seguinte atividade:
Título: ${program.title}
${program.description ? `Descrição: ${program.description}` : ""}
${program.address ? `Local: ${program.address}` : ""}
${program.start_time ? `Horário: ${program.start_time}` : ""}

FOQUE NA REGIÃO E ARREDORES desta atividade e forneça:

📍 **Sobre o Local**:
- Contexto e história interessante do lugar ou bairro
- Características únicas da região
- Melhor forma de chegar (metrô, ônibus, caminhada)

🎯 **Outras Atrações Próximas** (no raio de 10-15 minutos):
- 3-4 pontos turísticos ou atrações interessantes
- Parques, monumentos ou locais fotogênicos
- Lojas ou experiências únicas da área

🍽️ **Gastronomia Local**:
- Restaurantes típicos ou imperdíveis da região
- Cafés ou bares interessantes
- Opções de street food ou lancherias locais

💡 **Dicas Práticas**:
- Melhor horário para visitar e evitar multidões
- O que não deixar de ver/fazer no local
- Cuidados ou informações importantes

Seja específico sobre a REGIÃO e organize as informações de forma clara e prática. Mantenha o tom amigável e útil, em português brasileiro.`;

    console.log("Calling AI with prompt:", prompt);

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
              role: "system",
              content:
                "Você é um guia turístico experiente especializado em Nova York. Forneça informações úteis, práticas e interessantes.",
            },
            {
              role: "user",
              content: prompt,
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
