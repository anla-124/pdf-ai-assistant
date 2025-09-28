'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Document } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
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
  Eye,
  Edit,
  Building,
  Users,
  Briefcase,
  Globe,
  ArrowUp,
  ArrowDown,
  FilterX
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { EditDocumentMetadataModal } from './edit-document-metadata-modal'
import { 
  LAW_FIRM_OPTIONS, 
  FUND_MANAGER_OPTIONS, 
  FUND_ADMIN_OPTIONS, 
  JURISDICTION_OPTIONS 
} from '@/lib/metadata-constants'

interface DocumentStatus {
  phase: string
  message: string
  estimatedTimeRemaining?: string
  processingMethod: 'sync' | 'batch'
  isStale?: boolean
}

export function EnhancedDocumentList() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('upload_time')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  
  // Metadata filters
  const [showFilters, setShowFilters] = useState(false)
  const [lawFirmFilter, setLawFirmFilter] = useState<string[]>([])
  const [fundManagerFilter, setFundManagerFilter] = useState<string[]>([])
  const [fundAdminFilter, setFundAdminFilter] = useState<string[]>([])
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [deletingDocuments, setDeletingDocuments] = useState<Set<string>>(new Set())
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [documentStatuses, setDocumentStatuses] = useState<Map<string, DocumentStatus>>(new Map())

  const handleDocumentUpdate = (updatedDocument: Document) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === updatedDocument.id ? updatedDocument : doc
    ))
    setEditingDocument(null)
  }

  // Filter helper functions
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const clearAllFilters = () => {
    setLawFirmFilter([])
    setFundManagerFilter([])
    setFundAdminFilter([])
    setJurisdictionFilter([])
    setShowFilters(false)
  }

  const toggleFilters = () => {
    setShowFilters(!showFilters)
  }

  const hasActiveFilters = () => {
    return lawFirmFilter.length > 0 || 
           fundManagerFilter.length > 0 || 
           fundAdminFilter.length > 0 || 
           jurisdictionFilter.length > 0
  }

  const handleDropdownFilterChange = (filterType: 'law_firm' | 'fund_manager' | 'fund_admin' | 'jurisdiction', selectedValues: string[]) => {
    const setterMap = {
      law_firm: setLawFirmFilter,
      fund_manager: setFundManagerFilter,
      fund_admin: setFundAdminFilter,
      jurisdiction: setJurisdictionFilter
    }

    const setter = setterMap[filterType]
    setter(selectedValues)
  }

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

  const fetchDocumentStatus = useCallback(async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/status`)
      if (!response.ok) {
        console.error(`Failed to fetch status for document ${documentId}`)
        return
      }
      const statusData = await response.json()
      
      if (statusData.detailed_status) {
        setDocumentStatuses(prev => new Map(prev.set(documentId, statusData.detailed_status)))
      }
    } catch (err) {
      console.error(`Error fetching status for document ${documentId}:`, err)
    }
  }, [])

  const fetchAllProcessingStatuses = useCallback(async () => {
    const processingDocs = documents.filter(doc => 
      doc.status === 'processing' || doc.status === 'queued'
    )
    
    if (processingDocs.length > 0) {
      await Promise.all(
        processingDocs.map(doc => fetchDocumentStatus(doc.id))
      )
    }
  }, [documents, fetchDocumentStatus])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-refresh when there are processing documents
  useEffect(() => {
    const hasProcessingDocs = documents.some(doc => 
      doc.status === 'processing' || doc.status === 'uploading' || doc.status === 'queued'
    )

    let interval: NodeJS.Timeout

    if (hasProcessingDocs) {
      setIsPolling(true)
      interval = setInterval(async () => {
        await fetchDocuments(false) // Silent refresh without loading state
        await fetchAllProcessingStatuses() // Fetch enhanced statuses
      }, 3000) // Poll every 3 seconds for detailed updates

      console.log('Started polling for processing documents with enhanced status')
    } else {
      setIsPolling(false)
      console.log('No processing documents, stopped polling')
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [documents, fetchDocuments, fetchAllProcessingStatuses])

  // Fetch initial statuses for processing documents
  useEffect(() => {
    fetchAllProcessingStatuses()
  }, [fetchAllProcessingStatuses])

  // Also poll periodically even when no processing docs to catch new uploads
  useEffect(() => {
    const backgroundInterval = setInterval(() => {
      fetchDocuments(false) // Background refresh every 10 seconds
    }, 10000)

    return () => clearInterval(backgroundInterval)
  }, [fetchDocuments])

  useEffect(() => {
    let filtered = documents.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
      
      // Metadata filters
      const matchesLawFirm = lawFirmFilter.length === 0 || 
        (doc.metadata?.law_firm && lawFirmFilter.includes(doc.metadata.law_firm))
      
      const matchesFundManager = fundManagerFilter.length === 0 || 
        (doc.metadata?.fund_manager && fundManagerFilter.includes(doc.metadata.fund_manager))
      
      const matchesFundAdmin = fundAdminFilter.length === 0 || 
        (doc.metadata?.fund_admin && fundAdminFilter.includes(doc.metadata.fund_admin))
      
      const matchesJurisdiction = jurisdictionFilter.length === 0 || 
        (doc.metadata?.jurisdiction && jurisdictionFilter.includes(doc.metadata.jurisdiction))
      
      return matchesSearch && matchesStatus && matchesLawFirm && 
             matchesFundManager && matchesFundAdmin && matchesJurisdiction
    })

    // Sort documents
    filtered = filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'name':
          comparison = a.title.localeCompare(b.title)
          break
        case 'upload_time':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'size':
          comparison = a.file_size - b.file_size
          break
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

    setFilteredDocuments(filtered)
  }, [searchQuery, statusFilter, sortBy, sortOrder, documents, lawFirmFilter, fundManagerFilter, fundAdminFilter, jurisdictionFilter])

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
      case 'queued':
        return {
          icon: Clock,
          color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800',
          label: 'Queued'
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

  const formatPageCount = (pageCount?: number) => {
    if (!pageCount || pageCount === 0) return null
    return pageCount === 1 ? '1 page' : `${pageCount} pages`
  }

  const getDocumentsByStatus = () => {
    return {
      all: documents.length,
      completed: documents.filter(d => d.status === 'completed').length,
      processing: documents.filter(d => d.status === 'processing' || d.status === 'queued').length,
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
              <span>Live updates active</span>
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
              aria-label="Search documents by title"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={toggleFilters}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters() && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {lawFirmFilter.length + fundManagerFilter.length + fundAdminFilter.length + jurisdictionFilter.length}
                </Badge>
              )}
            </Button>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40" aria-label="Sort documents">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upload_time">Upload Time</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="size">Size</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSortOrder}
              className="px-3"
              aria-label={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            >
              {sortOrder === 'asc' ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Metadata Filters */}
        {showFilters && (
          <div className="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-slate-800/60 filter-panel-enhanced">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Filter Documents</span>
              </div>
              {hasActiveFilters() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-xs h-auto py-1 px-2"
                >
                  <FilterX className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Law Firm Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Building className="h-3 w-3" />
                  Law Firm
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-xs h-8">
                      {lawFirmFilter.length > 0 ? (
                        <span>{lawFirmFilter.length} selected</span>
                      ) : (
                        <span className="text-gray-500">Select...</span>
                      )}
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    {LAW_FIRM_OPTIONS.map(option => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={(e) => {
                          e.preventDefault()
                          const newSelection = lawFirmFilter.includes(option.value)
                            ? lawFirmFilter.filter(item => item !== option.value)
                            : [...lawFirmFilter, option.value]
                          setLawFirmFilter(newSelection)
                        }}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          checked={lawFirmFilter.includes(option.value)}
                          onChange={() => {}} // Handled by onClick above
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs">{option.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Fund Manager Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Users className="h-3 w-3" />
                  Fund Manager
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-xs h-8">
                      {fundManagerFilter.length > 0 ? (
                        <span>{fundManagerFilter.length} selected</span>
                      ) : (
                        <span className="text-gray-500">Select...</span>
                      )}
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    {FUND_MANAGER_OPTIONS.map(option => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={(e) => {
                          e.preventDefault()
                          const newSelection = fundManagerFilter.includes(option.value)
                            ? fundManagerFilter.filter(item => item !== option.value)
                            : [...fundManagerFilter, option.value]
                          setFundManagerFilter(newSelection)
                        }}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          checked={fundManagerFilter.includes(option.value)}
                          onChange={() => {}} // Handled by onClick above
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs">{option.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Fund Admin Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Briefcase className="h-3 w-3" />
                  Fund Admin
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-xs h-8">
                      {fundAdminFilter.length > 0 ? (
                        <span>{fundAdminFilter.length} selected</span>
                      ) : (
                        <span className="text-gray-500">Select...</span>
                      )}
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    {FUND_ADMIN_OPTIONS.map(option => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={(e) => {
                          e.preventDefault()
                          const newSelection = fundAdminFilter.includes(option.value)
                            ? fundAdminFilter.filter(item => item !== option.value)
                            : [...fundAdminFilter, option.value]
                          setFundAdminFilter(newSelection)
                        }}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          checked={fundAdminFilter.includes(option.value)}
                          onChange={() => {}} // Handled by onClick above
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs">{option.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Jurisdiction Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-medium">
                  <Globe className="h-3 w-3" />
                  Jurisdiction
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-xs h-8">
                      {jurisdictionFilter.length > 0 ? (
                        <span>{jurisdictionFilter.length} selected</span>
                      ) : (
                        <span className="text-gray-500">Select...</span>
                      )}
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    {JURISDICTION_OPTIONS.map(option => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={(e) => {
                          e.preventDefault()
                          const newSelection = jurisdictionFilter.includes(option.value)
                            ? jurisdictionFilter.filter(item => item !== option.value)
                            : [...jurisdictionFilter, option.value]
                          setJurisdictionFilter(newSelection)
                        }}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          checked={jurisdictionFilter.includes(option.value)}
                          onChange={() => {}} // Handled by onClick above
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs">{option.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        )}

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
                <Card key={document.id} className={`group hover:shadow-lg transition-all duration-200 hover:-translate-y-1 card-enhanced ${
                  isSelectMode && selectedDocuments.has(document.id) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''
                }`} role="article" aria-labelledby={`document-title-${document.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2 bg-blue-50 dark:bg-gradient-to-br dark:from-blue-900/60 dark:to-blue-800/40 rounded-lg border dark:border-blue-700/30" aria-hidden="true">
                            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle id={`document-title-${document.id}`} className="text-base font-semibold truncate">
                              {document.title}
                            </CardTitle>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
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
                          <DropdownMenuItem 
                            onClick={() => setEditingDocument(document)}
                            className="flex items-center"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
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
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Enhanced Status Display */}
                    {(() => {
                      const enhancedStatus = documentStatuses.get(document.id)
                      const isProcessing = document.status === 'processing' || document.status === 'queued'
                      
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge className={`${statusConfig.color} flex items-center gap-1`}>
                              <StatusIcon className="h-3 w-3" />
                              {enhancedStatus?.phase || statusConfig.label}
                            </Badge>
                            <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                              <div>{formatFileSize(document.file_size)}</div>
                              {formatPageCount(document.page_count) && (
                                <div className="text-gray-400 dark:text-gray-500">
                                  {formatPageCount(document.page_count)}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Enhanced Status Message for Processing Documents */}
                          {isProcessing && enhancedStatus && (
                            <div className="space-y-2">
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                {enhancedStatus.message}
                              </div>
                              
                              {/* Progress Bar - Visual indicator */}
                              {(() => {
                                const getProgressFromPhase = (phase: string, method: string) => {
                                  if (method === 'batch') {
                                    switch (phase) {
                                      case 'Preparing Batch': return 20
                                      case 'Batch Processing': return 60
                                      default: return 10
                                    }
                                  } else {
                                    switch (phase) {
                                      case 'Starting': return 15
                                      case 'Analyzing Document': return 40
                                      case 'Extracting Data': return 70
                                      case 'Generating Embeddings': return 90
                                      default: return 30
                                    }
                                  }
                                }
                                
                                const progress = getProgressFromPhase(enhancedStatus.phase, enhancedStatus.processingMethod)
                                
                                return (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-gray-500 dark:text-gray-400">
                                        Progress
                                      </span>
                                      <span className="text-gray-600 dark:text-gray-400 font-medium">
                                        {progress}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                      <div 
                                        className={`h-1.5 rounded-full transition-all duration-500 ${
                                          enhancedStatus.processingMethod === 'batch' 
                                            ? 'bg-purple-500 dark:bg-purple-400' 
                                            : 'bg-blue-500 dark:bg-blue-400'
                                        }`}
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>
                                )
                              })()}
                              
                              {enhancedStatus.estimatedTimeRemaining && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-500 dark:text-gray-400">
                                    Est. time remaining:
                                  </span>
                                  <span className={`font-medium ${enhancedStatus.isStale ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                    {enhancedStatus.estimatedTimeRemaining}
                                  </span>
                                </div>
                              )}
                              
                              {enhancedStatus.processingMethod === 'batch' && (
                                <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                                  <Clock className="h-3 w-3" />
                                  <span>Batch processing (large document)</span>
                                </div>
                              )}
                              
                              {enhancedStatus.isStale && (
                                <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Status checking...</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Metadata Tags */}
                    {document.metadata && (
                      <div className="space-y-2">
                        {/* Legacy metadata */}
                        {(document.metadata.investor_type || document.metadata.document_type) && (
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
                        
                        {/* Business metadata */}
                        {(document.metadata.law_firm || document.metadata.fund_manager || 
                          document.metadata.fund_admin || document.metadata.jurisdiction) && (
                          <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 dark:text-gray-400">
                            {document.metadata.law_firm && (
                              <div className="flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                <span className="truncate">{document.metadata.law_firm}</span>
                              </div>
                            )}
                            {document.metadata.fund_manager && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span className="truncate">{document.metadata.fund_manager}</span>
                              </div>
                            )}
                            {document.metadata.fund_admin && (
                              <div className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                <span className="truncate">{document.metadata.fund_admin}</span>
                              </div>
                            )}
                            {document.metadata.jurisdiction && (
                              <div className="flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                <span className="truncate">{document.metadata.jurisdiction}</span>
                              </div>
                            )}
                          </div>
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

      {/* Edit Document Metadata Modal */}
      <EditDocumentMetadataModal
        document={editingDocument}
        isOpen={!!editingDocument}
        onClose={() => setEditingDocument(null)}
        onSuccess={handleDocumentUpdate}
      />
    </div>
  )
}