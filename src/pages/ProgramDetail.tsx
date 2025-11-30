import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSwipeable } from "react-swipeable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Calendar, Clock, MapPin, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTransition } from "@/components/PageTransition";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProgramDialog } from "@/components/ProgramDialog";
import AiChat from "@/components/AiChat";
import { Program, FaqItem } from "@/types";
import { Json } from "@/integrations/supabase/types";
import { useUser } from "@/hooks/useUser";
import {
  deleteProgram as deleteProgramApi,
  getProgramDetail,
  invokeFunction,
  updateProgram,
} from "@/services/api";

const ProgramDetail = () => {
  const { id } = useParams();
  const { userId } = useUser();
  const [program, setProgram] = useState<Program | null>(null);
  const [notes, setNotes] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState("");
  const [aiFaq, setAiFaq] = useState<FaqItem[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadProgram = useCallback(async () => {
    if (!id) return;

    const { data, error } = await getProgramDetail(id);

    if (error) {
      toast({
        title: "Erro ao carregar programa",
        description: error.message,
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    if (data) {
      setProgram(data);
      setNotes(data.notes || "");
      setAiSuggestions(data.ai_suggestions || "");
      if (data.ai_faq && Array.isArray(data.ai_faq)) {
        setAiFaq(data.ai_faq as Array<{ question: string; answer: string }>);
      }
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    if (id) {
      void loadProgram();
    }
  }, [id, loadProgram]);

  const saveNotes = async () => {
    if (!program) return;

    const { error } = await updateProgram(program.id, { notes });

    if (error) {
      toast({
        title: "Erro ao salvar notas",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Notas salvas com sucesso!" });
    }
  };

  const getAiSuggestions = async () => {
    if (!program) return;

    setLoadingAi(true);
    try {
      const { data, error } = await invokeFunction<{ suggestions: string }>(
        "ai-suggestions",
        {
          program,
          userId: userId,
        }
      );

      if (error) throw new Error(error.message);

      const suggestions = data?.suggestions || "";
      setAiSuggestions(suggestions);

      const { data: faqData, error: faqError } = await invokeFunction<{ faq: FaqItem[] }>(
        "generate-faq",
        {
          suggestions,
          userId: userId,
          programDate: program.date,
        }
      );

      if (faqError) throw new Error(faqError.message);

      const faq = (faqData?.faq || []) as FaqItem[];
      setAiFaq(faq);

      const serializedFaq = faq as unknown as Json;

      const { data: updatedProgram, error: updateError } = await updateProgram(program.id, {
        ai_suggestions: suggestions,
        ai_faq: serializedFaq,
      });

      if (updateError) throw new Error(updateError.message);

      if (updatedProgram) {
        setProgram(updatedProgram);
      }

      toast({ title: "Informações geradas com sucesso!" });
    } catch (error: unknown) {
      toast({
        title: "Erro ao buscar sugestões",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoadingAi(false);
    }
  };

  const exploreTopic = async (index: number, question: string, answer: string) => {
    if (!program || !aiSuggestions) return;

    const updatedFaq = [...aiFaq];
    updatedFaq[index].loadingDetails = true;
    setAiFaq(updatedFaq);

    try {
      const { data, error } = await invokeFunction<{ details: string }>("explore-topic", {
        topic: `${question}\n${answer}`,
        context: aiSuggestions,
        userId: userId,
        programDate: program.date,
      });

      if (error) throw new Error(error.message);

      updatedFaq[index].details = data?.details;
      updatedFaq[index].loadingDetails = false;
      setAiFaq(updatedFaq);

      const serializedFaq = updatedFaq as unknown as Json;

      const { error: updateError } = await updateProgram(program.id, { ai_faq: serializedFaq });

      if (updateError) {
        console.error("Erro ao salvar detalhes:", updateError);
      } else {
        setProgram({ ...program, ai_faq: serializedFaq });
      }
    } catch (error: unknown) {
      toast({
        title: "Erro ao explorar tópico",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      updatedFaq[index].loadingDetails = false;
      setAiFaq(updatedFaq);
    }
  };

  const deleteProgram = async () => {
    if (!program) return;

    console.log("Deletando programa:", program.id);

    const { error } = await deleteProgramApi(program.id);

    if (error) {
      console.error("Erro ao deletar:", error);
      toast({ 
        title: "Erro ao deletar programa", 
        description: error.message,
        variant: "destructive" 
      });
    } else {
      console.log("Programa deletado com sucesso");
      toast({ title: "Programa deletado com sucesso!" });
      navigate("/");
    }
  };

  const handlers = useSwipeable({
    onSwipedRight: () => navigate("/"),
    trackMouse: false
  });

  if (!program) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div {...handlers} className="min-h-screen bg-background pb-6 sm:pb-0">
        <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b bg-card shadow-soft sticky top-0 z-50"
      >
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          {/* Mobile: Stack vertical */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Left side: Voltar + Info */}
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate("/")}
                className="min-w-[44px] min-h-[44px] flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold truncate">{program.title}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {(() => {
                    const [year, month, day] = program.date.split('-').map(Number);
                    const localDate = new Date(year, month - 1, day);
                    return format(localDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
                  })()}
                </p>
              </div>
            </div>
            
            {/* Right side: Actions */}
            <div className="flex gap-2 ml-auto sm:ml-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditDialog(true)}
                className="min-h-[44px] flex-1 sm:flex-none"
              >
                <Edit className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setShowDeleteDialog(true)}
                className="min-w-[44px] min-h-[44px]"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl space-y-4 sm:space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {program.description && (
                <div>
                  <h3 className="font-semibold mb-2">Descrição</h3>
                  <p className="text-muted-foreground">{program.description}</p>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2">
                {program.start_time && (
                  <div className="flex items-center gap-2 min-h-[44px]">
                    <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <span className="text-base">
                      {program.start_time}
                      {program.end_time && ` - ${program.end_time}`}
                    </span>
                  </div>
                )}
                {program.address && (
                  <div className="flex items-center gap-2 min-h-[44px]">
                    <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <span className="text-base break-words">{program.address}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Observações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Adicione suas observações e notas aqui..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
              />
              <Button onClick={saveNotes}>Salvar Observações</Button>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-secondary" />
                Informações com IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!aiSuggestions && (
                <Button
                  onClick={getAiSuggestions}
                  disabled={loadingAi}
                  className="w-full"
                  variant="secondary"
                >
                  {loadingAi ? "Gerando informações..." : "Gerar Informações sobre a Região"}
                </Button>
              )}
              
              {aiSuggestions && (
                <>
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2">Sobre a Região</h3>
                    <p className="whitespace-pre-wrap text-sm">{aiSuggestions}</p>
                  </div>

                  {aiFaq.length > 0 && (
                    <div className="mt-6 space-y-4">
                      <h3 className="font-semibold text-lg">Perguntas Frequentes</h3>
                      {aiFaq.map((item, index) => (
                        <div key={index} className="border rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold text-primary">{item.question}</h4>
                          <p className="text-sm text-muted-foreground">{item.answer}</p>
                          
                          {item.details && (
                            <div className="mt-3 p-3 bg-secondary/10 rounded-lg border-l-4 border-secondary">
                              <p className="text-sm whitespace-pre-wrap">{item.details}</p>
                            </div>
                          )}
                          
                          <Button
                            onClick={() => exploreTopic(index, item.question, item.answer)}
                            disabled={item.loadingDetails}
                            size="sm"
                            variant="outline"
                            className="w-full mt-2"
                          >
                            <Sparkles className="w-3 h-3 mr-2" />
                            {item.loadingDetails
                              ? "Explorando..."
                              : item.details
                              ? "Atualizar Detalhes"
                              : "Explorar Mais Sobre Isso"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={getAiSuggestions}
                    disabled={loadingAi}
                    variant="ghost"
                    size="sm"
                    className="w-full mt-4"
                  >
                    {loadingAi ? "Gerando..." : "Regenerar Informações"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {aiSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <AiChat program={program} aiSuggestions={aiSuggestions} />
          </motion.div>
        )}
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O programa será permanentemente
              deletado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProgram}>
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProgramDialog
        open={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          loadProgram();
        }}
        program={program}
        />
      </div>
    </PageTransition>
  );
};

export default ProgramDetail;
