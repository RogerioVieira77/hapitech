
-- Inserir um knowledge_file de website de teste para verificar o fluxo RAG
INSERT INTO public.knowledge_files (
  user_id,
  file_name,
  file_size,
  file_type,
  storage_path,
  status,
  source_type,
  source_url,
  content
)
SELECT 
  u.id,
  'example.com.txt',
  284,
  'txt',
  'websites/' || u.id || '/test_example_com.txt',
  'uploaded',
  'website',
  'https://example.com',
  E'Example Domain\n\nThis domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.\n\nMore information: https://www.iana.org/domains/reserved'
FROM auth.users u
WHERE u.email = 'grandecharada@gmail.com';

-- Também vincular ao agente existente
INSERT INTO public.agent_knowledge_files (agent_id, knowledge_file_id)
SELECT 
  a.id,
  kf.id
FROM public.agents a
CROSS JOIN public.knowledge_files kf
WHERE a.name = 'Apolinario Filho'
  AND kf.source_url = 'https://example.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_knowledge_files akf 
    WHERE akf.agent_id = a.id AND akf.knowledge_file_id = kf.id
  );
