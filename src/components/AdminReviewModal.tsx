import React, { useState, useEffect, useRef } from 'react';
import type {
  PdfDocument,
  ExtractedQuestion,
  QuestionOutput,
  OutputImageMetadata,
  OutputTextMetadata,
} from '../types';
import { supabase, uploadOutputImageToStorage } from '../lib/supabase';
import { normalizeQuestionNumber } from '../lib/normalizer';
import {
  X,
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertTriangle,
  Code2,
  Terminal,
  Upload,
  FileText,
  Clipboard,
} from 'lucide-react';

interface AdminReviewModalProps {
  document: PdfDocument;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const AdminReviewModal: React.FC<AdminReviewModalProps> = ({
  document: doc,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [questions, setQuestions] = useState<ExtractedQuestion[]>(() => {
    return doc.extracted_content?.questions ? JSON.parse(JSON.stringify(doc.extracted_content.questions)) : [];
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTabIdx, setActiveTabIdx] = useState<number>(0);
  const [uploadingImageForIdx, setUploadingImageForIdx] = useState<number | null>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  // Upload image Blob / File to storage and update question
  const uploadImageBlob = async (blobOrFile: Blob | File, idx: number) => {
    setUploadingImageForIdx(idx);
    setErrorMsg(null);

    // Instant local preview for immediate visual feedback
    const previewUrl = URL.createObjectURL(blobOrFile);
    const tempMeta: OutputImageMetadata = {
      type: 'image',
      public_url: previewUrl,
      storage_path: '',
    };

    setQuestions((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      const prevOut = cur.output;
      if (prevOut?.type === 'text' || (prevOut?.type === 'both' && prevOut.text)) {
        copy[idx].output = {
          type: 'both',
          image: tempMeta,
          text: prevOut.type === 'both' ? prevOut.text : prevOut,
        };
      } else {
        copy[idx].output = tempMeta;
      }
      return copy;
    });

    try {
      const qTarget = questions[idx];
      const { path, publicUrl, error } = await uploadOutputImageToStorage(
        blobOrFile,
        doc.id,
        qTarget.normalized_number || `q_${idx + 1}`
      );

      if (error) {
        setErrorMsg(`Failed to upload output image: ${error}`);
        setUploadingImageForIdx(null);
        return;
      }

      const imgMeta: OutputImageMetadata = {
        type: 'image',
        storage_path: path,
        public_url: publicUrl,
      };

      setQuestions((prev) => {
        const copy = [...prev];
        const cur = copy[idx];
        const prevOut = cur.output;

        if (prevOut?.type === 'text' || (prevOut?.type === 'both' && prevOut.text)) {
          const txt = prevOut.type === 'both' ? prevOut.text : prevOut;
          copy[idx].output = {
            type: 'both',
            image: imgMeta,
            text: txt,
          };
        } else {
          copy[idx].output = imgMeta;
        }
        return copy;
      });
      setSuccessMsg('Output image pasted & uploaded successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Image upload failed');
    } finally {
      setUploadingImageForIdx(null);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImageBlob(file, idx);
  };

  // Window paste listener for Ctrl + V inside the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            uploadImageBlob(file, activeTabIdx);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => {
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [isOpen, activeTabIdx, questions]);

  if (!isOpen) return null;

  const currentQ = questions[activeTabIdx];

  const handleFieldChange = (field: keyof ExtractedQuestion, value: any) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[activeTabIdx] = {
        ...copy[activeTabIdx],
        [field]: value,
      };
      if (field === 'question_number') {
        copy[activeTabIdx].normalized_number = normalizeQuestionNumber(value);
      }
      return copy;
    });
  };

  const handleOutputTextChange = (text: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const cur = copy[activeTabIdx];
      const prevOut = cur.output;

      if (!text.trim()) {
        if (prevOut?.type === 'both') {
          copy[activeTabIdx].output = prevOut.image;
        } else if (prevOut?.type === 'text') {
          copy[activeTabIdx].output = null;
        }
      } else {
        const textObj: OutputTextMetadata = { type: 'text', content: text };
        if (prevOut?.type === 'image' || (prevOut?.type === 'both' && prevOut.image)) {
          const img = prevOut.type === 'both' ? prevOut.image : prevOut;
          copy[activeTabIdx].output = {
            type: 'both',
            image: img,
            text: textObj,
          };
        } else {
          copy[activeTabIdx].output = textObj;
        }
      }
      return copy;
    });
  };

  const handleRemoveImage = (idx: number) => {
    setQuestions((prev) => {
      const copy = [...prev];
      const cur = copy[idx];
      const prevOut = cur.output;

      if (prevOut?.type === 'both') {
        copy[idx].output = prevOut.text;
      } else if (prevOut?.type === 'image') {
        copy[idx].output = null;
      }
      return copy;
    });
  };

  const handleAddQuestion = () => {
    const nextNum = questions.length > 0 ? `${questions.length + 1}` : '1';
    const newQ: ExtractedQuestion = {
      question_number: nextNum,
      normalized_number: normalizeQuestionNumber(nextNum),
      question_name: 'New Question Title / Description',
      source_code: '',
      programming_language: 'python',
      output: null,
      page_number: 1,
    };
    setQuestions((prev) => [...prev, newQ]);
    setActiveTabIdx(questions.length);
  };

  const handleDeleteQuestion = (idx: number) => {
    if (!window.confirm(`Are you sure you want to delete Question ${questions[idx]?.question_number}?`)) {
      return;
    }
    setQuestions((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      if (activeTabIdx >= updated.length) {
        setActiveTabIdx(Math.max(0, updated.length - 1));
      }
      return updated;
    });
  };

  const saveExtractedData = async (publish: boolean = false) => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Validate questions
      for (const q of questions) {
        if (!q.question_number.trim()) {
          setErrorMsg('Each question must have a question number (e.g., 1, 1(a)).');
          setSaving(false);
          return;
        }
      }

      const updatedPayload = {
        ...(doc.extracted_content || {}),
        questions,
        extracted_at: new Date().toISOString(),
      };

      const updateData: Partial<PdfDocument> = {
        extracted_content: updatedPayload,
        updated_at: new Date().toISOString(),
        processing_status: 'completed',
      };

      if (publish) {
        updateData.is_published = true;
      }

      const { error } = await supabase
        .from('pdf_documents')
        .update(updateData)
        .eq('id', doc.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(publish ? 'Content saved and PDF successfully published!' : 'Changes saved successfully!');
        onUpdate();
        setTimeout(() => {
          if (publish) onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Helper to extract text output content from question output
  const getTextOutputContent = (out?: QuestionOutput): string => {
    if (!out) return '';
    if (out.type === 'text') return out.content;
    if (out.type === 'both') return out.text.content;
    return '';
  };

  // Helper to extract image output meta from question output
  const getImageOutputMeta = (out?: QuestionOutput): OutputImageMetadata | null => {
    if (!out) return null;
    if (out.type === 'image') return out;
    if (out.type === 'both') return out.image;
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[96vh] sm:max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50 gap-2">
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 shrink-0">
                Extraction Review
              </span>
              <h2 className="text-sm sm:text-lg font-bold text-slate-900 truncate max-w-[140px] sm:max-w-md">
                {doc.display_name || doc.file_name}
              </h2>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 hidden sm:block">
              Review and refine extracted questions, programs, and outputs before publishing to users.
            </p>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            <button
              onClick={handleAddQuestion}
              className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Question</span>
              <span className="sm:hidden">Add</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 sm:mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 sm:mx-6 mt-3 sm:mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Main Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Question List Sidebar / Tabs */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/70 p-2 sm:p-3 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-1.5 md:space-y-1 shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 pb-1 shrink-0 hidden md:block">
              Extracted Questions ({questions.length})
            </div>

            {questions.length === 0 ? (
              <div className="p-3 sm:p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl w-full">
                No questions found. Click "Add Question" to manually add entries.
              </div>
            ) : (
              questions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTabIdx(idx)}
                  className={`text-left px-2.5 sm:px-3 py-1.5 sm:py-2.5 rounded-xl text-xs transition-all flex items-center justify-between shrink-0 md:shrink md:w-full whitespace-nowrap md:whitespace-normal cursor-pointer ${
                    activeTabIdx === idx
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200/60 bg-white md:bg-transparent border md:border-0 border-slate-200'
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="font-mono font-bold mr-1.5">
                      Q.{q.question_number || (idx + 1)}
                    </span>
                    <span className={`truncate text-[11px] ${activeTabIdx === idx ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {q.question_name || 'Untitled'}
                    </span>
                  </div>
                  {q.source_code ? (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${activeTabIdx === idx ? 'bg-white' : 'bg-emerald-500'}`} />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="No code extracted" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Question Details Editor */}
          {currentQ ? (
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2.5 sm:space-x-3">
                  <div className="w-24 sm:w-28">
                    <label className="block text-[10px] sm:text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Question No.
                    </label>
                    <input
                      type="text"
                      value={currentQ.question_number}
                      onChange={(e) => handleFieldChange('question_number', e.target.value)}
                      placeholder="e.g. 1(a)"
                      className="w-full px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-mono font-bold border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="w-28 sm:w-36">
                    <label className="block text-[10px] sm:text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Language
                    </label>
                    <select
                      value={currentQ.programming_language || 'python'}
                      onChange={(e) => handleFieldChange('programming_language', e.target.value)}
                      className="w-full px-2.5 sm:px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="python">Python</option>
                      <option value="c">C</option>
                      <option value="cpp">C++</option>
                      <option value="java">Java</option>
                      <option value="javascript">JavaScript</option>
                      <option value="sql">SQL</option>
                      <option value="html">HTML</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteQuestion(activeTabIdx)}
                  className="flex items-center space-x-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200 transition-colors ml-auto sm:ml-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>

              {/* Question Name / Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Question Name / Statement</span>
                </label>
                <textarea
                  rows={2}
                  value={currentQ.question_name}
                  onChange={(e) => handleFieldChange('question_name', e.target.value)}
                  placeholder="Enter the full question description or problem statement..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              {/* Source Code Editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Source Code</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentQ.source_code ? currentQ.source_code.split('\n').length : 0} lines
                  </span>
                </div>
                <textarea
                  rows={10}
                  value={currentQ.source_code}
                  onChange={(e) => handleFieldChange('source_code', e.target.value)}
                  placeholder="// Paste or edit complete source code here with original indentation..."
                  className="w-full p-3 font-mono text-xs bg-slate-950 text-slate-100 rounded-xl border border-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                  spellCheck={false}
                />
              </div>

              {/* Output Section */}
              <div className="pt-2 border-t border-slate-100 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Output Content</span>
                  </label>
                  <span className="text-xs text-slate-500">
                    (Leave empty if no output exists in the document)
                  </span>
                </div>

                {/* Text Output Input */}
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1">
                    Text Output:
                  </span>
                  <textarea
                    rows={3}
                    value={getTextOutputContent(currentQ.output)}
                    onChange={(e) => handleOutputTextChange(e.target.value)}
                    placeholder="Extracted terminal or console output text..."
                    className="w-full px-3 py-2 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl border border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Output Image Preview & Upload */}
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">
                    Output Image Screenshot:
                  </span>
                  {getImageOutputMeta(currentQ.output) ? (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          uploadImageBlob(file, activeTabIdx);
                        }
                      }}
                      className="flex items-start space-x-4 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <div className="relative group max-w-xs">
                        <img
                          src={
                            getImageOutputMeta(currentQ.output)?.public_url ||
                            getImageOutputMeta(currentQ.output)?.signed_url ||
                            ''
                          }
                          alt="Output preview"
                          className="max-h-36 rounded border border-slate-200 object-contain bg-white"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-xs font-mono text-slate-600 break-all">
                          {getImageOutputMeta(currentQ.output)?.storage_path || 'Pasted image ready to save'}
                        </p>
                        <div className="flex items-center space-x-3">
                          <label className="cursor-pointer inline-flex items-center space-x-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Replace / Paste (Ctrl + V)</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleImageUpload(e, activeTabIdx)}
                              disabled={uploadingImageForIdx === activeTabIdx}
                            />
                          </label>
                          <button
                            onClick={() => handleRemoveImage(activeTabIdx)}
                            className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 font-medium cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Image</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      tabIndex={0}
                      onClick={() => adminFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          uploadImageBlob(file, activeTabIdx);
                        }
                      }}
                      className="group border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-5 text-center cursor-pointer transition-all bg-slate-50/70 hover:bg-indigo-50/20 focus:outline-hidden focus:ring-2 focus:ring-indigo-400"
                    >
                      <div className="flex flex-col items-center justify-center space-y-1.5">
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Clipboard className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-600">
                          {uploadingImageForIdx === activeTabIdx ? (
                            'Uploading image...'
                          ) : (
                            <>
                              Click to upload or press <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[11px] text-slate-800 shadow-2xs">Ctrl + V</kbd> to paste image
                            </>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Copy screenshot to clipboard and paste directly here
                        </p>
                      </div>
                      <input
                        type="file"
                        ref={adminFileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, activeTabIdx)}
                        disabled={uploadingImageForIdx === activeTabIdx}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Code2 className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-medium">Select a question or add a new one to begin editing.</p>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50 gap-2.5 sm:gap-3">
          <div className="text-xs text-slate-500 text-center sm:text-left">
            Total Questions: <span className="font-bold text-slate-800">{questions.length}</span>
            {doc.is_published && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-[10px]">
                Currently Published
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-end">
            <button
              onClick={() => saveExtractedData(false)}
              disabled={saving}
              className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-3.5 sm:px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Draft'}</span>
            </button>

            <button
              onClick={() => saveExtractedData(true)}
              disabled={saving}
              className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-4 sm:px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{saving ? 'Publishing...' : 'Approve & Publish'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
