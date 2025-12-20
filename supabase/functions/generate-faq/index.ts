import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { withAuth } from "../_shared/auth.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { sanitizeInput } from "../_shared/sanitize.ts";

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
    const suggestions = sanitizeInput(rawBody.suggestions, 'suggestions');
    const programDate = sanitizeInput(rawBody.programDate, 'generic');

    // Build travel context
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey,
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
    
    const contextualPrompt = buildContextualPrompt(travelContext, specificContext);

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
    
    let faq;
    try {
      faq = JSON.parse(faqText);
    } catch (parseError) {
      console.error("Error parsing FAQ JSON:", parseError);
      faq = [];
    }

    console.log("FAQ generated successfully");

    return new Response(JSON.stringify({ faq }), {
      headers: jsonHeaders,
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
}));
