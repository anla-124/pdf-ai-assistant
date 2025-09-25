import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    let query = supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,filename.ilike.%${search}%`)
    }

    const { data: documents, error: dbError } = await query

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    return NextResponse.json(documents)

  } catch (error) {
    console.error('Documents fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}