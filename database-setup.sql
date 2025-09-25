-- =====================================================
-- PDF AI Assistant - Complete Database Setup Script
-- =====================================================
-- This script sets up the entire database schema for the PDF AI Assistant
-- Run this once in your Supabase SQL Editor to initialize the database
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Revoke default privileges for security
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- =====================================================
-- TABLES
-- =====================================================

-- Create users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'completed', 'error')),
  processing_error TEXT,
  extracted_text TEXT,
  extracted_fields JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create extracted_fields table
CREATE TABLE IF NOT EXISTS public.extracted_fields (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value JSONB, -- Changed from TEXT to JSONB to handle string|number|boolean types
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'checkbox', 'select')),
  confidence DECIMAL(5,4),
  page_number INTEGER,
  bounding_box JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create document_embeddings table with CORRECT vector dimensions for Vertex AI
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL,
  embedding VECTOR(768), -- Vertex AI embedding dimension (768, NOT 1536)
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create processing_status table for tracking document processing
CREATE TABLE IF NOT EXISTS public.processing_status (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'error')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  message TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Standard indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_fields_document_id ON extracted_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector_id ON document_embeddings(vector_id);
CREATE INDEX IF NOT EXISTS idx_processing_status_document_id ON processing_status(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_status_status ON processing_status(status);

-- Additional performance indexes for similarity search
CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk_index ON document_embeddings(chunk_index);
CREATE INDEX IF NOT EXISTS idx_documents_status_user_id ON documents(status, user_id);

-- GIN indexes for JSONB fields (for fast JSON queries)
CREATE INDEX IF NOT EXISTS idx_documents_metadata_gin ON documents USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_documents_extracted_fields_gin ON documents USING GIN(extracted_fields);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_status ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Users policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Documents policies
DROP POLICY IF EXISTS "Users can view own documents" ON documents;
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
CREATE POLICY "Users can insert own documents" ON documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can update own documents" ON documents
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can delete own documents" ON documents
  FOR DELETE USING (auth.uid() = user_id);

-- Extracted fields policies
DROP POLICY IF EXISTS "Users can view extracted fields of own documents" ON extracted_fields;
CREATE POLICY "Users can view extracted fields of own documents" ON extracted_fields
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = extracted_fields.document_id
      AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert extracted fields for own documents" ON extracted_fields;
CREATE POLICY "Users can insert extracted fields for own documents" ON extracted_fields
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = extracted_fields.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Document embeddings policies
DROP POLICY IF EXISTS "Users can view embeddings of own documents" ON document_embeddings;
CREATE POLICY "Users can view embeddings of own documents" ON document_embeddings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_embeddings.document_id
      AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert embeddings for own documents" ON document_embeddings;
CREATE POLICY "Users can insert embeddings for own documents" ON document_embeddings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_embeddings.document_id
      AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete embeddings of own documents" ON document_embeddings;
CREATE POLICY "Users can delete embeddings of own documents" ON document_embeddings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_embeddings.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Processing status policies
DROP POLICY IF EXISTS "Users can view processing status of own documents" ON processing_status;
CREATE POLICY "Users can view processing status of own documents" ON processing_status
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = processing_status.document_id
      AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert processing status for own documents" ON processing_status;
CREATE POLICY "Users can insert processing status for own documents" ON processing_status
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = processing_status.document_id
      AND documents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update processing status of own documents" ON processing_status;
CREATE POLICY "Users can update processing status of own documents" ON processing_status
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = processing_status.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function for automatic timestamp updates
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS handle_users_updated_at ON users;
CREATE TRIGGER handle_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

DROP TRIGGER IF EXISTS handle_documents_updated_at ON documents;
CREATE TRIGGER handle_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

DROP TRIGGER IF EXISTS handle_processing_status_updated_at ON processing_status;
CREATE TRIGGER handle_processing_status_updated_at
  BEFORE UPDATE ON processing_status
  FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger for automatic user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- =====================================================
-- STORAGE SETUP
-- =====================================================

-- Create storage bucket for PDF documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for document files
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
CREATE POLICY "Users can upload own documents" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view own documents" ON storage.objects;
CREATE POLICY "Users can view own documents" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own documents" ON storage.objects;
CREATE POLICY "Users can update own documents" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================================================
-- SETUP COMPLETE
-- =====================================================

-- Display setup completion message
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE 'PDF AI Assistant Database Setup Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Tables created: users, documents, extracted_fields, document_embeddings, processing_status';
  RAISE NOTICE 'Indexes created: Performance optimized indexes for all tables';
  RAISE NOTICE 'RLS enabled: Row-level security policies applied';
  RAISE NOTICE 'Storage bucket: "documents" bucket created for PDF files';
  RAISE NOTICE 'Vector dimensions: 768 (configured for Vertex AI embeddings)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Configure your environment variables (.env.local)';
  RAISE NOTICE '2. Set up Google Document AI credentials';
  RAISE NOTICE '3. Configure Vertex AI and Pinecone';
  RAISE NOTICE '4. Enable Google OAuth in Supabase Auth settings';
  RAISE NOTICE '============================================';
END $$;