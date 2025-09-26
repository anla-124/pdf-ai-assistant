'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, FileText, Loader2 } from 'lucide-react'

interface UploadFile {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  error?: string
}

export function DocumentUpload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const router = useRouter()

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const newFiles: UploadFile[] = Array.from(selectedFiles)
      .filter(file => file.type === 'application/pdf')
      .slice(0, 10) // Limit to 10 files
      .map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'pending' as const,
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

  return (
    <Card>
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
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((uploadFile) => (
                <div key={uploadFile.id} className="flex items-center gap-2 p-2 border rounded">
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
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
                    </div>
                    {uploadFile.progress > 0 && (
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div 
                          className="bg-blue-600 h-1 rounded-full transition-all"
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    )}
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
              ))}
            </div>

            <Button
              onClick={uploadFiles}
              disabled={!files.some(f => f.status === 'pending')}
              className="w-full"
            >
              {files.some(f => f.status === 'uploading' || f.status === 'processing')
                ? 'Processing...'
                : `Upload ${files.filter(f => f.status === 'pending').length} Files`
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}