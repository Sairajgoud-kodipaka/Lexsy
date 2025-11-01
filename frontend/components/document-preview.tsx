'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { FileText } from 'lucide-react';

interface DocumentPreviewProps {
  previewHtml: string | null;
  isLoading?: boolean;
  onEditField?: (fieldKey: string, currentValue: string) => void;
  sessionId?: string | null;
  currentIndex?: number | null;
}

export function DocumentPreview({ 
  previewHtml, 
  isLoading = false,
  onEditField,
  sessionId,
  currentIndex
}: DocumentPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to current field
  useEffect(() => {
    if (!previewRef.current || currentIndex === null || currentIndex === undefined) return;
    
    // Find the current placeholder element
    const currentField = previewRef.current.querySelector(`[data-index="${currentIndex}"]`);
    if (currentField) {
      currentField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);
  
  // Event delegation for placeholder clicks - works for filled/current/unfilled
  useEffect(() => {
    if (!previewRef.current || !onEditField) return;

    const container = previewRef.current;
    
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Clickable for ANY placeholder (filled/current/unfilled)
      const el = target.closest<HTMLElement>('[data-ph]');
      if (!el) return;

      // Use data-ph (id) as primary identifier, fallback to data-key
      const fieldKey = el.getAttribute('data-ph') || el.getAttribute('data-key') || '';
      const currentValue = el.textContent || '';
      onEditField(fieldKey, currentValue);
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [previewHtml, onEditField]);
  if (isLoading) {
    return (
      <Card className="border-2 bg-gradient-to-br from-card to-secondary/5 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span>Document Preview</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              <p className="text-sm text-black">Loading preview...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewHtml) {
    return (
      <Card className="border-2 bg-gradient-to-br from-card to-secondary/5 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span>Document Preview</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <FileText className="h-12 w-12 text-black mx-auto opacity-50" />
              <p className="text-sm text-black">
                Upload a document to see the preview
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-gray-200 bg-white shadow-sm flex flex-col h-full">
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <span>Document Preview</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full w-full p-6">
          <div
            ref={previewRef}
            className="document-preview-content prose prose-sm max-w-none text-black"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '2rem',
              minHeight: '100%',
              color: '#333',
            }}
          />
          <style jsx global>{`
            .document-preview-content {
              font-family: 'Calibri', 'Arial', sans-serif;
              color: #333;
              background-color: white !important;
            }
            /* Remove ALL yellow/brown/beige colors from document preview */
            .document-preview-content .placeholder-current {
              background-color: #fee2e2 !important;
              color: #991b1b !important;
              padding: 4px 8px;
              border-radius: 4px;
              font-weight: 700;
              border: 2px solid #dc2626 !important;
              box-shadow: 0 0 8px rgba(220, 38, 38, 0.3);
              display: inline-block;
            }
            .document-preview-content .placeholder-filled {
              background-color: #d1fae5 !important;
              color: #065f46 !important;
              padding: 2px 6px;
              border-radius: 3px;
              font-weight: 600;
              border: 1px solid #6ee7b7 !important;
              transition: all 0.2s;
            }
            .document-preview-content .placeholder-filled:hover {
              background-color: #a7f3d0 !important;
              text-decoration: underline;
            }
            .document-preview-content .placeholder-unfilled {
              background-color: transparent !important;
              color: #666 !important;
              padding: 2px 6px;
              border-radius: 3px;
              font-weight: 500;
              border: 1px dashed #d1d5db !important;
              opacity: 0.6;
            }
            /* Override table backgrounds - no yellow/brown */
            .document-preview-content table th,
            .document-preview-content .document-table th {
              background-color: #f3f4f6 !important;
            }
            .document-preview-content table tr:nth-child(even),
            .document-preview-content .document-table tr:nth-child(even) {
              background-color: #ffffff !important;
            }
            /* Remove any inline styles with yellow/brown colors */
            .document-preview-content [style*="#ff"],
            .document-preview-content [style*="#FF"],
            .document-preview-content [style*="yellow"],
            .document-preview-content [style*="Yellow"],
            .document-preview-content [style*="rgb(255, 255"],
            .document-preview-content [style*="rgb(255,193"],
            .document-preview-content [style*="rgb(255,235"],
            .document-preview-content [style*="#f8d7da"],
            .document-preview-content [style*="#fafafa"],
            .document-preview-content [style*="#f5f5f5"] {
              background-color: transparent !important;
              color: #333 !important;
            }
          `}</style>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

