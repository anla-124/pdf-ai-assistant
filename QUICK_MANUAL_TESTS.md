# Quick Manual Testing Guide

Since the automated testing script has some authentication limitations, here's a step-by-step manual testing guide you can follow right now.

## ✅ What We've Confirmed Works:
- ✅ Development server is running and accessible
- ✅ Database connectivity is working
- ✅ User management is functional
- ✅ Document creation in database works
- ✅ Job processing endpoint is accessible
- ✅ Authentication is properly protecting APIs

## 🧪 Manual Tests to Run Now:

### Test 1: Small Document Processing (5 minutes)

1. **Upload a small PDF (1-10 pages)**
   - Go to your dashboard: http://localhost:3000/dashboard
   - Click upload and select a small PDF file
   - Expected: Document appears with "Queued" or "Uploading" status

2. **Watch real-time status updates**
   - Observe the document card for live updates
   - Expected progression:
     - Queued → Processing → Completed
     - Progress bar advances
     - Phase changes: "Starting" → "Analyzing Document" → "Extracting Data" → "Generating Embeddings"
     - Time estimates update in real-time
     - "Live updates active" indicator shows

3. **Verify processing method**
   - Expected: Processing method should be "sync"
   - Small documents should complete in 1-3 minutes

### Test 2: Large Document Processing (10-15 minutes)

1. **Upload a large PDF (>15 pages or >15MB)**
   - Upload through the dashboard
   - Expected: Document appears with initial status

2. **Watch for sync-to-batch switching**
   - Initially tries sync processing
   - Should automatically switch to batch processing if page limit exceeded
   - Expected progression:
     - Queued → Processing (sync attempt) → Processing (batch)
     - Status shows "Batch Processing" 
     - Processing method becomes "batch"
     - Time estimates are longer (5-10 minutes)

3. **Verify batch completion**
   - Expected: Document completes successfully
   - All features work same as sync processed documents

### Test 3: Status API Validation (2 minutes)

Since you're logged in, test the status API directly:

1. **Upload a document and get its ID from the URL or dashboard**

2. **Test status endpoint manually:**
   ```bash
   # Open browser dev tools and run in console:
   fetch('/api/documents/YOUR_DOCUMENT_ID/status')
     .then(r => r.json())
     .then(console.log)
   ```

3. **Expected response structure:**
   ```json
   {
     "id": "doc-id",
     "status": "processing",
     "detailed_status": {
       "phase": "Analyzing Document",
       "message": "Extracting structured data...",
       "estimatedTimeRemaining": "30-90 seconds",
       "processingMethod": "sync",
       "isStale": false
     },
     "progress": 40,
     "processing_method": "sync"
   }
   ```

### Test 4: Error Handling (5 minutes)

1. **Upload invalid file types**
   - Try uploading a .txt file, .jpg, etc.
   - Expected: Proper error messages

2. **Upload very large file**
   - Try uploading a file >100MB
   - Expected: Appropriate handling (rejection or batch processing)

3. **Network interruption**
   - Start processing, then briefly disconnect internet
   - Expected: System handles gracefully, shows appropriate status

### Test 5: User Experience (5 minutes)

1. **Multiple document processing**
   - Upload 2-3 documents simultaneously
   - Expected: All show individual progress
   - Live updates work for all documents

2. **Dashboard responsiveness**
   - Expected: Dashboard remains responsive during processing
   - Auto-refresh works properly
   - Progress indicators are smooth

3. **Search functionality**
   - After documents complete, test similarity search
   - Expected: Returns relevant results
   - Business metadata filters work

## 🎯 Success Criteria:

### ✅ All working correctly if you see:
- Documents process from queued → completed
- Real-time status updates work smoothly
- Progress bars and time estimates are reasonable
- Sync-first approach works (tries sync, then batch if needed)
- Error messages are clear and helpful
- Search works after processing
- Dashboard remains responsive

### ⚠️ Issues to investigate if you see:
- Documents stuck in "processing" for >10 minutes (sync) or >20 minutes (batch)
- No real-time updates (status never changes)
- Immediate failures with unclear error messages
- Dashboard becomes unresponsive
- Search returns no results for processed documents

## 🐛 If You Find Issues:

1. **Check browser console for errors**
2. **Check terminal where `npm run dev` is running**
3. **Try refreshing the page**
4. **Try a different document**
5. **Check network connectivity**

## 📊 Expected Performance:

- **Small docs (1-10 pages):** 1-3 minutes
- **Medium docs (11-15 pages):** 2-5 minutes  
- **Large docs (batch):** 5-15 minutes
- **Status updates:** Every 2-3 seconds
- **Dashboard responsiveness:** Always smooth

---

**Result:** After running these manual tests, you'll have validated that your entire document processing pipeline works correctly with the new sync-first approach and real-time status updates!