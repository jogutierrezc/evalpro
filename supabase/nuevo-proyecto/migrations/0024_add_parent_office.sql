-- Add parent_id column to offices table to support hierarchy
ALTER TABLE public.offices 
ADD COLUMN parent_id UUID REFERENCES public.offices(id);

-- Optional: Add a foreign key constraint name if you want to be specific
-- ALTER TABLE public.offices ADD CONSTRAINT fk_offices_parent FOREIGN KEY (parent_id) REFERENCES public.offices(id);
