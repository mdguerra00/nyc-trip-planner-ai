import { useState, useEffect } from "react";
import { Calendar as BigCalendar, momentLocalizer, Event } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "@/styles/calendar.css";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, List, Calendar as CalendarIcon, Menu, MessageSquare } from "lucide-react";
import { Program } from "@/types";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProgramDialog } from "@/components/ProgramDialog";
import { ItineraryDialog } from "@/components/ItineraryDialog";
import GlobalAiChat from "@/components/GlobalAiChat";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

moment.locale("pt-br");
const localizer = momentLocalizer(moment);

const Calendar = () => {
  const { signOut } = useUser();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [itineraryDialogOpen, setItineraryDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [globalChatOpen, setGlobalChatOpen] = useState(false);
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
        setPrograms(data as Program[]);
      const formattedEvents = data.map((program) => {
        // Parse date in local timezone to avoid timezone shift issues
        const [year, month, day] = program.date.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        let start = date;
        let end = new Date(date);
        
        if (program.start_time) {
          const [hours, minutes] = program.start_time.split(":");
          start = new Date(year, month - 1, day);
          start.setHours(parseInt(hours), parseInt(minutes));
        }
        
        if (program.end_time) {
          const [hours, minutes] = program.end_time.split(":");
          end = new Date(year, month - 1, day);
          end.setHours(parseInt(hours), parseInt(minutes));
        } else {
          end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour default
        }

        return {
          title: program.title,
          start,
          end,
          resource: program,
        };
      });
      setEvents(formattedEvents);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleSelectSlot = ({ start }: { start: Date }) => {
    setSelectedDate(start);
    setEditingProgram(null);
    setDialogOpen(true);
  };

  const handleSelectEvent = (event: Event) => {
    setEditingProgram(event.resource as Program);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingProgram(null);
    setSelectedDate(null);
    loadPrograms();
  };

  return (
    <div className="min-h-screen bg-background">
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b bg-card shadow-soft sticky top-0 z-50"
      >
        <div className="container mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Logo/Title */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="p-2 bg-primary rounded-lg flex-shrink-0">
                <CalendarIcon className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold truncate">Viagem NYC</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Planeje sua aventura
                </p>
              </div>
            </div>
            
            {/* Actions - Mobile: Icons only */}
            <div className="flex items-center gap-1">
              {/* Desktop: Com texto */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setItineraryDialogOpen(true)}
                className="hidden sm:flex min-h-[44px]"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Criar Itinerário
              </Button>
              
              {/* Mobile: Menu Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="sm:hidden min-w-[44px] min-h-[44px]">
                    <Menu className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card">
                  <DropdownMenuItem onClick={() => setItineraryDialogOpen(true)}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Criar Itinerário
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setSelectedDate(new Date());
                    setDialogOpen(true);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Programa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/list")}>
                    <List className="w-4 h-4 mr-2" />
                    Ver Lista
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Desktop: Botões separados */}
              <div className="hidden sm:flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/list")} className="min-h-[44px]">
                  <List className="w-4 h-4 mr-2" />
                  Lista
                </Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  setSelectedDate(new Date());
                  setDialogOpen(true);
                }} className="min-h-[44px]">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </Button>
                <Button variant="ghost" size="icon" onClick={handleLogout} className="min-w-[44px] min-h-[44px]">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="container mx-auto px-3 sm:px-4 py-4 pb-20 sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-xl shadow-card p-3 sm:p-6"
          style={{ 
            height: typeof window !== 'undefined' && window.innerWidth < 640 
              ? "calc(100vh - 180px)" 
              : "calc(100vh - 200px)" 
          }}
        >
          <BigCalendar
            localizer={localizer}
            events={events}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            selectable
            views={["month", "week", "day", "agenda"]}
            defaultView="month"
            messages={{
              next: "Próximo",
              previous: "Anterior",
              today: "Hoje",
              month: "Mês",
              week: "Semana",
              day: "Dia",
              agenda: "Agenda",
              date: "Data",
              time: "Hora",
              event: "Evento",
              noEventsInRange: "Nenhum evento neste período",
            }}
          />
        </motion.div>
      </main>

      <ProgramDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        program={editingProgram}
        selectedDate={selectedDate}
      />

      <ItineraryDialog
        open={itineraryDialogOpen}
        onOpenChange={setItineraryDialogOpen}
        onSuccess={loadPrograms}
      />

      {/* Botão flutuante de chat global */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="fixed bottom-20 sm:bottom-8 right-4 z-40"
      >
        <Button
          size="lg"
          onClick={() => setGlobalChatOpen(true)}
          className="rounded-full w-14 h-14 sm:w-16 sm:h-16 shadow-2xl hover:scale-110 transition-transform"
        >
          <MessageSquare className="w-6 h-6" />
        </Button>
      </motion.div>

      {/* Dialog do Chat Global */}
      <Dialog open={globalChatOpen} onOpenChange={setGlobalChatOpen}>
        <DialogContent className="max-w-4xl h-[80vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Assistente de Viagem
            </DialogTitle>
            <DialogDescription>
              Converse sobre toda sua viagem, eventos e peça dicas
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 h-full overflow-hidden">
            <GlobalAiChat onClose={() => setGlobalChatOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Calendar;
