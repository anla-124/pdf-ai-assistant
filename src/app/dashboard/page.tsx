import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/dashboard/layout'
import { DocumentUpload } from '@/components/dashboard/document-upload'
import { EnhancedDocumentList } from '@/components/dashboard/enhanced-document-list'
import { JobProcessorTest } from '@/components/dev/job-processor-test'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your documents and discover insights with AI-powered analysis
          </p>
        </div>

        {/* Development: Job Processor Test */}
        <JobProcessorTest />

        {/* Upload Section */}
        <DocumentUpload />

        {/* Document List */}
        <EnhancedDocumentList />
      </div>
    </DashboardLayout>
  )
}