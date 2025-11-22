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
    const { topic, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const prompt = `Você é um guia turístico especializado em Nova York. Um turista quer saber mais detalhes sobre o seguinte tópico:

TÓPICO: ${topic}

CONTEXTO DA ATRAÇÃO:
${context}

Forneça informações adicionais detalhadas e práticas sobre este tópico específico. Seja informativo mas conciso.

IMPORTANTE:
- Seja factual e baseado em informações verificáveis
- Não invente dados ou estatísticas
- Foque em informações práticas e úteis
- Use fontes confiáveis de informação sobre Nova York
- Seja específico e relevante ao tópico perguntado
- Mantenha o tom amigável e acessível`;

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
              role: "system",
              content:
                "Você é um guia turístico experiente e confiável especializado em Nova York. Forneça informações precisas e práticas baseadas em fatos verificáveis.",
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
