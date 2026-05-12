
-- Table to track connection incident history (when went down, when reconnected, duration)
CREATE TABLE public.connection_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  connection_id UUID NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('whatsapp', 'telegram')),
  channel_name TEXT,
  disconnected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reconnected_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast user queries ordered by time
CREATE INDEX idx_connection_events_user_time ON public.connection_events (user_id, disconnected_at DESC);
-- Index to find open incidents by connection
CREATE INDEX idx_connection_events_open ON public.connection_events (connection_id, reconnected_at) WHERE reconnected_at IS NULL;

-- Enable RLS
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connection events"
  ON public.connection_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connection events"
  ON public.connection_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connection events"
  ON public.connection_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage connection events"
  ON public.connection_events FOR ALL
  USING (true)
  WITH CHECK (true);
