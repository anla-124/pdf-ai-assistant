import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get document status
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .select('status, processing_error')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to fetch document status' }, { status: 500 })
    }

    // Get latest processing status if available
    const { data: processingStatus } = await supabase
      .from('processing_status')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      status: document.status,
      error: document.processing_error,
      processing: processingStatus || null
    })

  } catch (error) {
    console.error('Status fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}