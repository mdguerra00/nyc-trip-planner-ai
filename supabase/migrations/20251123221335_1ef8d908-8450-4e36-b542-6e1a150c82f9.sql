-- Create travel_profile table to store detailed user preferences
CREATE TABLE public.travel_profile (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Traveler information (JSONB array of travelers)
  travelers JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "João", "age": 35, "interests": ["museus", "gastronomia"]}, {"name": "Maria", "age": 8, "interests": ["parques", "animais"]}]
  
  -- General interests and preferences
  interests TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Example: ["arte", "história", "gastronomia", "natureza", "compras"]
  
  -- Dietary restrictions
  dietary_restrictions TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Example: ["vegetariano", "sem glúten", "alergia a frutos do mar"]
  
  -- Mobility considerations
  mobility_notes TEXT,
  -- Example: "Criança pequena precisa de trocador", "Evitar muitas escadas"
  
  -- Travel pace preference
  pace TEXT DEFAULT 'moderate' CHECK (pace IN ('relaxed', 'moderate', 'active')),
  
  -- Budget level
  budget_level TEXT DEFAULT 'moderate' CHECK (budget_level IN ('budget', 'moderate', 'luxury')),
  
  -- Topics to avoid
  avoid_topics TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Example: ["museus de guerra", "cemitérios", "lugares muito cheios"]
  
  -- Preferred categories
  preferred_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  -- Example: ["família", "ao ar livre", "cultural", "culinária"]
  
  -- Additional notes
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.travel_profile ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own travel profile"
  ON public.travel_profile
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own travel profile"
  ON public.travel_profile
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own travel profile"
  ON public.travel_profile
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own travel profile"
  ON public.travel_profile
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_travel_profile_updated_at
  BEFORE UPDATE ON public.travel_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();