-- =====================================================
-- Database Schema Update for Batch Processing Support
-- =====================================================
-- Run this script in your Supabase SQL Editor to add batch processing support
-- =====================================================

-- Add new columns to document_jobs table for batch processing
ALTER TABLE public.document_jobs 
  ADD COLUMN IF NOT EXISTS batch_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_method TEXT DEFAULT 'sync' CHECK (processing_method IN ('sync', 'batch')),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for batch operation lookups
CREATE INDEX IF NOT EXISTS idx_document_jobs_batch_operation_id ON document_jobs(batch_operation_id);
CREATE INDEX IF NOT EXISTS idx_document_jobs_processing_method ON document_jobs(processing_method);

-- Update RLS policies to allow service role access to new columns
-- (The existing "System can manage all document jobs" policy already covers this)

-- Add comment to document the new columns
COMMENT ON COLUMN public.document_jobs.batch_operation_id IS 'Google Cloud Document AI batch operation ID for tracking long-running operations';
COMMENT ON COLUMN public.document_jobs.processing_method IS 'Processing method: sync for ≤30 pages, batch for >30 pages';
COMMENT ON COLUMN public.document_jobs.metadata IS 'Additional batch processing metadata (GCS URIs, processor info, etc.)';

-- Display completion message
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Batch Processing Schema Update Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Added columns to document_jobs table:';
  RAISE NOTICE '- batch_operation_id: Track Google Cloud operations';
  RAISE NOTICE '- processing_method: Distinguish sync vs batch processing';
  RAISE NOTICE '- metadata: Store batch processing details';
  RAISE NOTICE '';
  RAISE NOTICE 'Added indexes for performance:';
  RAISE NOTICE '- idx_document_jobs_batch_operation_id';
  RAISE NOTICE '- idx_document_jobs_processing_method';
  RAISE NOTICE '============================================';
END $$;