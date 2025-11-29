export interface Attraction {
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
  rating?: string;
  reviewCount?: string;
  whyRecommended?: string;
  verificationUrl?: string;
}

export interface OptimizationMetadata {
  endNearNextCommitment?: boolean;
  nextCommitmentTitle?: string;
  bufferMinutes?: number;
}

export interface DiscoverAttractionsParams {
  region: string;
  date: string;
  requestMore?: boolean;
  userSuggestion?: string;
  userId?: string | null;
}

export interface DiscoverAttractionsResult {
  attractions: Attraction[];
}

export interface OrganizedProgram {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  address: string;
  notes: string;
  transitToNext?: string;
}

export interface OrganizedItinerary {
  programs: OrganizedProgram[];
  summary: string;
  warnings: string[];
  optimizationApplied?: OptimizationMetadata | null;
}

export interface OrganizeItineraryParams {
  selectedAttractions: Attraction[];
  date: string;
  startTime: string;
  endTime: string;
  region: string;
}

export interface OrganizeItineraryResult {
  itinerary: OrganizedItinerary;
}
