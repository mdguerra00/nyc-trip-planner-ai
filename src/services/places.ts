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
  id: z.string(),
  name: z.string(),
  type: z.string().default(""),
  address: z.string().default(""),
  hours: z.string().default(""),
  description: z.string().default(""),
  estimatedDuration: z.coerce.number().optional().default(0),
  neighborhood: z.string().default(""),
  imageUrl: z.string().optional(),
  infoUrl: z.string().optional(),
  rating: z.coerce.string().optional(),
  reviewCount: z.coerce.string().optional(),
  whyRecommended: z.string().optional(),
  verificationUrl: z.string().optional(),
});

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
  title: z.string().default(""),
  description: z.string().default(""),
  start_time: z.string().default(""),
  end_time: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
  transitToNext: z.string().optional(),
});

const itinerarySchema = z.object({
  programs: z.array(organizedProgramSchema).default([]),
  summary: z.string().default(""),
  warnings: z.array(z.string()).default([]),
  optimizationApplied: z
    .object({
      endNearNextCommitment: z.boolean().optional(),
      nextCommitmentTitle: z.string().optional(),
      bufferMinutes: z.number().optional(),
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
  error: z.string().optional(),
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

  const parsedResponse = organizeResponseSchema.safeParse(data);
  if (!parsedResponse.success || !parsedResponse.data.itinerary) {
    throw new Error("Resposta inválida ao organizar itinerário");
  }

  if (parsedResponse.data.error) {
    throw new Error(parsedResponse.data.error);
  }

  return {
    itinerary: parsedResponse.data.itinerary,
  };
}
