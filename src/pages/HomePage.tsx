import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { PdfDocument, ExtractedQuestion } from '../types';
import { CodeBlock } from '../components/CodeBlock';
import { OutputViewer } from '../components/OutputViewer';
import {
  Search,
  FileText,
  AlertCircle,
  HelpCircle,
  BookOpen,
  ChevronRight,
  FolderOpen,
  Shield,
  LogOut,
  Code2,
  Sparkles,
} from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: 'home' | 'login' | 'admin') => void;
}

interface SearchMatch {
  doc: PdfDocument;
  question: ExtractedQuestion;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { user, isAdmin, signOut } = useAuth();
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const [searchPerformed, setSearchPerformed] = useState<boolean>(false);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isConfigured = isSupabaseConfigured();

  // Fetch all published documents dynamically from Supabase
  const fetchPublishedDocuments = async () => {
    if (!isConfigured) {
      setLoadingDocs(false);
      return;
    }

    setLoadingDocs(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('pdf_documents')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMsg(`Failed to load documents: ${error.message}`);
      } else {
        setDocuments(data || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error connecting to database');
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchPublishedDocuments();
  }, [isConfigured]);

  const currentDoc = documents.find((d) => d.id === selectedDocId);
  const currentDocQuestions: ExtractedQuestion[] = currentDoc?.extracted_content?.questions || [];

  const visibleQuestions = filterQuery.trim()
    ? currentDocQuestions.filter(
        (q) =>
          q.question_number.toLowerCase().includes(filterQuery.toLowerCase()) ||
          q.question_name.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : currentDocQuestions;

  // Select a question directly
  const handleSelectQuestionDirect = (question: ExtractedQuestion, doc: PdfDocument) => {
    setSearchResults([{ doc, question }]);
    setActiveMatchIndex(0);
    setSearchPerformed(true);
    setErrorMsg(null);
  };

  // Change selected question paper
  const handleDocChange = (docId: string) => {
    setSelectedDocId(docId);
    setErrorMsg(null);
    setFilterQuery('');
    const doc = documents.find((d) => d.id === docId);
    const qs = doc?.extracted_content?.questions || [];
    if (qs.length > 0) {
      handleSelectQuestionDirect(qs[0], doc!);
    } else {
      setSearchResults([]);
      setSearchPerformed(false);
    }
  };

  const currentMatch = searchResults[activeMatchIndex] || null;

  return (
    <div className="flex-1 min-h-screen flex flex-col bg-slate-50 relative">
      {/* Sleek Top Header Bar */}
      <header className="w-full bg-white border-b border-slate-200 px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Code2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm sm:text-lg text-slate-900 tracking-tight">
            Program<span className="text-indigo-600">Finder</span>
          </span>
        </div>

        {/* Admin Navigation */}
        <div>
          {user ? (
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              {isAdmin && (
                <button
                  onClick={() => onNavigate('admin')}
                  className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Admin Dashboard</span>
                  <span className="sm:hidden">Admin</span>
                </button>
              )}
              <button
                onClick={signOut}
                className="flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl text-xs font-semibold border border-slate-200 transition-all cursor-pointer shadow-xs"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onNavigate('login')}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-semibold shadow-xs border border-slate-200 transition-all cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline">Admin Login</span>
              <span className="sm:hidden">Login</span>
            </button>
          )}
        </div>
      </header>

      {/* PDF SELECTION & REAL QUESTION NUMBER PILLS CONTAINER */}
      <div className="w-full px-3 sm:px-6 lg:px-8 py-3 shrink-0">
        {/* Missing Supabase configuration alert */}
        {!isConfigured && (
          <div className="mb-3 p-3 sm:p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2.5 sm:space-x-3">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Supabase Connection Required</p>
              <p className="text-amber-700 mt-0.5">
                Please set <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">.env</code>.
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="mb-3 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* QUESTION PICKER CARD */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-3 sm:p-4 space-y-3">
          {/* Row 1: Document Selector Dropdown & Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider shrink-0">
                Question Paper:
              </span>
              <select
                value={selectedDocId}
                onChange={(e) => handleDocChange(e.target.value)}
                className={`text-xs font-semibold py-1.5 px-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer w-full sm:w-auto sm:max-w-xs truncate transition-all ${
                  !selectedDocId ? 'bg-slate-50 text-slate-500 italic' : 'bg-slate-100 text-slate-800'
                }`}
                title="Select Question Paper / PDF"
              >
                <option value="" disabled>-- Select Question Paper --</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id} className="text-slate-800 font-semibold not-italic">
                    {doc.display_name || doc.file_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedDocId && currentDocQuestions.length > 8 && (
              <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs w-full sm:w-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter question..."
                  className="bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden w-full sm:w-32"
                />
              </div>
            )}
          </div>

          {/* Row 2: Real Question Numbers (Same style as Try tags) */}
          {selectedDocId ? (
            currentDocQuestions.length > 0 ? (
              <div className="pt-2.5 border-t border-slate-100">
                <div className="flex items-center space-x-1.5 mb-2 text-xs text-slate-500">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Questions ({currentDocQuestions.length}):
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {visibleQuestions.map((q, idx) => {
                    const isSelected = currentMatch?.question.question_number === q.question_number;
                    return (
                      <button
                        key={`${q.question_number}-${idx}`}
                        onClick={() => handleSelectQuestionDirect(q, currentDoc!)}
                        className={`font-mono text-xs px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs scale-105 ring-2 ring-indigo-300'
                            : 'bg-white hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 text-slate-700 shadow-2xs'
                        }`}
                        title={q.question_name || `Question ${q.question_number}`}
                      >
                        {q.question_number}
                      </button>
                    );
                  })}
                  {visibleQuestions.length === 0 && (
                    <span className="text-xs text-slate-400 italic">No questions matching "{filterQuery}"</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-400 italic">
                No questions found in this document.
              </div>
            )
          ) : (
            <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center space-x-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Please select a question paper above to view all its question numbers.</span>
            </div>
          )}
        </div>
      </div>

      {/* RESULTS DISPLAY AREA - FULL PAGE WIDTH */}
      <div className="w-full px-3 sm:px-6 lg:px-8 pb-6 sm:pb-8 flex-1 flex flex-col">
        {/* State 1: No PDFs Uploaded / Published */}
        {!loadingDocs && documents.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-xs">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No Question Papers Available</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
              No PDFs have been uploaded or published by the administrator yet. Once an admin uploads and publishes a document, it will automatically become searchable.
            </p>
            <button
              onClick={() => onNavigate('login')}
              className="mt-5 inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Login</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* State 2: Active Result Found */}
        {currentMatch && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 sm:p-6 lg:p-8 animate-in fade-in zoom-in-98 duration-200 flex-1 w-full flex flex-col">
            {/* If multiple PDFs matched the question number, render tabs */}
            {searchResults.length > 1 && (
              <div className="mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Found in {searchResults.length} documents:
                </p>
                <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {searchResults.map((m, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveMatchIndex(idx)}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                        activeMatchIndex === idx
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[150px] sm:max-w-none">{m.doc.display_name || m.doc.file_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Split 2-Column Layout: Question on Left, Code on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start flex-1">
              {/* LEFT COLUMN: Question Details & Output */}
              <div className="lg:col-span-5 space-y-4 sm:space-y-5">
                {/* Header & Badges */}
                <div className="space-y-2.5 sm:space-y-3 pb-3 sm:pb-4 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="px-3 py-1 sm:px-3.5 sm:py-1.5 bg-indigo-600 text-white font-mono font-bold text-xs sm:text-sm rounded-lg shadow-xs">
                      QUESTION {currentMatch.question.question_number}
                    </span>
                    <span className="text-[11px] sm:text-xs font-mono px-2.5 py-0.5 sm:px-3 sm:py-1 bg-slate-100 text-slate-700 rounded-md uppercase font-semibold">
                      {currentMatch.question.programming_language || 'Program'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs text-slate-500 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-semibold text-slate-700 truncate">
                      {currentMatch.doc.display_name || currentMatch.doc.file_name}
                    </span>
                    {currentMatch.question.page_number && (
                      <span className="text-slate-400 font-mono shrink-0">
                        • Page {currentMatch.question.page_number}
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Name / Title */}
                <div>
                  <h3 className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Problem Statement
                  </h3>
                  <h2 className="text-base sm:text-xl font-bold text-slate-900 leading-snug sm:leading-relaxed break-words">
                    {currentMatch.question.question_name}
                  </h2>
                </div>

                {/* Output Section (Rendered on Left Side) */}
                <OutputViewer
                  output={currentMatch.question.output}
                  questionNumber={currentMatch.question.question_number}
                />
              </div>

              {/* RIGHT COLUMN: Source Code */}
              <div className="lg:col-span-7 flex flex-col h-full">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <span>Source Code</span>
                  </div>
                </div>

                {currentMatch.question.source_code ? (
                  <CodeBlock
                    code={currentMatch.question.source_code}
                    language={currentMatch.question.programming_language || 'python'}
                    questionNumber={currentMatch.question.question_number}
                    fileName={currentMatch.doc.display_name || 'Program'}
                  />
                ) : (
                  <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No source code extracted for this question in the uploaded document.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* State 3: Search Performed but Not Found */}
        {searchPerformed && searchResults.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              No Question Selected
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Please click any available question number pill above to view its content.
            </p>
          </div>
        )}

        {/* State 4: Initial Prompt */}
        {!searchPerformed && documents.length > 0 && (
          <div className="border border-dashed border-slate-300 rounded-2xl p-10 text-center bg-slate-50/50">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-indigo-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              Select a Question to View
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Select a question paper above and click on any question number to instantly view its complete source code and output.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
