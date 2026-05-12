-- Aplicar preços definidos pelo admin
UPDATE public.ai_models SET credits_per_response = 5
  WHERE model_id IN ('gpt-5.2', 'gpt-5.2-2026-05-01', 'gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06', 'gpt-4o-2024-05-13');

UPDATE public.ai_models SET credits_per_response = 4
  WHERE model_id IN ('gpt-5', 'gpt-5-2025-08-07', 'gpt-5.1', 'gpt-5.1-2026-03-11', 'gpt-4.1', 'gpt-4.1-2025-04-14');

UPDATE public.ai_models SET credits_per_response = 3
  WHERE model_id IN ('o4-mini', 'o4-mini-2025-04-16', 'o3-mini', 'o3-mini-2025-01-31');

UPDATE public.ai_models SET credits_per_response = 5
  WHERE model_id IN ('o3', 'o3-2025-04-16');

UPDATE public.ai_models SET credits_per_response = 25
  WHERE model_id IN ('o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12');

UPDATE public.ai_models SET credits_per_response = 20
  WHERE model_id IN ('gpt-4-turbo', 'gpt-4-turbo-2024-04-09', 'gpt-4-turbo-preview', 'gpt-4-0125-preview', 'gpt-4-1106-preview', 'gpt-4', 'gpt-4-0613');

UPDATE public.ai_models SET credits_per_response = 1
  WHERE model_id IN (
    'gpt-5-mini', 'gpt-5-mini-2026-03-11',
    'gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14',
    'gpt-4o-mini', 'gpt-4o-mini-2024-07-18',
    'gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-16k', 'gpt-3.5-turbo-instruct', 'gpt-3.5-turbo-instruct-0914',
    'deepseek-chat', 'deepseek-coder'
  );

UPDATE public.ai_models SET credits_per_response = 3
  WHERE model_id IN ('deepseek-reasoner');

-- Modelos não especificados: manter padrão 2 (já estão assim)
