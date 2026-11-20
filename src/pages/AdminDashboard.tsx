import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured, uploadPdfToStorage, deleteStorageFile } from '../lib/supabase';
import { extractContentFromPdf } from '../lib/pdfExtractor';
import type { ExtractionProgress } from '../lib/pdfExtractor';
import type { PdfDocument, ProcessingStatus } from '../types';
import { AdminReviewModal } from '../components/AdminReviewModal';
import {
  Upload,
  FileText,
  Trash2,
  Edit3,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Clock,
  Sparkles,
  Layers,
  Replace,
  FileCheck,
  ArrowLeft,
  LogOut,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigate: (page: 'home' | 'login' | 'admin') => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { user, isAdmin, signOut, loading: authLoading } = useAuth();
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Review modal state
  const [reviewingDoc, setReviewingDoc] = useState<PdfDocument | null>(null);

  // Replace file state
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const isConfigured = isSupabaseConfigured();

  // Load uploaded documents
  const fetchDocuments = async () => {
    if (!isConfigured) {
      setLoadingDocs(false);
      return;
    }

    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('pdf_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching documents:', error);
      } else {
        setDocuments(data || []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user, isConfigured]);

  // Handle PDF file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    setUploadSuccess(null);

    if (!file) return;

    // Validate PDF type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Invalid file type. Please select a valid PDF file.');
      return;
    }

    // Max 50MB file size validation
    const MAX_SIZE_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError('File size exceeds the 50MB limit.');
      return;
    }

    setSelectedFile(file);
    // Use filename as default display name (strip .pdf)
    const defaultName = file.name.replace(/\.pdf$/i, '');
    setDisplayName(defaultName);
  };

  // Upload and process PDF
  const handleUploadAndProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setUploadProgress(15);

    try {
      const tempId = crypto.randomUUID();

      // Step 1: Upload PDF to Supabase Storage
      setExtractionProgress({
        stage: 'loading',
        pageCurrent: 0,
        pageTotal: 0,
        message: 'Uploading original PDF to Supabase Storage...',
      });

      const { path: storagePath, error: storageErr } = await uploadPdfToStorage(
        selectedFile,
        tempId
      );

      if (storageErr || !storagePath) {
        throw new Error(storageErr || 'Failed to upload PDF to storage.');
      }

      setUploadProgress(40);

      // Step 2: Insert initial record in database
      const initialDoc: Partial<PdfDocument> = {
        id: tempId,
        file_name: selectedFile.name,
        display_name: displayName.trim() || selectedFile.name,
        storage_path: storagePath,
        file_size: selectedFile.size,
        processing_status: 'processing',
        is_published: false,
        uploaded_by: user?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: dbInsertError } = await supabase
        .from('pdf_documents')
        .insert(initialDoc);

      if (dbInsertError) {
        if (dbInsertError.message.includes('row-level security')) {
          throw new Error('RLS Permission blocked. Please run the updated SQL in supabase-schema.sql in your Supabase SQL Editor.');
        }
        throw new Error(`Database record creation failed: ${dbInsertError.message}`);
      }

      setUploadProgress(50);

      // Step 3: Run client-side PDF Extraction
      const { payload, isUncertain } = await extractContentFromPdf(
        selectedFile,
        tempId,
        (progress) => {
          setExtractionProgress(progress);
          if (progress.pageTotal > 0) {
            const pagePct = Math.floor((progress.pageCurrent / progress.pageTotal) * 40);
            setUploadProgress(50 + pagePct);
          }
        }
      );

      const finalStatus: ProcessingStatus = isUncertain ? 'review_required' : 'completed';

      // Step 4: Update database record with extracted content
      const { data: updatedDoc, error: dbUpdateError } = await supabase
        .from('pdf_documents')
        .update({
          extracted_content: payload,
          processing_status: finalStatus,
          processing_error: isUncertain
            ? 'Automatic extraction uncertain. Please review extracted questions.'
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tempId)
        .select()
        .single();

      if (dbUpdateError) {
        throw new Error(`Failed to update extracted content in database: ${dbUpdateError.message}`);
      }

      setUploadProgress(100);
      setUploadSuccess(
        `PDF successfully processed! Extracted ${payload.questions.length} questions. Opening review editor...`
      );

      // Reset form
      setSelectedFile(null);
      setDisplayName('');

      // Refresh document list and open review modal
      await fetchDocuments();
      if (updatedDoc) {
        setReviewingDoc(updatedDoc);
      }
    } catch (err: any) {
      console.error('Upload & Processing error:', err);
      setUploadError(err.message || 'An error occurred during upload and extraction.');
    } finally {
      setUploading(false);
      setExtractionProgress(null);
    }
  };

  // Quick Toggle Publish / Unpublish
  const handleTogglePublish = async (doc: PdfDocument) => {
    try {
      const nextState = !doc.is_published;
      const { error } = await supabase
        .from('pdf_documents')
        .update({
          is_published: nextState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      if (error) {
        alert(`Failed to update status: ${error.message}`);
      } else {
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, is_published: nextState } : d))
        );
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete PDF
  const handleDeletePdf = async (doc: PdfDocument) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${doc.display_name || doc.file_name}"? This will permanently delete the file and extracted questions.`
    );
    if (!confirmDelete) return;

    try {
      // Delete from storage
      await deleteStorageFile(doc.storage_path);

      // Delete from database
      const { error } = await supabase.from('pdf_documents').delete().eq('id', doc.id);

      if (error) {
        alert(`Failed to delete document: ${error.message}`);
      } else {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  // Replace PDF
  const handleStartReplace = (docId: string) => {
    setReplacingDocId(docId);
    replaceFileInputRef.current?.click();
  };

  const handleExecuteReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetDocId = replacingDocId;
    setReplacingDocId(null);

    if (!file || !targetDocId) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a valid PDF file.');
      return;
    }

    const docToReplace = documents.find((d) => d.id === targetDocId);
    if (!docToReplace) return;

    setUploading(true);
    setUploadError(null);

    try {
      // Upload new PDF file
      const { path: newPath, error: storageErr } = await uploadPdfToStorage(file, targetDocId);
      if (storageErr) throw new Error(storageErr);

      // Run extraction
      const { payload, isUncertain } = await extractContentFromPdf(file, targetDocId);

      // Update record
      const { data: updatedDoc, error: updateErr } = await supabase
        .from('pdf_documents')
        .update({
          file_name: file.name,
          storage_path: newPath,
          file_size: file.size,
          extracted_content: payload,
          processing_status: isUncertain ? 'review_required' : 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetDocId)
        .select()
        .single();

      if (updateErr) throw new Error(updateErr.message);

      await fetchDocuments();
      if (updatedDoc) {
        setReviewingDoc(updatedDoc);
      }
      alert('PDF replaced and re-extracted successfully!');
    } catch (err: any) {
      alert(`Failed to replace PDF: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Helper for formatting file size
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Helper for formatting date
  const formatDate = (isoString: string): string => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  // Render auth loading
  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Checking authorization...</p>
        </div>
      </div>
    );
  }

  // Render unauthorized access gate
  if (!user || !isAdmin) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-lg">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Admin Authorization Required</h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {user
              ? `You are signed in as ${user.email}, but your account does not have admin privileges. Admin rights must be granted in the Supabase user app_metadata.`
              : 'You must be signed in with an authorized administrator account to access the Admin Dashboard.'}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => onNavigate('login')}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-xs"
            >
              Sign In as Administrator
            </button>
            <button
              onClick={() => onNavigate('home')}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      {/* Hidden file input for Replace action */}
      <input
        type="file"
        ref={replaceFileInputRef}
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleExecuteReplace}
      />

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Dashboard Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[11px] font-bold uppercase tracking-wider">
                Management Console
              </span>
              <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Upload programming question papers and lab manuals, review automatic extractions, and publish them to students.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onNavigate('home')}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Search</span>
            </button>

            <button
              onClick={fetchDocuments}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh List</span>
            </button>

            <button
              onClick={signOut}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: PDF UPLOAD */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Direct PDF Upload</h2>
              <p className="text-xs text-slate-500">
                Upload a computer programming question paper or lab manual (.pdf). No predefined subject category required.
              </p>
            </div>
          </div>

          {/* Upload Alerts */}
          {uploadError && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          {uploadSuccess && (
            <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center space-x-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {/* Upload Form */}
          <form onSubmit={handleUploadAndProcess} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* File Drop / Select Area */}
              <div className="md:col-span-7">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Select PDF File
                </label>
                <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-indigo-50/30 rounded-xl p-4 transition-all flex items-center justify-center cursor-pointer group">
                  <input
                    type="file"
                    required
                    accept="application/pdf,.pdf"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="flex items-center space-x-3 text-center sm:text-left">
                    <div className="w-10 h-10 rounded-lg bg-white shadow-2xs border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 transition-colors shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      {selectedFile ? (
                        <div>
                          <p className="text-xs font-bold text-slate-900 truncate max-w-xs sm:max-w-sm">
                            {selectedFile.name}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {formatFileSize(selectedFile.size)} • Ready for extraction
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-slate-700">
                            Click or drag & drop PDF here
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Supports lab manuals, question sheets, and exam papers up to 50MB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Display Name Input */}
              <div className="md:col-span-5 flex flex-col justify-between">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>Document Display Name</span>
                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Data Structures Lab Manual - Set A"
                    disabled={uploading}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to the original filename. This name appears in the student dropdown.
                  </p>
                </div>

                <div className="mt-3 md:mt-0">
                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm rounded-xl shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {uploading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing Document...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload & Extract Content</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Progress Bar during upload & extraction */}
            {uploading && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-700 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                    <span>{extractionProgress?.message || 'Processing PDF...'}</span>
                  </span>
                  <span className="font-mono font-bold text-slate-600">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </form>
        </div>

        {/* SECTION 2: UPLOADED PDF LIST */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Uploaded Question Papers ({documents.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Only published papers are visible on the Home Page search dropdown.
            </span>
          </div>

          {loadingDocs ? (
            <div className="p-12 text-center text-xs text-slate-400">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span>Loading documents...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No documents uploaded yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Upload your first programming lab manual or question paper above to begin automatic extraction.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/40 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-6">Document Details</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Uploaded</th>
                    <th className="py-3 px-4">Processing Status</th>
                    <th className="py-3 px-4">Published Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {documents.map((doc) => {
                    const qCount = doc.extracted_content?.questions?.length || 0;
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Title and Filename */}
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                              <FileCheck className="w-5 h-5" />
                            </div>
                            <div className="max-w-xs sm:max-w-sm truncate">
                              <p className="font-bold text-slate-900 truncate">
                                {doc.display_name || doc.file_name}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                                {doc.file_name} • {qCount} Question{qCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* File Size */}
                        <td className="py-4 px-4 font-mono text-slate-600">
                          {formatFileSize(doc.file_size)}
                        </td>

                        {/* Upload Date */}
                        <td className="py-4 px-4 text-slate-500 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatDate(doc.created_at)}</span>
                        </td>

                        {/* Processing Status Badge */}
                        <td className="py-4 px-4">
                          {doc.processing_status === 'completed' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              <span>Completed</span>
                            </span>
                          )}
                          {doc.processing_status === 'review_required' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              <span>Review Required</span>
                            </span>
                          )}
                          {doc.processing_status === 'processing' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-200">
                              <div className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              <span>Processing</span>
                            </span>
                          )}
                          {doc.processing_status === 'error' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold border border-red-200">
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                              <span>Error</span>
                            </span>
                          )}
                        </td>

                        {/* Published Status Badge & Quick Toggle */}
                        <td className="py-4 px-4">
                          <button
                            onClick={() => handleTogglePublish(doc)}
                            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase transition-all cursor-pointer ${
                              doc.is_published
                                ? 'bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                            title="Click to toggle publish status"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${doc.is_published ? 'bg-white' : 'bg-slate-500'}`} />
                            <span>{doc.is_published ? 'Published' : 'Draft'}</span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-right space-x-1.5">
                          {/* Review / Edit Extracted Content */}
                          <button
                            onClick={() => setReviewingDoc(doc)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
                            title="Review and Edit Extracted Content"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Review Content</span>
                          </button>

                          {/* Replace PDF */}
                          <button
                            onClick={() => handleStartReplace(doc.id)}
                            className="inline-flex items-center p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                            title="Replace PDF File"
                          >
                            <Replace className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete PDF */}
                          <button
                            onClick={() => handleDeletePdf(doc)}
                            className="inline-flex items-center p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 hover:border-red-200 transition-colors"
                            title="Delete PDF"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Review & Edit Modal */}
      {reviewingDoc && (
        <AdminReviewModal
          document={reviewingDoc}
          isOpen={Boolean(reviewingDoc)}
          onClose={() => setReviewingDoc(null)}
          onUpdate={fetchDocuments}
        />
      )}
    </div>
  );
};
