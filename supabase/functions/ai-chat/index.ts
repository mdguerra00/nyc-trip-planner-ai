import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
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
    const { message, programId, programData } = await req.json();
    const isGlobalChat = !programId;

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

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!PERPLEXITY_API_KEY || !LOVABLE_API_KEY) {
      throw new Error('API keys not configured');
    }

    // Build complete travel context
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey
    );

    // Fetch chat history based on chat mode
    const chatTable = isGlobalChat ? 'global_chat_messages' : 'program_chat_messages';
    
    let chatHistoryQuery = supabase
      .from(chatTable)
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);
    
    if (!isGlobalChat) {
      chatHistoryQuery = chatHistoryQuery.eq('program_id', programId);
    }
    
    const { data: chatHistory } = await chatHistoryQuery;

    let specificContext = `O usuário está conversando sobre sua viagem a Nova York.\n`;

    if (isGlobalChat) {
      // Fetch all user programs for global context
      const { data: allPrograms } = await supabase
        .from('programs')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });
      
      if (allPrograms && allPrograms.length > 0) {
        specificContext += `\n📅 Programas criados pelo viajante:\n`;
        allPrograms.forEach((p: any) => {
          specificContext += `- ${p.title} (${p.date})${p.address ? ' - ' + p.address : ''}${p.start_time ? ' às ' + p.start_time : ''}\n`;
        });
      } else {
        specificContext += `\nNenhum programa foi criado ainda. Você pode ajudar o viajante a planejar sua viagem.\n`;
      }
      specificContext += `\nConversando de forma GERAL sobre toda a viagem. Considere TODOS os programas ao responder.`;
    } else {
      specificContext += `\nPrograma específico sendo visualizado:\n`;
      specificContext += `- ${programData.title} - ${programData.date}\n`;
      specificContext += `- ${programData.address || "Local não especificado"}`;
    }

    specificContext += `\n\nVocê é um assistente de viagem amigável e prestativo. Responda de forma personalizada considerando TODO o contexto do viajante, respeitando suas preferências, restrições e necessidades.`;

    const tripContext = buildContextualPrompt(travelContext, specificContext);

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
    const callPerplexity = async (query: string) => {
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
              content: `${tripContext}\n\nForneça informações ATUALIZADAS em tempo real. Cite fontes quando possível.`
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
    const callGemini = async (query: string) => {
      const messages = [
        { role: 'system', content: tripContext },
        ...(chatHistory || []),
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

    // Intelligent routing
    let assistantMessage: string;
    try {
      if (needsRealTimeInfo(message)) {
        console.log('🔍 Using Perplexity for real-time query');
        assistantMessage = await callPerplexity(message);
      } else {
        console.log('🧠 Using Gemini for context-based query');
        assistantMessage = await callGemini(message);
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

    // Save messages to database based on chat mode
    if (isGlobalChat) {
      await supabase
        .from('global_chat_messages')
        .insert({
          user_id: userId,
          role: 'user',
          content: message
        });

      await supabase
        .from('global_chat_messages')
        .insert({
          user_id: userId,
          role: 'assistant',
          content: assistantMessage
        });
    } else {
      await supabase
        .from('program_chat_messages')
        .insert({
          program_id: programId,
          user_id: userId,
          role: 'user',
          content: message
        });

      await supabase
        .from('program_chat_messages')
        .insert({
          program_id: programId,
          user_id: userId,
          role: 'assistant',
          content: assistantMessage
        });
    }

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
