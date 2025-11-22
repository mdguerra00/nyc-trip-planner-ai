-- Add columns to store AI suggestions and FAQ
ALTER TABLE public.programs 
ADD COLUMN IF NOT EXISTS ai_suggestions TEXT,
ADD COLUMN IF NOT EXISTS ai_faq JSONB;