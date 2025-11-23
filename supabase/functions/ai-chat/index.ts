import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, programId, programData } = await req.json();

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Fetch previous chat messages for this program and user
    const { data: previousMessages } = await supabase
      .from('program_chat_messages')
      .select('role, content')
      .eq('program_id', programId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50); // Limit to last 50 messages to avoid too large context

    // Build system prompt with program context
    const systemPrompt = `Você é um assistente turístico especializado e prestativo. Use as seguintes informações do evento para responder perguntas de forma útil e segura:

Evento: ${programData.title}
Descrição: ${programData.description}
Local: ${programData.address}
Data: ${programData.date}
Horário: ${programData.start_time} - ${programData.end_time}

${programData.aiSuggestions ? `Sugestões anteriores geradas:\n${programData.aiSuggestions}` : ''}

Foque em fornecer informações sobre:
- Gastronomia local e restaurantes próximos
- Pontos turísticos e atrações na região
- Dicas práticas de transporte e deslocamento
- Sugestões de atividades relacionadas ao evento
- Dicas de segurança quando relevante

Seja preciso, útil e seguro. Não invente estabelecimentos ou informações. Se não souber algo específico, admita e sugira como o usuário pode pesquisar mais.`;

    // Combine all messages
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(previousMessages || []),
      { role: 'user', content: message }
    ];

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Muitas requisições. Por favor, tente novamente em alguns instantes.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Limite de créditos atingido. Por favor, adicione créditos ao seu workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error('AI API request failed');
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices[0].message.content;

    // Save user message to database
    await supabase
      .from('program_chat_messages')
      .insert({
        program_id: programId,
        user_id: userId,
        role: 'user',
        content: message
      });

    // Save assistant message to database
    await supabase
      .from('program_chat_messages')
      .insert({
        program_id: programId,
        user_id: userId,
        role: 'assistant',
        content: assistantMessage
      });

    return new Response(
      JSON.stringify({ message: assistantMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-chat function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});