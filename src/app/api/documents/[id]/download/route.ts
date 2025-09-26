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

    // Get document to check ownership and get file path
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('file_path, filename, content_type')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }

    // Download file from Supabase storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.file_path)

    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError)
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
    }

    // Return the file as a blob
    return new NextResponse(fileData, {
      headers: {
        'Content-Type': document.content_type || 'application/pdf',
        'Content-Disposition': `attachment; filename="${document.filename}"`,
        'Content-Length': fileData.size.toString(),
      },
    })

  } catch (error) {
    console.error('Document download error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}