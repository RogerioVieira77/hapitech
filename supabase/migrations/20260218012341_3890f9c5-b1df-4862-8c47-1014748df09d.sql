-- Corrigir modelo inválido do agente (gpt-4.1-mini não existe no gateway)
-- Mapear para openai/gpt-5-mini que é o equivalente válido
UPDATE public.agents 
SET model = 'openai/gpt-5-mini', updated_at = now()
WHERE model NOT IN (
  'google/gemini-2.5-pro',
  'google/gemini-3-pro-preview', 
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/gpt-5.2'
) AND model IS NOT NULL;