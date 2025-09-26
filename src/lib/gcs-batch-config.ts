import { Storage } from '@google-cloud/storage'

// Initialize Google Cloud Storage client
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

export const GCS_CONFIG = {
  BUCKET_NAME: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || '',
  BATCH_INPUT_PREFIX: 'batch-processing/input/',
  BATCH_OUTPUT_PREFIX: 'batch-processing/output/',
  TEMP_FILE_TTL_HOURS: 24, // Clean up temp files after 24 hours
}

export class GCSBatchManager {
  private bucket = GCS_CONFIG.BUCKET_NAME ? storage.bucket(GCS_CONFIG.BUCKET_NAME) : null

  async uploadDocumentForBatch(documentId: string, fileBuffer: Buffer, filename: string): Promise<string> {
    if (!this.bucket) {
      throw new Error('Google Cloud Storage bucket not configured')
    }
    
    const gcsFileName = `${GCS_CONFIG.BATCH_INPUT_PREFIX}${documentId}/${filename}`
    const file = this.bucket.file(gcsFileName)

    console.log(`Uploading document to GCS: gs://${GCS_CONFIG.BUCKET_NAME}/${gcsFileName}`)

    await file.save(fileBuffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          documentId,
          uploadedAt: new Date().toISOString(),
          source: 'pdf-ai-assistant-batch',
        },
      },
    })

    return `gs://${GCS_CONFIG.BUCKET_NAME}/${gcsFileName}`
  }

  async downloadBatchResults(documentId: string): Promise<any[]> {
    if (!this.bucket) {
      throw new Error('Google Cloud Storage bucket not configured')
    }
    
    const outputPrefix = `${GCS_CONFIG.BATCH_OUTPUT_PREFIX}${documentId}/`
    console.log(`Looking for batch results with prefix: ${outputPrefix}`)

    const [files] = await this.bucket.getFiles({
      prefix: outputPrefix,
    })

    const results: any[] = []

    for (const file of files) {
      if (file.name.endsWith('.json')) {
        console.log(`Downloading batch result: ${file.name}`)
        const [content] = await file.download()
        const jsonContent = JSON.parse(content.toString())
        results.push(jsonContent)
      }
    }

    return results
  }

  async cleanupBatchFiles(documentId: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('Google Cloud Storage bucket not configured')
    }
    
    console.log(`Cleaning up batch files for document: ${documentId}`)

    // Delete input files
    const inputPrefix = `${GCS_CONFIG.BATCH_INPUT_PREFIX}${documentId}/`
    const [inputFiles] = await this.bucket.getFiles({ prefix: inputPrefix })
    
    for (const file of inputFiles) {
      await file.delete()
      console.log(`Deleted input file: ${file.name}`)
    }

    // Delete output files  
    const outputPrefix = `${GCS_CONFIG.BATCH_OUTPUT_PREFIX}${documentId}/`
    const [outputFiles] = await this.bucket.getFiles({ prefix: outputPrefix })
    
    for (const file of outputFiles) {
      await file.delete()
      console.log(`Deleted output file: ${file.name}`)
    }
  }

  getBatchInputUri(documentId: string): string {
    return `gs://${GCS_CONFIG.BUCKET_NAME}/${GCS_CONFIG.BATCH_INPUT_PREFIX}${documentId}/`
  }

  getBatchOutputUri(documentId: string): string {
    return `gs://${GCS_CONFIG.BUCKET_NAME}/${GCS_CONFIG.BATCH_OUTPUT_PREFIX}${documentId}/`
  }

  async checkBucketAccess(): Promise<boolean> {
    if (!this.bucket) {
      return false
    }
    
    try {
      const [exists] = await this.bucket.exists()
      if (!exists) {
        console.error(`GCS bucket ${GCS_CONFIG.BUCKET_NAME} does not exist`)
        return false
      }

      // Test write access
      const testFile = this.bucket.file('test-access.txt')
      await testFile.save('test', { resumable: false })
      await testFile.delete()
      
      console.log(`GCS bucket access verified: ${GCS_CONFIG.BUCKET_NAME}`)
      return true
    } catch (error) {
      console.error('GCS bucket access check failed:', error)
      return false
    }
  }
}

export const gcsManager = new GCSBatchManager()