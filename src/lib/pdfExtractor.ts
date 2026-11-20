import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import type { ExtractedQuestion, ExtractedContentPayload, QuestionOutput } from '../types';
import { normalizeQuestionNumber } from './normalizer';
import { uploadOutputImageToStorage } from './supabase';

// Point PDF.js worker to local public copy
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface ExtractionProgress {
  stage: 'loading' | 'analyzing' | 'extracting_text' | 'extracting_images' | 'ocr' | 'finalizing';
  pageCurrent: number;
  pageTotal: number;
  message: string;
}

interface PageTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Common programming language detection
 */
function detectLanguage(code: string): string {
  const lower = code.toLowerCase();

  // Dart & Flutter
  if (
    lower.includes('package:flutter') ||
    lower.includes('statelesswidget') ||
    lower.includes('statefulwidget') ||
    lower.includes('widget build(') ||
    lower.includes('buildcontext') ||
    lower.includes('setstate(') ||
    lower.includes('materialapp') ||
    lower.includes('scaffold(')
  ) {
    return 'dart';
  }

  // C / C++
  if (lower.includes('#include') || lower.includes('printf(') || lower.includes('scanf(')) {
    return lower.includes('cout') || lower.includes('cin') || lower.includes('std::') ? 'cpp' : 'c';
  }

  // Java
  if (lower.includes('public class') || lower.includes('system.out.print') || lower.includes('public static void main')) {
    return 'java';
  }

  // Python
  if (lower.includes('def ') || lower.includes('import numpy') || lower.includes('print(') || lower.includes('elif ')) {
    return 'python';
  }

  // SQL
  if (lower.includes('select ') && lower.includes('from ') && (lower.includes('where ') || lower.includes('create table'))) {
    return 'sql';
  }

  // JavaScript / TypeScript
  if (lower.includes('const ') || lower.includes('let ') || lower.includes('console.log') || lower.includes('function(')) {
    return 'javascript';
  }

  // HTML
  if (lower.includes('<html>') || lower.includes('<!doctype html>')) {
    return 'html';
  }

  return 'dart'; // Modern default for mobile & UI
}

/**
 * Check if a line indicates the start of Code or Solution
 */
function isCodeMarker(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return (
    trimmed === 'answer:' ||
    trimmed === 'ans:' ||
    trimmed === 'solution:' ||
    trimmed === 'sol:' ||
    trimmed === 'program:' ||
    trimmed === 'code:' ||
    trimmed === 'source code:' ||
    trimmed === 'dart code:' ||
    trimmed === 'flutter code:' ||
    trimmed === 'implementation:' ||
    trimmed.startsWith('answer:') ||
    trimmed.startsWith('ans:') ||
    trimmed.startsWith('solution:') ||
    trimmed.startsWith('sol:') ||
    trimmed.startsWith('program:') ||
    trimmed.startsWith('code:') ||
    trimmed.startsWith('source code:') ||
    trimmed.startsWith('implementation:')
  );
}

/**
 * Check if a line looks like programming source code
 */
function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Flutter / Dart
  if (/^import\s+['"]package:[a-zA-Z0-9_/.]+['"];?/i.test(trimmed)) return true;
  if (/^import\s+['"]dart:[a-zA-Z0-9_/.]+['"];?/i.test(trimmed)) return true;
  if (/^void\s+main\s*\(/i.test(trimmed)) return true;
  if (/^class\s+[a-zA-Z0-9_]+\s+extends\s+(?:StatelessWidget|StatefulWidget|State<)/i.test(trimmed)) return true;
  if (/^@override/i.test(trimmed)) return true;
  if (/^Widget\s+build\s*\(\s*BuildContext/i.test(trimmed)) return true;
  if (/^(?:return\s+)?(?:MaterialApp|Scaffold|Container|Column|Row|Center|Padding|SizedBox|Text|ElevatedButton|IconButton|TextField|ListView)\s*\(/i.test(trimmed)) return true;
  if (/^setState\s*\(\s*\(\s*\)\s*\{/i.test(trimmed)) return true;
  if (/^(?:final|const|late|var)\s+[a-zA-Z0-9_<>,\s]+\s*=/i.test(trimmed)) return true;

  // C / C++ / Java / C#
  if (/^(?:#include\s*<|#define|import\s+[a-zA-Z0-9_.*]+;|from\s+[a-zA-Z0-9_.]+\s+import)/i.test(trimmed)) return true;
  if (/^(?:public|private|protected|static|class|interface|enum|struct)\s+/i.test(trimmed)) return true;
  if (/^(?:int|float|double|char|void|bool|long|short|String)\s+[a-zA-Z0-9_]+\s*(\(|=)/i.test(trimmed)) return true;
  if (/^(?:if|else if|else|for|while|do|switch|case|default|return|break|continue)[\s(]/i.test(trimmed)) return true;
  if (/^(?:printf|scanf|cout|cin|System\.out|console\.log|print)\s*[\(<]/i.test(trimmed)) return true;

  // Python
  if (/^(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+[:\(]|try:|except[\s:]|finally:|with\s+)/i.test(trimmed)) return true;

  // Structural characters
  if (/^[{}();]+$/.test(trimmed)) return true;
  if (/[;{}]$/.test(trimmed) && trimmed.length > 3) return true;
  if (/^\/\//.test(trimmed) || /^#\s+[a-zA-Z]/.test(trimmed)) return true; // comments

  // Indentation check: starts with 2+ spaces or tab followed by programming syntax
  if (/^(\s{2,}|\t)/.test(line) && /[=+\-*/(){}[\];:,]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Output section detector
 */
function isOutputMarker(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return (
    trimmed === 'output:' ||
    trimmed === 'output' ||
    trimmed === 'sample output:' ||
    trimmed === 'sample output' ||
    trimmed === 'expected output:' ||
    trimmed === 'result:' ||
    trimmed === 'result' ||
    trimmed === 'output screen:' ||
    trimmed === 'screenshot:' ||
    trimmed.startsWith('output:') ||
    trimmed.startsWith('output :') ||
    trimmed.startsWith('sample output:') ||
    trimmed.startsWith('result:') ||
    trimmed.startsWith('console output:')
  );
}

/**
 * Cleans question titles by removing trailing marks, Blooms levels, COs
 * e.g. "What is Flutter? [10M] CO1 L2" -> "What is Flutter?"
 */
function cleanQuestionText(text: string): string {
  let cleaned = text.trim();
  // Remove trailing table pipes
  cleaned = cleaned.replace(/^\|\s*/, '').replace(/\s*\|$/, '');
  // Remove marks like [10M], (10 Marks), [5 Marks], [5M], (2M), (CO1), (L2), (BTL-2)
  cleaned = cleaned.replace(/\s*\[\s*\d+\s*(?:marks?|m)?\s*\]\s*$/i, '');
  cleaned = cleaned.replace(/\s*\(\s*\d+\s*(?:marks?|m)?\s*\)\s*$/i, '');
  cleaned = cleaned.replace(/\s*(?:CO\d+|BTL-?\d+|L\d+)\s*$/i, '');
  cleaned = cleaned.replace(/\s*\[\s*\d+\s*(?:marks?|m)?\s*\]\s*$/i, '');
  return cleaned.trim();
}

/**
 * Highly comprehensive Question Header detector
 * Matches:
 * 1. "Q.No: 1", "Q.No. 1(a)", "QNo. 1", "Q. 1", "Question 1:", "Que 1"
 * 2. "1.", "1)", "(1)", "[1]" (even on its own line)
 * 3. "1(a)", "1(b)", "1.a", "1.b", "1-a", "2(a)", "10(a)"
 * 4. Sub-questions: "a)", "b)", "(a)", "(b)"
 * 5. "Problem 1:", "Prog 1:", "Exp 1:", "Exercise 1:"
 */
interface QuestionHeaderResult {
  qNum: string;
  isSubQuestion: boolean;
  remainder: string;
}

function matchQuestionHeader(line: string, lastParentNum?: string): QuestionHeaderResult | null {
  let trimmed = line.trim();
  if (!trimmed) return null;

  // Strip leading table pipe if any
  trimmed = trimmed.replace(/^\|\s*/, '');

  // 1. Explicit Prefixes: "Q.No. 1(a)", "Q.No: 1", "QNo 1", "Question No. 1", "Question 1:", "Que 1", "Q. 1", "Q1:"
  const prefixMatch = trimmed.match(
    /^(?:q\.?\s*no\.?|question\s*no\.?|qno\.?|question|que\.?|ques\.?|q)\s*[:.\-]?\s*(\d+(?:\s*\([a-z0-9]+\)|[a-z\)])?)\s*[:.\-)]?\s*(.*)/i
  );
  if (prefixMatch && /\d/.test(prefixMatch[1])) {
    return {
      qNum: prefixMatch[1].replace(/\s+/g, ''),
      isSubQuestion: false,
      remainder: cleanQuestionText(prefixMatch[2]),
    };
  }

  // 2. Lab / Program / Problem prefixes: "Program 1:", "Prog 1(a)", "Exp 1", "Exercise 1", "Problem 1", "Task 1"
  const progMatch = trimmed.match(
    /^(?:program|prog\.?|experiment|exp\.?\s*no\.?|exp\.?|exercise|ex\.?\s*no\.?|ex\.?|problem|task)\s*[:.\-]?\s*(\d+(?:\s*\([a-z0-9]+\)|[a-z\)])?)\s*[:.\-)]?\s*(.*)/i
  );
  if (progMatch && /\d/.test(progMatch[1])) {
    return {
      qNum: progMatch[1].replace(/\s+/g, ''),
      isSubQuestion: false,
      remainder: cleanQuestionText(progMatch[2]),
    };
  }

  // 3. Question Number with subpart: "1(a)", "1(b)", "1.a", "1-a", "10(a)"
  const compositeMatch = trimmed.match(
    /^(\d+\s*(?:\([a-z0-9]+\)|[\.\-][a-z]))\s*[:.\-)]?\s*(.*)/i
  );
  if (compositeMatch) {
    return {
      qNum: compositeMatch[1].replace(/\s+/g, ''),
      isSubQuestion: false,
      remainder: cleanQuestionText(compositeMatch[2]),
    };
  }

  // 4. Standard Numbered List: "1.", "1)", "(1)", "[1]" (with or without trailing text)
  const numListMatch = trimmed.match(
    /^(?:\[|\()?(\d{1,3})(?:\]|\))?[\.\:\-\)]\s*(.*)/
  );
  if (numListMatch) {
    const num = numListMatch[1];
    const rest = numListMatch[2].trim();
    // Verify it's not a floating number in math or code
    return {
      qNum: num,
      isSubQuestion: false,
      remainder: cleanQuestionText(rest),
    };
  }

  // 5. Standalone number on line: e.g. "1" or "2" or "3" at the very beginning of a section
  const standaloneMatch = trimmed.match(/^(\d{1,3})\s*$/);
  if (standaloneMatch) {
    return {
      qNum: standaloneMatch[1],
      isSubQuestion: false,
      remainder: '',
    };
  }

  // 6. Sub-questions under a parent question: "a)", "b)", "(a)", "(b)", "a.", "b."
  const subMatch = trimmed.match(/^(?:\()?([a-f])(?:\)|\.)\s*(.*)/i);
  if (subMatch && lastParentNum) {
    const subLetter = subMatch[1].toLowerCase();
    return {
      qNum: `${lastParentNum}(${subLetter})`,
      isSubQuestion: true,
      remainder: cleanQuestionText(subMatch[2]),
    };
  }

  return null;
}

/**
 * Convert canvas to Blob
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas to Blob conversion failed'));
    }, 'image/png');
  });
}

/**
 * Extract structured content from a PDF file in browser
 */
export async function extractContentFromPdf(
  file: File,
  documentId: string,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<{ payload: ExtractedContentPayload; isUncertain: boolean }> {
  onProgress?.({
    stage: 'loading',
    pageCurrent: 0,
    pageTotal: 0,
    message: 'Loading PDF document...',
  });

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
    cMapPacked: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  onProgress?.({
    stage: 'analyzing',
    pageCurrent: 1,
    pageTotal: numPages,
    message: `Loaded ${numPages} page${numPages > 1 ? 's' : ''}. Analyzing layout...`,
  });

  let totalTextLength = 0;
  const pageLinesArray: { pageNum: number; lines: string[] }[] = [];
  const pageCanvases: HTMLCanvasElement[] = [];

  // Step 1: Extract text lines from every page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.({
      stage: 'extracting_text',
      pageCurrent: pageNum,
      pageTotal: numPages,
      message: `Extracting text and structure from page ${pageNum} of ${numPages}...`,
    });

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    // Render page to canvas for potential image/OCR extraction
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      await (page.render as any)({
        canvasContext: ctx,
        viewport,
        canvas,
      }).promise;
    }
    pageCanvases.push(canvas);

    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    // Group text items by Y coordinate with 6pt tolerance to preserve lines with different font sizes
    const lineMap = new Map<number, PageTextItem[]>();
    const Y_TOLERANCE = 6;

    for (const item of items) {
      if (!('str' in item)) continue;
      const str = item.str;
      const transform = item.transform;
      const x = transform[4];
      const y = transform[5];
      const width = item.width || 0;
      const height = item.height || 0;

      totalTextLength += str.trim().length;

      let matchedY: number | null = null;
      for (const existingY of lineMap.keys()) {
        if (Math.abs(existingY - y) <= Y_TOLERANCE) {
          matchedY = existingY;
          break;
        }
      }

      const keyY = matchedY !== null ? matchedY : y;
      if (!lineMap.has(keyY)) {
        lineMap.set(keyY, []);
      }
      lineMap.get(keyY)!.push({ text: str, x, y, width, height });
    }

    // Sort lines from top to bottom
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines: string[] = [];

    // Find leftmost margin for indentation calculation
    let minX = Infinity;
    for (const y of sortedY) {
      const lineItems = lineMap.get(y)!;
      for (const it of lineItems) {
        if (it.text.trim().length > 0 && it.x < minX) {
          minX = it.x;
        }
      }
    }
    if (minX === Infinity) minX = 0;

    for (const y of sortedY) {
      const lineItems = lineMap.get(y)!;
      lineItems.sort((a, b) => a.x - b.x);

      let lineStr = '';
      const firstItem = lineItems[0];
      if (firstItem) {
        const indentSpaces = Math.max(0, Math.floor((firstItem.x - minX) / 7));
        lineStr += ' '.repeat(indentSpaces);
      }

      for (let i = 0; i < lineItems.length; i++) {
        const cur = lineItems[i];
        if (i > 0) {
          const prev = lineItems[i - 1];
          const gap = cur.x - (prev.x + prev.width);
          if (gap > 4) {
            lineStr += ' ';
          }
        }
        lineStr += cur.text;
      }

      if (lineStr.trim().length > 0) {
        lines.push(lineStr);
      }
    }

    pageLinesArray.push({ pageNum, lines });
  }

  // Scanned PDF fallback via Tesseract.js if text length is near zero
  if (totalTextLength < 50 && numPages > 0) {
    onProgress?.({
      stage: 'ocr',
      pageCurrent: 1,
      pageTotal: numPages,
      message: 'Scanned document detected. Performing OCR with Tesseract...',
    });

    try {
      const worker = await createWorker('eng');
      for (let i = 0; i < pageCanvases.length; i++) {
        onProgress?.({
          stage: 'ocr',
          pageCurrent: i + 1,
          pageTotal: numPages,
          message: `Running OCR on page ${i + 1} of ${numPages}...`,
        });

        const ret = await worker.recognize(pageCanvases[i]);
        const ocrLines = ret.data.text.split('\n').filter((l) => l.trim().length > 0);
        pageLinesArray[i].lines = ocrLines;
      }
      await worker.terminate();
    } catch (err) {
      console.warn('OCR fallback failed, proceeding with extracted text:', err);
    }
  }

  // Step 2: Parse questions, code, and outputs across pages
  onProgress?.({
    stage: 'extracting_images',
    pageCurrent: 1,
    pageTotal: numPages,
    message: 'Extracting every question, program, and output...',
  });

  interface RawQuestionBlock {
    qNum: string;
    qNameLines: string[];
    codeLines: string[];
    outputLines: string[];
    hasOutputImage: boolean;
    outputImageCanvas?: HTMLCanvasElement;
    pageNum: number;
  }

  const rawBlocks: RawQuestionBlock[] = [];
  let currentBlock: RawQuestionBlock | null = null;
  let currentSection: 'name' | 'code' | 'output' = 'name';
  let lastParentNumber: string = '1';

  for (const { pageNum, lines } of pageLinesArray) {
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const trimmed = line.trim();

      // Check for question start
      const headerMatch = matchQuestionHeader(line, lastParentNumber);

      if (headerMatch) {
        if (!headerMatch.isSubQuestion) {
          // Track base parent number (e.g. "1" from "1" or "1(a)")
          const baseMatch = headerMatch.qNum.match(/^\d+/);
          if (baseMatch) {
            lastParentNumber = baseMatch[0];
          }
        }

        // Save previously active question block
        if (currentBlock) {
          rawBlocks.push(currentBlock);
        }

        currentBlock = {
          qNum: headerMatch.qNum,
          qNameLines: headerMatch.remainder ? [headerMatch.remainder] : [],
          codeLines: [],
          outputLines: [],
          hasOutputImage: false,
          pageNum,
        };
        currentSection = 'name';
        continue;
      }

      if (!currentBlock) {
        // Line before any detected question (e.g. document title, instructions)
        continue;
      }

      // Check for Output Section Marker
      if (isOutputMarker(line)) {
        currentSection = 'output';
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1 && colonIdx < line.length - 1) {
          const remainder = line.substring(colonIdx + 1).trim();
          if (remainder) {
            currentBlock.outputLines.push(remainder);
          }
        }
        continue;
      }

      // Check for Code / Answer / Solution Section Marker
      if (isCodeMarker(line)) {
        currentSection = 'code';
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1 && colonIdx < line.length - 1) {
          const remainder = line.substring(colonIdx + 1).trim();
          if (remainder) {
            currentBlock.codeLines.push(remainder);
          }
        }
        continue;
      }

      // If we are in 'name' section, check if this line starts code
      if (currentSection === 'name') {
        if (isCodeLine(line)) {
          currentSection = 'code';
          currentBlock.codeLines.push(line);
        } else {
          // Still question statement or description
          // If the question had no remainder on header line, this is the main title
          currentBlock.qNameLines.push(cleanQuestionText(trimmed));
        }
        continue;
      }

      // If in 'code' section
      if (currentSection === 'code') {
        currentBlock.codeLines.push(line);
        continue;
      }

      // If in 'output' section
      if (currentSection === 'output') {
        currentBlock.outputLines.push(line);
        continue;
      }
    }

    // Check if the current page has a visual output screenshot
    if (currentBlock && currentSection === 'output' && !currentBlock.hasOutputImage) {
      const canvas = pageCanvases[pageNum - 1];
      if (canvas && currentBlock.outputLines.length < 5) {
        try {
          const cropCanvas = document.createElement('canvas');
          const cropH = Math.floor(canvas.height * 0.45);
          cropCanvas.width = canvas.width;
          cropCanvas.height = cropH;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            cropCtx.drawImage(
              canvas,
              0,
              canvas.height - cropH,
              canvas.width,
              cropH,
              0,
              0,
              canvas.width,
              cropH
            );
            currentBlock.hasOutputImage = true;
            currentBlock.outputImageCanvas = cropCanvas;
          }
        } catch (e) {
          console.warn('Canvas cropping failed:', e);
        }
      }
    }
  }

  if (currentBlock) {
    rawBlocks.push(currentBlock);
  }

  // Step 3: Build structured ExtractedQuestion array
  onProgress?.({
    stage: 'finalizing',
    pageCurrent: numPages,
    pageTotal: numPages,
    message: 'Finalizing question structures and output media...',
  });

  const extractedQuestions: ExtractedQuestion[] = [];
  const detectedLanguagesSet = new Set<string>();

  for (const block of rawBlocks) {
    let qName = block.qNameLines.join(' ').replace(/\s+/g, ' ').trim();
    if (!qName) {
      qName = `Question ${block.qNum}`;
    }

    const code = block.codeLines.join('\n').trim();
    const lang = detectLanguage(code);
    detectedLanguagesSet.add(lang);

    const normNum = normalizeQuestionNumber(block.qNum);
    const outputText = block.outputLines.join('\n').trim();

    let outputObj: QuestionOutput = null;

    // Upload output image if captured
    let uploadedImageMeta: { type: 'image'; storage_path: string; public_url: string } | null = null;
    if (block.outputImageCanvas) {
      try {
        const blob = await canvasToBlob(block.outputImageCanvas);
        const { path, publicUrl, error } = await uploadOutputImageToStorage(
          blob,
          documentId,
          normNum
        );
        if (!error && path) {
          uploadedImageMeta = {
            type: 'image',
            storage_path: path,
            public_url: publicUrl,
          };
        }
      } catch (err) {
        console.warn('Failed to upload output image:', err);
      }
    }

    if (uploadedImageMeta && outputText) {
      outputObj = {
        type: 'both',
        image: uploadedImageMeta,
        text: {
          type: 'text',
          content: outputText,
        },
      };
    } else if (uploadedImageMeta) {
      outputObj = uploadedImageMeta;
    } else if (outputText) {
      outputObj = {
        type: 'text',
        content: outputText,
      };
    } else {
      outputObj = null;
    }

    extractedQuestions.push({
      question_number: block.qNum,
      normalized_number: normNum,
      question_name: qName,
      source_code: code,
      programming_language: lang,
      output: outputObj,
      page_number: block.pageNum,
    });
  }

  const isUncertain = extractedQuestions.length === 0;

  const payload: ExtractedContentPayload = {
    questions: extractedQuestions,
    extracted_at: new Date().toISOString(),
    total_pages: numPages,
    detected_languages: Array.from(detectedLanguagesSet),
    extraction_notes: `Successfully extracted ${extractedQuestions.length} questions from ${numPages} page(s).`,
  };

  return {
    payload,
    isUncertain,
  };
}
