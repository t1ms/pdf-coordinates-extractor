/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  FileUp, 
  Copy, 
  Check, 
  Crosshair, 
  Maximize2, 
  Settings2, 
  History,
  Info,
  ChevronLeft,
  ChevronRight,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface HistoryItem {
  id: string;
  timestamp: number;
  coords: string;
  page: number;
}

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [dpi, setDpi] = useState(300);
  const [scale, setScale] = useState(1); // Visual scale for the canvas
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF document
  const loadPdf = async (file: File) => {
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage(1);
      setPdfFile(file);
    } catch (error) {
      console.error('Error loading PDF:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Render PDF page to canvas
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    const page = await pdfDoc.getPage(currentPage);
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Calculate viewport at target DPI
    // PDF points are 72 DPI. So scale = targetDPI / 72
    const viewportScale = dpi / 72;
    const viewport = page.getViewport({ scale: viewportScale });

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    
    // Adjust visual scale to fit container if necessary
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 40;
      const visualScale = Math.min(1, containerWidth / canvas.width);
      setScale(visualScale);
    }
  }, [pdfDoc, currentPage, dpi]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Handle mouse events for drawing ROI
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setStartPos({ x, y });
    setIsDrawing(true);
    setCurrentRect({ x1: x, y1: y, x2: x, y2: y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setCurrentRect(prev => prev ? { ...prev, x2: x, y2: y } : null);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentRect) {
      const coords = formatCoords(currentRect);
      copyToClipboard(coords);
      addToHistory(coords);
    }
  };

  const formatCoords = (rect: Rect) => {
    const x1 = Math.round(Math.min(rect.x1, rect.x2));
    const y1 = Math.round(Math.min(rect.y1, rect.y2));
    const x2 = Math.round(Math.max(rect.x1, rect.x2));
    const y2 = Math.round(Math.max(rect.y1, rect.y2));
    return `${x1}, ${y1}, ${x2}, ${y2}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addToHistory = (coords: string) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      coords,
      page: currentPage
    };
    setHistory(prev => [newItem, ...prev].slice(0, 10));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadPdf(file);
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen bg-bg text-text-main font-sans overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-[280px] bg-surface border-r border-border flex flex-col p-6 shrink-0">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-2 h-2 bg-accent rounded-sm" />
            <h1 className="text-sm font-bold tracking-[2px] uppercase text-accent">Coord-X Portable</h1>
          </div>
          
          <div className="space-y-8 flex-1 overflow-y-auto custom-scrollbar pr-2">
            <div className="space-y-3">
              <span className="text-[10px] uppercase tracking-wider text-text-dim font-bold">Target Document</span>
              <div className="p-4 bg-bg border border-border rounded-sm space-y-1">
                <div className="text-[13px] font-medium truncate">
                  {pdfFile ? pdfFile.name : "No document loaded"}
                </div>
                <div className="text-[11px] text-text-dim">
                  {pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB • ${numPages} Pages` : "0.0 MB • 0 Pages"}
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf" 
                className="hidden" 
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-accent hover:bg-accent/90 text-white font-bold text-[13px] rounded-sm h-11"
              >
                <FileUp className="mr-2 h-4 w-4" />
                Load New PDF
              </Button>
            </div>

            <div className="space-y-4">
              <span className="text-[10px] uppercase tracking-wider text-text-dim font-bold">Engine Parameters</span>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center text-[12px]">
                  <span>Target DPI</span>
                  <span className="font-mono text-accent">{dpi}</span>
                </div>
                <Slider 
                  value={[dpi]} 
                  onValueChange={(val) => setDpi(val[0])} 
                  min={72} 
                  max={600} 
                  step={1}
                  className="py-2"
                />
              </div>

              <div className="flex justify-between items-center text-[12px]">
                <span>Navigation</span>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    className="h-6 w-6 text-text-dim hover:text-text-main"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="font-mono text-accent text-[11px]">P{currentPage}/{numPages || 1}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    disabled={currentPage >= numPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="h-6 w-6 text-text-dim hover:text-text-main"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>

              <div className="flex justify-between items-center text-[12px]">
                <span>Output Format</span>
                <span className="font-mono text-accent uppercase">CSV</span>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <span className="text-[10px] uppercase tracking-wider text-text-dim font-bold">Recent Extractions</span>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {history.length === 0 ? (
                    <p className="text-[11px] text-text-dim italic">No recent activity</p>
                  ) : (
                    history.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group flex items-center justify-between p-2 rounded-sm bg-bg border border-border hover:border-accent/50 transition-all cursor-pointer"
                        onClick={() => copyToClipboard(item.coords)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-mono text-accent opacity-70">P{item.page}</span>
                          <span className="text-[11px] font-mono text-text-main truncate max-w-[160px]">{item.coords}</span>
                        </div>
                        <Copy size={12} className="text-text-dim group-hover:text-accent transition-colors" />
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <p className="text-[12px] text-text-dim italic leading-tight">
              Release mouse to auto-copy coordinates to clipboard.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col bg-bg relative overflow-hidden">
          <div className="flex-1 m-10 bg-white shadow-[0_12px_48px_rgba(0,0,0,0.5)] border-[4px] border-[#1A1A1C] relative flex items-start justify-center overflow-auto custom-scrollbar group" ref={containerRef}>
            {!pdfFile ? (
              <div className="flex flex-col items-center gap-4 text-text-dim self-center">
                <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center border border-border">
                  <FileUp size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-text-main">No Document Loaded</p>
                  <p className="text-xs">Upload a PDF to begin</p>
                </div>
              </div>
            ) : (
              <div 
                className="relative cursor-crosshair select-none my-auto"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
              >
                <canvas ref={canvasRef} className="grayscale-[0.2] opacity-[0.95]" />
                
                {/* Drawing Layer */}
                <svg 
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${canvasRef.current?.width || 0} ${canvasRef.current?.height || 0}`}
                >
                  {currentRect && (
                    <g>
                      <rect
                        x={Math.min(currentRect.x1, currentRect.x2)}
                        y={Math.min(currentRect.y1, currentRect.y2)}
                        width={Math.abs(currentRect.x2 - currentRect.x1)}
                        height={Math.abs(currentRect.y2 - currentRect.y1)}
                        fill="rgba(99, 102, 241, 0.1)"
                        stroke="#6366F1"
                        strokeWidth={2 / scale}
                      />
                      {/* ROI Label */}
                      <foreignObject
                        x={Math.max(currentRect.x1, currentRect.x2) - (120 / scale)}
                        y={Math.max(currentRect.y1, currentRect.y2)}
                        width={120 / scale}
                        height={20 / scale}
                      >
                        <div className="bg-accent text-white font-mono text-[10px] px-1.5 py-0.5 whitespace-nowrap text-right" style={{ fontSize: `${10 / scale}px` }}>
                          {formatCoords(currentRect)}
                        </div>
                      </foreignObject>
                      {/* Corner Handle */}
                      <rect 
                        x={Math.max(currentRect.x1, currentRect.x2) - (4 / scale)}
                        y={Math.max(currentRect.y1, currentRect.y2) - (4 / scale)}
                        width={8 / scale}
                        height={8 / scale}
                        fill="white"
                        stroke="#6366F1"
                        strokeWidth={1 / scale}
                      />
                    </g>
                  )}
                </svg>
              </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-surface/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-mono text-accent font-bold uppercase tracking-widest">Rendering</p>
                </div>
              </div>
            )}
          </div>

          {/* Results / Status Bar */}
          <footer className="h-16 bg-surface border-t border-border flex items-center px-10 justify-between shrink-0">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-text-dim font-bold mb-1">Current Clipboard</span>
              <div className="font-mono text-[18px] text-text-main tracking-wider">
                {currentRect ? formatCoords(currentRect) : "0, 0, 0, 0"}
              </div>
            </div>

            <AnimatePresence>
              {copied && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="bg-[#10B981] text-white px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-tight shadow-lg"
                >
                  Copied to Clipboard
                </motion.div>
              )}
            </AnimatePresence>
          </footer>
        </main>
      </div>
    </TooltipProvider>
  );
}
