'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Document } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { 
  FileText, 
  Search, 
  Calendar, 
  Filter, 
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  Sparkles,
  MoreVertical,
  Copy,
  Trash2,
  Square,
  CheckSquare,
  X,
  Eye
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export function EnhancedDocumentList() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [deletingDocuments, setDeletingDocuments] = useState<Set<string>>(new Set())
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [isPolling, setIsPolling] = useState(false)

  // Multi-select helper functions
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode)
    setSelectedDocuments(new Set())
  }

  const toggleDocumentSelection = (documentId: string) => {
    const newSelected = new Set(selectedDocuments)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocuments(newSelected)
  }

  const selectAllDocuments = () => {
    const allIds = new Set(filteredDocuments.map(doc => doc.id))
    setSelectedDocuments(allIds)
  }

  const deselectAllDocuments = () => {
    setSelectedDocuments(new Set())
  }

  const deleteDocument = async (documentId: string) => {
    setDeletingDocuments(prev => new Set(prev).add(documentId))
    
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))
      
      // If it was selected, remove from selection
      if (selectedDocuments.has(documentId)) {
        setSelectedDocuments(prev => {
          const newSelected = new Set(prev)
          newSelected.delete(documentId)
          return newSelected
        })
      }

    } catch (error) {
      console.error('Error deleting document:', error)
      alert('Failed to delete document. Please try again.')
    } finally {
      setDeletingDocuments(prev => {
        const newDeleting = new Set(prev)
        newDeleting.delete(documentId)
        return newDeleting
      })
    }
  }

  const deleteSelectedDocuments = async () => {
    if (selectedDocuments.size === 0) return
    
    setShowBulkDeleteDialog(false)
    const documentIds = Array.from(selectedDocuments)
    
    try {
      // Delete documents one by one
      await Promise.all(documentIds.map(id => deleteDocument(id)))
      
      // Exit select mode
      setSelectedDocuments(new Set())
      setIsSelectMode(false)
    } catch (error) {
      console.error('Error in bulk delete:', error)
    }
  }

  const downloadPdf = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.id}/download`)
      
      if (!response.ok) {
        throw new Error('Failed to download document')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.filename
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading document:', error)
      alert('Failed to download document. Please try again.')
    }
  }

  const viewPdf = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.id}/download`)
      
      if (!response.ok) {
        throw new Error('Failed to load document')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      // Open PDF in a new tab
      window.open(url, '_blank')
      
      // Clean up the URL after a short delay to allow the browser to load it
      setTimeout(() => {
        window.URL.revokeObjectURL(url)
      }, 1000)
    } catch (error) {
      console.error('Error viewing document:', error)
      alert('Failed to open document. Please try again.')
    }
  }

  const fetchDocuments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true)
      const response = await fetch('/api/documents')
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      const data = await response.json()
      setDocuments(data)
      setFilteredDocuments(data)
      setError('')
    } catch (err) {
      setError('Failed to load documents')
      console.error(err)
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-refresh when there are processing documents
  useEffect(() => {
    const hasProcessingDocs = documents.some(doc => 
      doc.status === 'processing' || doc.status === 'uploading'
    )

    let interval: NodeJS.Timeout

    if (hasProcessingDocs) {
      setIsPolling(true)
      interval = setInterval(() => {
        fetchDocuments(false) // Silent refresh without loading state
      }, 2000) // Poll every 2 seconds for faster updates

      console.log('Started polling for processing documents')
    } else {
      setIsPolling(false)
      console.log('No processing documents, stopped polling')
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [documents, fetchDocuments])

  // Also poll periodically even when no processing docs to catch new uploads
  useEffect(() => {
    const backgroundInterval = setInterval(() => {
      fetchDocuments(false) // Background refresh every 10 seconds
    }, 10000)

    return () => clearInterval(backgroundInterval)
  }, [fetchDocuments])

  useEffect(() => {
    let filtered = documents.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
      
      return matchesSearch && matchesStatus
    })

    // Sort documents
    filtered = filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title)
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'file_size':
          return b.file_size - a.file_size
        default:
          return 0
      }
    })

    setFilteredDocuments(filtered)
  }, [searchQuery, statusFilter, sortBy, documents])

  const getStatusConfig = (status: Document['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800',
          label: 'Completed'
        }
      case 'processing':
        return {
          icon: Clock,
          color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800',
          label: 'Processing'
        }
      case 'uploading':
        return {
          icon: Clock,
          color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800',
          label: 'Uploading'
        }
      case 'error':
        return {
          icon: AlertCircle,
          color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
          label: 'Error'
        }
      default:
        return {
          icon: FileText,
          color: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800',
          label: 'Unknown'
        }
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getDocumentsByStatus = () => {
    return {
      all: documents.length,
      completed: documents.filter(d => d.status === 'completed').length,
      processing: documents.filter(d => d.status === 'processing').length,
      error: documents.filter(d => d.status === 'error').length,
    }
  }

  const statusCounts = getDocumentsByStatus()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h2>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h2>
          {isPolling && (
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
              <span>Auto-refreshing...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSelectMode && (
            <>
              <Badge variant="secondary">
                {selectedDocuments.size} selected
              </Badge>
              {selectedDocuments.size > 0 && (
                <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected ({selectedDocuments.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Documents</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete {selectedDocuments.size} selected document{selectedDocuments.size > 1 ? 's' : ''}? 
                        This action cannot be undone and will permanently remove the document{selectedDocuments.size > 1 ? 's' : ''} 
                        from your account.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteSelectedDocuments} className="bg-red-600 hover:bg-red-700">
                        Delete {selectedDocuments.size} Document{selectedDocuments.size > 1 ? 's' : ''}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button size="sm" variant="outline" onClick={selectAllDocuments}>
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={deselectAllDocuments}>
                Deselect All
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleSelectMode}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
          {!isSelectMode && (
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export List
            </Button>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" className="flex items-center gap-2">
            All
            <Badge variant="secondary" className="ml-1">
              {statusCounts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Completed
            <Badge variant="secondary" className="ml-1">
              {statusCounts.completed}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            Processing
            <Badge variant="secondary" className="ml-1">
              {statusCounts.processing}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="error" className="flex items-center gap-2">
            <AlertCircle className="h-3 w-3" />
            Errors
            <Badge variant="secondary" className="ml-1">
              {statusCounts.error}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Filters and Search */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" aria-hidden="true" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              aria-label="Search documents by title or filename"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48" aria-label="Sort documents">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Recently Added</SelectItem>
              <SelectItem value="title">Name (A-Z)</SelectItem>
              <SelectItem value="file_size">File Size</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value={statusFilter} className="space-y-4">
          {error && (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="flex items-center justify-center p-8">
                <AlertCircle className="h-8 w-8 text-red-500 mr-3" />
                <span className="text-red-700 dark:text-red-400">{error}</span>
              </CardContent>
            </Card>
          )}

          {filteredDocuments.length === 0 && !error && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-12">
                <FileText className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {searchQuery || statusFilter !== 'all' ? 'No documents found' : 'No documents yet'}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try adjusting your search terms or filters'
                    : 'Upload your first PDF document to get started with AI-powered analysis'
                  }
                </p>
              </CardContent>
            </Card>
          )}

          {/* Document Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredDocuments.map((document) => {
              const statusConfig = getStatusConfig(document.status)
              const StatusIcon = statusConfig.icon
              
              return (
                <Card key={document.id} className={`group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 ${
                  isSelectMode && selectedDocuments.has(document.id) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''
                }`} role="article" aria-labelledby={`document-title-${document.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {isSelectMode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleDocumentSelection(document.id)}
                            className="p-1 h-auto"
                            aria-label={`${selectedDocuments.has(document.id) ? 'Deselect' : 'Select'} ${document.title}`}
                          >
                            {selectedDocuments.has(document.id) ? (
                              <CheckSquare className="h-5 w-5 text-blue-600" />
                            ) : (
                              <Square className="h-5 w-5 text-gray-400" />
                            )}
                          </Button>
                        )}
                        <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg" aria-hidden="true">
                          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle id={`document-title-${document.id}`} className="text-base font-semibold truncate">
                            {document.title}
                          </CardTitle>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {document.filename}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate font-mono">
                            ID: {document.id}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label={`More options for ${document.title}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => downloadPdf(document)}
                            className="flex items-center"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={toggleSelectMode}
                            className="flex items-center"
                          >
                            <CheckSquare className="h-4 w-4 mr-2" />
                            Select Documents
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem 
                                className="flex items-center text-red-600 dark:text-red-400"
                                onSelect={(e) => e.preventDefault()}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Document</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete &quot;{document.title}&quot;? 
                                  This action cannot be undone and will permanently remove the document 
                                  from your account.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteDocument(document.id)} 
                                  className="bg-red-600 hover:bg-red-700"
                                  disabled={deletingDocuments.has(document.id)}
                                >
                                  {deletingDocuments.has(document.id) ? 'Deleting...' : 'Delete Document'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Status Badge */}
                    <div className="flex items-center justify-between">
                      <Badge className={`${statusConfig.color} flex items-center gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(document.file_size)}
                      </span>
                    </div>

                    {/* Metadata Tags */}
                    {document.metadata && (
                      <div className="flex gap-2 flex-wrap">
                        {document.metadata.investor_type && (
                          <Badge variant="outline" className="text-xs">
                            {document.metadata.investor_type}
                          </Badge>
                        )}
                        {document.metadata.document_type && (
                          <Badge variant="outline" className="text-xs">
                            {document.metadata.document_type}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Date */}
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                    </div>

                    {/* Error Message */}
                    {document.processing_error && (
                      <div className="p-2 bg-red-50 dark:bg-red-950/50 rounded text-xs text-red-700 dark:text-red-400">
                        {document.processing_error}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      {document.status === 'completed' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => viewPdf(document)}
                          className="flex-1"
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View PDF
                        </Button>
                      )}
                      {document.status === 'completed' && !document.metadata?.embeddings_skipped && (
                        <Button asChild size="sm" className="flex-1">
                          <Link href={`/documents/${document.id}/similar`}>
                            <Sparkles className="h-3 w-3 mr-1" />
                            Find Similar
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}