-- ==============================================================================
-- PROGRAM FINDER - COMPLETE SUPABASE DATABASE & STORAGE FIX
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create the Application Table: pdf_documents
CREATE TABLE IF NOT EXISTS public.pdf_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  display_name TEXT,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  extracted_content JSONB DEFAULT '{"questions": []}'::jsonb,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'review_required', 'completed', 'error')),
  processing_error TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pdf_documents_published ON public.pdf_documents (is_published);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_created_at ON public.pdf_documents (created_at DESC);

-- 2. Reset and Enable Row Level Security (RLS) on pdf_documents
ALTER TABLE public.pdf_documents ENABLE ROW LEVEL SECURITY;

-- Drop any existing conflicting policies
DROP POLICY IF EXISTS "Public users can view published documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Admins can insert documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Admins can update documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Admins can delete documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.pdf_documents;
DROP POLICY IF EXISTS "Allow select for public and authenticated" ON public.pdf_documents;

-- POLICY 1: Public / Student viewers can ONLY view published papers. Authenticated admin can view all papers (drafts + published).
CREATE POLICY "Allow select for public and authenticated"
ON public.pdf_documents
FOR SELECT
USING (
  is_published = true
  OR
  auth.role() = 'authenticated'
);

-- POLICY 2: Only authenticated administrators can insert new PDF documents
CREATE POLICY "Authenticated users can insert documents"
ON public.pdf_documents
FOR INSERT
TO authenticated
WITH CHECK (true);

-- POLICY 3: Only authenticated administrators can update documents (edit questions, publish/unpublish)
CREATE POLICY "Authenticated users can update documents"
ON public.pdf_documents
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- POLICY 4: Only authenticated administrators can delete documents
CREATE POLICY "Authenticated users can delete documents"
ON public.pdf_documents
FOR DELETE
TO authenticated
USING (true);


-- 3. Create the Private Storage Bucket: question-papers
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-papers',
  'question-papers',
  true, -- enables public read for extracted screenshots & PDFs
  52428800, -- 50 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- 4. Storage Policies for question-papers bucket
DROP POLICY IF EXISTS "Admins can upload files to question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update files in question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete files in question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Authorized read access for question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete question-papers" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read question-papers" ON storage.objects;

-- Only logged-in admin can upload to storage
CREATE POLICY "Authenticated users can upload to question-papers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'question-papers');

-- Only logged-in admin can update storage objects
CREATE POLICY "Authenticated users can update question-papers"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'question-papers');

-- Only logged-in admin can delete storage objects
CREATE POLICY "Authenticated users can delete question-papers"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'question-papers');

-- Public & students can read the uploaded question papers and output images
CREATE POLICY "Anyone can read question-papers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'question-papers');
