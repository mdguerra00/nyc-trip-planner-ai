import { useQuery, useQueryClient } from "@tanstack/react-query";
import { discoverAttractions } from "@/services/places";
import type { Attraction, DiscoverAttractionsParams } from "@/types/places";

const CACHE_TIME = 30 * 60 * 1000; // 30 minutes

function createCacheKey(params: DiscoverAttractionsParams): string[] {
  return [
    "attractions",
    params.region,
    params.date,
    params.userSuggestion || "",
    params.requestMore ? "more" : "",
  ];
}

export function useAttractionsCache(
  params: DiscoverAttractionsParams | null,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: params ? createCacheKey(params) : ["attractions"],
    queryFn: async () => {
      if (!params) throw new Error("No params provided");
      const result = await discoverAttractions(params);
      return result.attractions;
    },
    enabled: enabled && !!params,
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME * 2,
    retry: false, // We handle retries in fetchWithRetry
  });

  const invalidateCache = (region?: string, date?: string) => {
    if (region && date) {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === "attractions" && key[1] === region && key[2] === date;
        },
      });
    } else {
      queryClient.invalidateQueries({ queryKey: ["attractions"] });
    }
  };

  const prefetchAttractions = async (params: DiscoverAttractionsParams) => {
    await queryClient.prefetchQuery({
      queryKey: createCacheKey(params),
      queryFn: () => discoverAttractions(params).then((r) => r.attractions),
      staleTime: CACHE_TIME,
    });
  };

  return {
    attractions: query.data as Attraction[] | undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    invalidateCache,
    prefetchAttractions,
  };
}
