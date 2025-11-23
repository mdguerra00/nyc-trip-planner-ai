import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { region, date } = await req.json();

    if (!region || !date) {
      return new Response(
        JSON.stringify({ error: 'Region and date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Searching attractions for ${region} on ${date}`);

    const prompt = `Liste as principais atrações, eventos, restaurantes e atividades turísticas em ${region}, Nova York, adequadas para o dia ${date}.

Para cada item, forneça EXATAMENTE as seguintes informações em formato JSON:
- name: nome completo
- type: tipo (atração, restaurante, evento, museu, parque, etc)
- address: endereço completo com CEP se possível
- hours: horário de funcionamento típico
- description: breve descrição (2-3 linhas)
- estimatedDuration: tempo estimado de visita em minutos
- neighborhood: bairro específico

Retorne um array JSON válido com 8-12 sugestões variadas (mix de atrações, restaurantes, eventos). Não inclua texto adicional, apenas o JSON.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a NYC tourism expert. Always respond with valid JSON arrays only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch attractions from Perplexity' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('No content in Perplexity response');
      return new Response(
        JSON.stringify({ error: 'No content received from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JSON from response (handle markdown code blocks)
    let attractions;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
      const jsonString = jsonMatch[1].trim();
      attractions = JSON.parse(jsonString);

      if (!Array.isArray(attractions)) {
        throw new Error('Response is not an array');
      }

      // Validate and enrich data
      attractions = attractions.map((attr: any, index: number) => ({
        id: `attr-${Date.now()}-${index}`,
        name: attr.name || 'Unknown',
        type: attr.type || 'atração',
        address: attr.address || 'Endereço não especificado',
        hours: attr.hours || 'Verificar horários',
        description: attr.description || 'Sem descrição',
        estimatedDuration: attr.estimatedDuration || 60,
        neighborhood: attr.neighborhood || region,
      }));

      console.log(`✅ Found ${attractions.length} attractions`);

    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', parseError);
      console.error('Raw content:', content);
      
      // Fallback: return error but with the raw content for debugging
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse AI response', 
          rawContent: content.substring(0, 500) 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ attractions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in discover-attractions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
