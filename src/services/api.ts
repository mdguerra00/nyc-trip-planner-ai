import { supabase } from "@/integrations/supabase/client";
import { Program, Message } from "@/types";

export interface ApiError {
  message: string;
  status?: number;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

type SupabaseError = { message?: string; status?: number } | null;

const formatError = (error: SupabaseError): ApiError => ({
  message: error?.message || "Erro desconhecido",
  status: error?.status,
});

export const listPrograms = async (): Promise<ApiResult<Program[]>> => {
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) return { data: null, error: formatError(error) };

  return { data: (data ?? []) as Program[], error: null };
};

export const getProgramDetail = async (id: string): Promise<ApiResult<Program>> => {
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return { data: null, error: formatError(error) };

  return { data: data as Program, error: null };
};

export const updateProgram = async (
  id: string,
  updates: Partial<Pick<Program, "notes" | "ai_suggestions" | "ai_faq">>
): Promise<ApiResult<Program>> => {
  const { data, error } = await supabase
    .from("programs")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) return { data: null, error: formatError(error) };

  return { data: data as Program, error: null };
};

export const deleteProgram = async (id: string): Promise<ApiResult<boolean>> => {
  const { error } = await supabase.from("programs").delete().eq("id", id);

  if (error) return { data: null, error: formatError(error) };

  return { data: true, error: null };
};

export const getChatMessages = async (
  programId: string
): Promise<ApiResult<Message[]>> => {
  const { data, error } = await supabase
    .from("program_chat_messages")
    .select("role, content")
    .eq("program_id", programId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: formatError(error) };

  return { data: (data ?? []) as Message[], error: null };
};

export const saveChatMessage = async (
  programId: string,
  role: Message["role"],
  content: string
): Promise<ApiResult<boolean>> => {
  const { error } = await supabase.from("program_chat_messages").insert({
    program_id: programId,
    role,
    content,
  });

  if (error) return { data: null, error: formatError(error) };

  return { data: true, error: null };
};

export const invokeFunction = async <T>(
  name: string,
  payload: Record<string, unknown>
): Promise<ApiResult<T>> => {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });

  if (error) return { data: null, error: formatError(error) };

  return { data: data as T, error: null };
};
