import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, User, CalendarIcon } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSwipeable } from "react-swipeable";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";

const travelerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  age: z.number().min(0).max(120).optional(),
  interests: z.array(z.string()).optional(),
});

const profileSchema = z.object({
  start_date: z.date().optional(),
  end_date: z.date().optional(),
  hotel_address: z.string().optional(),
  travelers: z.array(travelerSchema).min(1, "Adicione pelo menos um viajante"),
  dietary_restrictions: z.array(z.string()).optional(),
  mobility_notes: z.string().optional(),
  pace: z.enum(["relaxed", "moderate", "intense"]).default("moderate"),
  budget_level: z.enum(["budget", "moderate", "luxury"]).default("moderate"),
  preferred_categories: z.array(z.string()).optional(),
  avoid_topics: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const DIETARY_OPTIONS = [
  { id: "vegetarian", label: "Vegetariano" },
  { id: "vegan", label: "Vegano" },
  { id: "gluten-free", label: "Sem Glúten" },
  { id: "lactose-free", label: "Sem Lactose" },
  { id: "kosher", label: "Kosher" },
  { id: "halal", label: "Halal" },
];

const CATEGORY_OPTIONS = [
  { id: "museums", label: "Museus" },
  { id: "parks", label: "Parques" },
  { id: "restaurants", label: "Restaurantes" },
  { id: "shopping", label: "Compras" },
  { id: "nightlife", label: "Vida Noturna" },
  { id: "arts", label: "Artes & Teatro" },
  { id: "sports", label: "Esportes" },
  { id: "architecture", label: "Arquitetura" },
];

const INTEREST_OPTIONS = [
  { id: "history", label: "História" },
  { id: "art", label: "Arte" },
  { id: "food", label: "Gastronomia" },
  { id: "nature", label: "Natureza" },
  { id: "music", label: "Música" },
  { id: "photography", label: "Fotografia" },
  { id: "adventure", label: "Aventura" },
  { id: "culture", label: "Cultura" },
];

export default function TravelProfile() {
  const navigate = useNavigate();
  const { userId } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      start_date: undefined,
      end_date: undefined,
      hotel_address: "",
      travelers: [{ name: "", age: undefined, interests: [] }],
      dietary_restrictions: [],
      mobility_notes: "",
      pace: "moderate",
      budget_level: "moderate",
      preferred_categories: [],
      avoid_topics: [],
      interests: [],
      notes: "",
    },
  });

  const loadProfile = useCallback(async () => {
    if (!userId) {
      return;
    }
    
    try {
      const [profileResult, tripConfigResult] = await Promise.all([
        supabase.from("travel_profile").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("trip_config").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (tripConfigResult.error) throw tripConfigResult.error;

      const profileData = profileResult.data;
      const tripConfigData = tripConfigResult.data;

      form.reset({
        start_date: tripConfigData?.start_date ? new Date(tripConfigData.start_date + "T00:00:00") : undefined,
        end_date: tripConfigData?.end_date ? new Date(tripConfigData.end_date + "T00:00:00") : undefined,
        hotel_address: tripConfigData?.hotel_address || "",
        travelers: profileData?.travelers as any[] || [{ name: "", age: undefined, interests: [] }],
        dietary_restrictions: profileData?.dietary_restrictions || [],
        mobility_notes: profileData?.mobility_notes || "",
        pace: (profileData?.pace as "relaxed" | "moderate" | "intense") || "moderate",
        budget_level: (profileData?.budget_level as "budget" | "moderate" | "luxury") || "moderate",
        preferred_categories: profileData?.preferred_categories || [],
        avoid_topics: profileData?.avoid_topics || [],
        interests: profileData?.interests || [],
        notes: profileData?.notes || "",
      });
    } catch (error) {
      console.error("Error loading profile:", error);
      toast.error("Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  }, [userId, form]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onSubmit = async (values: ProfileFormValues) => {
    if (!userId) return;
    
    setSaving(true);
    try {
      const profilePromise = supabase
        .from("travel_profile")
        .upsert({
          user_id: userId,
          travelers: values.travelers,
          dietary_restrictions: values.dietary_restrictions,
          mobility_notes: values.mobility_notes,
          pace: values.pace,
          budget_level: values.budget_level,
          preferred_categories: values.preferred_categories,
          avoid_topics: values.avoid_topics,
          interests: values.interests,
          notes: values.notes,
        }, {
          onConflict: 'user_id'
        });

      const tripConfigPromise = supabase
        .from("trip_config")
        .upsert({
          user_id: userId,
          start_date: values.start_date ? format(values.start_date, "yyyy-MM-dd") : null,
          end_date: values.end_date ? format(values.end_date, "yyyy-MM-dd") : null,
          hotel_address: values.hotel_address || null,
        }, {
          onConflict: 'user_id'
        });

      const [profileResult, tripConfigResult] = await Promise.all([profilePromise, tripConfigPromise]);

      if (profileResult.error) throw profileResult.error;
      if (tripConfigResult.error) throw tripConfigResult.error;

      toast.success("Perfil salvo com sucesso!");
      navigate("/");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate("/list"),
    trackMouse: false,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div {...swipeHandlers} className="min-h-screen bg-background pb-24 sm:pb-4">
        <PageHeader
          title="Perfil de Viagem"
          subtitle="Configure suas preferências para receber sugestões personalizadas"
          showBack={false}
        />
        <div className="container max-w-4xl mx-auto p-4">

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Configuração da Viagem */}
          <Card>
            <CardHeader>
              <CardTitle>Configuração da Viagem</CardTitle>
              <CardDescription>Quando você vai viajar e onde ficará hospedado?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data de Início</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "dd/MM/yyyy")
                              ) : (
                                <span>Selecione a data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data de Fim</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "dd/MM/yyyy")
                              ) : (
                                <span>Selecione a data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="hotel_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço do Hotel</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: 303 Lexington Avenue, New York, NY" {...field} />
                    </FormControl>
                    <FormDescription>
                      Endereço completo onde você ficará hospedado
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Viajantes */}
          <Card>
            <CardHeader>
              <CardTitle>Viajantes</CardTitle>
              <CardDescription>Quem está viajando?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.watch("travelers").map((_, index) => (
                <div key={index} className="flex gap-4 items-start p-4 border rounded-lg">
                  <User className="w-5 h-5 mt-2 text-muted-foreground" />
                  <div className="flex-1 space-y-4">
                    <FormField
                      control={form.control}
                      name={`travelers.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome do viajante" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`travelers.${index}.age`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Idade (opcional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Idade"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {form.watch("travelers").length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const travelers = form.getValues("travelers");
                        form.setValue("travelers", travelers.filter((_, i) => i !== index));
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const travelers = form.getValues("travelers");
                  form.setValue("travelers", [...travelers, { name: "", age: undefined, interests: [] }]);
                }}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Viajante
              </Button>
            </CardContent>
          </Card>

          {/* Restrições Alimentares */}
          <Card>
            <CardHeader>
              <CardTitle>Restrições Alimentares</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="dietary_restrictions"
                render={() => (
                  <FormItem>
                    <div className="grid grid-cols-2 gap-4">
                      {DIETARY_OPTIONS.map((option) => (
                        <FormField
                          key={option.id}
                          control={form.control}
                          name="dietary_restrictions"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    const value = field.value || [];
                                    field.onChange(
                                      checked
                                        ? [...value, option.id]
                                        : value.filter((v) => v !== option.id)
                                    );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Preferências */}
          <Card>
            <CardHeader>
              <CardTitle>Preferências</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="pace"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ritmo de Viagem</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="relaxed">Relaxado</SelectItem>
                        <SelectItem value="moderate">Moderado</SelectItem>
                        <SelectItem value="intense">Intenso</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budget_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nível de Budget</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="budget">Econômico</SelectItem>
                        <SelectItem value="moderate">Moderado</SelectItem>
                        <SelectItem value="luxury">Luxo</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Categorias Preferidas */}
          <Card>
            <CardHeader>
              <CardTitle>Categorias de Interesse</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="preferred_categories"
                render={() => (
                  <FormItem>
                    <div className="grid grid-cols-2 gap-4">
                      {CATEGORY_OPTIONS.map((option) => (
                        <FormField
                          key={option.id}
                          control={form.control}
                          name="preferred_categories"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    const value = field.value || [];
                                    field.onChange(
                                      checked
                                        ? [...value, option.id]
                                        : value.filter((v) => v !== option.id)
                                    );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Interesses */}
          <Card>
            <CardHeader>
              <CardTitle>Interesses Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="interests"
                render={() => (
                  <FormItem>
                    <div className="grid grid-cols-2 gap-4">
                      {INTEREST_OPTIONS.map((option) => (
                        <FormField
                          key={option.id}
                          control={form.control}
                          name="interests"
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    const value = field.value || [];
                                    field.onChange(
                                      checked
                                        ? [...value, option.id]
                                        : value.filter((v) => v !== option.id)
                                    );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal cursor-pointer">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Mobilidade */}
          <Card>
            <CardHeader>
              <CardTitle>Mobilidade</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="mobility_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas sobre Mobilidade (opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Preciso de acessibilidade para cadeira de rodas"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Informe qualquer necessidade especial de mobilidade
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Tópicos a Evitar */}
          <Card>
            <CardHeader>
              <CardTitle>Tópicos a Evitar</CardTitle>
              <CardDescription>
                Indique temas ou atividades que você prefere evitar durante a viagem
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="avoid_topics"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tópicos para não incluir no roteiro</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: Locais muito lotados, atividades radicais, lugares com animais"
                        className="min-h-[120px]"
                        rows={4}
                        value={field.value?.join(", ") || ""}
                        onChange={(e) => {
                          const topics = e.target.value
                            .split(",")
                            .map((t) => t.trim())
                            .filter((t) => t);
                          field.onChange(topics);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Separe múltiplos tópicos por vírgula (,)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Notas Adicionais */}
          <Card>
            <CardHeader>
              <CardTitle>Notas Adicionais</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Qualquer informação adicional que possa ajudar..."
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Perfil
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/")}>
              Cancelar
            </Button>
          </div>
          </form>
        </Form>
        </div>
      </div>
    </PageTransition>
  );
}
