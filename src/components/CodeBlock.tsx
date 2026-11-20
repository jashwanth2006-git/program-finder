import React, { useState, useEffect } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-dart';
import { Copy, Check, Download, FileCode } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  fileName?: string;
  questionNumber?: string;
}

const EXTENSION_MAP: Record<string, string> = {
  python: 'py',
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  javascript: 'js',
  dart: 'dart',
  flutter: 'dart',
  sql: 'sql',
  html: 'html',
};

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'python',
  fileName,
  questionNumber,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Prism.highlightAll();
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const ext = EXTENSION_MAP[language.toLowerCase()] || 'txt';
    const cleanQ = questionNumber ? questionNumber.replace(/[^a-zA-Z0-9]/g, '_') : 'program';
    const downloadName = fileName ? `${fileName}.${ext}` : `Question_${cleanQ}.${ext}`;

    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lineCount = code.split('\n').length;
  const langKey = language.toLowerCase() === 'flutter' ? 'dart' : language.toLowerCase();
  const validLang = Prism.languages[langKey] ? langKey : 'clike';

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-xl my-2">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-900 border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="hidden sm:flex space-x-1.5 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block"></span>
          </div>
          <FileCode className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-mono font-medium text-slate-300 uppercase tracking-wider truncate">
            {language}
          </span>
          <span className="hidden sm:inline text-xs text-slate-500">
            • {lineCount} line{lineCount > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-md transition-all duration-150 border border-slate-700/60 cursor-pointer"
            title="Copy source code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold text-[11px] sm:text-xs">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy Code</span>
                <span className="sm:hidden text-[11px]">Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center space-x-1 px-2 sm:px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-md transition-all duration-150 border border-slate-700/60 cursor-pointer"
            title="Download source file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      {/* Code Body with Scroll */}
      <div className="max-h-[60vh] sm:max-h-[70vh] overflow-auto p-3 sm:p-4 font-mono text-xs sm:text-sm leading-relaxed text-slate-100">
        <pre className={`language-${validLang} !bg-transparent !m-0 !p-0 !border-none`}>
          <code className={`language-${validLang}`}>{code}</code>
        </pre>
      </div>
    </div>
  );
};
