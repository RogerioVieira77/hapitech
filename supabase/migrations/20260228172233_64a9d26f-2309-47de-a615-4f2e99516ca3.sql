
-- Unlink agents from old connection
UPDATE public.agents SET connection_id = NULL WHERE connection_id = '46a434d6-f6f8-4404-9644-03ca32e8d038';
-- Delete old connection
DELETE FROM public.wuzapi_connections WHERE id = '46a434d6-f6f8-4404-9644-03ca32e8d038';
