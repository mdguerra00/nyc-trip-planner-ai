import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import {
  Attraction,
  DiscoverAttractionsParams,
  DiscoverAttractionsResult,
  OrganizeItineraryParams,
  OrganizeItineraryResult,
} from "@/types/places";

const attractionSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string().default(""),
  address: z.string().default(""),
  hours: z.string().default(""),
  description: z.string().default(""),
  estimatedDuration: z.coerce.number().optional().default(0),
  neighborhood: z.string().optional().default(""),
  imageUrl: z.string().nullable().optional(),
  infoUrl: z.string().nullable().optional(),
  rating: z.union([z.string(), z.number()]).nullable().optional(),
  reviewCount: z.union([z.string(), z.number()]).nullable().optional(),
  whyRecommended: z.string().nullable().optional(),
  verificationUrl: z.string().nullable().optional(),
}).transform((data) => ({
  ...data,
  id: data.id || crypto.randomUUID(),
  rating: data.rating?.toString(),
  reviewCount: data.reviewCount?.toString(),
}));

const discoverParamsSchema = z.object({
  region: z.string().min(1, "Região é obrigatória"),
  date: z.string().min(1, "Data é obrigatória"),
  requestMore: z.boolean().optional(),
  userSuggestion: z.string().optional(),
  userId: z.string().nullable().optional(),
});

const discoverResponseSchema = z.object({
  attractions: z.array(attractionSchema).default([]),
  error: z.string().optional(),
});

const organizedProgramSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  start_time: z.string(),
  end_time: z.string(),
  address: z.string().default(""),
  notes: z.string().optional().default(""),
  transitToNext: z.string().optional(),
});

const itinerarySchema = z.object({
  programs: z.array(organizedProgramSchema).default([]),
  summary: z.string().optional().default(""),
  warnings: z.array(z.string()).optional().default([]),
  optimizationApplied: z
    .object({
      endNearNextCommitment: z.boolean().optional(),
      nextCommitmentTitle: z.string().optional(),
      bufferMinutes: z.number().optional(),
      suggestedDeparture: z.string().optional(),
    })
    .nullable()
    .optional(),
});

const organizeParamsSchema = z.object({
  selectedAttractions: z.array(attractionSchema),
  date: z.string().min(1, "Data é obrigatória"),
  startTime: z.string().min(1, "Hora de início é obrigatória"),
  endTime: z.string().min(1, "Hora de término é obrigatória"),
  region: z.string().min(1, "Região é obrigatória"),
});

const organizeResponseSchema = z.object({
  itinerary: itinerarySchema.optional(),
  existingPrograms: z.array(z.any()).optional(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  rawContent: z.string().optional(),
  details: z.string().optional(),
});

export async function discoverAttractions(
  params: DiscoverAttractionsParams,
): Promise<DiscoverAttractionsResult> {
  const parsedParams = discoverParamsSchema.parse(params);

  const { data, error } = await supabase.functions.invoke("discover-attractions", {
    body: {
      region: parsedParams.region,
      date: parsedParams.date,
      requestMore: parsedParams.requestMore,
      userSuggestion: parsedParams.userSuggestion,
      userId: parsedParams.userId ?? undefined,
    },
  });

  if (error) {
    throw new Error(error.message || "Erro ao buscar atrações");
  }

  const parsedResponse = discoverResponseSchema.safeParse(data);
  if (!parsedResponse.success) {
    throw new Error("Resposta inválida das atrações descobertas");
  }

  if (parsedResponse.data.error) {
    throw new Error(parsedResponse.data.error);
  }

  return { attractions: parsedResponse.data.attractions as Attraction[] };
}

export async function organizeItinerary(
  params: OrganizeItineraryParams,
): Promise<OrganizeItineraryResult> {
  const parsedParams = organizeParamsSchema.parse(params);

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke("organize-itinerary", {
    body: {
      selectedAttractions: parsedParams.selectedAttractions,
      date: parsedParams.date,
      startTime: parsedParams.startTime,
      endTime: parsedParams.endTime,
      region: parsedParams.region,
    },
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
  });

  if (error) {
    throw new Error(error.message || "Erro ao organizar itinerário");
  }

  // Primeiro verificar se há erro no response
  if (data?.error) {
    throw new Error(data.error);
  }

  const parsedResponse = organizeResponseSchema.safeParse(data);
  if (!parsedResponse.success) {
    console.error("Schema validation failed:", parsedResponse.error);
    throw new Error("Resposta inválida ao organizar itinerário");
  }

  // Se não há itinerary, criar um default vazio
  const itinerary = parsedResponse.data.itinerary || {
    programs: [],
    summary: "",
    warnings: parsedResponse.data.warnings || [],
  };

  return {
    itinerary: itinerary as OrganizeItineraryResult["itinerary"],
  };
}
