import { withAuth, getCorsHeaders } from "../_shared/auth.ts";
import { sanitizeInput } from "../_shared/sanitize.ts";

interface Program {
  title: string;
  address: string | null;
  description: string | null;
}

Deno.serve(withAuth(async ({ req, supabaseUrl, supabaseKey, user, corsHeaders }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { programs, date, destination } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const sanitizedDestination = sanitizeInput(destination || "New York City", "region");
    const sanitizedDate = sanitizeInput(date, "generic");
    
    // Extrair a região principal dos endereços
    const addresses = (programs as Program[])
      .map(p => p.address)
      .filter(Boolean)
      .join(", ");
    
    const programsList = (programs as Program[])
      .map((p, i) => `[${i}] ${p.title}${p.address ? ` - ${p.address}` : ""}${p.description ? `: ${p.description}` : ""}`)
      .join("\n");

    const prompt = `Você é um guia turístico experiente e apaixonado. Com base nos programas do dia abaixo, crie conteúdo para um guia de viagem em PDF.

DESTINO: ${sanitizedDestination}
DATA: ${sanitizedDate}
ENDEREÇOS DOS PROGRAMAS: ${addresses}

PROGRAMAS DO DIA (índice entre colchetes começa em 0):
${programsList}

Responda APENAS com um JSON válido no seguinte formato:
{
  "region_intro": {
    "region_name": "Nome da região/bairro principal (ex: Brooklyn, Manhattan, Times Square)",
    "intro_text": "Um parágrafo de 3-4 frases apresentando a região, sua história e atmosfera. Seja envolvente e informativo."
  },
  "locations": [
    {
      "program_index": 0,
      "guide_text": "Um parágrafo de 4-6 frases sobre este local específico. Inclua: história breve, curiosidades interessantes, o que torna especial, dicas de um guia local. Seja como um guia turístico contando sobre o lugar."
    }
  ]
}

IMPORTANTE:
- O array "locations" DEVE conter exatamente ${(programs as Program[]).length} objetos, um para cada programa
- program_index DEVE corresponder EXATAMENTE ao número entre colchetes de cada programa (0, 1, 2, ...)
- O primeiro programa tem program_index: 0, o segundo program_index: 1, etc.
- region_name deve ser o bairro/região onde estão concentrados os programas
- intro_text deve contextualizar o visitante sobre a área
- Para cada programa, crie um guide_text único e informativo
- Use linguagem envolvente de guia turístico
- Inclua fatos curiosos e dicas práticas
- Escreva em português brasileiro`;

    console.log("Generating PDF content for", programs.length, "programs in", sanitizedDestination);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";
    
    // Limpar markdown se presente
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let pdfContent;
    try {
      pdfContent = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Fallback com conteúdo básico
      pdfContent = {
        region_intro: {
          region_name: sanitizedDestination,
          intro_text: `Bem-vindo a ${sanitizedDestination}! Este roteiro foi preparado especialmente para você aproveitar ao máximo sua visita.`
        },
        locations: (programs as Program[]).map((_, i) => ({
          program_index: i,
          guide_text: "Local especialmente selecionado para seu roteiro."
        }))
      };
    }

    console.log("PDF content generated successfully");

    return new Response(JSON.stringify(pdfContent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error generating PDF content:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
