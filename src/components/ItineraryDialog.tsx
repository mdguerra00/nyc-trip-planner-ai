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
import { Loader2, Sparkles, Search, Brain, MapPin, Clock } from "lucide-react";

interface Attraction {
  id: string;
  name: string;
  type: string;
  address: string;
  hours: string;
  description: string;
  estimatedDuration: number;
  neighborhood: string;
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
  const [step, setStep] = useState(1);
  
  // Step 1: Configuration
  const [region, setRegion] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("22:00");
  
  // Step 2: Attractions
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [selectedAttractions, setSelectedAttractions] = useState<string[]>([]);
  const [loadingAttractions, setLoadingAttractions] = useState(false);
  
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

  const handleDiscoverAttractions = async () => {
    if (!region || !date) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha região e data",
        variant: "destructive",
      });
      return;
    }

    setLoadingAttractions(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-attractions', {
        body: { region, date }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setAttractions(data.attractions || []);
      setStep(2);
      
      toast({
        title: "🔍 Atrações descobertas!",
        description: `Encontramos ${data.attractions?.length || 0} sugestões para ${region}`,
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

  const handleOrganizeItinerary = async () => {
    if (selectedAttractions.length === 0) {
      toast({
        title: "Selecione atrações",
        description: "Escolha pelo menos uma atração para organizar",
        variant: "destructive",
      });
      return;
    }

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

      if (data.error) {
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
      toast({
        title: "Erro ao organizar itinerário",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoadingOrganization(false);
    }
  };

  const handleConfirmAndSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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

      const { error } = await supabase
        .from('programs')
        .insert(programsToInsert);

      if (error) throw error;

      toast({
        title: "✅ Itinerário criado!",
        description: `${programsToInsert.length} programas adicionados ao calendário`,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Criar Itinerário Inteligente
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Configure a região e data para descobrir atrações"}
            {step === 2 && "Selecione as atrações que deseja visitar"}
            {step === 3 && "Confira o itinerário organizado pela IA"}
          </DialogDescription>
        </DialogHeader>

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
                onChange={(e) => setDate(e.target.value)}
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
              onClick={handleDiscoverAttractions}
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
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Search className="w-3 h-3" />
                Perplexity
              </Badge>
              <span className="text-sm text-muted-foreground">
                {selectedAttractions.length} de {attractions.length} selecionadas
              </span>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {attractions.map((attraction) => (
                <Card key={attraction.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedAttractions.includes(attraction.id)}
                      onCheckedChange={() => toggleAttraction(attraction.id)}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{attraction.name}</h4>
                          <Badge variant="outline" className="mt-1">
                            {attraction.type}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {attraction.description}
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button 
                onClick={handleOrganizeItinerary}
                disabled={loadingOrganization || selectedAttractions.length === 0}
                className="flex-1"
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

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
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

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button 
                onClick={handleConfirmAndSave}
                disabled={saving}
                className="flex-1"
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
      </DialogContent>
    </Dialog>
  );
}
