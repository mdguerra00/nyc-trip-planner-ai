import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calendar, Clock, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

const ProgramList = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar programas", variant: "destructive" });
      return;
    }

    if (data) {
      setPrograms(data);
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
        <div className="space-y-4">
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
            programs.map((program, index) => (
              <motion.div
                key={program.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className="hover:shadow-card transition-shadow cursor-pointer"
                  onClick={() => navigate(`/program/${program.id}`)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-start justify-between">
                      <span>{program.title}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {format(new Date(program.date), "dd 'de' MMM", {
                          locale: ptBR,
                        })}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {program.description && (
                      <p className="text-sm text-muted-foreground">
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
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default ProgramList;
