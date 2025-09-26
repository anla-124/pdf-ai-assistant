export interface User {
  id: string
  email: string
  full_name?: string
  role: 'admin' | 'user'
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  title: string
  filename: string
  file_path: string
  file_size: number
  content_type: string
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'error'
  processing_error?: string
  extracted_text?: string
  extracted_fields?: Record<string, any>
  metadata?: DocumentMetadata
  created_at: string
  updated_at: string
}

export interface DocumentMetadata {
  investor_type?: string
  document_type?: string
  date_range?: {
    start_date?: string
    end_date?: string
  }
  tags?: string[]
  custom_fields?: Record<string, any>
  embeddings_skipped?: boolean
  embeddings_error?: string
}

export interface ExtractedField {
  id: string
  document_id: string
  field_name: string
  field_value: string | number | boolean
  field_type: 'text' | 'number' | 'date' | 'checkbox' | 'select'
  confidence: number
  page_number?: number
  bounding_box?: {
    x: number
    y: number
    width: number
    height: number
  }
  created_at: string
}

export interface DocumentEmbedding {
  id: string
  document_id: string
  vector_id: string
  embedding: number[]
  chunk_text: string
  chunk_index: number
  created_at: string
}

export interface SimilaritySearchResult {
  document: Document
  score: number
  matching_chunks: {
    text: string
    score: number
  }[]
}

export interface SearchFilters {
  investor_type?: string[]
  document_type?: string[]
  date_range?: {
    start_date?: string
    end_date?: string
  }
  tags?: string[]
  min_score?: number
}

export interface ProcessingStatus {
  document_id: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  progress: number
  message?: string
  error?: string
}

export interface DocumentJob {
  id: string
  document_id: string
  user_id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  job_type: string
  priority: number
  attempts: number
  max_attempts: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
  // Batch processing fields
  batch_operation_id?: string
  processing_method: 'sync' | 'batch'
  metadata?: BatchJobMetadata
}

export interface BatchJobMetadata {
  inputUri?: string
  outputUri?: string
  processorType?: string
  operationMetadata?: Record<string, any>
  [key: string]: any
}