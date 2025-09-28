-- Migration script to add page_number column to document_embeddings table
-- Run this on existing databases to enable page-range similarity search

-- Add page_number column to document_embeddings table
ALTER TABLE public.document_embeddings 
ADD COLUMN IF NOT EXISTS page_number INTEGER;

-- Add index for performance on page_number queries
CREATE INDEX IF NOT EXISTS idx_document_embeddings_page_number 
ON public.document_embeddings(page_number);

-- Add composite index for document_id + page_number queries
CREATE INDEX IF NOT EXISTS idx_document_embeddings_doc_page 
ON public.document_embeddings(document_id, page_number);

-- Update statistics
ANALYZE public.document_embeddings;

-- Migration complete
-- Note: Existing documents will have page_number = NULL until re-processed
-- New documents will automatically get page_number populated