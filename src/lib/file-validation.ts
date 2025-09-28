interface ValidationResult {
  isValid: boolean
  issues: string[]
  warnings: string[]
  fileInfo: {
    size: number
    sizeFormatted: string
    type: string
    pageCount?: number
    estimatedProcessingTime?: number
    isPasswordProtected?: boolean
    hasText?: boolean
  }
}

interface FileAnalysis {
  metadata: {
    title?: string
    author?: string
    creator?: string
    producer?: string
    creationDate?: string
    modificationDate?: string
  }
  security: {
    isEncrypted: boolean
    hasUserPassword: boolean
    hasOwnerPassword: boolean
    permissions: string[]
  }
  content: {
    pageCount: number
    hasText: boolean
    hasImages: boolean
    language?: string
    estimatedWordCount: number
  }
  processing: {
    estimatedTime: number
    complexity: 'low' | 'medium' | 'high'
    recommendedProcessor: string
  }
}

export class FileValidator {
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  private static readonly MIN_FILE_SIZE = 1024 // 1KB
  private static readonly ALLOWED_TYPES = ['application/pdf']
  
  static async validateFile(file: File): Promise<ValidationResult> {
    const issues: string[] = []
    const warnings: string[] = []
    
    // Basic file validation
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      issues.push('Only PDF files are supported')
    }
    
    if (file.size > this.MAX_FILE_SIZE) {
      issues.push(`File size exceeds ${this.formatFileSize(this.MAX_FILE_SIZE)} limit`)
    }
    
    if (file.size < this.MIN_FILE_SIZE) {
      issues.push('File appears to be empty or corrupted')
    }
    
    // Check filename
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      warnings.push('File extension should be .pdf')
    }
    
    if (file.name.length > 255) {
      warnings.push('Filename is very long and may cause issues')
    }
    
    // Estimate processing complexity
    let estimatedTime = this.estimateProcessingTime(file.size)
    let complexity: 'low' | 'medium' | 'high' = 'low'
    
    if (file.size > 10 * 1024 * 1024) { // > 10MB
      complexity = 'high'
      warnings.push('Large file - processing may take several minutes')
    } else if (file.size > 5 * 1024 * 1024) { // > 5MB
      complexity = 'medium'
      warnings.push('Medium-sized file - processing may take 1-2 minutes')
    }
    
    // Try to analyze PDF content if possible
    let pageCount: number | undefined
    let hasText = true // Assume true unless we can detect otherwise
    let isPasswordProtected = false
    
    try {
      const analysis = await this.analyzePDFContent(file)
      pageCount = analysis.content.pageCount
      hasText = analysis.content.hasText
      isPasswordProtected = analysis.security.isEncrypted
      
      if (isPasswordProtected) {
        // Only block if we're very confident it's password protected
        issues.push('Password-protected PDFs are not currently supported')
      }
      
      if (!hasText) {
        warnings.push('This appears to be a scanned document - text extraction may be limited')
      }
      
      if (pageCount && pageCount > 100) {
        warnings.push(`Large document (${pageCount} pages) - may exceed processing limits`)
      }
      
      // Update processing estimate based on content analysis
      estimatedTime = this.estimateProcessingTime(file.size, pageCount, hasText)
      
    } catch (error) {
      console.warn('Could not analyze PDF content:', error)
      warnings.push('Could not analyze file content - proceeding with basic validation')
      // Reset password protection flag if analysis failed
      isPasswordProtected = false
    }
    
    const fileInfo = {
      size: file.size,
      sizeFormatted: this.formatFileSize(file.size),
      type: file.type,
      pageCount,
      estimatedProcessingTime: estimatedTime,
      isPasswordProtected,
      hasText
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      fileInfo
    }
  }
  
  private static async analyzePDFContent(file: File): Promise<FileAnalysis> {
    // This is a simplified analysis - in a real implementation, you might use
    // a PDF parsing library like pdf-lib or PDF.js
    
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const header = new TextDecoder().decode(uint8Array.slice(0, 1024))
    
    // Conservative PDF encryption detection
    // Only flag as encrypted if we find multiple encryption indicators
    const encryptMatch = header.match(/\/Encrypt\s+\d+\s+\d+\s+R/) // Reference to encryption object
    const hasUserPassword = header.includes('/U ') || header.includes('/UE ')
    const hasOwnerPassword = header.includes('/O ') || header.includes('/OE ')
    
    // Only consider encrypted if we have both an encrypt reference AND password fields
    const isEncrypted = encryptMatch !== null && (hasUserPassword || hasOwnerPassword)
    
    // Estimate page count from PDF structure
    const content = new TextDecoder().decode(uint8Array.slice(0, Math.min(uint8Array.length, 10000)))
    const pageMatches = content.match(/\/Type\s*\/Page[^s]/g) || []
    const pageCount = Math.max(pageMatches.length, 1)
    
    // Check for text content
    const hasText = content.includes('/Font') || content.includes('BT ') || content.includes('ET ')
    
    // Check for images
    const hasImages = content.includes('/Image') || content.includes('/XObject')
    
    // Estimate word count (very rough)
    const estimatedWordCount = hasText ? Math.floor(pageCount * 250) : 0 // ~250 words per page average
    
    // Determine processing complexity
    let complexity: 'low' | 'medium' | 'high' = 'low'
    if (pageCount > 50 || file.size > 10 * 1024 * 1024) {
      complexity = 'high'
    } else if (pageCount > 20 || file.size > 5 * 1024 * 1024) {
      complexity = 'medium'
    }
    
    return {
      metadata: {
        // Would extract from PDF metadata in real implementation
      },
      security: {
        isEncrypted,
        hasUserPassword,
        hasOwnerPassword,
        permissions: [] // Would extract actual permissions
      },
      content: {
        pageCount,
        hasText,
        hasImages,
        estimatedWordCount
      },
      processing: {
        estimatedTime: this.estimateProcessingTime(file.size, pageCount, hasText),
        complexity,
        recommendedProcessor: complexity === 'high' ? 'FORM_PARSER_PROCESSOR' : 'OCR_PROCESSOR'
      }
    }
  }
  
  private static estimateProcessingTime(
    fileSize: number, 
    pageCount?: number, 
    hasText: boolean = true
  ): number {
    // Base time calculation in seconds
    let baseTime = Math.ceil(fileSize / (1024 * 1024)) * 5 // 5 seconds per MB
    
    if (pageCount) {
      // Add time based on page count
      baseTime += pageCount * 2 // 2 seconds per page
      
      // OCR processing takes longer for scanned documents
      if (!hasText) {
        baseTime *= 2
      }
    }
    
    // Minimum and maximum processing times
    return Math.max(10, Math.min(baseTime, 300)) // 10 seconds to 5 minutes
  }
  
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }
  
  static getValidationRules() {
    return {
      maxFileSize: this.MAX_FILE_SIZE,
      minFileSize: this.MIN_FILE_SIZE,
      allowedTypes: this.ALLOWED_TYPES,
      maxFileSizeFormatted: this.formatFileSize(this.MAX_FILE_SIZE)
    }
  }
}

// Real-time file validation hook for React components
export const useFileValidation = () => {
  const validateFiles = async (files: FileList | File[]): Promise<Map<string, ValidationResult>> => {
    const results = new Map<string, ValidationResult>()
    const fileArray = Array.from(files)
    
    // Validate files in parallel
    const validationPromises = fileArray.map(async (file) => {
      const result = await FileValidator.validateFile(file)
      return { file, result }
    })
    
    const validationResults = await Promise.all(validationPromises)
    
    validationResults.forEach(({ file, result }) => {
      results.set(file.name, result)
    })
    
    return results
  }
  
  const getValidationSummary = (results: Map<string, ValidationResult>) => {
    const total = results.size
    const valid = Array.from(results.values()).filter(r => r.isValid).length
    const invalid = total - valid
    const totalWarnings = Array.from(results.values()).reduce((sum, r) => sum + r.warnings.length, 0)
    const totalIssues = Array.from(results.values()).reduce((sum, r) => sum + r.issues.length, 0)
    
    return {
      total,
      valid,
      invalid,
      totalWarnings,
      totalIssues,
      canProceed: invalid === 0
    }
  }
  
  return {
    validateFiles,
    getValidationSummary,
    rules: FileValidator.getValidationRules()
  }
}