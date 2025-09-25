import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/layout'
import { SimilaritySearchForm } from '@/components/similarity/similarity-search-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileText, Sparkles, Target } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SimilarDocumentsPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Fetch the source document
  const { data: document, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !document) {
    redirect('/dashboard')
  }

  if (document.status !== 'completed') {
    redirect('/dashboard')
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="h-6 border-l border-gray-300 dark:border-gray-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-blue-500" />
                Similarity Search
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Find documents similar to your selected document
              </p>
            </div>
          </div>
        </div>

        {/* Source Document Card */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
              <Target className="h-5 w-5" />
              Source Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {document.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {document.filename}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatFileSize(document.file_size)}</span>
                    <span>{formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {document.metadata?.investor_type && (
                  <Badge variant="outline">
                    {document.metadata.investor_type}
                  </Badge>
                )}
                {document.metadata?.document_type && (
                  <Badge variant="outline">
                    {document.metadata.document_type}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search Form and Results */}
        <SimilaritySearchForm documentId={id} sourceDocument={document} />
      </div>
    </DashboardLayout>
  )
}