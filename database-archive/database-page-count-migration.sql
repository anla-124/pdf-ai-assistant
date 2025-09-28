-- Migration script to add page_count column to documents table
-- Run this on existing databases to enable page count display

-- Add page_count column to documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS page_count INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN public.documents.page_count IS 'Total number of pages in the PDF document, extracted during processing';

-- Update statistics
ANALYZE public.documents;

-- Migration complete
-- Note: Existing documents will have page_count = NULL until re-processed
-- New documents will automatically get page_count populated during processing