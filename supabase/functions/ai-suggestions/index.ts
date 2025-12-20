import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { withAuth } from "../_shared/auth.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { sanitizeObject } from "../_shared/sanitize.ts";

Deno.serve(withAuth(async ({ req, supabaseUrl, supabaseKey, user, corsHeaders }) => {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  
  try {
    const rawBody = await req.json();
    const userId = user.id;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("Required environment variables not configured");
    }

    // Sanitize program data to prevent prompt injection
    const program = sanitizeObject(rawBody.program || {}, {
      title: 'title',
      address: 'address',
      description: 'description',
      notes: 'notes',
    });

    // Build travel context
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey,
      program.date
    );
    
    const specificContext = `
O usuário planejou a seguinte atividade:

ATIVIDADE: ${program.title || 'Não especificado'}
LOCAL: ${program.address || "Não especificado"}
DATA: ${program.date || 'Não especificada'}
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
    
    const contextualPrompt = buildContextualPrompt(travelContext, specificContext);

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
      headers: jsonHeaders,
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
}));
