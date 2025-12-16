import { supabase } from "@/integrations/supabase/client";
import { Program } from "@/types";

export type LlmProviderName = "perplexity";

export interface ChatMessagePayload {
  message: string;
  programId?: string | null;
  programData?: ProgramChatContext;
}

export interface ProgramChatContext {
  title: string;
  description?: string;
  address?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  aiSuggestions?: string;
}

export interface ActionExecuted {
  type: 'add_program' | 'update_program' | 'delete_program';
  program?: Program;
}

export interface ChatResponse {
  message: string;
  action_executed?: ActionExecuted;
}

interface LlmProvider {
  sendMessage: (payload: ChatMessagePayload) => Promise<ChatResponse>;
}

function getLlmProviderName(): LlmProviderName {
  const provider = (import.meta.env.VITE_LLM_PROVIDER || "perplexity").toLowerCase();
  return provider as LlmProviderName;
}

const buildPerplexityProvider = (): LlmProvider => {
  const callAiChat = async (payload: ChatMessagePayload): Promise<ChatResponse> => {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: {
        message: payload.message,
        programId: payload.programId ?? null,
        programData: payload.programData,
      },
    });

    if (error) {
      throw error;
    }

    return {
      message: data.message as string,
      action_executed: data.action_executed,
    };
  };

  return {
    sendMessage: callAiChat,
  };
};

export const buildProgramChatContext = (
  program: Program,
  aiSuggestions?: string
): ProgramChatContext => ({
  title: program.title,
  description: program.description || "",
  address: program.address || "",
  date: program.date,
  start_time: program.start_time || "",
  end_time: program.end_time || "",
  aiSuggestions: aiSuggestions || "",
});

export const sendChatMessage = async (
  programId: string | null,
  programData: ProgramChatContext | undefined,
  message: string
): Promise<ChatResponse> => {
  const providerName = getLlmProviderName();

  switch (providerName) {
    case "perplexity": {
      const provider = buildPerplexityProvider();
      return provider.sendMessage({ programId, programData, message });
    }
    default:
      throw new Error(`LLM provider not supported: ${providerName}`);
  }
};
