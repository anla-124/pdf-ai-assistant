'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export function JobProcessorTest() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastResult, setLastResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const triggerJobProcessing = async () => {
    setIsProcessing(true)
    setError(null)
    
    try {
      const response = await fetch('/api/test/process-jobs')
      const result = await response.json()
      
      setLastResult(result)
      
      if (!response.ok) {
        setError(result.error || 'Processing failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setIsProcessing(false)
    }
  }

  const getStatusIcon = () => {
    if (isProcessing) return <Loader2 className="h-4 w-4 animate-spin" />
    if (error) return <AlertCircle className="h-4 w-4 text-red-500" />
    if (lastResult?.cronResponse?.status === 200) return <CheckCircle className="h-4 w-4 text-green-500" />
    return <Play className="h-4 w-4" />
  }

  const getStatusMessage = () => {
    if (isProcessing) return 'Processing jobs...'
    if (error) return `Error: ${error}`
    if (lastResult?.cronResponse?.data?.message) return lastResult.cronResponse.data.message
    return 'Ready to process jobs'
  }

  return (
    <Card className="border-dashed border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            🧪 Development: Job Processor Test
            <Badge variant="secondary" className="text-xs">
              DEV ONLY
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          {getStatusIcon()}
          <span>{getStatusMessage()}</span>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={triggerJobProcessing}
            disabled={isProcessing}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Process Queued Jobs
              </>
            )}
          </Button>
          
          <Button 
            onClick={() => window.location.reload()}
            size="sm"
            variant="ghost"
            title="Refresh page to see updated document status"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {lastResult && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-xs font-mono">
              <div><strong>Status:</strong> {lastResult.cronResponse?.status}</div>
              <div><strong>Time:</strong> {new Date(lastResult.timestamp).toLocaleTimeString()}</div>
              {lastResult.cronResponse?.data?.jobId && (
                <div><strong>Job ID:</strong> {lastResult.cronResponse.data.jobId}</div>
              )}
              {lastResult.cronResponse?.data?.documentId && (
                <div><strong>Document ID:</strong> {lastResult.cronResponse.data.documentId}</div>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-950/30 p-2 rounded">
          <strong>💡 How to test:</strong>
          <ol className="mt-1 ml-4 list-decimal text-xs space-y-1">
            <li>Upload a PDF document</li>
            <li>Click &quot;Process Queued Jobs&quot; to trigger processing</li>
            <li>Click refresh to see status updates</li>
            <li>Repeat as needed for testing</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}