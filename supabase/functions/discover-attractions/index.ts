import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { withAuth } from "../_shared/auth.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { DiscoverAttractionsRequestSchema } from "../_shared/schemas.ts";
import { sanitizeInput, validateAndSanitize, logSuspiciousInput } from "../_shared/sanitize.ts";

// Fallback: usar Lovable AI para converter texto em JSON
async function convertTextToJson(text: string, region: string, profileContext: string): Promise<any[]> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    console.error('LOVABLE_API_KEY not available for fallback');
    return [];
  }

  console.log('🔄 Usando Lovable AI fallback para converter texto em JSON...');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'Você é um conversor de JSON. Extraia atrações turísticas do texto e retorne APENAS um array JSON válido. Sem explicações.'
        },
        {
          role: 'user',
          content: `Extraia atrações deste texto sobre ${region} e retorne como um array JSON com objetos contendo: name, type, address, hours, description, estimatedDuration (número em minutos), neighborhood, rating, whyRecommended.

CONTEXTO DO PERFIL (use para filtrar sugestões relevantes):
${profileContext}

Texto:\n\n${text}`
        }
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    console.error('Lovable AI fallback failed:', await response.text());
    return [];
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleanContent.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Fallback JSON parse also failed');
    return [];
  }
}

// Constrói contexto do perfil para o prompt
function buildProfileContext(travelContext: any): string {
  const profile = travelContext.profile;
  const tripConfig = travelContext.tripConfig;
  
  if (!profile) {
    return "Nenhum perfil configurado.";
  }

  const lines: string[] = [];
  
  // Viajantes com idades
  if (profile.travelers && Array.isArray(profile.travelers) && profile.travelers.length > 0) {
    const travelerInfo = profile.travelers.map((t: any) => {
      const age = t.age ? ` (${t.age} anos)` : '';
      return `${t.name}${age}`;
    }).join(', ');
    lines.push(`👥 VIAJANTES: ${travelerInfo}`);
    
    // Destacar se há crianças
    const children = profile.travelers.filter((t: any) => t.age && t.age < 18);
    if (children.length > 0) {
      const childNames = children.map((c: any) => `${c.name} (${c.age} anos)`).join(', ');
      lines.push(`👧 HÁ CRIANÇA(S) NO GRUPO: ${childNames} → INCLUA ATRAÇÕES APROPRIADAS PARA IDADE!`);
    }
  }

  // Categorias preferidas (PRIORIZAR)
  if (profile.preferred_categories && profile.preferred_categories.length > 0) {
    lines.push(`\n✅ CATEGORIAS QUE INTERESSAM (PRIORIZE ESTAS):\n- ${profile.preferred_categories.join('\n- ')}`);
  }

  // Interesses gerais
  if (profile.interests && profile.interests.length > 0) {
    lines.push(`\n🎯 INTERESSES DO GRUPO:\n- ${profile.interests.join('\n- ')}`);
  }

  // Tópicos a EVITAR (CRÍTICO)
  if (profile.avoid_topics && profile.avoid_topics.length > 0) {
    lines.push(`\n⛔ EVITAR ABSOLUTAMENTE (NUNCA SUGIRA):\n- ${profile.avoid_topics.join('\n- ')}`);
  }

  // Restrições alimentares
  if (profile.dietary_restrictions && profile.dietary_restrictions.length > 0) {
    lines.push(`\n🍽️ RESTRIÇÕES ALIMENTARES (considere ao sugerir restaurantes):\n- ${profile.dietary_restrictions.join('\n- ')}`);
  }

  // Mobilidade
  if (profile.mobility_notes) {
    lines.push(`\n♿ MOBILIDADE: ${profile.mobility_notes}`);
  }

  // Ritmo
  if (profile.pace) {
    const paceMap: Record<string, string> = {
      'relaxed': 'Relaxado (poucas atividades, mais tempo em cada lugar)',
      'moderate': 'Moderado (equilíbrio entre atividades e descanso)',
      'active': 'Ativo (muitas atividades, ritmo intenso)'
    };
    lines.push(`\n🚶 RITMO PREFERIDO: ${paceMap[profile.pace] || profile.pace}`);
  }

  // Orçamento
  if (profile.budget_level) {
    const budgetMap: Record<string, string> = {
      'budget': 'Econômico (priorize opções gratuitas ou baratas)',
      'moderate': 'Moderado (bom custo-benefício)',
      'premium': 'Premium (experiências de alta qualidade)',
      'luxury': 'Luxo (sem restrições de custo)'
    };
    lines.push(`\n💰 ORÇAMENTO: ${budgetMap[profile.budget_level] || profile.budget_level}`);
  }

  // Preferência de transporte
  if (profile.transportation_preference) {
    const transportMap: Record<string, string> = {
      'walking_only': 'Apenas caminhando',
      'walking_subway': 'Caminhando + metrô',
      'taxi_uber': 'Táxi/Uber',
      'mixed': 'Misto (flexível)'
    };
    lines.push(`\n🚇 TRANSPORTE: ${transportMap[profile.transportation_preference] || profile.transportation_preference}`);
  }

  // Notas especiais (MUITO IMPORTANTE - contém preferências específicas do usuário)
  if (profile.notes) {
    lines.push(`\n📝 NOTAS IMPORTANTES DO VIAJANTE (LEIA COM ATENÇÃO E SIGA):\n${profile.notes}`);
  }

  // Hotel (para proximidade)
  if (tripConfig?.hotel_address) {
    lines.push(`\n🏨 HOTEL: ${tripConfig.hotel_address}`);
  }

  return lines.join('\n');
}

// Gera instruções de balanceamento dinâmico baseado no perfil
function buildBalancingInstructions(profile: any): string {
  if (!profile) {
    return `
⚖️ BALANCEAMENTO PADRÃO:
- Variedade de tipos: atrações, restaurantes, parques, experiências
- Máximo 2-3 restaurantes/cafés
- Incluir opções ao ar livre se possível`;
  }

  const instructions: string[] = ['⚖️ BALANCEAMENTO BASEADO NO PERFIL:'];
  
  const preferredCategories = profile.preferred_categories || [];
  const avoidTopics = profile.avoid_topics || [];

  // Instruções baseadas em categorias preferidas
  if (preferredCategories.includes('restaurants')) {
    instructions.push('- Restaurantes são bem-vindos (até 3-4 opções variadas)');
  } else {
    instructions.push('- Máximo 1-2 restaurantes (não é prioridade)');
  }

  if (preferredCategories.includes('museums')) {
    instructions.push('- Inclua museus relevantes');
  } else if (avoidTopics.some((t: string) => t.toLowerCase().includes('museu'))) {
    instructions.push('- NÃO inclua museus');
  }

  if (preferredCategories.includes('parks')) {
    instructions.push('- Inclua parques e espaços ao ar livre');
  }

  if (preferredCategories.includes('shopping')) {
    instructions.push('- Inclua opções de compras interessantes');
  }

  if (preferredCategories.includes('landmarks')) {
    instructions.push('- Inclua pontos turísticos icônicos');
  }

  if (preferredCategories.includes('local-experiences')) {
    instructions.push('- Inclua experiências locais autênticas');
  }

  // Se há crianças
  if (profile.travelers?.some((t: any) => t.age && t.age < 18)) {
    instructions.push('- INCLUA atrações family-friendly apropriadas para as idades das crianças');
  }

  // Variedade geral
  instructions.push('- Garanta variedade nos tipos de atividades sugeridas');
  instructions.push('- Considere a proximidade geográfica entre as sugestões');

  return instructions.join('\n');
}

Deno.serve(withAuth(async ({ req, supabaseUrl, supabaseKey, user, corsHeaders }) => {
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  
  try {
    const parsedBody = DiscoverAttractionsRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsedBody.error.format() }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const { date, requestMore } = parsedBody.data;
    
    // Sanitize user inputs to prevent prompt injection
    const regionValidation = validateAndSanitize(parsedBody.data.region, 'region');
    const region = regionValidation.value;
    
    const userSuggestionValidation = parsedBody.data.userSuggestion 
      ? validateAndSanitize(parsedBody.data.userSuggestion, 'generic')
      : { value: undefined, hasSuspiciousContent: false };
    const userSuggestion = userSuggestionValidation.value;
    
    // Log suspicious inputs
    if (regionValidation.hasSuspiciousContent) {
      logSuspiciousInput(user.id, 'discover-attractions', parsedBody.data.region, 'region');
    }
    if (userSuggestionValidation.hasSuspiciousContent && parsedBody.data.userSuggestion) {
      logSuspiciousInput(user.id, 'discover-attractions', parsedBody.data.userSuggestion, 'userSuggestion');
    }
    
    const userId = user.id;

    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!perplexityApiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: jsonHeaders }
      );
    }

    console.log(`🔍 Buscando atrações para ${region} em ${date}`, { userSuggestion, requestMore, userId });

    // Construir contexto de viagem
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey,
      date,
      region
    );
    
    // Construir contexto do perfil para uso no prompt
    const profileContext = buildProfileContext(travelContext);
    const balancingInstructions = buildBalancingInstructions(travelContext.profile);

    console.log('📋 Contexto do perfil:', profileContext.substring(0, 500));

    // Campos base em português
    const baseFields = `Cada objeto DEVE ter:
- name: nome oficial do local
- type: tipo (museu/restaurante/parque/evento/atração/loja/experiência)
- address: endereço completo em Nova York
- hours: horário de funcionamento
- description: descrição de 2-3 frases EM PORTUGUÊS
- estimatedDuration: duração estimada em minutos (número)
- neighborhood: nome do bairro/área
- rating: avaliação se conhecida (ex: "4.5/5")
- whyRecommended: por que vale a pena visitar EM PORTUGUÊS (considere o perfil dos viajantes)`;

    let prompt: string;
    let expectedCount: string;

    if (userSuggestion) {
      expectedCount = "1-3";
      prompt = `Encontre informações sobre "${userSuggestion}" em ${region}, Nova York para ${date}.

${baseFields}

Retorne um array JSON com ${expectedCount} resultados.

📋 PERFIL DOS VIAJANTES (USE ATIVAMENTE PARA PERSONALIZAR):
${profileContext}

${balancingInstructions}`;
    } else if (requestMore) {
      expectedCount = "6-10";
      prompt = `Liste atrações menos conhecidas, joias escondidas, restaurantes e atividades em ${region}, Nova York para ${date}.

${baseFields}

📋 PERFIL DOS VIAJANTES (USE ATIVAMENTE - MUITO IMPORTANTE):
${profileContext}

${balancingInstructions}

⚠️ REGRAS CRÍTICAS:
- SIGA as preferências do perfil acima
- EVITE absolutamente o que está marcado como "EVITAR"
- Se há crianças, INCLUA opções apropriadas para elas
- Leia as NOTAS do viajante e siga as preferências específicas

Retorne um array JSON com ${expectedCount} sugestões variadas.`;
    } else {
      expectedCount = "8-12";
      prompt = `Liste as melhores atrações e atividades em ${region}, Nova York para ${date}.

Se "${region}" é um ponto específico (como "Columbus Circle", "Times Square", "SoHo"), priorize lugares a 10-15 minutos de caminhada.

${baseFields}

📋 PERFIL DOS VIAJANTES (USE ATIVAMENTE - MUITO IMPORTANTE):
${profileContext}

${balancingInstructions}

⚠️ REGRAS CRÍTICAS:
- SIGA as preferências de categoria do perfil acima
- EVITE absolutamente o que está marcado como "EVITAR"
- Se há crianças, INCLUA opções apropriadas para elas
- Leia as NOTAS do viajante e siga as preferências específicas
- Considere o orçamento e ritmo preferidos
- Sugestões de restaurantes devem respeitar restrições alimentares

Retorne um array JSON com ${expectedCount} sugestões variadas e personalizadas.`;
    }

    console.log('📤 Enviando requisição para Perplexity...');

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
            content: `Você é uma API JSON especializada em turismo em Nova York. SEMPRE responda com APENAS um array JSON válido. Sem explicações, sem blocos de código markdown, sem texto antes ou depois - apenas o array JSON bruto começando com [ e terminando com ].

IMPORTANTE: Todas as descrições e recomendações devem ser em PORTUGUÊS BRASILEIRO.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API Perplexity:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Falha ao buscar atrações do Perplexity' }),
        { status: response.status, headers: jsonHeaders }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('Sem conteúdo na resposta do Perplexity');
      return new Response(
        JSON.stringify({ error: 'Nenhum conteúdo recebido da IA' }),
        { status: 500, headers: jsonHeaders }
      );
    }

    // Extrair JSON da resposta
    let attractions: any[] = [];
    try {
      console.log('Conteúdo bruto do Perplexity:', content.substring(0, 300));
      
      let cleanContent = content.trim();
      
      // Remover blocos de código markdown
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      cleanContent = cleanContent.trim();
      
      // Tentar encontrar array JSON na resposta
      const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
      console.log('Conteúdo limpo (preview):', cleanContent.substring(0, 200));
      attractions = JSON.parse(cleanContent);

      if (!Array.isArray(attractions)) {
        throw new Error('Resposta não é um array');
      }

    } catch (parseError) {
      console.error('Falha ao parsear resposta do Perplexity:', parseError);
      console.log('Tentando fallback com Lovable AI...');
      
      // Usar fallback para converter texto em JSON
      attractions = await convertTextToJson(content, region, profileContext);
      
      if (attractions.length === 0) {
        return new Response(
          JSON.stringify({
            error: 'Falha ao processar resposta da IA',
            attractions: []
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
    }

    // Validar e enriquecer dados
    attractions = attractions.map((attr: any, index: number) => ({
      id: `attr-${Date.now()}-${index}`,
      name: attr.name || 'Desconhecido',
      type: attr.type || 'atração',
      address: attr.address || 'Endereço não especificado',
      hours: attr.hours || 'Verificar horários',
      description: attr.description || 'Sem descrição',
      estimatedDuration: typeof attr.estimatedDuration === 'number' ? attr.estimatedDuration : 60,
      neighborhood: attr.neighborhood || region,
      imageUrl: attr.imageUrl || null,
      infoUrl: attr.infoUrl || null,
      rating: attr.rating || null,
      reviewCount: attr.reviewCount || null,
      whyRecommended: attr.whyRecommended || null,
      verificationUrl: attr.verificationUrl || null,
    }));

    console.log(`✅ Encontradas ${attractions.length} atrações`);

    return new Response(
      JSON.stringify({ attractions }),
      { headers: jsonHeaders }
    );

  } catch (error) {
    console.error('Erro em discover-attractions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: jsonHeaders }
    );
  }
}));
