import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Send, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Message, Program, getErrorMessage } from "@/types";
import { buildProgramChatContext, sendChatMessage } from "@/services/llm";

interface AiChatProps {
  program: Program;
  aiSuggestions?: string;
}

export default function AiChat({ program, aiSuggestions }: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Load chat history on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from("program_chat_messages")
          .select("role, content")
          .eq("program_id", program.id)
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
  }, [program.id]);

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
      const assistantMessage = await sendChatMessage(
        program.id,
        buildProgramChatContext(program, aiSuggestions),
        userMessage
      );

      // Add assistant message to UI
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantMessage },
      ]);
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
    try {
      const { error } = await supabase
        .from("program_chat_messages")
        .delete()
        .eq("program_id", program.id);

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
      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Carregando conversa...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" />
          <h3 className="font-semibold text-sm sm:text-base">Converse com a IA</h3>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearChat}
            disabled={isLoading}
            className="min-w-[48px] min-h-[48px]"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* Messages container */}
        <div className="max-h-[40dvh] sm:max-h-[50dvh] overflow-y-auto space-y-3 pr-1 -mr-1">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center py-8 text-muted-foreground text-sm text-center px-4"
              >
                Faça uma pergunta sobre este evento
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
        <div className="flex gap-3 pt-4 border-t">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Sua pergunta..."
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
    </Card>
  );
}