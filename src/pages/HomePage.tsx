import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { PdfDocument, ExtractedQuestion } from '../types';
import { matchesQuestionNumber } from '../lib/normalizer';
import { CodeBlock } from '../components/CodeBlock';
import { OutputViewer } from '../components/OutputViewer';
import {
  Search,
  FileText,
  AlertCircle,
  HelpCircle,
  BookOpen,
  ChevronRight,
  ArrowRight,
  FolderOpen,
  Shield,
  LogOut,
  Code2,
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const [searchPerformed, setSearchPerformed] = useState<boolean>(false);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [searching, setSearching] = useState<boolean>(false);
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

  // Perform Question Search
  const handleSearch = (overrideQuery?: string, overrideDocId?: string) => {
    const docId = overrideDocId !== undefined ? overrideDocId : selectedDocId;
    const query = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();

    if (!docId) {
      setErrorMsg('Please select a question paper / PDF first before searching.');
      return;
    }

    if (!query) {
      setErrorMsg('Please enter a question number to search (e.g. 1, 1(a), 2(b)).');
      return;
    }

    if (documents.length === 0) {
      setErrorMsg('No question papers are available yet.');
      return;
    }

    setSearching(true);
    setErrorMsg(null);
    setSearchPerformed(true);
    setActiveMatchIndex(0);

    const targetDocs = documents.filter((d) => d.id === docId);

    const matches: SearchMatch[] = [];

    for (const doc of targetDocs) {
      const questions: ExtractedQuestion[] = doc.extracted_content?.questions || [];
      const found = questions.find((q) => {
        return (
          matchesQuestionNumber(q.question_number, query) ||
          matchesQuestionNumber(q.normalized_number, query) ||
          q.question_number.trim().toLowerCase() === query.toLowerCase() ||
          q.question_name.toLowerCase().includes(query.toLowerCase())
        );
      });

      if (found) {
        matches.push({ doc, question: found });
      }
    }

    setTimeout(() => {
      setSearchResults(matches);
      setSearching(false);
    }, 120);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSelectQuestionTag = (qNum: string, docId?: string) => {
    if (docId) {
      setSelectedDocId(docId);
    }
    setSearchQuery(qNum);
    handleSearch(qNum, docId);
  };

  const currentMatch = searchResults[activeMatchIndex] || null;

  return (
    <div className="flex-1 min-h-screen flex flex-col bg-slate-50 relative">
      {/* Sleek Top Header Bar */}
      <header className="w-full bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Code2 className="w-4 h-4" />
          </div>
          <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight">
            Program<span className="text-indigo-600">Finder</span>
          </span>
        </div>

        {/* Admin Navigation */}
        <div>
          {user ? (
            <div className="flex items-center space-x-2">
              {isAdmin && (
                <button
                  onClick={() => onNavigate('admin')}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin Dashboard</span>
                </button>
              )}
              <button
                onClick={signOut}
                className="flex items-center space-x-1 px-3 py-1.5 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl text-xs font-semibold border border-slate-200 transition-all cursor-pointer shadow-xs"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onNavigate('login')}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-semibold shadow-xs border border-slate-200 transition-all cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>Admin Login</span>
            </button>
          )}
        </div>
      </header>

      {/* SINGLE UNIFIED SEARCH BAR CONTAINER - FULL WIDTH */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 shrink-0">
        {/* Missing Supabase configuration alert */}
        {!isConfigured && (
          <div className="mb-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-3">
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
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* THE SINGLE SEARCH BAR */}
        <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-white rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-400/80 focus-within:ring-4 focus-within:ring-indigo-100 focus-within:border-indigo-500 transition-all p-1.5 sm:p-2 w-full">
          {/* Integrated Document Selector Pill (if documents exist) */}
          {documents.length > 0 && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 sm:py-0 border-b sm:border-b-0 sm:border-r border-slate-200 shrink-0">
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              <select
                value={selectedDocId}
                onChange={(e) => {
                  setSelectedDocId(e.target.value);
                  setErrorMsg(null);
                  setSearchPerformed(false);
                  setSearchResults([]);
                }}
                className={`bg-slate-100/90 hover:bg-slate-200/80 text-xs font-semibold py-1.5 px-2.5 rounded-lg border-0 focus:ring-0 focus:outline-hidden cursor-pointer max-w-[200px] sm:max-w-[220px] truncate transition-colors ${
                  !selectedDocId ? 'text-slate-500 font-normal italic' : 'text-slate-800'
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
          )}

          {/* Search Icon & Text Input */}
          <div className="flex-1 flex items-center px-3 py-1.5">
            <Search className="w-5 h-5 text-slate-400 shrink-0 mr-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search question number (e.g. 1, 1(a), 2(b), 10(a))..."
              className="w-full text-sm sm:text-base font-semibold text-slate-900 placeholder-slate-400 bg-transparent border-0 focus:outline-hidden focus:ring-0"
              autoFocus
            />
          </div>

          {/* Search Action Button */}
          <button
            onClick={() => handleSearch()}
            disabled={searching}
            className="flex items-center justify-center space-x-2 px-6 py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 mt-1 sm:mt-0"
          >
            {searching ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Search</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Quick Format Tags under the single search bar */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between text-xs text-slate-500 px-1 gap-2">
          <div className="flex items-center space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Try searching:</span>
            {['1', '1(a)', '1(b)', '2(a)', '10(a)'].map((tag) => (
              <button
                key={tag}
                onClick={() => handleSelectQuestionTag(tag)}
                className="font-mono bg-white hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 px-2 py-0.5 rounded text-slate-700 font-semibold cursor-pointer transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>

          {documents.length > 0 && (
            <span className="text-slate-400 text-[11px]">
              {documents.length} PDF paper{documents.length !== 1 ? 's' : ''} available
            </span>
          )}
        </div>
      </div>

      {/* RESULTS DISPLAY AREA - FULL PAGE WIDTH */}
      <div className="w-full px-4 sm:px-6 lg:px-8 pb-8 flex-1 flex flex-col">
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 lg:p-8 animate-in fade-in zoom-in-98 duration-200 flex-1 w-full flex flex-col">
            {/* If multiple PDFs matched the question number, render tabs */}
            {searchResults.length > 1 && (
              <div className="mb-6 pb-4 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">
                  Found in {searchResults.length} documents:
                </p>
                <div className="flex flex-wrap gap-2">
                  {searchResults.map((m, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveMatchIndex(idx)}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        activeMatchIndex === idx
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{m.doc.display_name || m.doc.file_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Split 2-Column Layout: Question on Left, Code on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start flex-1">
              {/* LEFT COLUMN: Question Details & Output */}
              <div className="lg:col-span-5 space-y-5">
                {/* Header & Badges */}
                <div className="space-y-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="px-3.5 py-1.5 bg-indigo-600 text-white font-mono font-bold text-sm rounded-lg shadow-xs">
                      QUESTION {currentMatch.question.question_number}
                    </span>
                    <span className="text-xs font-mono px-3 py-1 bg-slate-100 text-slate-700 rounded-md uppercase font-semibold">
                      {currentMatch.question.programming_language || 'Program'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs text-slate-500">
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
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Problem Statement
                  </h3>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed">
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
              Question "{searchQuery}" Not Found
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Could not find any question matching "{searchQuery}" in the uploaded question papers.
            </p>

            {/* Show available question tags from available documents */}
            {documents.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  Available questions in uploaded papers:
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 max-w-lg mx-auto">
                  {documents.flatMap((doc) =>
                    (doc.extracted_content?.questions || []).map((q, idx) => (
                      <button
                        key={`${doc.id}-${idx}`}
                        onClick={() => handleSelectQuestionTag(q.question_number, doc.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-700 transition-colors cursor-pointer"
                        title={`From: ${doc.display_name || doc.file_name}`}
                      >
                        {q.question_number}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* State 4: Initial Prompt */}
        {!searchPerformed && documents.length > 0 && (
          <div className="border border-dashed border-slate-300 rounded-2xl p-10 text-center bg-slate-50/50">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">
              Instant Question Search
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Type any question number (e.g. <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700 font-bold">1(a)</code>) directly into the search bar and hit Enter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
