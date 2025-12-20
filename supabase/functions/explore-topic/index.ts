import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { withAuth } from "../_shared/auth.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { sanitizeInput, validateAndSanitize, logSuspiciousInput } from "../_shared/sanitize.ts";

Deno.serve(withAuth(async ({ req, supabaseUrl, supabaseKey, user, corsHeaders }) => {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  
  try {
    const rawBody = await req.json();
    const userId = user.id;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("Required environment variables not configured");
    }

    // Sanitize inputs to prevent prompt injection
    const topicValidation = validateAndSanitize(rawBody.topic, 'topic');
    const topic = topicValidation.value;
    
    const attractionContext = sanitizeInput(rawBody.context, 'context');
    const programDate = sanitizeInput(rawBody.programDate, 'generic');
    
    if (topicValidation.hasSuspiciousContent) {
      logSuspiciousInput(userId, 'explore-topic', rawBody.topic, 'topic');
    }

    // Build travel context
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey,
      programDate
    );
    
    const specificContext = `
Um turista quer saber mais detalhes sobre o seguinte tópico:

TÓPICO: ${topic}

CONTEXTO DA ATRAÇÃO:
${attractionContext}

Forneça informações adicionais detalhadas e práticas sobre este tópico específico. Seja informativo mas conciso e considere o perfil do viajante.
`;
    
    const contextualPrompt = buildContextualPrompt(travelContext, specificContext);

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
      headers: jsonHeaders,
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
}));
