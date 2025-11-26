import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Search, Brain, MapPin, Clock, Calendar, ExternalLink } from "lucide-react";
import { useUser } from "@/hooks/useUser";

interface Attraction {
  id: string;
  name: string;
  type: string;
  address: string;
  hours: string;
  description: string;
  estimatedDuration: number;
  neighborhood: string;
  imageUrl?: string;
  infoUrl?: string;
}

interface OrganizedProgram {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  address: string;
  notes: string;
}

interface ItineraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ItineraryDialog({ open, onOpenChange, onSuccess }: ItineraryDialogProps) {
  const { toast } = useToast();
  const { userId } = useUser();
  const [step, setStep] = useState(1);
  
  // Step 1: Configuration
  const [region, setRegion] = useState("");
  const [date, setDate] = useState("");
  const [dateTimestamp, setDateTimestamp] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("22:00");
  
  // Step 2: Attractions
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [selectedAttractions, setSelectedAttractions] = useState<string[]>([]);
  const [loadingAttractions, setLoadingAttractions] = useState(false);
  const [userSuggestion, setUserSuggestion] = useState("");
  
  // Step 3: Organization
  const [organizedPrograms, setOrganizedPrograms] = useState<OrganizedProgram[]>([]);
  const [itinerarySummary, setItinerarySummary] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loadingOrganization, setLoadingOrganization] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetDialog = () => {
    setStep(1);
    setRegion("");
    setDate("");
    setStartTime("09:00");
    setEndTime("22:00");
    setAttractions([]);
    setSelectedAttractions([]);
    setOrganizedPrograms([]);
    setItinerarySummary("");
    setWarnings([]);
  };

  const handleDiscoverAttractions = async (appendMode = false) => {
    if (!region || !date) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha região e data",
        variant: "destructive",
      });
      return;
    }

    // Validate date is not in the past
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      toast({
        title: "Data inválida",
        description: "Não é possível criar itinerário para datas passadas",
        variant: "destructive",
      });
      return;
    }

    console.log('🔍 DEBUG - Discovering attractions:', { region, date, dateTimestamp, appendMode });

    setLoadingAttractions(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-attractions', {
        body: { 
          region, 
          date, 
          requestMore: appendMode,
          userId: userId,
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const newAttractions = data.attractions || [];
      
      if (appendMode) {
        // Add to existing attractions
        setAttractions(prev => [...prev, ...newAttractions]);
      } else {
        // Replace attractions
        setAttractions(newAttractions);
        setStep(2);
      }
      
      toast({
        title: appendMode ? "✨ Mais sugestões encontradas!" : "🔍 Atrações descobertas!",
        description: `${newAttractions.length} ${appendMode ? 'novas' : ''} sugestões para ${region}`,
      });

    } catch (error: any) {
      console.error('Error discovering attractions:', error);
      toast({
        title: "Erro ao buscar atrações",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoadingAttractions(false);
    }
  };

  const handleAddUserSuggestion = async () => {
    if (!userSuggestion.trim()) {
      toast({
        title: "Digite uma sugestão",
        description: "Informe o nome do local que deseja adicionar",
        variant: "destructive",
      });
      return;
    }

    setLoadingAttractions(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-attractions', {
        body: { 
          region, 
          date, 
          userSuggestion: userSuggestion.trim(),
          userId: userId,
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const newAttractions = data.attractions || [];
      
      // Add to existing attractions
      setAttractions(prev => [...prev, ...newAttractions]);
      setUserSuggestion("");
      
      toast({
        title: "✅ Sugestão adicionada!",
        description: `${newAttractions.length} atração(ões) encontrada(s) para "${userSuggestion}"`,
      });

    } catch (error: any) {
      console.error('Error adding user suggestion:', error);
      toast({
        title: "Erro ao adicionar sugestão",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoadingAttractions(false);
    }
  };

  const handleOrganizeItinerary = async () => {
    if (selectedAttractions.length === 0) {
      toast({
        title: "Selecione atrações",
        description: "Escolha pelo menos uma atração para organizar",
        variant: "destructive",
      });
      return;
    }

    // Validate date state is still present
    if (!date || !dateTimestamp) {
      toast({
        title: "Erro interno",
        description: "Data perdida. Por favor, reinicie o processo.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    console.log('🧠 DEBUG - Organizing itinerary:', { 
      date, 
      dateTimestamp,
      region,
      selectedCount: selectedAttractions.length 
    });

    setLoadingOrganization(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const selectedAttractionsData = attractions.filter(a => 
        selectedAttractions.includes(a.id)
      );

      const { data, error } = await supabase.functions.invoke('organize-itinerary', {
        body: {
          selectedAttractions: selectedAttractionsData,
          date,
          startTime,
          endTime,
          region
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      setOrganizedPrograms(data.itinerary?.programs || []);
      setItinerarySummary(data.itinerary?.summary || "");
      setWarnings(data.itinerary?.warnings || []);
      setStep(3);
      
      toast({
        title: "🧠 Itinerário organizado!",
        description: `${data.itinerary?.programs?.length || 0} programas criados com IA`,
      });

    } catch (error: any) {
      console.error('Error organizing itinerary:', error);
      
      // Extrair mensagem de erro mais descritiva
      let errorMessage = "Tente novamente";
      if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao organizar itinerário",
        description: errorMessage,
        variant: "destructive",
        duration: 7000, // Mais tempo para ler mensagens longas
      });
      
      // Se for erro de região não encontrada, sugerir voltar para Step 1
      if (errorMessage.toLowerCase().includes('região') || 
          errorMessage.toLowerCase().includes('não encontr')) {
        setTimeout(() => {
          toast({
            title: "💡 Sugestão",
            description: "Tente ajustar a região ou data e descobrir atrações novamente",
            duration: 5000,
          });
        }, 1000);
      }
    } finally {
      setLoadingOrganization(false);
    }
  };

  const handleConfirmAndSave = async () => {
    // Final validation before saving
    if (!date || !dateTimestamp) {
      toast({
        title: "Erro de validação",
        description: "Data não encontrada. Reinicie o processo.",
        variant: "destructive"
      });
      setStep(1);
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for existing programs on this date
      const { data: existingPrograms } = await supabase
        .from('programs')
        .select('start_time, end_time, title')
        .eq('user_id', user.id)
        .eq('date', date);

      if (existingPrograms && existingPrograms.length > 0) {
        console.log('⚠️ Found existing programs on this date:', existingPrograms);
        toast({
          title: "⚠️ Atenção",
          description: `Já existem ${existingPrograms.length} programa(s) nesta data. Você pode revisar conflitos depois.`,
          duration: 5000,
        });
      }

      // Insert all programs
      const programsToInsert = organizedPrograms.map(prog => ({
        user_id: user.id,
        title: prog.title,
        description: prog.description,
        date: date,
        start_time: prog.start_time,
        end_time: prog.end_time,
        address: prog.address,
        notes: prog.notes,
      }));

      console.log('💾 DEBUG - Saving programs:', {
        date,
        dateTimestamp,
        dateObject: new Date(date).toISOString(),
        programCount: programsToInsert.length,
        firstProgram: programsToInsert[0],
        region
      });

      const { error } = await supabase
        .from('programs')
        .insert(programsToInsert);

      if (error) throw error;

      toast({
        title: "✅ Itinerário criado com sucesso!",
        description: `${programsToInsert.length} programas adicionados em ${new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')} para ${region}`,
        duration: 5000,
      });

      resetDialog();
      onOpenChange(false);
      onSuccess();

    } catch (error: any) {
      console.error('Error saving programs:', error);
      toast({
        title: "Erro ao salvar programas",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleAttraction = (id: string) => {
    setSelectedAttractions(prev =>
      prev.includes(id) 
        ? prev.filter(a => a !== id)
        : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetDialog();
      onOpenChange(open);
    }}>
      <DialogContent className="max-h-[95vh] w-[95vw] sm:max-w-[90vw] lg:max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Criar Itinerário Inteligente
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Configure a região e data para descobrir atrações"}
            {step === 2 && "Selecione as atrações que deseja visitar"}
            {step === 3 && "Confira o itinerário organizado pela IA"}
          </DialogDescription>
          
          {/* Contextual header with date and region */}
          {(date || region) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              {date && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long',
                    year: 'numeric'
                  })}
                </Badge>
              )}
              {region && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {region}
                </Badge>
              )}
            </div>
          )}
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className={`w-10 h-10 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${step >= 1 ? 'bg-primary text-primary-foreground scale-110' : 'bg-muted text-muted-foreground'}`}>
              1
            </div>
            <div className={`h-1 w-8 sm:w-12 transition-all ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`w-10 h-10 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${step >= 2 ? 'bg-primary text-primary-foreground scale-110' : 'bg-muted text-muted-foreground'}`}>
              2
            </div>
            <div className={`h-1 w-8 sm:w-12 transition-all ${step >= 3 ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`w-10 h-10 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${step >= 3 ? 'bg-primary text-primary-foreground scale-110' : 'bg-muted text-muted-foreground'}`}>
              3
            </div>
          </div>
        </DialogHeader>
        
        {/* Content com scroll */}
        <div className="flex-1 overflow-y-auto px-1">

        {/* Step 1: Configuration */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="region">Região de NYC *</Label>
              <Input
                id="region"
                placeholder="Ex: Brooklyn, Lower Manhattan, Upper West Side"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data do Itinerário *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setDate(newDate);
                  setDateTimestamp(new Date(newDate).getTime());
                  console.log('📅 Date updated:', { newDate, timestamp: new Date(newDate).getTime() });
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Hora de Início</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">Hora de Fim</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <Button 
              onClick={() => handleDiscoverAttractions()}
              disabled={loadingAttractions || !region || !date}
              className="w-full"
            >
              {loadingAttractions ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Descobrindo atrações com Perplexity...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Descobrir Atrações
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 2: Select Attractions */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  Perplexity
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedAttractions.length} de {attractions.length} selecionadas
                </span>
              </div>
            </div>

            {/* User suggestion input */}
            <Card className="p-4 bg-muted/30">
              <div className="space-y-3">
                <Label htmlFor="userSuggestion" className="text-sm font-medium">
                  Adicionar local específico
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="userSuggestion"
                    placeholder="Ex: Brooklyn Brewery, The Met, Central Park"
                    value={userSuggestion}
                    onChange={(e) => setUserSuggestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !loadingAttractions) {
                        handleAddUserSuggestion();
                      }
                    }}
                    disabled={loadingAttractions}
                  />
                  <Button 
                    onClick={handleAddUserSuggestion}
                    disabled={loadingAttractions || !userSuggestion.trim()}
                    size="sm"
                  >
                    {loadingAttractions ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-1" />
                        Adicionar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="space-y-3 max-h-[50vh] sm:max-h-[400px] overflow-y-auto">
              {attractions.map((attraction) => (
                <Card key={attraction.id} className="p-3 sm:p-4 hover:border-primary transition-colors">
                  <div className="flex gap-3">
                    {/* Checkbox maior */}
                    <Checkbox
                      checked={selectedAttractions.includes(attraction.id)}
                      onCheckedChange={() => toggleAttraction(attraction.id)}
                      className="mt-1 scale-125 sm:scale-100"
                    />
                    
                    {/* Image thumbnail */}
                    {attraction.imageUrl && (
                      <img 
                        src={attraction.imageUrl} 
                        alt={attraction.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm sm:text-base line-clamp-2">{attraction.name}</h4>
                            {attraction.infoUrl && (
                              <a 
                                href={attraction.infoUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {attraction.type}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                        {attraction.description}
                      </p>
                      <div className="flex flex-wrap gap-2 sm:gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {attraction.neighborhood}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {attraction.hours}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(1)} className="min-h-[44px]">
                Voltar
              </Button>
              <Button 
                variant="outline"
                onClick={() => handleDiscoverAttractions(true)}
                disabled={loadingAttractions}
                className="min-h-[44px]"
              >
                {loadingAttractions ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Sugerir Mais
              </Button>
              <Button 
                onClick={handleOrganizeItinerary}
                disabled={loadingOrganization || selectedAttractions.length === 0}
                className="flex-1 min-h-[44px]"
              >
                {loadingOrganization ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Organizando com Gemini...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Organizar Itinerário
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview Organized Itinerary */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Brain className="w-3 h-3" />
                Gemini
              </Badge>
              <span className="text-sm text-muted-foreground">
                {organizedPrograms.length} programas organizados
              </span>
            </div>

            {itinerarySummary && (
              <Card className="p-4 bg-muted/50">
                <p className="text-sm">{itinerarySummary}</p>
              </Card>
            )}

            {warnings.length > 0 && (
              <Card className="p-4 border-orange-500/50 bg-orange-500/10">
                <h4 className="font-medium text-sm mb-2">⚠️ Avisos:</h4>
                <ul className="text-sm space-y-1">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>• {warning}</li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="space-y-3 max-h-[50vh] sm:max-h-[400px] overflow-y-auto">
              {organizedPrograms.map((program, idx) => (
                <Card key={idx} className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium">{program.title}</h4>
                      <Badge variant="outline">
                        {program.start_time} - {program.end_time}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {program.description}
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {program.address}
                      </p>
                      {program.notes && (
                        <p className="italic">💡 {program.notes}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)} className="min-h-[44px]">
                Voltar
              </Button>
              <Button 
                onClick={handleConfirmAndSave}
                disabled={saving}
                className="flex-1 min-h-[44px]"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    Confirmar e Criar Programas
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
