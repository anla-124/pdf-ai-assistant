import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 })
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`
    const filePath = `${user.id}/${fileName}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create document record with 'queued' status
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
        filename: file.name,
        file_path: uploadData.path,
        file_size: file.size,
        content_type: file.type,
        status: 'uploading', // Will be changed to 'queued' after job creation
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([uploadData.path])
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    // Create processing job
    console.log(`Creating job for document ${document.id}`)
    const { data: job, error: jobError } = await supabase
      .from('document_jobs')
      .insert({
        document_id: document.id,
        user_id: user.id,
        status: 'queued',
        job_type: 'process_document',
        priority: 0,
      })
      .select()
      .single()

    if (jobError) {
      console.error('Job creation error:', jobError)
      // Clean up document and file
      await supabase.from('documents').delete().eq('id', document.id)
      await supabase.storage.from('documents').remove([uploadData.path])
      return NextResponse.json({ error: 'Failed to create processing job' }, { status: 500 })
    }

    console.log(`Successfully created job ${job.id} for document ${document.id}`)

    // Update document status to queued
    console.log(`Updating document ${document.id} status to 'queued'`)
    const { data: updatedDocument, error: statusError } = await supabase
      .from('documents')
      .update({ status: 'queued' })
      .eq('id', document.id)
      .select()

    if (statusError) {
      console.error('Status update error:', statusError)
    } else {
      console.log('Document status updated successfully:', updatedDocument)
    }

    return NextResponse.json({ 
      id: document.id,
      jobId: job.id,
      message: 'Document uploaded successfully and queued for processing',
      status: 'queued'
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}