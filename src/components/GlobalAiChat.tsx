import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Sparkles, CheckCircle2, PlusCircle, Pencil, Trash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Message, getErrorMessage } from "@/types";
import { useUser } from "@/hooks/useUser";
import { sendChatMessage, ActionExecuted } from "@/services/llm";
import { useQueryClient } from "@tanstack/react-query";

interface GlobalAiChatProps {
  onClose?: () => void;
}

export default function GlobalAiChat({ onClose }: GlobalAiChatProps) {
  const { userId } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load chat history on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!userId) return;
      
      try {
        const { data, error } = await supabase
          .from("global_chat_messages")
          .select("role, content")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Erro ao carregar histórico:", error);
        } else if (data) {
          setMessages(data as Message[]);
        }
      } catch (error) {
        console.error("Erro ao carregar histórico:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadChatHistory();
  }, [userId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleActionExecuted = (action: ActionExecuted) => {
    const actionLabels = {
      add_program: { icon: PlusCircle, label: "Programa adicionado", color: "text-green-600" },
      update_program: { icon: Pencil, label: "Programa atualizado", color: "text-blue-600" },
      delete_program: { icon: Trash, label: "Programa removido", color: "text-red-600" },
    };

    const config = actionLabels[action.type];
    const Icon = config.icon;

    toast({
      title: (
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span>{config.label}</span>
        </div>
      ) as any,
      description: action.program?.title || "Ação executada com sucesso",
    });

    // Invalidate queries to refresh calendar/list
    queryClient.invalidateQueries({ queryKey: ["programs"] });
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Add user message to UI immediately
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const response = await sendChatMessage(null, undefined, userMessage);

      // Add assistant message to UI
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.message },
      ]);

      // Handle action if executed
      if (response.action_executed) {
        handleActionExecuted(response.action_executed);
      }
    } catch (error: unknown) {
      console.error("Erro ao enviar mensagem:", error);
      
      // Remove user message on error
      setMessages((prev) => prev.slice(0, -1));
      
      const errorMessage = getErrorMessage(error);
      let errorTitle = "Erro ao enviar mensagem";
      let errorDescription = errorMessage || "Tente novamente mais tarde";
      
      // Handle specific error codes
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate limit")) {
        errorTitle = "Limite de requisições atingido";
        errorDescription = "Você está fazendo muitas perguntas. Por favor, aguarde um momento antes de tentar novamente.";
      } else if (errorMessage.includes("402") || errorMessage.toLowerCase().includes("insufficient credits")) {
        errorTitle = "Créditos insuficientes";
        errorDescription = "Os créditos de IA foram esgotados. Entre em contato com o suporte.";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    if (!userId) return;
    
    try {
      const { error } = await supabase
        .from("global_chat_messages")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      setMessages([]);
      toast({
        title: "Conversa limpa",
        description: "Todas as mensagens foram removidas",
      });
    } catch (error) {
      console.error("Erro ao limpar conversa:", error);
      toast({
        title: "Erro ao limpar conversa",
        description: "Tente novamente mais tarde",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center py-8 h-full">
        <div className="text-muted-foreground">Carregando conversa...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 pb-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-base">Chat da Viagem</h3>
            <p className="text-xs text-muted-foreground truncate">Pergunte ou peça para adicionar ao roteiro</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearChat}
            disabled={isLoading}
            className="min-w-[48px] min-h-[48px] flex-shrink-0"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Messages container */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 -mr-1">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center justify-center h-full text-center px-4 py-8"
              >
                <Sparkles className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">
                  Faça perguntas ou peça para adicionar ao roteiro.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Ex: "Adiciona o Carbone dia 22 às 19h" ou "Sugira restaurantes"
                </p>
              </motion.div>
            ) : (
              messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[88%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce" />
                  <div
                    className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2.5 h-2.5 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area - iPhone optimized */}
        <div className="flex gap-3 pt-4 mt-auto border-t">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Digite sua pergunta..."
            disabled={isLoading}
            rows={1}
            className="flex-1 text-[16px] min-h-[56px] max-h-[120px] resize-none rounded-2xl py-4 px-4"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="min-w-[56px] min-h-[56px] rounded-2xl flex-shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
