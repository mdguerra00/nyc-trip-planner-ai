import { Json } from "@/integrations/supabase/types";

// Tipos de domínio do app
export interface Program {
  id: string;
  title: string;
  description?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  address?: string;
  notes?: string;
  ai_suggestions?: string | null;
  ai_faq?: Json | null;
}

export interface FaqItem {
  question: string;
  answer: string;
  details?: string;
  loadingDetails?: boolean;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

// Tipos de autenticação
export interface User {
  id: string;
  email?: string;
}

// Tipo para erros da aplicação
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Erro desconhecido";
}

export * from "./places";
