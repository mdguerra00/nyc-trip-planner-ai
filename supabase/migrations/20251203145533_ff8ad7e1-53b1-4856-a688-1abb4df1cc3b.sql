-- Make trip_config dates nullable
ALTER TABLE public.trip_config 
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;

-- Add useful fields to travel_profile for AI decision making
ALTER TABLE public.travel_profile
  ADD COLUMN IF NOT EXISTS destination TEXT DEFAULT 'New York City',
  ADD COLUMN IF NOT EXISTS trip_purpose TEXT DEFAULT 'family_vacation',
  ADD COLUMN IF NOT EXISTS language_preference TEXT DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS special_occasions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transportation_preference TEXT DEFAULT 'walking_subway',
  ADD COLUMN IF NOT EXISTS weather_sensitivity TEXT DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS morning_preference TEXT DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS group_dynamics TEXT;