import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteDocumentFromPinecone } from '@/lib/pinecone'

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

    const { data: document, error: dbError } = await supabase
      .from('documents')
      .select(`
        *,
        extracted_fields (*)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (dbError) {
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }

    return NextResponse.json(document)

  } catch (error) {
    console.error('Document fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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
      .select('file_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.file_path])

    if (storageError) {
      console.error('Storage deletion error:', storageError)
    }

    // Delete from Pinecone first (before database, in case we need to rollback)
    try {
      await deleteDocumentFromPinecone(id)
      console.log(`Deleted vectors for document ${id} from Pinecone`)
    } catch (pineconeError) {
      console.error('Pinecone deletion error:', pineconeError)
      // Continue with deletion even if Pinecone fails - we'll clean up stale vectors later
    }

    // Delete from database (CASCADE will handle related records)
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Database deletion error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Document deleted successfully from all systems' })

  } catch (error) {
    console.error('Document deletion error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}