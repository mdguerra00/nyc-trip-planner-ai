-- Create table for chat messages
CREATE TABLE public.program_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for better query performance
CREATE INDEX idx_program_chat_messages_program_user 
  ON public.program_chat_messages(program_id, user_id, created_at);

-- Enable Row Level Security
ALTER TABLE public.program_chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own chat messages
CREATE POLICY "Users can view their own chat messages"
  ON public.program_chat_messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own chat messages
CREATE POLICY "Users can insert their own chat messages"
  ON public.program_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own chat messages
CREATE POLICY "Users can delete their own chat messages"
  ON public.program_chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);