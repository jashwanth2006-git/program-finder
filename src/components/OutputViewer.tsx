import React, { useState, useEffect } from 'react';
import type { QuestionOutput, OutputImageMetadata, OutputTextMetadata } from '../types';
import { getFileSignedUrl } from '../lib/supabase';
import { Terminal, Image as ImageIcon, X } from 'lucide-react';

interface OutputViewerProps {
  output?: QuestionOutput;
  questionNumber?: string;
}

export const OutputViewer: React.FC<OutputViewerProps> = ({ output, questionNumber }) => {
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!output) {
    return null;
  }

  let textOutput: OutputTextMetadata | null = null;
  let imageOutput: OutputImageMetadata | null = null;

  if (output.type === 'text') {
    textOutput = output;
  } else if (output.type === 'image') {
    imageOutput = output;
  } else if (output.type === 'both') {
    imageOutput = output.image;
    textOutput = output.text;
  }

  const hasText = Boolean(textOutput && textOutput.content && textOutput.content.trim().length > 0);
  const hasImage = Boolean(
    imageOutput && (imageOutput.storage_path || imageOutput.public_url || imageOutput.signed_url)
  );

  if (!hasText && !hasImage) {
    return null;
  }

  // Resolve image URL
  useEffect(() => {
    let isMounted = true;

    async function resolveUrl() {
      if (!imageOutput) {
        setResolvedImageUrl(null);
        return;
      }

      if (imageOutput.public_url) {
        setResolvedImageUrl(imageOutput.public_url);
        setImageError(false);
        return;
      }
      if (imageOutput.signed_url) {
        setResolvedImageUrl(imageOutput.signed_url);
        setImageError(false);
        return;
      }
      if (imageOutput.storage_path) {
        const signed = await getFileSignedUrl(imageOutput.storage_path);
        if (isMounted && signed) {
          setResolvedImageUrl(signed);
          setImageError(false);
        }
      }
    }

    resolveUrl();

    return () => {
      isMounted = false;
    };
  }, [imageOutput?.storage_path, imageOutput?.public_url, imageOutput?.signed_url]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center space-x-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">
        <Terminal className="w-4 h-4 text-indigo-600" />
        <span>Output</span>
      </div>

      {/* Direct Image Display: No box, border, or card wrapper */}
      {hasImage && imageOutput && (
        resolvedImageUrl && !imageError ? (
          <img
            src={resolvedImageUrl}
            alt={`Output for Question ${questionNumber || ''}`}
            className="w-full h-auto max-h-[700px] object-contain cursor-pointer"
            onClick={() => setIsLightboxOpen(true)}
            onError={() => setImageError(true)}
          />
        ) : imageError ? (
          <p className="text-xs text-slate-400">Image could not be loaded.</p>
        ) : (
          <div className="h-44 flex items-center justify-center text-slate-300 animate-pulse">
            <ImageIcon className="w-8 h-8 opacity-40" />
          </div>
        )
      )}

      {/* Text Output Block (Only when there is NO image) */}
      {!hasImage && hasText && textOutput && (
        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-xs">
          <pre className="p-4 font-mono text-xs sm:text-sm text-emerald-400 bg-slate-950 overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {textOutput.content}
          </pre>
        </div>
      )}

      {/* Lightbox Modal */}
      {isLightboxOpen && resolvedImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-transparent flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute -top-10 right-0 p-1.5 rounded-full text-white/80 hover:text-white bg-black/50 hover:bg-black/80 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={resolvedImageUrl}
              alt="Full output preview"
              className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
