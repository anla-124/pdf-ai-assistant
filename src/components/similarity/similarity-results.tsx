'use client'

import { Document, SimilaritySearchResult } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  FileText, 
  Calendar, 
  Download,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Eye
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface SimilarityResultsProps {
  results: SimilaritySearchResult[]
  sourceDocument: Document
  isLoading: boolean
}

export function SimilarityResults({ results, sourceDocument, isLoading }: SimilarityResultsProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 dark:text-green-400'
    if (score >= 0.8) return 'text-blue-600 dark:text-blue-400'
    if (score >= 0.7) return 'text-orange-600 dark:text-orange-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
    if (score >= 0.8) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
    if (score >= 0.7) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="animate-pulse flex flex-col items-center">
            <Sparkles className="h-12 w-12 text-blue-500 mb-4 animate-spin" />
            <p className="text-gray-600 dark:text-gray-400">Searching for similar documents...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Search Results
        </CardTitle>
        <CardDescription>
          Found {results.length} similar document{results.length !== 1 ? 's' : ''} to &quot;{sourceDocument.title}&quot;
        </CardDescription>
      </CardHeader>
      <CardContent>
        {results.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No Similar Documents Found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Try adjusting your search parameters, lowering the minimum similarity threshold, 
              or removing filters to find more results.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {results.map((result, index) => (
              <Card key={result.document.id} className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                        <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {result.document.title}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {result.document.filename}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                            Similarity
                          </span>
                        </div>
                        <Badge className={getScoreBadgeColor(result.score)}>
                          {Math.round(result.score * 100)}%
                        </Badge>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => viewPdf(result.document)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View PDF
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadPdf(result.document)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Progress bar */}
                  <div>
                    <Progress value={result.score * 100} className="h-2" />
                  </div>

                  {/* Document metadata */}
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDistanceToNow(new Date(result.document.created_at), { addSuffix: true })}
                    </span>
                    <span>{formatFileSize(result.document.file_size)}</span>
                    {result.document.metadata?.investor_type && (
                      <Badge variant="outline" className="text-xs">
                        {result.document.metadata.investor_type}
                      </Badge>
                    )}
                    {result.document.metadata?.document_type && (
                      <Badge variant="outline" className="text-xs">
                        {result.document.metadata.document_type}
                      </Badge>
                    )}
                  </div>

                  {/* Matching chunks */}
                  {result.matching_chunks && result.matching_chunks.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-blue-500" />
                        Similar Content ({result.matching_chunks.length} matches)
                      </h4>
                      <div className="space-y-2">
                        {result.matching_chunks.slice(0, 2).map((chunk, chunkIndex) => (
                          <div 
                            key={chunkIndex}
                            className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border-l-2 border-blue-200 dark:border-blue-800"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                Match {chunkIndex + 1}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {Math.round(chunk.score * 100)}% similar
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                              {chunk.text}
                            </p>
                          </div>
                        ))}
                        {result.matching_chunks.length > 2 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 pl-3">
                            + {result.matching_chunks.length - 2} more matching sections
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}