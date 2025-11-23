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

    const attractionsText = selectedAttractions.map((a: any) => 
      `- ${a.name} (${a.type})\n  Endereço: ${a.address}\n  Horários: ${a.hours}\n  Duração estimada: ${a.estimatedDuration} minutos\n  Descrição: ${a.description}`
    ).join('\n\n');

    const specificContext = `
Você está organizando um itinerário para o dia ${date} em ${region || "Nova York"}.

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
      "notes": "Dicas práticas, transporte, tempo de translado"
    }
  ],
  "summary": "Resumo da organização do dia com lógica aplicada",
  "warnings": ["Avisos sobre conflitos ou ajustes necessários"]
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
