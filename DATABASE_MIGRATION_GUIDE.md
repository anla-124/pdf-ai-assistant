# Database Migration Guide

## 🎯 Schema Consolidation

We've consolidated all database scripts into one comprehensive schema file: `database-complete-schema.sql`

### ✅ **For New Installations**
Simply run the new consolidated script:
```sql
-- Run this in your Supabase SQL Editor
-- File: database-complete-schema.sql
```

### 🔄 **For Existing Installations**

If you've already run some of the individual scripts, here's what to do:

#### Option 1: Fresh Setup (Recommended)
If you can start fresh:
1. Drop all tables (if comfortable doing so)
2. Run `database-complete-schema.sql`
3. Re-upload documents to test

#### Option 2: Check What You Have
Run this query to see which features you already have:

```sql
-- Check if you have all required columns
SELECT 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'page_count'
  ) THEN '✅' ELSE '❌' END as "page_count",
  
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_embeddings' AND column_name = 'page_number'
  ) THEN '✅' ELSE '❌' END as "page_tracking",
  
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'document_jobs' AND column_name = 'batch_operation_id'
  ) THEN '✅' ELSE '❌' END as "batch_processing",
  
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'processing_notes'
  ) THEN '✅' ELSE '❌' END as "processing_notes";
```

#### Option 3: Run Missing Migrations Only

Based on your check results, run only what's missing:

**If missing page_count (❌):**
```sql
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS page_count INTEGER;

COMMENT ON COLUMN public.documents.page_count IS 'Total number of pages in the PDF document, extracted during processing';
```

**If missing page_tracking (❌):**
```sql
ALTER TABLE public.document_embeddings 
ADD COLUMN IF NOT EXISTS page_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_document_embeddings_page_number ON document_embeddings(page_number);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_doc_page ON document_embeddings(document_id, page_number);
```

**If missing batch_processing (❌):**
```sql
ALTER TABLE public.document_jobs 
  ADD COLUMN IF NOT EXISTS batch_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_method TEXT DEFAULT 'sync' CHECK (processing_method IN ('sync', 'batch')),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_document_jobs_batch_operation_id ON document_jobs(batch_operation_id);
CREATE INDEX IF NOT EXISTS idx_document_jobs_processing_method ON document_jobs(processing_method);

COMMENT ON COLUMN public.document_jobs.batch_operation_id IS 'Google Cloud Document AI batch operation ID for tracking long-running operations';
COMMENT ON COLUMN public.document_jobs.processing_method IS 'Processing method: sync for ≤30 pages, batch for >30 pages';
COMMENT ON COLUMN public.document_jobs.metadata IS 'Additional batch processing metadata (GCS URIs, processor info, etc.)';
```

**If missing processing_notes (❌):**
```sql
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS processing_notes TEXT;

COMMENT ON COLUMN public.documents.processing_notes IS 'Additional processing information (batch operations, errors, etc.)';
```

## 🗂️ **Old Script Files**

The following scripts are now consolidated into `database-complete-schema.sql`:

- ✅ `database-setup.sql` - Core database schema
- ✅ `database-page-migration.sql` - Page tracking for embeddings  
- ✅ `database-page-count-migration.sql` - Page count for documents
- ✅ `database-batch-update.sql` - Batch processing support

**You can safely delete these old files after migrating to the new schema.**

## 🔍 **Verification**

After running the consolidated script or migrations, verify everything is working:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'documents', 'extracted_fields', 'document_embeddings', 'processing_status', 'document_jobs');

-- Check all required columns exist
SELECT table_name, column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'documents'
  AND column_name IN ('page_count', 'processing_notes');

-- Check batch processing columns
SELECT table_name, column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'document_jobs'
  AND column_name IN ('batch_operation_id', 'processing_method', 'metadata');
```

Expected result: All queries should return the expected tables and columns.

## 📊 **Benefits of Consolidation**

✅ **Single Source of Truth** - One file contains the complete schema
✅ **No Migration Order Issues** - Everything is in the correct sequence  
✅ **Easier Deployment** - New installations just run one script
✅ **Better Documentation** - All features documented in one place
✅ **Version Control** - Easier to track schema changes

## 🚨 **Important Notes**

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Try on a copy/test environment first if possible
3. **Existing Data**: The new schema preserves all existing data
4. **No Downtime**: These are additive changes (adding columns/indexes)
5. **Business Metadata**: Your business metadata filtering will continue to work

## 🎯 **Next Steps**

1. Run the appropriate migration option above
2. Continue with batch processing setup if needed
3. Test document upload and processing
4. Verify business metadata filtering still works
5. Delete old script files to avoid confusion

The consolidated schema includes everything needed for the complete PDF AI Assistant with business metadata filtering and batch processing support!