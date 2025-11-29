import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AiChatRequestSchema } from "../_shared/schemas.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { corsHeaders, withAuth } from "../_shared/auth.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

serve(withAuth(async ({ req, supabase, supabaseUrl, supabaseKey, user }) => {
  try {
    const parsedBody = AiChatRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsedBody.error.format() }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const { message, programId, programData } = parsedBody.data;
    const isGlobalChat = !programId;
    const userId = user.id;

    if (!isGlobalChat && !programData) {
      return new Response(
        JSON.stringify({ error: "programData is required when programId is provided" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!PERPLEXITY_API_KEY || !LOVABLE_API_KEY) {
      throw new Error('API keys not configured');
    }

    // Extract date and region from program if available
    let contextDate: string | undefined;
    let contextRegion: string | undefined;
    
    if (!isGlobalChat && programData) {
      contextDate = programData.date;
      // Extract region from address if available
      if (programData.address) {
        // Try to extract neighborhood/region from address
        const addressParts = programData.address.split(',');
        if (addressParts.length > 0) {
          contextRegion = addressParts[0].trim();
        }
      }
    }

    // Build complete travel context with date and region
    const travelContext = await buildTravelContext(
      userId,
      supabaseUrl,
      supabaseKey,
      contextDate,
      contextRegion
    );

    // Fetch chat history - for global chat, include ALL conversations
    let chatHistory: any[] = [];

    if (isGlobalChat) {
      // Fetch global chat messages
      const { data: globalMessages } = await supabase
        .from('global_chat_messages')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // Fetch ALL program chat messages with program info
      const { data: programMessages } = await supabase
        .from('program_chat_messages')
        .select(`
          role, 
          content, 
          created_at,
          program_id,
          programs!inner(title, date)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // Combine and sort all messages
      const allMessages = [
        ...(globalMessages || []).map(m => ({
          ...m,
          source: 'global'
        })),
        ...(programMessages || []).map((m: any) => ({
          ...m,
          source: 'program',
          programTitle: m.programs?.title,
          programDate: m.programs?.date
        }))
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Format for AI context - include program context when relevant
      chatHistory = allMessages.slice(-50).map(m => {
        let content = m.content;
        if (m.source === 'program' && m.role === 'user') {
          content = `[Conversa sobre "${m.programTitle}" (${m.programDate})]: ${m.content}`;
        }
        return { role: m.role, content };
      });

    } else {
      // For program-specific chat, only get that program's messages
      const { data } = await supabase
        .from('program_chat_messages')
        .select('role, content')
        .eq('user_id', userId)
        .eq('program_id', programId)
        .order('created_at', { ascending: true })
        .limit(50);
      
      chatHistory = data || [];
    }

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
      
      specificContext += `\n\n💬 HISTÓRICO DE CONVERSAS:
Você tem acesso a TODAS as conversas anteriores, incluindo:
- Conversas gerais sobre a viagem (chat global)
- Conversas específicas sobre cada programa agendado
Quando o usuário perguntar sobre algo que foi discutido anteriormente em qualquer conversa, 
USE o histórico completo para responder com contexto total. Se o usuário mencionar algo discutido 
em um programa específico, você DEVE saber do que ele está falando.`;
    } else {
      specificContext += `\nPrograma específico sendo visualizado:\n`;
      specificContext += `- Título: ${programData.title}\n`;
      specificContext += `- Data: ${programData.date}\n`;
      if (programData.start_time) specificContext += `- Horário: ${programData.start_time}${programData.end_time ? ' - ' + programData.end_time : ''}\n`;
      if (programData.address) specificContext += `- Local: ${programData.address}\n`;
      if (programData.description) specificContext += `- Descrição: ${programData.description}\n`;
      if (programData.notes) specificContext += `- Observações: ${programData.notes}\n`;
      specificContext += `\nConversando especificamente sobre ESTE programa. Use o contexto completo da viagem (hotel, perfil, outras atividades) para enriquecer suas respostas.`;
    }

    specificContext += `\n\n⚠️ REGRAS CRÍTICAS:
1. Você TEM ACESSO a TODO o contexto da viagem (hotel, perfil do viajante, todas as preferências e restrições)
2. SEMPRE considere o contexto completo ao responder, incluindo:
   - Localização do hotel (se disponível)
   - Perfil dos viajantes (idades, interesses)
   - Restrições alimentares e de mobilidade
   - Budget e ritmo preferidos
   - Outros programas já planejados
3. Se o usuário perguntar sobre informações que VOCÊ TEM no contexto (como hotel, preferências, etc.), RESPONDA com essas informações
4. Seja um assistente prestativo que CONHECE o viajante e sua viagem

Você é um assistente de viagem amigável e prestativo. Responda de forma personalizada considerando TODO o contexto do viajante.`;

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
            { status: 429, headers: jsonHeaders }
          );
        }
        if (error.message === 'PAYMENT_REQUIRED') {
          return new Response(
            JSON.stringify({ error: 'Limite de créditos atingido. Por favor, adicione créditos ao seu workspace.' }),
            { status: 402, headers: jsonHeaders }
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
      { headers: jsonHeaders }
    );

  } catch (error) {
    console.error('Error in ai-chat function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: jsonHeaders }
    );
  }
}));
