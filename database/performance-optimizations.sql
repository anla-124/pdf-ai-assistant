-- Performance Optimizations for PDF AI Assistant
-- Run these in your Supabase SQL editor

-- 1. INDEX OPTIMIZATIONS
-- =====================

-- Documents table indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_user_status 
ON documents(user_id, status);

CREATE INDEX IF NOT EXISTS idx_documents_created_at 
ON documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_user_created 
ON documents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_status_updated 
ON documents(status, updated_at DESC);

-- Composite index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_documents_dashboard 
ON documents(user_id, status, created_at DESC);

-- Document jobs indexes for job processing
CREATE INDEX IF NOT EXISTS idx_document_jobs_status 
ON document_jobs(status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_document_jobs_document 
ON document_jobs(document_id);

CREATE INDEX IF NOT EXISTS idx_document_jobs_processing 
ON document_jobs(processing_method, status);

-- Processing status indexes for real-time updates
CREATE INDEX IF NOT EXISTS idx_processing_status_document_time 
ON processing_status(document_id, created_at DESC);

-- Document embeddings indexes for search performance
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document 
ON document_embeddings(document_id);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_page 
ON document_embeddings(document_id, page_number);

-- Extracted fields indexes for search
CREATE INDEX IF NOT EXISTS idx_extracted_fields_document 
ON extracted_fields(document_id);

-- 2. PARTIAL INDEXES (for specific use cases)
-- ==========================================

-- Index only for processing documents (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_documents_processing 
ON documents(user_id, updated_at DESC) 
WHERE status IN ('processing', 'queued');

-- Index only for completed documents with embeddings
CREATE INDEX IF NOT EXISTS idx_documents_searchable 
ON documents(user_id, created_at DESC) 
WHERE status = 'completed' AND (metadata->>'embeddings_skipped')::boolean IS NOT TRUE;

-- Index for active jobs only
CREATE INDEX IF NOT EXISTS idx_jobs_active 
ON document_jobs(created_at ASC) 
WHERE status IN ('queued', 'processing');

-- 3. METADATA INDEXES (for business filtering)
-- =============================================

-- GIN indexes for metadata search
CREATE INDEX IF NOT EXISTS idx_documents_metadata_gin 
ON documents USING GIN (metadata);

-- Specific metadata field indexes for common filters
CREATE INDEX IF NOT EXISTS idx_documents_law_firm 
ON documents((metadata->>'law_firm')) 
WHERE metadata->>'law_firm' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_fund_manager 
ON documents((metadata->>'fund_manager')) 
WHERE metadata->>'fund_manager' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_jurisdiction 
ON documents((metadata->>'jurisdiction')) 
WHERE metadata->>'jurisdiction' IS NOT NULL;

-- 4. PERFORMANCE VIEWS
-- ====================

-- Pre-aggregated dashboard statistics
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT 
  user_id,
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_documents,
  COUNT(*) FILTER (WHERE status IN ('processing', 'queued')) as processing_documents,
  COUNT(*) FILTER (WHERE status = 'error') as error_documents,
  AVG(file_size) FILTER (WHERE status = 'completed') as avg_file_size,
  SUM(file_size) as total_storage_used,
  MAX(created_at) as last_upload
FROM documents 
GROUP BY user_id;

-- Recent document activity view
CREATE OR REPLACE VIEW recent_activity AS
SELECT 
  d.id,
  d.user_id,
  d.title,
  d.status,
  d.created_at,
  d.updated_at,
  j.processing_method,
  ps.progress,
  ps.message as latest_message
FROM documents d
LEFT JOIN document_jobs j ON d.id = j.document_id 
LEFT JOIN LATERAL (
  SELECT progress, message 
  FROM processing_status 
  WHERE document_id = d.id 
  ORDER BY created_at DESC 
  LIMIT 1
) ps ON true
WHERE d.created_at > NOW() - INTERVAL '24 hours'
ORDER BY d.updated_at DESC;

-- 5. PERFORMANCE MONITORING
-- =========================

-- Table to track query performance
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_metrics_name_time 
ON performance_metrics(metric_name, created_at DESC);

-- 6. CLEANUP POLICIES
-- ===================

-- Function to clean up old processing status entries (keep last 10 per document)
CREATE OR REPLACE FUNCTION cleanup_old_processing_status()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM processing_status 
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, 
             ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at DESC) as rn
      FROM processing_status
    ) ranked
    WHERE rn <= 10
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 7. VACUUM AND ANALYZE SCHEDULE
-- ===============================

-- Note: These should be run periodically (set up in Supabase dashboard)
-- VACUUM ANALYZE documents;
-- VACUUM ANALYZE document_jobs;
-- VACUUM ANALYZE processing_status;
-- VACUUM ANALYZE document_embeddings;

-- 8. CONNECTION OPTIMIZATION
-- ==========================

-- Enable prepared statements (for connection pooling)
-- This should be set at the database level:
-- ALTER SYSTEM SET plan_cache_mode = 'force_generic_plan';

COMMENT ON INDEX idx_documents_user_status IS 'Optimizes dashboard queries by user and status';
COMMENT ON INDEX idx_document_jobs_status IS 'Optimizes job queue processing';
COMMENT ON VIEW dashboard_stats IS 'Pre-aggregated statistics for dashboard performance';
COMMENT ON VIEW recent_activity IS 'Optimized view for recent document activity';

-- Output summary
SELECT 'Database performance optimizations applied successfully!' as result;