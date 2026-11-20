export interface OutputImageMetadata {
  type: 'image';
  storage_path: string;
  public_url?: string;
  signed_url?: string;
  caption?: string;
}

export interface OutputTextMetadata {
  type: 'text';
  content: string;
}

export interface OutputBothMetadata {
  type: 'both';
  image: OutputImageMetadata;
  text: OutputTextMetadata;
}

export type QuestionOutput = OutputImageMetadata | OutputTextMetadata | OutputBothMetadata | null;

export interface ExtractedQuestion {
  id?: string;
  question_number: string; // e.g. "1", "1(a)", "2(b)"
  normalized_number: string; // e.g. "1(a)", "1", "2(b)"
  question_name: string; // extracted title/prompt
  source_code: string; // extracted program
  programming_language?: string; // e.g. "c", "cpp", "java", "python", "javascript", "sql"
  output?: QuestionOutput;
  page_number?: number;
}

export interface ExtractedContentPayload {
  questions: ExtractedQuestion[];
  extracted_at?: string;
  total_pages?: number;
  detected_languages?: string[];
  extraction_notes?: string;
}

export type ProcessingStatus = 'pending' | 'processing' | 'review_required' | 'completed' | 'error';

export interface PdfDocument {
  id: string;
  file_name: string;
  display_name: string | null;
  storage_path: string;
  file_size: number | null;
  extracted_content: ExtractedContentPayload | null;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  is_published: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  isAdmin: boolean;
}
