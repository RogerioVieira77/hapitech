
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.billing_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'cpf' CHECK (document_type IN ('cpf', 'cnpj')),
  document_number TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  zip_code TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.billing_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org billing data"
ON public.billing_data FOR SELECT
TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert their org billing data"
ON public.billing_data FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update their org billing data"
ON public.billing_data FOR UPDATE
TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

CREATE TRIGGER update_billing_data_updated_at
BEFORE UPDATE ON public.billing_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
