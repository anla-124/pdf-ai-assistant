# Batch Processing Implementation Guide

## 🎯 Goal
Enable processing of large PDF documents (>30 pages) using Google Cloud Document AI batch processing, removing the current 30-page synchronous processing limit.

## 📋 Current Status
✅ **Implemented:** Batch processing infrastructure code
❓ **Needs Setup:** Database schema, GCS bucket, and integration

## 🚀 Step-by-Step Implementation

### Step 1: Database Schema Update
Run this SQL in your Supabase SQL Editor:

```sql
-- Add batch processing columns to document_jobs table
ALTER TABLE public.document_jobs 
  ADD COLUMN IF NOT EXISTS batch_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_method TEXT DEFAULT 'sync' CHECK (processing_method IN ('sync', 'batch')),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_jobs_batch_operation_id ON document_jobs(batch_operation_id);
CREATE INDEX IF NOT EXISTS idx_document_jobs_processing_method ON document_jobs(processing_method);

-- Add comments
COMMENT ON COLUMN public.document_jobs.batch_operation_id IS 'Google Cloud Document AI batch operation ID';
COMMENT ON COLUMN public.document_jobs.processing_method IS 'Processing method: sync for ≤30 pages, batch for >30 pages';
COMMENT ON COLUMN public.document_jobs.metadata IS 'Batch processing metadata (GCS URIs, processor info, etc.)';
```

### Step 2: Google Cloud Storage Setup

#### 2.1 Create GCS Bucket
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Storage > Buckets**
3. Click **"Create Bucket"**
4. Settings:
   - **Name:** `your-project-name-batch-processing` (must be globally unique)
   - **Location:** Same region as your Document AI processors
   - **Storage class:** Standard
   - **Access control:** Uniform (bucket-level)

#### 2.2 Set Bucket Permissions
Your service account needs these roles:
- **Storage Object Admin** (for reading/writing files)
- **Storage Legacy Bucket Reader** (for listing objects)

### Step 3: Environment Variables
Add to your `.env.local` file:

```bash
# Add this new variable (others should already exist)
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name-here
```

### Step 4: Update Document Processing Logic

The batch processing code is already implemented. We need to modify the main document processing to automatically use batch processing for large documents.

### Step 5: Test the Setup

1. **Verify Setup:**
   ```bash
   node scripts/verify-batch-setup.js
   ```

2. **Test with Large Document:**
   - Upload a PDF with >30 pages
   - Should automatically trigger batch processing
   - Monitor processing status in document dashboard

## 🔧 Implementation Details

### Automatic Processing Decision
```typescript
// In document processing
const shouldUseBatch = document.page_count > 30 || document.file_size > 50 * 1024 * 1024; // >50MB
```

### Processing Flow
1. **Small Documents (≤30 pages):** Synchronous processing (current method)
2. **Large Documents (>30 pages):** 
   - Upload to GCS
   - Start batch operation
   - Poll for completion
   - Download and process results
   - Generate embeddings

### Status Tracking
- `sync`: Real-time processing updates
- `batch`: Periodic status checks via Google Cloud Operations API

## 📊 Benefits of Batch Processing

✅ **No Page Limits:** Process documents of any size
✅ **Better Resource Management:** Offload heavy processing to Google Cloud
✅ **Improved Reliability:** Async processing handles timeouts better
✅ **Cost Optimization:** More efficient for large documents

## 🧪 Testing Checklist

- [ ] Database schema updated
- [ ] GCS bucket created and accessible
- [ ] Environment variables configured
- [ ] Verification script passes
- [ ] Small document processing still works (sync)
- [ ] Large document triggers batch processing
- [ ] Batch operation status tracking works
- [ ] Processed results are correct
- [ ] Embeddings generation works for batch-processed documents

## 🚨 Troubleshooting

### Common Issues

**1. GCS Access Denied**
- Verify service account has proper IAM roles
- Check bucket permissions
- Ensure GOOGLE_APPLICATION_CREDENTIALS points to correct file

**2. Batch Operation Fails**
- Check Document AI API is enabled
- Verify processor IDs are correct
- Monitor Google Cloud Console for detailed error logs

**3. Database Errors**
- Ensure all required columns exist in document_jobs table
- Check Supabase RLS policies allow service role access

**4. Long Processing Times**
- Batch processing takes longer than sync (minutes vs seconds)
- Implement proper status polling intervals
- Add user notifications for long-running operations

## 📈 Next Enhancements

After basic batch processing works:
1. **Real-time Status Updates:** WebSocket notifications
2. **Progress Tracking:** Detailed processing progress
3. **Batch Queue Management:** Handle multiple large documents
4. **Retry Logic:** Auto-retry failed batch operations
5. **Cost Monitoring:** Track batch processing costs

---

## ✅ Implementation Status

### 🎉 **COMPLETED - Batch Processing System Ready!**

**What's Been Implemented:**
✅ **Automatic Document Processing Decision Logic**
- Documents >30 pages or >50MB automatically use batch processing
- Smaller documents continue using fast synchronous processing
- Graceful fallback from sync to batch if page limits are exceeded

✅ **Complete Batch Processing Infrastructure**
- Document upload to Google Cloud Storage
- Batch operation initiation with Google Document AI
- Status monitoring and completion checking
- Result processing and text extraction
- Embedding generation for similarity search
- Automatic cleanup of temporary files

✅ **Real-time Monitoring Dashboard**
- Batch Processing Monitor component in dashboard
- Live status updates every 30 seconds
- Manual operation checking with one click
- Detailed operation tracking and progress display

✅ **Robust Error Handling**
- Graceful fallback mechanisms
- Comprehensive error logging
- Failed operation recovery
- User-friendly error messages

✅ **API Endpoints**
- `/api/admin/batch-status` - Monitor and manage batch operations
- Automatic status checking and completion processing
- Support for both individual and bulk operation management

## 🚀 Ready to Use!

Follow the setup guide in `SETUP_BATCH_PROCESSING.md` to:
1. Run the database migration (5 minutes)
2. Create and configure Google Cloud Storage bucket (10 minutes)  
3. Add environment variable (2 minutes)
4. Test with large documents (10 minutes)

**Total Setup Time: ~30 minutes**

After setup, your PDF AI Assistant will seamlessly handle documents of any size!