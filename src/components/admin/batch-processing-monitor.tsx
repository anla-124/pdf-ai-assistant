'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

interface BatchOperation {
  document_id: string
  batch_operation_id: string
  documents: {
    id: string
    filename: string
    status: string
  }
}

interface BatchStatus {
  success: boolean
  pendingOperations: number
  operations: BatchOperation[]
}

export function BatchProcessingMonitor() {
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)

  const fetchBatchStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/batch-status')
      const data = await response.json()
      setBatchStatus(data)
    } catch (error) {
      console.error('Failed to fetch batch status:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkBatchOperations = async () => {
    setChecking(true)
    try {
      const response = await fetch('/api/admin/batch-status', { method: 'POST' })
      const result = await response.json()
      console.log('Batch check result:', result)
      
      // Refresh the status after checking
      await fetchBatchStatus()
    } catch (error) {
      console.error('Failed to check batch operations:', error)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    fetchBatchStatus()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchBatchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="text-green-700 bg-green-100">Completed</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'processing':
        return <Badge variant="default" className="text-blue-700 bg-blue-100">Processing</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Batch Processing Monitor</CardTitle>
            <CardDescription>
              Monitor large document batch processing operations
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchBatchStatus}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={checkBatchOperations}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Check Operations
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !batchStatus ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading batch status...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {batchStatus?.pendingOperations || 0}
                </div>
                <div className="text-sm text-blue-700">Pending Operations</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">
                  {batchStatus?.operations?.length || 0}
                </div>
                <div className="text-sm text-gray-700">Total Batch Jobs</div>
              </div>
            </div>

            {/* Operations List */}
            {batchStatus?.operations && batchStatus.operations.length > 0 ? (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Active Batch Operations</h4>
                {batchStatus.operations.map((operation) => (
                  <div 
                    key={operation.document_id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-white"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(operation.documents.status)}
                      <div>
                        <div className="font-medium text-sm">
                          {operation.documents.filename}
                        </div>
                        <div className="text-xs text-gray-500">
                          Doc ID: {operation.document_id.substring(0, 8)}...
                        </div>
                        <div className="text-xs text-gray-500">
                          Operation: {operation.batch_operation_id.substring(0, 20)}...
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(operation.documents.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <div>No pending batch operations</div>
                <div className="text-sm">Large documents that require batch processing will appear here</div>
              </div>
            )}

            {/* Instructions */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm">
              <h5 className="font-medium mb-2">How Batch Processing Works:</h5>
              <ul className="space-y-1 text-gray-600">
                <li>• Documents are processed with fast sync first, then batch if needed</li>
                <li>• Batch operations are sent to Google Cloud Document AI for processing</li>
                <li>• Processing typically takes 3-10 minutes depending on document size</li>
                <li>• Click &quot;Check Operations&quot; to manually check for completed batch jobs</li>
                <li>• Status updates automatically every 30 seconds</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}