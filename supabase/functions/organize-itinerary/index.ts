import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { selectedAttractions, date, startTime, endTime, region } = await req.json();

    if (!selectedAttractions || !date) {
      return new Response(
        JSON.stringify({ error: 'Selected attractions and date are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🧠 Organizing itinerary for ${date} with ${selectedAttractions.length} attractions`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build complete travel context
    const travelContext = await buildTravelContext(
      user.id,
      supabaseUrl,
      supabaseKey,
      date,
      region || "Manhattan"
    );

    // Fetch existing programs for the specific date
    const { data: existingPrograms, error: programsError } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .order('start_time');

    if (programsError) {
      console.error('Error fetching existing programs:', programsError);
    }

    const existingProgramsText = existingPrograms?.length 
      ? existingPrograms.map(p => 
          `${p.start_time || '?'}-${p.end_time || '?'}: ${p.title} em ${p.address || 'endereço não especificado'}`
        ).join('\n')
      : 'Nenhum programa existente neste dia';

    // Identificar próximo compromisso (após o horário de fim do itinerário)
    const nextCommitment = existingPrograms?.find(p => {
      const programStart = p.start_time;
      return programStart && programStart > endTime;
    });

    const nextCommitmentText = nextCommitment 
      ? `
⭐⭐⭐ OTIMIZAÇÃO CRÍTICA COM PRÓXIMO COMPROMISSO ⭐⭐⭐

🎯 PRÓXIMO COMPROMISSO DO DIA:
   - Título: ${nextCommitment.title}
   - Horário: ${nextCommitment.start_time}
   - Local: ${nextCommitment.address || 'não especificado'}
   
⚠️ REGRAS OBRIGATÓRIAS DE OTIMIZAÇÃO:
1. O ÚLTIMO programa do itinerário DEVE terminar GEOGRAFICAMENTE PRÓXIMO a "${nextCommitment.address || 'o próximo compromisso'}"
2. RESERVE no mínimo 30-45 minutos de buffer antes de ${nextCommitment.start_time}
3. No campo "notes" do ÚLTIMO programa, INCLUA:
   - Tempo estimado de deslocamento até ${nextCommitment.address || 'o próximo local'}
   - Melhor forma de transporte (metrô com linhas específicas, táxi, a pé)
   - Dicas para chegar com tranquilidade
4. ORGANIZE toda a sequência de programas para CONVERGIR naturalmente ao destino final
5. Adicione ao campo "transitToNext" do último programa: "X min de [transporte] até [próximo compromisso]"
`
      : '';

    // Identificar compromisso anterior (antes do horário de início)
    const previousCommitment = existingPrograms?.filter(p => {
      return p.end_time && p.end_time <= startTime;
    }).pop(); // Pegar o último que termina antes

    const previousCommitmentText = previousCommitment
      ? `
📍 COMPROMISSO ANTERIOR DO DIA:
   - ${previousCommitment.title} termina às ${previousCommitment.end_time}
   - Local: ${previousCommitment.address || 'não especificado'}
   
💡 SUGESTÃO: Se possível, iniciar o itinerário próximo a este local para otimizar deslocamento.
`
      : '';

    const attractionsText = selectedAttractions.map((a: any) => 
      `- ${a.name} (${a.type})\n  Endereço: ${a.address}\n  Horários: ${a.hours}\n  Duração estimada: ${a.estimatedDuration} minutos\n  Descrição: ${a.description}`
    ).join('\n\n');

    console.log(`🧠 Organizing itinerary for ${date} with ${selectedAttractions.length} attractions in ${region || "Nova York"}`);
    console.log('📊 Context summary:', {
      hasProfile: !!travelContext,
      date,
      region,
      attractionsCount: selectedAttractions.length,
      existingProgramsCount: existingPrograms?.length || 0
    });

    const specificContext = `
Você está organizando um itinerário para o dia ${date} em ${region || "Nova York"}.

⚠️⚠️⚠️ VALIDAÇÃO CRÍTICA DE DATA ⚠️⚠️⚠️
ANTES DE ORGANIZAR, VERIFIQUE:
1. Se alguma atração for um EVENTO PONTUAL (show, jogo, festival):
   - Confirme que o evento ocorre EXATAMENTE em ${date}
   - Se a data do evento for diferente → REJEITE e adicione warning
2. Se for ATRAÇÃO PERMANENTE (museu, restaurante):
   - Confirme que está ABERTA em ${date}
   - Se fechada → REJEITE e adicione warning

⭐ OTIMIZAÇÃO GEOGRÁFICA:
- MINIMIZE deslocamentos: organize por PROXIMIDADE
- PREFIRA atrações caminháveis quando possível (máximo 15 min a pé)
- Se incluir lugares mais distantes, mencione tempo/custo de transporte no campo "notes"
- CRIE um fluxo lógico de deslocamento (evite vai-e-vem desnecessário)
- Agrupe atrações próximas no mesmo período
- Considere o tempo de deslocamento entre cada atividade

${nextCommitmentText}
${previousCommitmentText}

HORÁRIO DESEJADO: ${startTime || "09:00"} até ${endTime || "22:00"}

PROGRAMAS JÁ EXISTENTES NESTE DIA:
${existingProgramsText}

ATRAÇÕES SELECIONADAS PELO USUÁRIO:
${attractionsText}

SUA TAREFA:
1. Organize as atrações selecionadas de forma lógica e eficiente considerando:
   - Proximidade geográfica (agrupar locais próximos)
   - Horários de funcionamento
   - Tempo realista de translado (15-30min dependendo da distância)
   - Duração estimada em cada local
   - Fluxo natural do dia (café → atrações → almoço → mais atrações → jantar)
   - Padrões de preferência do perfil do viajante
   - Condições climáticas da estação
   ${nextCommitment ? '- **CONVERGÊNCIA ao próximo compromisso** (regra obrigatória acima)' : ''}

2. NÃO sobrescrever ou conflitar com programas existentes
3. Preencher gaps de tempo livre entre programas existentes
4. Respeitar as restrições e preferências do viajante
5. Para cada programa, calcule tempo de translado

FORMATO DE RESPOSTA (JSON válido, sem markdown):
{
  "programs": [
    {
      "title": "Nome da atração exatamente como fornecido",
      "description": "Breve descrição personalizada (1-2 linhas)",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "address": "Endereço completo exato",
      "notes": "Dicas práticas, transporte, tempo de translado",
      "transitToNext": "Informação sobre deslocamento para próxima atividade (opcional, obrigatório se houver próximo compromisso)"
    }
  ],
  "summary": "Resumo da organização do dia com lógica aplicada",
  "warnings": ["Avisos sobre conflitos ou ajustes necessários"],
  "optimizationApplied": {
    "endNearNextCommitment": ${!!nextCommitment},
    "nextCommitmentTitle": "${nextCommitment?.title || ''}",
    "bufferMinutes": 45,
    "suggestedDeparture": "Horário calculado para sair com folga"
  }
}
`;

    const systemPrompt = buildContextualPrompt(travelContext, specificContext);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: systemPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit atingido. Aguarde um momento e tente novamente.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to organize itinerary' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'No response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON response
    let organizedItinerary;
    try {
      // 1. Tentar extrair JSON de markdown
      let jsonString = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
      }
      
      // 2. Tentar fazer parse
      organizedItinerary = JSON.parse(jsonString);
      
      // 3. Validar estrutura mínima
      if (!organizedItinerary.programs || !Array.isArray(organizedItinerary.programs)) {
        throw new Error('Invalid response structure: missing programs array');
      }
      
      // 4. Verificar se retornou vazio
      if (organizedItinerary.programs.length === 0) {
        console.log('⚠️ No programs organized - AI returned empty array');
        return new Response(
          JSON.stringify({ 
            error: 'Nenhum programa foi organizado. A IA pode não ter encontrado informações suficientes sobre a região ou as atrações selecionadas não são compatíveis com a data escolhida.',
            warnings: organizedItinerary.warnings || [],
            itinerary: { programs: [], summary: organizedItinerary.summary || '', warnings: organizedItinerary.warnings || [] }
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`✅ Organized ${organizedItinerary.programs.length} programs`);
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', content);
      
      // Verificar se a IA retornou uma mensagem explicativa
      if (content.toLowerCase().includes('não encontr') || 
          content.toLowerCase().includes('não há') ||
          content.toLowerCase().includes('não existe')) {
        return new Response(
          JSON.stringify({ 
            error: 'A IA não conseguiu encontrar informações suficientes sobre essa região ou data. Tente: 1) Escolher uma região mais específica (ex: "SoHo" em vez de "Manhattan"), 2) Verificar se a data está correta, 3) Selecionar outras atrações.',
            rawContent: content.substring(0, 300)
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao processar resposta da IA. Por favor, tente novamente. Se o problema persistir, tente selecionar menos atrações ou uma região diferente.',
          details: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          rawContent: content.substring(0, 500)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        itinerary: organizedItinerary,
        existingPrograms: existingPrograms || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in organize-itinerary:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
