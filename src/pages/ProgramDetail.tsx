import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Calendar, Clock, MapPin, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

interface Program {
  id: string;
  title: string;
  description?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  address?: string;
  notes?: string;
}

const ProgramDetail = () => {
  const { id } = useParams();
  const [program, setProgram] = useState<Program | null>(null);
  const [notes, setNotes] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (id) {
      loadProgram();
    }
  }, [id]);

  const loadProgram = async () => {
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      toast({ title: "Erro ao carregar programa", variant: "destructive" });
      navigate("/");
      return;
    }

    if (data) {
      setProgram(data);
      setNotes(data.notes || "");
    }
  };

  const saveNotes = async () => {
    if (!program) return;

    const { error } = await supabase
      .from("programs")
      .update({ notes })
      .eq("id", program.id);

    if (error) {
      toast({ title: "Erro ao salvar notas", variant: "destructive" });
    } else {
      toast({ title: "Notas salvas com sucesso!" });
    }
  };

  const getAiSuggestions = async () => {
    if (!program) return;

    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-suggestions", {
        body: { program },
      });

      if (error) throw error;

      setAiSuggestions(data.suggestions);
    } catch (error: any) {
      toast({
        title: "Erro ao buscar sugestões",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingAi(false);
    }
  };

  const deleteProgram = async () => {
    if (!program) return;

    const { error } = await supabase
      .from("programs")
      .delete()
      .eq("id", program.id);

    if (error) {
      toast({ title: "Erro ao deletar programa", variant: "destructive" });
    } else {
      toast({ title: "Programa deletado com sucesso!" });
      navigate("/");
    }
  };

  if (!program) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b bg-card shadow-soft"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{program.title}</h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(program.date), "dd 'de' MMMM 'de' yyyy", {
                  locale: ptBR,
                })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.header>

      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {program.start_time && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>
                      {program.start_time}
                      {program.end_time && ` - ${program.end_time}`}
                    </span>
                  </div>
                )}
                {program.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{program.address}</span>
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
                Sugestões com IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={getAiSuggestions}
                disabled={loadingAi}
                className="w-full"
                variant="secondary"
              >
                {loadingAi ? "Buscando sugestões..." : "Buscar Informações com IA"}
              </Button>
              {aiSuggestions && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="whitespace-pre-wrap">{aiSuggestions}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
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
  );
};

export default ProgramDetail;
