# Batch Processing Setup Guide

## Overview
The app now supports asynchronous batch processing for large documents (>30 pages) using Google Cloud Document AI and Google Cloud Storage.

## Setup Requirements

### 1. Database Schema Update
**IMPORTANT**: Run this SQL script in your Supabase SQL Editor:

```sql
-- Run the database-batch-update.sql file
```

Or copy and paste the contents of `database-batch-update.sql` into your Supabase SQL Editor.

### 2. Google Cloud Storage Setup

#### Create a GCS Bucket
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to Cloud Storage > Buckets
3. Click "Create Bucket"
4. Choose a unique bucket name (e.g., `your-project-batch-processing`)
5. Select the same region as your Document AI processors
6. Create the bucket

#### Set Bucket Permissions
Your service account (the one used for Document AI) needs these permissions:
- Storage Object Admin
- Storage Legacy Bucket Reader

### 3. Environment Variables
Add this to your `.env.local` file:

```env
# Add this line to your existing Google Cloud configuration
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name-here
```

### 4. Test GCS Access
Run this to verify your setup:

```bash
npm run dev
```

Then test GCS access by uploading a small document first.

## How It Works

### Processing Logic
- **Documents ≤30 pages or <2MB**: Uses synchronous processing (existing logic)
- **Documents >30 pages or >2MB**: Uses asynchronous batch processing

### Batch Processing Flow
1. **Upload**: Document uploaded to Supabase Storage → Job created
2. **Job Processing**: Cron job detects large document → Uploads to GCS → Starts batch operation
3. **Polling**: Subsequent cron runs check batch operation status
4. **Completion**: Downloads results → Processes data → Generates embeddings → Cleans up GCS files

### Status Tracking
- Jobs show processing method in database (`sync` vs `batch`)
- Batch operations tracked via `batch_operation_id`
- Real-time status updates in dashboard

## Testing Locally

### 1. Upload Small Document (≤30 pages)
- Should use synchronous processing (existing behavior)
- Completes immediately

### 2. Upload Large Document (>30 pages)
- Should trigger batch processing
- Check browser console for "batch" processing method logs
- Monitor job status in Supabase dashboard
- May take 5-15 minutes for Google Cloud batch processing

### 3. Manual Job Processing
- Use "Process Queued Jobs" button to trigger processing
- Check console logs for batch operation status updates

## Monitoring

### Database Tables to Check
- `document_jobs`: Check `processing_method` and `batch_operation_id` fields
- `documents`: Monitor `status` field for progress
- Console logs: Watch for batch processing messages

### Troubleshooting
- **GCS Access Issues**: Verify bucket permissions and service account key
- **Batch Operation Stuck**: Check Google Cloud Console > Document AI > Operations
- **Missing Results**: Verify GCS bucket has correct output files

## Production Notes
- Cron jobs run every 2 minutes in production (Vercel)
- GCS files are automatically cleaned up after processing
- Batch processing supports up to 500 pages per document
- Costs: GCS storage + Document AI batch processing fees

## Next Steps
1. Run the database update SQL
2. Create GCS bucket and set permissions
3. Add bucket name to environment variables
4. Test with a large document (try your 39+ page document!)