'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, FileText, Loader2, Building, Users, Briefcase, Globe, AlertTriangle, CheckCircle, Clock, Info } from 'lucide-react'
import { useFileValidation } from '@/lib/file-validation'
import { 
  LAW_FIRM_OPTIONS, 
  FUND_MANAGER_OPTIONS, 
  FUND_ADMIN_OPTIONS, 
  JURISDICTION_OPTIONS,
  DEFAULT_METADATA,
  type LawFirmOption,
  type FundManagerOption,
  type FundAdminOption,
  type JurisdictionOption
} from '@/lib/metadata-constants'

interface DocumentMetadata {
  law_firm: LawFirmOption | ''
  fund_manager: FundManagerOption | ''
  fund_admin: FundAdminOption | ''
  jurisdiction: JurisdictionOption | ''
}

interface UploadFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'validating'
  error?: string
  metadata: DocumentMetadata
  validation?: {
    isValid: boolean
    issues: string[]
    warnings: string[]
    fileInfo: any
  }
}

export function DocumentUpload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const router = useRouter()
  const { validateFiles, getValidationSummary } = useFileValidation()

  const handleFileSelect = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    setIsValidating(true)

    const allFiles = Array.from(selectedFiles)
    const pdfFiles = allFiles.filter(file => file.type === 'application/pdf')
    const nonPdfCount = allFiles.length - pdfFiles.length

    // Show alert if non-PDF files were selected
    if (nonPdfCount > 0) {
      alert(`${nonPdfCount} file(s) were skipped. Only PDF files are allowed.`)
    }

    // Limit to 10 files
    const filesToProcess = pdfFiles.slice(0, 10)
    if (pdfFiles.length > 10) {
      alert(`Only the first 10 files will be processed. ${pdfFiles.length - 10} files were skipped.`)
    }

    // Create initial file objects with validating status
    const newFiles: UploadFile[] = filesToProcess.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      progress: 0,
      status: 'validating' as const,
      metadata: { ...DEFAULT_METADATA }
    }))

    setFiles(prev => [...prev, ...newFiles])

    try {
      // Validate files
      const validationResults = await validateFiles(filesToProcess)
      
      // Update files with validation results
      setFiles(prev => prev.map(f => {
        const validation = validationResults.get(f.file.name)
        if (validation) {
          return {
            ...f,
            status: validation.isValid ? 'pending' as const : 'error' as const,
            validation,
            error: validation.isValid ? undefined : validation.issues.join(', ')
          }
        }
        return f
      }))

      // Show validation summary
      const summary = getValidationSummary(validationResults)
      if (summary.invalid > 0) {
        alert(`${summary.invalid} file(s) failed validation. Please check the issues and try again.`)
      } else if (summary.totalWarnings > 0) {
        console.log(`Validation completed with ${summary.totalWarnings} warning(s)`)
      }

    } catch (error) {
      console.error('Validation failed:', error)
      // Mark all new files as error if validation fails
      setFiles(prev => prev.map(f => 
        newFiles.some(nf => nf.id === f.id)
          ? { ...f, status: 'error' as const, error: 'Validation failed' }
          : f
      ))
    } finally {
      setIsValidating(false)
    }
  }, [validateFiles, getValidationSummary])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const uploadFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    
    // Parallel upload processing with concurrency limit
    const CONCURRENCY_LIMIT = 3 // Process up to 3 files simultaneously
    const uploadPromises: Promise<void>[] = []
    
    for (let i = 0; i < pendingFiles.length; i += CONCURRENCY_LIMIT) {
      const batch = pendingFiles.slice(i, i + CONCURRENCY_LIMIT)
      
      const batchPromises = batch.map(uploadFile => uploadSingleFile(uploadFile))
      uploadPromises.push(...batchPromises)
      
      // Wait for current batch to complete before starting next batch
      await Promise.allSettled(batchPromises)
    }
    
    // Optional: Trigger batch job processing after all uploads complete
    try {
      await fetch('/api/test/process-jobs')
      console.log('Triggered batch job processing for all uploaded files')
    } catch (error) {
      console.log('Could not trigger batch processing (this is okay)')
    }
  }

  const uploadSingleFile = async (uploadFile: UploadFile): Promise<void> => {
    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'uploading' as const, progress: 10 } 
          : f
      ))

      const formData = new FormData()
      formData.append('file', uploadFile.file)
      formData.append('metadata', JSON.stringify(uploadFile.metadata))

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id && f.progress < 90
            ? { ...f, progress: Math.min(f.progress + 10, 90) }
            : f
        ))
      }, 200)

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(errorData.error || 'Upload failed')
      }

      const result = await response.json()

      // Upload completed successfully
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'completed' as const, progress: 100 } 
          : f
      ))

      console.log(`✅ Successfully uploaded: ${uploadFile.file.name}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      console.error(`❌ Upload failed for ${uploadFile.file.name}:`, errorMessage)
      
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id 
          ? { ...f, status: 'error' as const, error: errorMessage, progress: 0 } 
          : f
      ))
    }
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'completed'))
  }

  const updateFileMetadata = (fileId: string, field: keyof DocumentMetadata, value: string) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, metadata: { ...f.metadata, [field]: value } }
        : f
    ))
  }

  const isMetadataComplete = (metadata: DocumentMetadata) => {
    return metadata.law_firm !== '' && 
           metadata.fund_manager !== '' && 
           metadata.fund_admin !== '' && 
           metadata.jurisdiction !== ''
  }

  const canUpload = () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    return pendingFiles.length > 0 && 
           pendingFiles.every(f => isMetadataComplete(f.metadata) && f.validation?.isValid !== false)
  }

  const getFileStatusIcon = (uploadFile: UploadFile) => {
    switch (uploadFile.status) {
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'pending':
        return uploadFile.validation?.isValid ? 
          <CheckCircle className="h-4 w-4 text-green-500" /> :
          <FileText className="h-4 w-4 text-gray-400" />
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      default:
        return <FileText className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <Card className="card-enhanced">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Documents
        </CardTitle>
        <CardDescription>
          Upload PDF documents for processing and similarity search
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Drop PDF files here or click to browse
          </p>
          <p className="text-xs text-gray-500">
            Maximum 10 files, up to 50MB each
          </p>
          <Input
            id="file-upload"
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Upload Queue</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                disabled={!files.some(f => f.status === 'completed')}
              >
                Clear Completed
              </Button>
            </div>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {files.map((uploadFile) => (
                <div key={uploadFile.id} className={`border rounded-lg p-4 space-y-3 ${
                  isMetadataComplete(uploadFile.metadata) 
                    ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20' 
                    : 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
                }`}>
                  {/* File Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getFileStatusIcon(uploadFile)}
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">
                          {uploadFile.file.name}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-gray-500 capitalize">
                            {uploadFile.status}
                            {uploadFile.error && `: ${uploadFile.error}`}
                          </p>
                          
                          {/* Validation status */}
                          {uploadFile.validation && (
                            <>
                              {uploadFile.validation.isValid ? (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                  ✓ Validated
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  ✗ Invalid
                                </Badge>
                              )}
                              
                              {/* File info */}
                              <span className="text-xs text-gray-400">
                                {uploadFile.validation.fileInfo.sizeFormatted}
                                {uploadFile.validation.fileInfo.pageCount && 
                                  ` • ${uploadFile.validation.fileInfo.pageCount} pages`}
                                {uploadFile.validation.fileInfo.estimatedProcessingTime && 
                                  ` • ~${Math.round(uploadFile.validation.fileInfo.estimatedProcessingTime / 60)}min`}
                              </span>
                            </>
                          )}
                          
                          {/* Metadata status */}
                          {uploadFile.status === 'pending' && (
                            isMetadataComplete(uploadFile.metadata) ? (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                ✓ Ready
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700">
                                ⚠ Metadata required
                              </Badge>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadFile.id)}
                      disabled={uploadFile.status === 'uploading' || uploadFile.status === 'processing'}
                    >
                      ×
                    </Button>
                  </div>

                  {/* Validation Issues and Warnings */}
                  {uploadFile.validation && (uploadFile.validation.issues.length > 0 || uploadFile.validation.warnings.length > 0) && (
                    <div className="space-y-2">
                      {uploadFile.validation.issues.length > 0 && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-sm text-red-800">
                            <div className="font-medium">Issues found:</div>
                            <ul className="list-disc list-inside mt-1">
                              {uploadFile.validation.issues.map((issue, idx) => (
                                <li key={idx}>{issue}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {uploadFile.validation.warnings.length > 0 && (
                        <Alert className="border-amber-200 bg-amber-50">
                          <Info className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-sm text-amber-800">
                            <div className="font-medium">Warnings:</div>
                            <ul className="list-disc list-inside mt-1">
                              {uploadFile.validation.warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* Metadata Dropdowns */}
                  {uploadFile.status === 'pending' && uploadFile.validation?.isValid && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Select metadata for this document (all fields required):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <Building className="h-3 w-3" />
                            Law Firm
                          </Label>
                          <Select 
                            value={uploadFile.metadata.law_firm} 
                            onValueChange={(value: LawFirmOption) => 
                              updateFileMetadata(uploadFile.id, 'law_firm', value)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Please select" />
                            </SelectTrigger>
                            <SelectContent>
                              {LAW_FIRM_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <Users className="h-3 w-3" />
                            Fund Manager
                          </Label>
                          <Select 
                            value={uploadFile.metadata.fund_manager} 
                            onValueChange={(value: FundManagerOption) => 
                              updateFileMetadata(uploadFile.id, 'fund_manager', value)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Please select" />
                            </SelectTrigger>
                            <SelectContent>
                              {FUND_MANAGER_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <Briefcase className="h-3 w-3" />
                            Fund Admin
                          </Label>
                          <Select 
                            value={uploadFile.metadata.fund_admin} 
                            onValueChange={(value: FundAdminOption) => 
                              updateFileMetadata(uploadFile.id, 'fund_admin', value)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Please select" />
                            </SelectTrigger>
                            <SelectContent>
                              {FUND_ADMIN_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <Globe className="h-3 w-3" />
                            Jurisdiction
                          </Label>
                          <Select 
                            value={uploadFile.metadata.jurisdiction} 
                            onValueChange={(value: JurisdictionOption) => 
                              updateFileMetadata(uploadFile.id, 'jurisdiction', value)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Please select" />
                            </SelectTrigger>
                            <SelectContent>
                              {JURISDICTION_OPTIONS.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {uploadFile.progress > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-1">
                      <div 
                        className="bg-blue-600 h-1 rounded-full transition-all"
                        style={{ width: `${uploadFile.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={uploadFiles}
              disabled={!canUpload()}
              className="w-full"
            >
              {files.some(f => f.status === 'uploading' || f.status === 'processing')
                ? 'Processing...'
                : canUpload()
                  ? `Upload ${files.filter(f => f.status === 'pending').length} Files`
                  : 'Complete all metadata fields to upload'
              }
            </Button>
            
          </div>
        )}
      </CardContent>
    </Card>
  )
}