# Google Document AI Setup Guide

## Prerequisites
- Google Cloud account
- Billing enabled on your Google Cloud project
- Basic familiarity with Google Cloud Console

## Step 1: Create or Select a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Either create a new project or select an existing one
3. Note your **Project ID** (you'll need this for environment variables)

## Step 2: Enable Document AI API

1. In the Google Cloud Console, navigate to **APIs & Services > Library**
2. Search for "Document AI API"
3. Click on "Cloud Document AI API"
4. Click **Enable**

## Step 3: Create a Document AI Processor

1. Go to **Document AI** in the Google Cloud Console
   - Or visit: https://console.cloud.google.com/ai/document-ai
2. Click **Create Processor**
3. Choose processor type:
   - **Recommended**: "Document OCR" for general text extraction
   - **Alternative**: "Form Parser" if you need advanced form field extraction
4. Configure processor:
   - **Name**: `pdf-processor` (or your preferred name)
   - **Region**: Choose `us` (United States) - this matches our environment setup
5. Click **Create**
6. **Important**: Copy the **Processor ID** from the processor details page

## Step 4: Create Service Account

1. Navigate to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Fill in details:
   - **Service account name**: `document-ai-service`
   - **Description**: `Service account for PDF AI Assistant Document AI integration`
4. Click **Create and Continue**

## Step 5: Assign Permissions

1. Add the following roles to your service account:
   - **Document AI API User** (required for processing documents)
   - **Storage Object Viewer** (if you plan to process files from Google Cloud Storage)
2. Click **Continue** then **Done**

## Step 6: Create and Download Service Account Key

1. Find your newly created service account in the list
2. Click on the service account email
3. Go to the **Keys** tab
4. Click **Add Key > Create new key**
5. Choose **JSON** format
6. Click **Create**
7. The JSON file will be downloaded automatically
8. **Important**: Store this file securely and never commit it to version control

## Step 7: Set Up Environment Variables

1. Place the downloaded JSON file in your project directory:
   ```bash
   mkdir credentials
   mv ~/Downloads/your-service-account-key.json credentials/google-service-account.json
   ```

2. Update your `.env.local` file:
   ```env
   # Google Document AI Configuration
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   GOOGLE_CLOUD_LOCATION=us
   GOOGLE_CLOUD_PROCESSOR_ID=your-processor-id
   GOOGLE_APPLICATION_CREDENTIALS=./credentials/google-service-account.json
   ```

## Step 8: Test the Configuration

You can test your Document AI setup with this simple Node.js script:

```javascript
// test-document-ai.js
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');

async function testDocumentAI() {
  const client = new DocumentProcessorServiceClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  const name = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.GOOGLE_CLOUD_LOCATION}/processors/${process.env.GOOGLE_CLOUD_PROCESSOR_ID}`;
  
  console.log('Document AI configuration:');
  console.log('Project ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
  console.log('Location:', process.env.GOOGLE_CLOUD_LOCATION);
  console.log('Processor ID:', process.env.GOOGLE_CLOUD_PROCESSOR_ID);
  console.log('Processor Name:', name);
  
  console.log('✅ Document AI client initialized successfully!');
}

testDocumentAI().catch(console.error);
```

Run the test:
```bash
node test-document-ai.js
```

## Processor Types Explained

### Document OCR (Recommended)
- **Best for**: General PDF text extraction
- **Features**: 
  - High-quality text extraction
  - Layout detection
  - Basic table detection
- **Use case**: Most PDF documents with text content

### Form Parser
- **Best for**: Structured forms and documents
- **Features**:
  - Form field detection
  - Key-value pair extraction
  - Checkbox detection
  - Advanced table parsing
- **Use case**: Subscription documents with forms, contracts, applications

### Custom Processors
- **Best for**: Specialized document types
- **Features**: 
  - Train on your specific document types
  - Custom field extraction
  - Higher accuracy for domain-specific documents
- **Use case**: If you have very specific document formats

## Security Best Practices

1. **Never commit service account keys** to version control
2. **Use IAM roles** with minimum required permissions
3. **Rotate service account keys** regularly
4. **Monitor API usage** in Google Cloud Console
5. **Set up billing alerts** to avoid unexpected charges

## Cost Optimization

- **Document AI Pricing**: ~$1.50 per 1,000 pages processed
- **Free tier**: 1,000 pages per month
- **Batch processing**: More cost-effective for large volumes
- **Monitor usage**: Set up billing alerts in Google Cloud

## Troubleshooting

### Common Issues

1. **"Permission denied" errors**:
   - Verify service account has Document AI API User role
   - Check that the API is enabled
   - Ensure correct project ID in environment variables

2. **"Processor not found" errors**:
   - Double-check processor ID in environment variables
   - Verify processor region matches GOOGLE_CLOUD_LOCATION
   - Ensure processor is active (not deleted)

3. **"Invalid credentials" errors**:
   - Check path to service account JSON file
   - Verify JSON file is not corrupted
   - Ensure service account has necessary permissions

4. **Quota exceeded errors**:
   - Check your quota limits in Google Cloud Console
   - Request quota increase if needed
   - Consider batch processing for large volumes

### Testing in Development

Create a simple test PDF processing endpoint:

```javascript
// pages/api/test-document-ai.js
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = new DocumentProcessorServiceClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    const name = `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.GOOGLE_CLOUD_LOCATION}/processors/${process.env.GOOGLE_CLOUD_PROCESSOR_ID}`;
    
    // Test with sample text
    const request = {
      name,
      rawDocument: {
        content: Buffer.from('Test document content').toString('base64'),
        mimeType: 'text/plain',
      },
    };

    const [result] = await client.processDocument(request);
    
    res.status(200).json({
      success: true,
      extractedText: result.document?.text || '',
      message: 'Document AI is working correctly!'
    });

  } catch (error) {
    console.error('Document AI test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

## Next Steps

Once Document AI is configured:

1. **Test with sample PDFs** through your application
2. **Monitor processing performance** in Google Cloud Console
3. **Set up monitoring alerts** for API usage and errors
4. **Consider upgrading processor** if you need more advanced features

Your PDF AI Assistant will now be able to extract text and structured data from uploaded PDF documents automatically!