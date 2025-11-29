import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { region, date, userSuggestion, requestMore, userId } = await req.json();

    if (!region || !date) {
      return new Response(
        JSON.stringify({ error: 'Region and date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Searching attractions for ${region} on ${date}`, { userSuggestion, requestMore, userId });

    // Build travel context if userId is provided
    let contextualPrefix = "";
    if (userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const travelContext = await buildTravelContext(
        userId,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        date,
        region
      );
      
      const specificContext = `
O usuário está procurando atrações para ${region} em ${date}.
${userSuggestion ? `Sugestão específica do usuário: "${userSuggestion}"` : ""}
${requestMore ? "O usuário quer opções menos conhecidas e diferentes." : ""}

Use o contexto do viajante para personalizar as sugestões, considerando:
- Restrições alimentares ao sugerir restaurantes
- Interesses e preferências para selecionar atrações relevantes
- Ritmo de viagem para sugerir quantidade adequada de atividades
- Mobilidade para recomendar locais acessíveis
- Tópicos a evitar
`;
      
      contextualPrefix = buildContextualPrompt(travelContext, specificContext);
    }

    let prompt: string;

    if (userSuggestion) {
      // User-specific suggestion
      prompt = `${contextualPrefix}

⚠️⚠️⚠️ VALIDAÇÃO TEMPORAL CRÍTICA ⚠️⚠️⚠️
ATENÇÃO: Se "${userSuggestion}" for um evento pontual, ele DEVE ocorrer EXATAMENTE no dia ${date}.
Se for evento de outra data → retorne array vazio [].
Se for atração permanente → confirme que está aberta em ${date}.

Busque informações detalhadas sobre "${userSuggestion}" em Nova York, considerando a região de ${region} e a data ${date}.

⭐ INFORMAÇÕES OBRIGATÓRIAS DE VERIFICAÇÃO:
Para CADA local, você DEVE incluir dados verificáveis de fontes reais (Google Maps, Yelp, TripAdvisor, etc):

Para este local específico, forneça EXATAMENTE as seguintes informações em formato JSON:
- name: nome completo oficial
- type: tipo (atração, restaurante, evento, museu, parque, etc)
- address: endereço completo com CEP se possível
- hours: horário de funcionamento para o dia ${date}
- description: descrição detalhada (3-4 linhas)
- estimatedDuration: tempo estimado de visita em minutos
- neighborhood: bairro específico
- imageUrl: URL de uma foto representativa do local
- infoUrl: URL do site oficial ou Google Maps
- rating: avaliação média (ex: "4.5/5" ou "4.5 estrelas Google Maps") - OBRIGATÓRIO
- reviewCount: número aproximado de avaliações (ex: "1200+ avaliações") - OBRIGATÓRIO
- whyRecommended: motivo ESPECÍFICO da recomendação (ex: "Famoso pelo pastrami desde 1888", "Reconhecido pelo NY Times 2023") - OBRIGATÓRIO
- verificationUrl: link direto do Google Maps para verificar o local - OBRIGATÓRIO

⚠️ Se NÃO encontrar dados verificáveis (rating, reviews) para um local, NÃO o inclua na lista.

Retorne um array JSON válido com 1-3 resultados VERIFICÁVEIS. Apenas JSON, sem texto adicional.`;
    } else if (requestMore) {
      // Request for additional suggestions
      prompt = `${contextualPrefix}

⚠️⚠️⚠️ VALIDAÇÃO TEMPORAL OBRIGATÓRIA ⚠️⚠️⚠️
APENAS inclua eventos que acontecem EXATAMENTE em ${date}.
Atrações permanentes devem estar ABERTAS em ${date}.
REMOVA qualquer item de data incorreta.

Liste OUTRAS atrações, eventos, restaurantes e atividades turísticas em ${region}, Nova York, adequadas para o dia ${date}. 
Busque opções DIFERENTES e menos conhecidas, incluindo joias escondidas.

⭐ INFORMAÇÕES OBRIGATÓRIAS DE VERIFICAÇÃO:
Para CADA local, você DEVE incluir dados verificáveis de fontes reais (Google Maps, Yelp, TripAdvisor, etc):

Para cada item, forneça EXATAMENTE as informações em formato JSON:
- name, type, address, hours, description, estimatedDuration, neighborhood, imageUrl, infoUrl
- rating: avaliação média (ex: "4.5/5" ou "4.5 estrelas Google Maps") - OBRIGATÓRIO
- reviewCount: número aproximado de avaliações (ex: "1200+ avaliações") - OBRIGATÓRIO
- whyRecommended: motivo ESPECÍFICO da recomendação (ex: "Famoso pelo pastrami desde 1888", "Reconhecido pelo NY Times 2023") - OBRIGATÓRIO
- verificationUrl: link direto do Google Maps para verificar o local - OBRIGATÓRIO

⚠️ Se NÃO encontrar dados verificáveis (rating, reviews) para um local, NÃO o inclua na lista.

Retorne um array JSON válido com 6-10 sugestões DIFERENTES E VERIFICÁVEIS. Apenas JSON, sem texto adicional.`;
    } else {
      // Standard discovery
      prompt = `${contextualPrefix}

⚠️⚠️⚠️ VALIDAÇÃO TEMPORAL OBRIGATÓRIA ⚠️⚠️⚠️

ANTES DE LISTAR QUALQUER ITEM, VOCÊ DEVE:

1. EVENTOS PONTUAIS (shows, jogos, festivais, apresentações):
   - APENAS eventos que acontecem EXATAMENTE no dia ${date}
   - SE um evento acontece em outra data → REMOVA IMEDIATAMENTE
   - NUNCA sugira eventos passados ou futuros

2. ATRAÇÕES PERMANENTES (museus, restaurantes, parques):
   - Verificar se estão ABERTOS no dia ${date}
   - Confirmar horários de funcionamento para esta data específica
   - Se fechado → REMOVA da lista

3. VALIDAÇÃO FINAL:
   - Revise CADA item antes de retornar
   - Remova QUALQUER item que não seja válido para ${date}
   - Em caso de dúvida sobre a data → NÃO inclua o item

Liste as principais atrações, eventos, restaurantes e atividades turísticas em ou PRÓXIMAS a ${region}, Nova York, adequadas para o dia ${date}.

⭐ CRITÉRIO DE PROXIMIDADE:
- Se ${region} for um PONTO ESPECÍFICO (ex: "Columbus Circle", "Times Square", "SoHo"):
  → Priorize opções a no máximo 10-15 minutos A PÉ
  → Mencione distâncias/tempos de caminhada quando relevante
  → Agrupe por proximidade (ex: "5 min norte", "caminhável", "no local")
  → Inclua estabelecimentos, atrações e restaurantes PRÓXIMOS
- Se ${region} for REGIÃO AMPLA (ex: "Manhattan", "Brooklyn", "Midtown"):
  → Diversifique dentro da região
  → Mencione sub-bairros/áreas específicas
  → Cubra diferentes partes da região

⭐ INFORMAÇÕES OBRIGATÓRIAS DE VERIFICAÇÃO:
Para CADA local, você DEVE incluir dados verificáveis de fontes reais (Google Maps, Yelp, TripAdvisor, etc):

Para cada item, forneça EXATAMENTE as informações em formato JSON:
- name, type, address, hours, description, estimatedDuration, neighborhood, imageUrl, infoUrl
- rating: avaliação média (ex: "4.5/5" ou "4.5 estrelas Google Maps") - OBRIGATÓRIO
- reviewCount: número aproximado de avaliações (ex: "1200+ avaliações") - OBRIGATÓRIO  
- whyRecommended: motivo ESPECÍFICO da recomendação (ex: "Famoso pelo pastrami desde 1888", "Reconhecido pelo NY Times 2023") - OBRIGATÓRIO
- verificationUrl: link direto do Google Maps para verificar o local - OBRIGATÓRIO

⚠️ IMPORTANTE: Se NÃO encontrar dados verificáveis (rating, reviews) para um local, NÃO o inclua na lista.
⚠️ Priorize locais BEM ESTABELECIDOS com avaliações reais de usuários.

Retorne um array JSON válido com 8-12 sugestões variadas E VERIFICÁVEIS. Apenas JSON, sem texto adicional.`;
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a NYC tourism expert. Always respond with valid JSON arrays only. Consider user preferences and restrictions when making suggestions.'
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

    // Extract JSON from response
    let attractions;
    try {
      console.log('Raw content from Perplexity:', content.substring(0, 200));
      
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      cleanContent = cleanContent.trim();
      
      console.log('Cleaned content:', cleanContent.substring(0, 200));
      attractions = JSON.parse(cleanContent);

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
        imageUrl: attr.imageUrl || null,
        infoUrl: attr.infoUrl || null,
        rating: attr.rating || null,
        reviewCount: attr.reviewCount || null,
        whyRecommended: attr.whyRecommended || null,
        verificationUrl: attr.verificationUrl || null,
      }));

      console.log(`✅ Found ${attractions.length} attractions`);

    } catch (parseError) {
      console.error('Failed to parse Perplexity response:', parseError);
      console.error('Raw content:', content);
      
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
