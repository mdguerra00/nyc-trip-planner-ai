import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AiChatRequestSchema } from "../_shared/schemas.ts";
import { buildTravelContext, buildContextualPrompt } from "../_shared/context-builder.ts";
import { corsHeaders, withAuth } from "../_shared/auth.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// Tool definitions for program management
const programTools = [
  {
    type: "function",
    function: {
      name: "add_program",
      description: "Adiciona um novo programa/atividade ao roteiro de viagem do usuário. Use quando o usuário pedir para adicionar algo ao roteiro.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título do programa (ex: 'Jantar no Carbone')" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD (ex: '2024-12-22')" },
          start_time: { type: "string", description: "Horário de início no formato HH:MM (ex: '19:00')" },
          end_time: { type: "string", description: "Horário de término no formato HH:MM (ex: '21:00')" },
          address: { type: "string", description: "Endereço completo do local" },
          description: { type: "string", description: "Descrição breve da atividade" },
          notes: { type: "string", description: "Observações adicionais" }
        },
        required: ["title", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_program",
      description: "Atualiza um programa existente no roteiro. Use quando o usuário pedir para editar/modificar um programa já cadastrado.",
      parameters: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "ID do programa a ser atualizado" },
          title: { type: "string", description: "Novo título (opcional)" },
          date: { type: "string", description: "Nova data no formato YYYY-MM-DD (opcional)" },
          start_time: { type: "string", description: "Novo horário de início HH:MM (opcional)" },
          end_time: { type: "string", description: "Novo horário de término HH:MM (opcional)" },
          address: { type: "string", description: "Novo endereço (opcional)" },
          description: { type: "string", description: "Nova descrição (opcional)" },
          notes: { type: "string", description: "Novas observações (opcional)" }
        },
        required: ["program_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_program",
      description: "Remove um programa do roteiro. Use APENAS após confirmação explícita do usuário.",
      parameters: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "ID do programa a ser removido" }
        },
        required: ["program_id"]
      }
    }
  }
];

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
      if (programData.address) {
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

    // Fetch ALL user programs with IDs for tool context
    const { data: allPrograms } = await supabase
      .from('programs')
      .select('id, title, date, start_time, end_time, address, description, notes')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    // Build programs context with IDs for the AI
    let programsContext = "";
    if (allPrograms && allPrograms.length > 0) {
      programsContext = `\n📅 PROGRAMAS EXISTENTES (com IDs para referência):\n`;
      allPrograms.forEach((p: any) => {
        programsContext += `- ID: "${p.id}" | ${p.title} | ${p.date}${p.start_time ? ' às ' + p.start_time : ''}${p.address ? ' | ' + p.address : ''}\n`;
      });
    }

    // Fetch chat history
    let chatHistory: any[] = [];

    if (isGlobalChat) {
      const { data: globalMessages } = await supabase
        .from('global_chat_messages')
        .select('role, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

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

      const allMessages = [
        ...(globalMessages || []).map((m: any) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          source: 'global' as const
        })),
        ...(programMessages || []).map((m: any) => ({
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          source: 'program' as const,
          programTitle: m.programs?.title,
          programDate: m.programs?.date
        }))
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      chatHistory = allMessages.slice(-50).map(m => {
        let content = m.content;
        if (m.source === 'program' && m.role === 'user') {
          content = `[Conversa sobre "${m.programTitle}" (${m.programDate})]: ${m.content}`;
        }
        return { role: m.role, content };
      });

    } else {
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
    specificContext += programsContext;

    if (isGlobalChat) {
      if (!allPrograms || allPrograms.length === 0) {
        specificContext += `\nNenhum programa foi criado ainda. Você pode ajudar o viajante a planejar sua viagem.\n`;
      }
      specificContext += `\nConversando de forma GERAL sobre toda a viagem. Considere TODOS os programas ao responder.`;
      
      specificContext += `\n\n💬 HISTÓRICO DE CONVERSAS:
Você tem acesso a TODAS as conversas anteriores, incluindo:
- Conversas gerais sobre a viagem (chat global)
- Conversas específicas sobre cada programa agendado`;
    } else if (programData) {
      specificContext += `\nPrograma específico sendo visualizado:\n`;
      specificContext += `- Título: ${programData.title}\n`;
      specificContext += `- Data: ${programData.date}\n`;
      if (programData.start_time) specificContext += `- Horário: ${programData.start_time}${programData.end_time ? ' - ' + programData.end_time : ''}\n`;
      if (programData.address) specificContext += `- Local: ${programData.address}\n`;
      if (programData.description) specificContext += `- Descrição: ${programData.description}\n`;
      if (programData.notes) specificContext += `- Observações: ${programData.notes}\n`;
      specificContext += `\nConversando especificamente sobre ESTE programa.`;
    }

    specificContext += `\n\n🛠️ FERRAMENTAS DISPONÍVEIS:
Você pode EXECUTAR AÇÕES no roteiro do usuário usando as ferramentas disponíveis:
- add_program: Quando o usuário pedir para ADICIONAR algo ao roteiro (ex: "adiciona esse restaurante no dia 22")
- update_program: Quando o usuário pedir para EDITAR um programa existente (ex: "muda o horário para 19h")
- delete_program: Quando o usuário pedir para REMOVER um programa (SEMPRE peça confirmação antes!)

REGRAS PARA USO DE FERRAMENTAS:
1. Use a ferramenta apropriada quando o usuário EXPLICITAMENTE pedir para adicionar/editar/remover
2. Para ADICIONAR: extraia título, data, horário e endereço da conversa
3. Para EDITAR: use o ID do programa da lista acima
4. Para REMOVER: SEMPRE peça confirmação antes de executar (ex: "Tem certeza que deseja remover X?")
5. Após executar uma ação, confirme o que foi feito de forma amigável

⚠️ REGRAS CRÍTICAS:
1. SEMPRE considere o contexto completo ao responder
2. Responda DIRETAMENTE ao usuário, NUNCA mencione processos internos
3. Seja prestativo e proativo - sugira adicionar ao roteiro quando fizer sentido
4. Responda em português de forma natural`;

    const tripContext = buildContextualPrompt(travelContext, specificContext);

    // Function to call Perplexity to generate draft answer
    const callPerplexity = async (query: string) => {
      console.log('🔍 Stage 1: Generating Perplexity draft answer...');
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            {
              role: 'system',
              content: `${tripContext}\n\nForneça informações ATUALIZADAS e PRECISAS. Cite fontes verificáveis quando possível.`
            },
            { role: 'user', content: query }
          ],
          temperature: 0.2,
          max_tokens: 1500,
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

    // Function to call Gemini with tools for action execution
    const callGeminiWithTools = async (query: string, perplexityDraft: string) => {
      console.log('🧠 Stage 2: Gemini processing with tools...');
      
      const systemPrompt = `${tripContext}

INFORMAÇÕES ATUALIZADAS (do Perplexity):
${perplexityDraft}

⚠️ REGRAS DE OUTPUT:
- Responda APENAS com o texto final para o usuário
- NUNCA mencione "rascunho", "Perplexity", "auditoria" ou processos internos
- Se precisar executar uma ação (adicionar/editar/remover programa), use a ferramenta apropriada
- Responda em português de forma natural e direta`;

      const messages = [
        { role: 'system', content: systemPrompt },
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
          tools: programTools,
          tool_choice: 'auto',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', response.status, errorText);
        
        if (response.status === 429) {
          throw new Error('RATE_LIMIT');
        }
        if (response.status === 402) {
          throw new Error('PAYMENT_REQUIRED');
        }
        throw new Error('Gemini API request failed');
      }

      const data = await response.json();
      return data.choices[0];
    };

    // Execute tool action on database
    const executeToolAction = async (toolCall: any): Promise<{ type: string; program?: any; error?: string }> => {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      
      console.log(`🔧 Executing tool: ${functionName}`, args);

      switch (functionName) {
        case 'add_program': {
          const { title, date, start_time, end_time, address, description, notes } = args;
          
          const { data, error } = await supabase
            .from('programs')
            .insert({
              user_id: userId,
              title,
              date,
              start_time: start_time || null,
              end_time: end_time || null,
              address: address || null,
              description: description || null,
              notes: notes || null,
            })
            .select()
            .single();

          if (error) {
            console.error('Error adding program:', error);
            return { type: 'add_program', error: error.message };
          }
          
          console.log('✅ Program added:', data);
          return { type: 'add_program', program: data };
        }

        case 'update_program': {
          const { program_id, ...updates } = args;
          
          // Filter out undefined values
          const cleanUpdates: any = {};
          if (updates.title) cleanUpdates.title = updates.title;
          if (updates.date) cleanUpdates.date = updates.date;
          if (updates.start_time !== undefined) cleanUpdates.start_time = updates.start_time || null;
          if (updates.end_time !== undefined) cleanUpdates.end_time = updates.end_time || null;
          if (updates.address !== undefined) cleanUpdates.address = updates.address || null;
          if (updates.description !== undefined) cleanUpdates.description = updates.description || null;
          if (updates.notes !== undefined) cleanUpdates.notes = updates.notes || null;

          const { data, error } = await supabase
            .from('programs')
            .update(cleanUpdates)
            .eq('id', program_id)
            .eq('user_id', userId)
            .select()
            .single();

          if (error) {
            console.error('Error updating program:', error);
            return { type: 'update_program', error: error.message };
          }
          
          console.log('✅ Program updated:', data);
          return { type: 'update_program', program: data };
        }

        case 'delete_program': {
          const { program_id } = args;
          
          // First get the program to return its info
          const { data: programToDelete } = await supabase
            .from('programs')
            .select('*')
            .eq('id', program_id)
            .eq('user_id', userId)
            .single();

          const { error } = await supabase
            .from('programs')
            .delete()
            .eq('id', program_id)
            .eq('user_id', userId);

          if (error) {
            console.error('Error deleting program:', error);
            return { type: 'delete_program', error: error.message };
          }
          
          console.log('✅ Program deleted:', programToDelete);
          return { type: 'delete_program', program: programToDelete };
        }

        default:
          return { type: 'unknown', error: 'Unknown tool' };
      }
    };

    // Two-stage process with tool execution
    let assistantMessage: string;
    let actionExecuted: { type: string; program?: any } | null = null;
    
    try {
      // Stage 1: Get Perplexity draft
      const perplexityDraft = await callPerplexity(message);
      console.log('✅ Perplexity draft generated successfully');
      
      // Stage 2: Gemini with tools
      try {
        const geminiChoice = await callGeminiWithTools(message, perplexityDraft);
        
        // Check if there are tool calls
        if (geminiChoice.message.tool_calls && geminiChoice.message.tool_calls.length > 0) {
          console.log('🔧 Tool calls detected:', geminiChoice.message.tool_calls.length);
          
          // Execute the first tool call
          const toolCall = geminiChoice.message.tool_calls[0];
          const toolResult = await executeToolAction(toolCall);
          
          if (!toolResult.error) {
            actionExecuted = { type: toolResult.type, program: toolResult.program };
          }
          
          // Call Gemini again to generate response after tool execution
          const toolResultMessage = toolResult.error 
            ? `Erro ao executar ação: ${toolResult.error}`
            : `Ação executada com sucesso: ${toolResult.type} - ${JSON.stringify(toolResult.program)}`;
          
          const followUpResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: tripContext },
                ...(chatHistory || []),
                { role: 'user', content: message },
                geminiChoice.message,
                { role: 'tool', tool_call_id: toolCall.id, content: toolResultMessage }
              ],
            }),
          });
          
          if (followUpResponse.ok) {
            const followUpData = await followUpResponse.json();
            assistantMessage = followUpData.choices[0].message.content;
          } else {
            // Fallback message if follow-up fails
            assistantMessage = toolResult.error 
              ? `Desculpe, ocorreu um erro: ${toolResult.error}`
              : `Pronto! ${toolResult.type === 'add_program' ? 'Programa adicionado' : toolResult.type === 'update_program' ? 'Programa atualizado' : 'Programa removido'} com sucesso.`;
          }
        } else {
          // No tool calls, use the response directly
          assistantMessage = geminiChoice.message.content;
        }
        
        console.log('✅ Gemini processing completed');
      } catch (geminiError) {
        console.warn('⚠️ Gemini failed, using Perplexity draft:', geminiError);
        assistantMessage = perplexityDraft;
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

    // Save messages to database
    if (isGlobalChat) {
      await (supabase as any)
        .from('global_chat_messages')
        .insert({
          user_id: userId,
          role: 'user',
          content: message
        });

      await (supabase as any)
        .from('global_chat_messages')
        .insert({
          user_id: userId,
          role: 'assistant',
          content: assistantMessage
        });
    } else {
      await (supabase as any)
        .from('program_chat_messages')
        .insert({
          program_id: programId,
          user_id: userId,
          role: 'user',
          content: message
        });

      await (supabase as any)
        .from('program_chat_messages')
        .insert({
          program_id: programId,
          user_id: userId,
          role: 'assistant',
          content: assistantMessage
        });
    }

    // Return response with action if executed
    const responseBody: any = { message: assistantMessage };
    if (actionExecuted) {
      responseBody.action_executed = actionExecuted;
    }

    return new Response(
      JSON.stringify(responseBody),
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
