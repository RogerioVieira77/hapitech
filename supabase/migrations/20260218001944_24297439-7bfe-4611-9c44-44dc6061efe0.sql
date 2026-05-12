-- Allow anonymous users to read active widget connections (needed for the widget iframe page)
CREATE POLICY "Public can read active widget connections"
ON public.widget_connections
FOR SELECT
USING (is_active = true);
