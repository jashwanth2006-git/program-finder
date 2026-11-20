import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== 'https://your-project.supabase.co' &&
    !supabaseUrl.includes('placeholder') &&
    supabaseAnonKey !== 'your-anon-key'
  );
};

// Initialize client with safety fallback to avoid unhandled crashes before env is provided
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured() ? supabaseAnonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const BUCKET_NAME = 'question-papers';

/**
 * Storage helpers
 */
export async function uploadPdfToStorage(
  file: File,
  documentId: string
): Promise<{ path: string; error: string | null }> {
  try {
    if (!isSupabaseConfigured()) {
      return { path: '', error: 'Supabase credentials are not configured.' };
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `pdfs/${documentId}/${Date.now()}_${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      return { path: '', error: uploadError.message };
    }

    return { path: storagePath, error: null };
  } catch (err: any) {
    return { path: '', error: err.message || 'Failed to upload PDF' };
  }
}

export async function uploadOutputImageToStorage(
  blob: Blob,
  documentId: string,
  questionIdentifier: string
): Promise<{ path: string; publicUrl: string; error: string | null }> {
  try {
    if (!isSupabaseConfigured()) {
      return { path: '', publicUrl: '', error: 'Supabase credentials are not configured.' };
    }

    const cleanId = questionIdentifier.replace(/[^a-zA-Z0-9]/g, '_') || 'output';
    const storagePath = `output-images/${documentId}/${cleanId}_${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      return { path: '', publicUrl: '', error: uploadError.message };
    }

    // Try signed URL or public URL
    const { data: signedData } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year signed url

    const publicUrl = signedData?.signedUrl || '';

    return { path: storagePath, publicUrl, error: null };
  } catch (err: any) {
    return { path: '', publicUrl: '', error: err.message || 'Failed to upload image' };
  }
}

export async function getFileSignedUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !storagePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 60 * 60 * 2); // 2 hours

    if (error || !data?.signedUrl) {
      // Fallback to publicUrl if bucket has public policy
      const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
      return pubData?.publicUrl || null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function deleteStorageFile(storagePath: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !storagePath) return false;

  try {
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    return !error;
  } catch {
    return false;
  }
}
