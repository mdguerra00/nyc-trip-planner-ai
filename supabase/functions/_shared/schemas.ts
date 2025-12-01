import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

export const ProgramDataSchema = z.object({
  title: z.string(),
  date: z.string(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  aiSuggestions: z.string().optional(),
});

export const AiChatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  programId: z.string().optional(),
  programData: ProgramDataSchema.optional(),
});

export const AiChatResponseSchema = z.object({
  message: z.string(),
});

export const DiscoverAttractionsRequestSchema = z.object({
  region: z.string().min(1, "Region is required"),
  date: z.string().min(1, "Date is required"),
  userSuggestion: z.string().optional(),
  requestMore: z.boolean().optional(),
  userId: z.string().optional(),
});

export const AttractionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  address: z.string(),
  hours: z.string(),
  description: z.string(),
  estimatedDuration: z.number(),
  neighborhood: z.string(),
  imageUrl: z.string().nullable().optional(),
  infoUrl: z.string().nullable().optional(),
  rating: z.union([z.string(), z.number()]).nullable().optional(),
  reviewCount: z.union([z.string(), z.number()]).nullable().optional(),
  whyRecommended: z.string().nullable().optional(),
  verificationUrl: z.string().nullable().optional(),
});

export const DiscoverAttractionsResponseSchema = z.object({
  attractions: z.array(AttractionSchema),
});

export const SelectedAttractionSchema = z.object({
  name: z.string(),
  type: z.string(),
  address: z.string(),
  hours: z.string(),
  description: z.string(),
  estimatedDuration: z.number(),
  neighborhood: z.string().optional(),
});

export const OrganizeItineraryRequestSchema = z.object({
  selectedAttractions: z.array(SelectedAttractionSchema).min(1, "At least one attraction is required"),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  region: z.string().optional(),
});

export const ItineraryProgramSchema = z.object({
  title: z.string(),
  description: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  address: z.string(),
  notes: z.string().optional(),
  transitToNext: z.string().optional(),
});

export const OrganizeItineraryResponseSchema = z.object({
  itinerary: z.object({
    programs: z.array(ItineraryProgramSchema),
    summary: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  }),
  existingPrograms: z.array(z.record(z.unknown())).optional(),
});
