import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Trash2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface GlobalAiChatProps {
  onClose?: () => void;
}

export default function GlobalAiChat({ onClose }: GlobalAiChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load chat history on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from("global_chat_messages")
          .select("role, content")
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
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Add user message to UI immediately
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: userMessage,
          programId: null, // Indicates global chat mode
        },
      });

      if (error) {
        throw error;
      }

      // Add assistant message to UI
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error);
      
      // Remove user message on error
      setMessages((prev) => prev.slice(0, -1));
      
      let errorTitle = "Erro ao enviar mensagem";
      let errorDescription = error.message || "Tente novamente mais tarde";
      
      // Handle specific error codes
      if (error.message?.includes("429") || error.message?.toLowerCase().includes("rate limit")) {
        errorTitle = "Limite de requisições atingido";
        errorDescription = "Você está fazendo muitas perguntas. Por favor, aguarde um momento antes de tentar novamente.";
      } else if (error.message?.includes("402") || error.message?.toLowerCase().includes("insufficient credits")) {
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
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("global_chat_messages")
        .delete()
        .eq("user_id", user.id);

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
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-base">Chat Global da Viagem</h3>
            <p className="text-xs text-muted-foreground">Pergunte sobre qualquer aspecto da sua viagem</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearChat}
            disabled={isLoading}
            className="min-w-[44px] min-h-[44px]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col space-y-4 min-h-0">
        {/* Messages container */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center justify-center h-full text-center p-8"
              >
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-sm max-w-md">
                  Faça qualquer pergunta sobre sua viagem, eventos criados, dicas de NYC ou planejamento geral.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Exemplos: "Quais programas tenho amanhã?" ou "Me sugira um restaurante"
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
                    className={`rounded-lg px-3 py-2 sm:px-4 sm:py-2 max-w-[85%] sm:max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm sm:text-base whitespace-pre-wrap break-words">{msg.content}</p>
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
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="flex gap-2 pt-4 border-t">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Pergunte sobre sua viagem, dicas, eventos..."
            disabled={isLoading}
            className="flex-1 text-base min-h-[44px]"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="min-w-[44px] min-h-[44px]"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
