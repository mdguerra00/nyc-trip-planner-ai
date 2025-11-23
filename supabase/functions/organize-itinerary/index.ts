import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

    // Fetch existing programs for the date
    const { data: existingPrograms, error: programsError } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .order('start_time');

    if (programsError) {
      console.error('Error fetching existing programs:', programsError);
    }

    // Fetch ALL programs for context
    const { data: allPrograms } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', user.id)
      .order('date');

    // Fetch trip config
    const { data: tripConfig } = await supabase
      .from('trip_config')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Build comprehensive context
    const existingProgramsText = existingPrograms?.length 
      ? existingPrograms.map(p => 
          `${p.start_time || '?'}-${p.end_time || '?'}: ${p.title} em ${p.address || 'endereço não especificado'}`
        ).join('\n')
      : 'Nenhum programa existente neste dia';

    const allProgramsContext = allPrograms?.map(p => {
      const faqText = p.ai_faq && Array.isArray(p.ai_faq)
        ? p.ai_faq.map((q: any) => `P: ${q.question}\nR: ${q.answer}`).join('\n')
        : '';
      
      return `
📅 ${p.date} - ${p.title}
📍 ${p.address || 'Sem endereço'}
⏰ ${p.start_time || '?'} - ${p.end_time || '?'}
📝 ${p.description || 'Sem descrição'}
🗒️ Notas: ${p.notes || 'Nenhuma'}
💡 Sugestões IA: ${p.ai_suggestions || 'Nenhuma'}
${faqText ? `❓ FAQs:\n${faqText}` : ''}
---`;
    }).join('\n') || 'Nenhum programa cadastrado ainda';

    const attractionsText = selectedAttractions.map((a: any) => 
      `- ${a.name} (${a.type})\n  Endereço: ${a.address}\n  Horários: ${a.hours}\n  Duração estimada: ${a.estimatedDuration} minutos\n  Descrição: ${a.description}`
    ).join('\n\n');

    const hotelInfo = tripConfig?.hotel_address 
      ? `🏨 Hotel: ${tripConfig.hotel_address}`
      : '🏨 Hotel: Não configurado (assumir Manhattan central)';

    const systemPrompt = `Você é um especialista em planejamento de viagens em NYC com profundo conhecimento de geografia, transporte e logística.

CONTEXTO COMPLETO DA VIAGEM:
${allProgramsContext}

${hotelInfo}
Período da viagem: ${tripConfig?.start_date || '?'} a ${tripConfig?.end_date || '?'}

PROGRAMAS JÁ EXISTENTES NO DIA ${date}:
${existingProgramsText}

REGIÃO DE FOCO: ${region}

ATRAÇÕES SELECIONADAS PELO USUÁRIO:
${attractionsText}

JANELA DE TEMPO DESEJADA: ${startTime || '09:00'} - ${endTime || '22:00'}

SUA TAREFA:
1. Organize as atrações selecionadas de forma lógica e eficiente, considerando:
   - Proximidade geográfica (agrupar locais próximos para minimizar translados)
   - Horários de funcionamento de cada local
   - Tempo realista de translado entre locais (15-30min dependendo da distância)
   - Duração estimada em cada local
   - Padrões de preferência identificados nos programas anteriores
   - Fluxo natural do dia (ex: café da manhã → atrações → almoço → mais atrações → jantar)

2. NÃO sobrescrever ou conflitar com programas existentes
3. Preencher gaps de tempo livre entre programas existentes
4. Sugerir horários realistas baseados nos padrões do usuário

5. Para cada programa, calcule e informe o tempo de translado do local anterior (ou do hotel se for o primeiro)

REGRAS CRÍTICAS:
- Use os endereços exatos fornecidos
- Tempos de translado: a pé (5-20min), metrô (15-30min), táxi (10-25min)
- Respeite os horários dos programas existentes
- Deixe 15-30min de buffer entre programas para translados
- Inclua referências às notas e preferências anteriores quando relevante

FORMATO DE RESPOSTA (JSON válido, sem markdown):
{
  "programs": [
    {
      "title": "Nome da atração",
      "description": "Breve descrição personalizada considerando o contexto da viagem",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "address": "Endereço completo exato",
      "notes": "Dicas e informações úteis, incluindo translado (ex: 20min de metrô do hotel)"
    }
  ],
  "summary": "Resumo da organização do dia com lógica aplicada",
  "warnings": ["Avisos sobre conflitos ou ajustes necessários"]
}`;

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Por favor, organize esse itinerário de forma inteligente.' }
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
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
      const jsonString = jsonMatch[1].trim();
      organizedItinerary = JSON.parse(jsonString);

      console.log(`✅ Organized ${organizedItinerary.programs?.length || 0} programs`);

    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
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
