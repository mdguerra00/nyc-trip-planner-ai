import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calendar, Clock, MapPin, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Program, getErrorMessage } from "@/types";
import { generateDayPDF } from "@/utils/generateDayPDF";
import { useUser } from "@/hooks/useUser";
import { Badge } from "@/components/ui/badge";
import { useCallback } from "react";
import { listPrograms } from "@/services/api";

const ProgramList = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userId } = useUser();

  const loadPrograms = useCallback(async () => {
    const { data, error } = await listPrograms();

    if (error) {
      toast({
        title: "Erro ao carregar programas",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setPrograms((data as Program[]) || []);
  }, [toast]);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  // Agrupar programas por data
  const programsByDate = useMemo(() => {
    const grouped: Record<string, Program[]> = {};
    programs.forEach(program => {
      if (!grouped[program.date]) {
        grouped[program.date] = [];
      }
      grouped[program.date].push(program);
    });
    return grouped;
  }, [programs]);

  const handleGeneratePDF = async (date: string) => {
    if (!userId) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado",
        variant: "destructive"
      });
      return;
    }

    setGeneratingPDF(date);
    try {
      await generateDayPDF(date, userId);
      toast({
        title: "PDF gerado com sucesso!",
        description: "O arquivo foi baixado automaticamente",
      });
    } catch (error: unknown) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: getErrorMessage(error) || "Tente novamente",
        variant: "destructive"
      });
    } finally {
      setGeneratingPDF(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b bg-card shadow-soft"
      >
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Programas</h1>
            <p className="text-sm text-muted-foreground">Lista cronológica</p>
          </div>
        </div>
      </motion.header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="space-y-6">
          {programs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <p className="text-muted-foreground">
                Nenhum programa cadastrado ainda
              </p>
            </motion.div>
          ) : (
            Object.entries(programsByDate).map(([date, dayPrograms], dateIndex) => {
              const [year, month, day] = date.split('-').map(Number);
              const localDate = new Date(year, month - 1, day);
              
              return (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: dateIndex * 0.1 }}
                  className="space-y-3"
                >
                  {/* Cabeçalho do dia com botão de PDF */}
                  <div className="flex items-center justify-between gap-4 sticky top-0 bg-background/95 backdrop-blur-sm py-3 z-10">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-primary" />
                      <div>
                        <h2 className="text-xl font-bold">
                          {format(localDate, "dd 'de' MMMM", { locale: ptBR })}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {format(localDate, "EEEE", { locale: ptBR })}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {dayPrograms.length} {dayPrograms.length === 1 ? 'programa' : 'programas'}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGeneratePDF(date)}
                      disabled={generatingPDF === date}
                    >
                      {generatingPDF === date ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="mr-2"
                          >
                            <FileDown className="w-4 h-4" />
                          </motion.div>
                          Gerando...
                        </>
                      ) : (
                        <>
                          <FileDown className="w-4 h-4 mr-2" />
                          Gerar PDF
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Programas do dia */}
                  <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                    {dayPrograms.map((program, programIndex) => (
                      <motion.div
                        key={program.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: dateIndex * 0.1 + programIndex * 0.05 }}
                      >
                        <Card
                          className="hover:shadow-card transition-shadow cursor-pointer"
                          onClick={() => navigate(`/program/${program.id}`)}
                        >
                          <CardHeader>
                            <CardTitle className="text-base">
                              {program.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {program.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {program.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-4 text-sm">
                              {program.start_time && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="w-4 h-4" />
                                  <span>
                                    {program.start_time}
                                    {program.end_time && ` - ${program.end_time}`}
                                  </span>
                                </div>
                              )}
                              {program.address && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <MapPin className="w-4 h-4" />
                                  <span className="truncate">{program.address}</span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};

export default ProgramList;
