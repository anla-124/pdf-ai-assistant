'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, FileText, Loader2, Building, Users, Briefcase, Globe } from 'lucide-react'
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
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
  metadata: DocumentMetadata
}

export function DocumentUpload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const router = useRouter()

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const allFiles = Array.from(selectedFiles)
    const pdfFiles = allFiles.filter(file => file.type === 'application/pdf')
    const nonPdfCount = allFiles.length - pdfFiles.length

    // Show alert if non-PDF files were selected
    if (nonPdfCount > 0) {
      alert(`${nonPdfCount} file(s) were skipped. Only PDF files are allowed.`)
    }

    const newFiles: UploadFile[] = pdfFiles
      .slice(0, 10) // Limit to 10 files
      .map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'pending' as const,
        metadata: { ...DEFAULT_METADATA } // Initialize with default values
      }))

    setFiles(prev => [...prev, ...newFiles])
  }, [])

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
    for (const uploadFile of files.filter(f => f.status === 'pending')) {
      try {
        // Update status to uploading
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'uploading' as const } 
            : f
        ))

        const formData = new FormData()
        formData.append('file', uploadFile.file)
        formData.append('metadata', JSON.stringify(uploadFile.metadata))

        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('Upload failed')
        }

        const result = await response.json()

        // With job queue: Upload completes immediately, processing happens in background
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'completed' as const, progress: 100 } 
            : f
        ))

        // Optionally trigger immediate processing for better UX
        try {
          await fetch('/api/test/process-jobs')
          console.log('Triggered immediate job processing')
        } catch (error) {
          console.log('Could not trigger immediate processing (this is okay)')
        }

      } catch (error) {
        setFiles(prev => prev.map(f => 
          f.id === uploadFile.id 
            ? { ...f, status: 'error' as const, error: 'Upload failed' } 
            : f
        ))
      }
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
    return pendingFiles.length > 0 && pendingFiles.every(f => isMetadataComplete(f.metadata))
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
                      <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium truncate">
                          {uploadFile.file.name}
                        </p>
                        <div className="flex items-center gap-2">
                          {uploadFile.status === 'uploading' || uploadFile.status === 'processing' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          <p className="text-xs text-gray-500 capitalize">
                            {uploadFile.status}
                            {uploadFile.error && `: ${uploadFile.error}`}
                          </p>
                          {isMetadataComplete(uploadFile.metadata) ? (
                            <span className="text-xs text-green-600 font-medium">✓ Ready</span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">⚠ Metadata required</span>
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

                  {/* Metadata Dropdowns */}
                  {uploadFile.status === 'pending' && (
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