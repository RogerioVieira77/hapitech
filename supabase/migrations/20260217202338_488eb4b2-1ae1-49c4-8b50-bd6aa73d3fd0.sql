ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_sound boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_desktop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compact_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR';