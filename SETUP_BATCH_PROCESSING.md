# Batch Processing Setup - Step by Step Guide

## 🎯 What You'll Achieve
After completing this setup, your PDF AI Assistant will:
- ✅ Automatically process documents larger than 30 pages or 50MB
- ✅ Handle documents of any size using Google Cloud batch processing
- ✅ Provide real-time status monitoring for large document processing
- ✅ Maintain all existing functionality for smaller documents

## 📋 Prerequisites Checklist
Before starting, ensure you have:
- [x] Working PDF AI Assistant (business metadata filtering complete)
- [ ] Google Cloud Project with Document AI enabled
- [ ] Supabase project with admin access
- [ ] Google Cloud service account with proper permissions

## 🚀 Setup Steps

### Step 1: Database Schema Update (5 minutes)

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor

2. **Run the Migration**
   Copy and paste this SQL into the SQL Editor:
   
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

3. **Verify Success**
   You should see a success message with no errors.

### Step 2: Google Cloud Storage Setup (10 minutes)

1. **Create GCS Bucket**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to **Cloud Storage > Buckets**
   - Click **"Create Bucket"**
   
   **Bucket Settings:**
   - **Name:** `your-project-name-batch-processing` (must be globally unique)
   - **Location:** Same region as your Document AI processors (e.g., us-central1)
   - **Storage class:** Standard
   - **Access control:** Uniform (bucket-level)

2. **Set Bucket Permissions**
   - Go to the bucket's **Permissions** tab
   - Ensure your service account has these roles:
     - Storage Object Admin
     - Storage Legacy Bucket Reader

3. **Test Access** (Optional)
   - Try uploading a test file to verify permissions
   - Delete the test file after verification

### Step 3: Environment Configuration (2 minutes)

1. **Add Environment Variable**
   In your `.env.local` file, add:
   
   ```bash
   # Add this line (replace with your actual bucket name)
   GOOGLE_CLOUD_STORAGE_BUCKET=your-project-name-batch-processing
   ```

2. **Restart Development Server**
   ```bash
   npm run dev
   ```

### Step 4: Verification (5 minutes)

1. **Run Setup Verification**
   ```bash
   node scripts/verify-batch-setup.js
   ```
   
   **Expected Output:**
   ```
   ✅ Environment Variables Check: All required variables found
   ✅ Database Schema Check: Batch processing columns exist
   ✅ Google Cloud Storage Check: Bucket accessible
   ✅ Document AI Check: Client initialized successfully
   🎉 Batch Processing Setup: READY
   ```

2. **Check Dashboard**
   - Go to your dashboard: `http://localhost:3000/dashboard`
   - You should see a new "Batch Processing Monitor" section
   - It should show "No pending batch operations" initially

## 🧪 Testing the Setup

### Test with a Large Document

1. **Get a Large PDF**
   - Find or create a PDF larger than 30 pages
   - Or use a PDF larger than 50MB

2. **Upload the Document**
   - Go to your dashboard
   - Upload the large PDF
   - Watch the processing status

3. **Monitor Batch Processing**
   - The document should automatically trigger batch processing
   - Check the "Batch Processing Monitor" section
   - Processing will take 3-10 minutes depending on document size

4. **Expected Behavior:**
   ```
   📋 Console logs should show:
   "🔄 Large document detected (XX.XMB, ~XX pages) - using batch processing"
   "✅ Batch operation started: [operation-id]"
   ```

### Test with a Small Document

1. **Upload a Small PDF** (< 30 pages)
2. **Verify Normal Processing**
   - Should process immediately (synchronous)
   - No batch operations should appear in the monitor

## 🔧 Troubleshooting

### Issue: Environment Variables Not Found
**Solution:** 
- Ensure `.env.local` file exists in project root
- Restart development server after adding variables
- Check for typos in variable names

### Issue: Database Migration Fails
**Solution:**
- Ensure you have admin access to Supabase
- Check that `document_jobs` table exists
- Re-run the migration SQL

### Issue: GCS Access Denied
**Solution:**
- Verify service account has correct IAM roles
- Check bucket permissions
- Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to correct service account file

### Issue: Batch Processing Doesn't Start
**Solution:**
- Check console logs for error messages
- Verify Document AI API is enabled
- Ensure processor IDs are configured correctly

## 📊 What Happens Next?

### For Large Documents:
1. **Automatic Detection:** System detects large documents
2. **Upload to GCS:** Document is uploaded to Google Cloud Storage
3. **Batch Processing:** Google Cloud Document AI processes the document
4. **Status Monitoring:** Real-time status updates in dashboard
5. **Result Processing:** Extracted text and fields are saved
6. **Embedding Generation:** Similarity search capabilities are enabled
7. **Cleanup:** Temporary files are removed from GCS

### Processing Times:
- **Small Documents (< 30 pages):** 30 seconds - 2 minutes
- **Large Documents (> 30 pages):** 3 - 10 minutes
- **Very Large Documents (> 100 pages):** 5 - 15 minutes

## 🎉 Success Criteria

You've successfully set up batch processing when:
- [ ] Verification script passes all checks
- [ ] Dashboard shows batch processing monitor
- [ ] Large documents trigger batch processing automatically
- [ ] Small documents continue to process normally
- [ ] Batch operations complete successfully
- [ ] Processed documents have similarity search enabled

## 📈 Next Steps After Setup

Once batch processing is working:

1. **Monitor Performance**
   - Track processing times for different document sizes
   - Monitor Google Cloud costs
   - Check success rates

2. **Optimize Settings**
   - Adjust batch thresholds if needed
   - Fine-tune polling intervals
   - Configure cleanup schedules

3. **Scale Up**
   - Test with multiple concurrent batch operations
   - Plan for increased usage
   - Consider adding progress notifications

---

## 🆘 Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Review Google Cloud Console logs
3. Check Supabase logs for database issues
4. Verify all environment variables are correct

The batch processing system is designed to be robust and handle failures gracefully. Most issues are configuration-related and can be resolved by double-checking the setup steps.