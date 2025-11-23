-- Create table for global chat messages
CREATE TABLE global_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_global_chat_user_id ON global_chat_messages(user_id);
CREATE INDEX idx_global_chat_created_at ON global_chat_messages(created_at);

-- Enable RLS
ALTER TABLE global_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own global chat messages"
  ON global_chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own global chat messages"
  ON global_chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own global chat messages"
  ON global_chat_messages FOR DELETE
  USING (auth.uid() = user_id);