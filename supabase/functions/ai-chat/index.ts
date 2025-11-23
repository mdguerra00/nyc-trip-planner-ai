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

    // Fetch ALL programs from the user's trip
    const { data: allPrograms } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    // Fetch trip configuration (start and end dates)
    const { data: tripConfig } = await supabase
      .from('trip_config')
      .select('start_date, end_date')
      .eq('user_id', userId)
      .single();

    // Fetch previous chat messages for this program and user
    const { data: previousMessages } = await supabase
      .from('program_chat_messages')
      .select('role, content')
      .eq('program_id', programId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);

    // Build complete trip context
    const tripContext = allPrograms?.map(p => {
      const faqText = p.ai_faq 
        ? JSON.parse(p.ai_faq).map((q: any) => 
            `P: ${q.question}\nR: ${q.answer}${q.details ? '\n' + q.details : ''}`
          ).join('\n\n')
        : '';
      
      return `
📅 ${p.date} - ${p.title}
📍 ${p.address || 'Local não informado'}
⏰ ${p.start_time || ''} ${p.end_time ? '- ' + p.end_time : ''}
📝 ${p.description || ''}

${p.ai_suggestions ? `💡 Sugestões:\n${p.ai_suggestions}\n` : ''}
${faqText ? `❓ FAQs:\n${faqText}` : ''}
`.trim();
    }).join('\n\n---\n\n') || '';

    // Function to detect if query needs real-time information
    const needsRealTimeInfo = (query: string): boolean => {
      const realtimeKeywords = [
        'agora', 'hoje', 'amanhã', 'aberto', 'fechado', 'funciona', 'horário atual',
        'disponível', 'lotado', 'cheio', 'clima', 'tempo', 'temperatura', 'trânsito',
        'tráfego', 'abriu', 'fechou', 'atual', 'neste momento', 'preço atual',
        'quanto custa agora', 'está aberto', 'está funcionando'
      ];
      const lowerQuery = query.toLowerCase();
      return realtimeKeywords.some(keyword => lowerQuery.includes(keyword));
    };

    // Function to call Perplexity for real-time queries
    const callPerplexity = async (query: string, context: string) => {
      const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
      if (!PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY not configured');
      }

      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-large-128k-online',
          messages: [
            {
              role: 'system',
              content: `Você é um assistente turístico especializado. Use informações em tempo real da web para responder.

CONTEXTO DA VIAGEM DO USUÁRIO:
${context}

Forneça informações ATUALIZADAS sobre: horários, preços, disponibilidade, clima, trânsito, eventos atuais.
Cite suas fontes quando possível. Seja preciso e útil.`
            },
            { role: 'user', content: query }
          ],
          temperature: 0.2,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Perplexity API error:', response.status, errorText);
        throw new Error('Perplexity API request failed');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    };

    // Function to call Gemini for context-based queries
    const callGemini = async (query: string, context: string, history: any[]) => {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      const systemPrompt = `Você é um assistente turístico especializado ajudando a planejar uma viagem.

📋 CONTEXTO COMPLETO DA VIAGEM:
${tripConfig ? `Período: ${tripConfig.start_date} a ${tripConfig.end_date}` : ''}

${context}

---

🎯 EVENTO ATUAL SENDO VISUALIZADO:
${programData.title} - ${programData.date}
${programData.address}

---

💬 COMO RESPONDER:

1. Use TODAS as informações da viagem para dar respostas contextualizadas
2. Faça conexões entre eventos próximos (temporal e geograficamente)
3. Sugira otimizações de roteiro quando relevante
4. Use as FAQs geradas para enriquecer suas respostas
5. Considere o período total da viagem nas recomendações
6. Mencione eventos relacionados quando for útil

Exemplos de perguntas que você pode responder bem:
- "Qual o melhor restaurante perto dos eventos do dia 15?"
- "Como ir do evento X para o evento Y?"
- "O que fazer no tempo livre entre os eventos?"
- "Quais eventos estão na mesma região?"

Seja preciso, útil e seguro. Não invente informações. Se não souber algo específico, admita e sugira como pesquisar mais.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: query }
      ];

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        
        if (response.status === 429) {
          throw new Error('RATE_LIMIT');
        }
        if (response.status === 402) {
          throw new Error('PAYMENT_REQUIRED');
        }
        throw new Error('AI API request failed');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    };

    // Intelligent routing: Perplexity for real-time, Gemini for context
    let assistantMessage: string;
    try {
      if (needsRealTimeInfo(message)) {
        console.log('🔍 Using Perplexity for real-time query');
        assistantMessage = await callPerplexity(message, tripContext);
      } else {
        console.log('🧠 Using Gemini for context-based query');
        assistantMessage = await callGemini(message, tripContext, previousMessages || []);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'RATE_LIMIT') {
          return new Response(
            JSON.stringify({ error: 'Muitas requisições. Por favor, tente novamente em alguns instantes.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (error.message === 'PAYMENT_REQUIRED') {
          return new Response(
            JSON.stringify({ error: 'Limite de créditos atingido. Por favor, adicione créditos ao seu workspace.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      throw error;
    }

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