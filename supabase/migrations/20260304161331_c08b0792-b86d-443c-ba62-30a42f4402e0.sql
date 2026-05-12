CREATE POLICY "No direct access to recovery_codes"
ON public.recovery_codes
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);