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

interface LlmProvider {
  sendMessage: (payload: ChatMessagePayload) => Promise<string>;
}

function getLlmProviderName(): LlmProviderName {
  const provider = (import.meta.env.VITE_LLM_PROVIDER || "perplexity").toLowerCase();
  return provider as LlmProviderName;
}

const buildPerplexityProvider = (): LlmProvider => {
  const callAiChat = async (payload: ChatMessagePayload) => {
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

    return data.message as string;
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
): Promise<string> => {
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
