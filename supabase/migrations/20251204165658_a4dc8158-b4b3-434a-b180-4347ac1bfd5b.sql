-- Fix pace constraint to match frontend values
ALTER TABLE public.travel_profile DROP CONSTRAINT IF EXISTS travel_profile_pace_check;
ALTER TABLE public.travel_profile ADD CONSTRAINT travel_profile_pace_check CHECK (pace IN ('relaxed', 'moderate', 'intense'));

-- Add unique constraint on trip_config.user_id for upsert to work
ALTER TABLE public.trip_config ADD CONSTRAINT trip_config_user_id_unique UNIQUE (user_id);