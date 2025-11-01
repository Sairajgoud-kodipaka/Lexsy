'use client';

import { useState, useCallback, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { UploadZone } from '@/components/upload-zone';
import { ChatInterface } from '@/components/chat-interface';
import { DocumentPreview } from '@/components/document-preview';
import { ProgressTracker } from '@/components/progress-tracker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import type {
  AppState,
  ChatMessage,
  Placeholder,
  UploadResponse,
  ChatResponse,
  PreviewResponse,
  CompleteResponse,
} from '@/lib/types';
import { Progress } from '@/components/ui/progress';

export default function Home() {
  const [state, setState] = useState<AppState>({
    sessionId: null,
    document: null,
    currentIndex: 0,
    progress: 0,
    isLoading: false,
    error: null,
    chatMessages: [],
    previewHtml: null,
    isComplete: false,
    downloadUrl: null,
  });

  const [initialMessage, setInitialMessage] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploadedFile(file);
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response: UploadResponse = await api.uploadDocument(file);

      // Don't add initial message to chat history yet - it will be shown separately
      setInitialMessage(response.initial_message || '');

      setState({
        sessionId: response.session_id,
        document: {
          filename: response.filename,
          placeholders: response.placeholders,
          filledValues: {},
        },
        currentIndex: 0,
        progress: 0,
        isLoading: false,
        error: null,
        chatMessages: [], // Start with empty messages
        previewHtml: null,
        isComplete: false,
        downloadUrl: null,
      });

      // Load initial preview
      setTimeout(() => {
        loadPreview(response.session_id);
      }, 500);
    } catch (error) {
      const errorMessage =
        error instanceof ApiError ? error.message : 'Failed to upload document';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      setUploadedFile(null);
    }
  }, []);

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!state.sessionId || state.isLoading) return;

      // Add user message immediately
      const userMessage: ChatMessage = {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        chatMessages: [...prev.chatMessages, userMessage],
        isLoading: true,
      }));

      try {
        const response: ChatResponse = await api.sendMessage(
          state.sessionId,
          message
        );

        const assistantMessage: ChatMessage = {
          id: `msg-assistant-${Date.now()}`,
          role: 'assistant',
          content: response.response,
          timestamp: new Date(),
          placeholderFilled: response.placeholder_filled,
        };

        const updatedFilledValues = response.filled_values;
        const newProgress = response.progress_percentage;
        const newCurrentIndex = response.current_progress;

        setState((prev) => ({
          ...prev,
          chatMessages: [...prev.chatMessages, assistantMessage],
          document: prev.document
            ? {
                ...prev.document,
                filledValues: updatedFilledValues,
              }
            : null,
          currentIndex: newCurrentIndex,
          progress: newProgress,
          isLoading: false,
          isComplete: response.all_filled,
          previewHtml: response.preview ?? prev.previewHtml,  // Use server-provided preview
        }));
      } catch (error) {
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : 'Failed to send message. Please try again.';

        const errorChatMessage: ChatMessage = {
          id: `msg-error-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${errorMessage}`,
          timestamp: new Date(),
        };

        setState((prev) => ({
          ...prev,
          chatMessages: [...prev.chatMessages, errorChatMessage],
          isLoading: false,
          error: errorMessage,
        }));
      }
    },
    [state.sessionId, state.isLoading]
  );

  const loadPreview = useCallback(async (sessionId: string) => {
    try {
      const preview: PreviewResponse = await api.getPreview(sessionId);
      setState((prev) => ({
        ...prev,
        previewHtml: preview.preview,
      }));
    } catch (error) {
      console.error('Failed to load preview:', error);
    }
  }, []);

  const handleComplete = useCallback(async () => {
    if (!state.sessionId || state.isLoading) return;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const response: CompleteResponse = await api.completeDocument(
        state.sessionId
      );

      setState((prev) => ({
        ...prev,
        isComplete: true,
        downloadUrl: response.download_url,
        isLoading: false,
      }));

      // Show success message
      const successMessage: ChatMessage = {
        id: `msg-success-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        chatMessages: [...prev.chatMessages, successMessage],
      }));
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : 'Failed to complete document. Please try again.';

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [state.sessionId, state.isLoading]);

  const handleDownload = useCallback(async () => {
    if (!state.downloadUrl) return;

    try {
      const filename = state.downloadUrl.split('/').pop() || 'document.docx';
      const blob = await api.downloadDocument(filename);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : 'Failed to download document. Please try again.';
      setState((prev) => ({ ...prev, error: errorMessage }));
    }
  }, [state.downloadUrl]);

  const handleFillFieldDirectly = useCallback(
    async (fieldKey: string, value: string) => {
      if (!state.sessionId || state.isLoading) return;

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const response = await api.fillFieldDirectly(state.sessionId, fieldKey, value);

        // Update state with new preview and filled values
        setState((prev) => ({
          ...prev,
          previewHtml: response.preview,
          isLoading: false,
          currentIndex: response.next_index ?? prev.currentIndex,
          document: prev.document ? {
            ...prev.document,
            filledValues: response.filled_values || prev.document.filledValues,
          } : null,
          progress: response.progress_percentage || prev.progress,
        }));

        // Show success message if auto-filled
        if (response.auto_filled && response.auto_filled.length > 0) {
          console.log(`Auto-filled: ${response.auto_filled.join(', ')}`);
        }
      } catch (error) {
        const errorMessage =
          error instanceof ApiError ? error.message : 'Failed to fill field';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error; // Re-throw so component can handle it
      }
    },
    [state.sessionId, state.isLoading]
  );

  const handleEditField = useCallback(
    async (fieldKey: string, currentValue: string) => {
      if (!state.sessionId) return;

      // Prompt user for new value
      const newValue = prompt(`Edit field value:\n\nCurrent: ${currentValue}\n\nEnter new value:`, currentValue);
      
      if (newValue === null || newValue === currentValue) {
        return; // User cancelled or didn't change
      }

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const response: PreviewResponse = await api.editField(
          state.sessionId,
          fieldKey,  // This is now the ID
          newValue
        );

        // Find the placeholder by ID first, then by key
        const placeholder = state.document?.placeholders.find((p) => p.id === fieldKey || p.key === fieldKey);
        const fieldName = placeholder?.name || 'Field';

        // Update state
        setState((prev) => ({
          ...prev,
          document: prev.document
            ? {
                ...prev.document,
                filledValues: response.filled_values,
              }
            : null,
          previewHtml: response.preview,
          currentIndex: response.current_index ?? prev.currentIndex,
          progress: response.progress_percentage,
          isLoading: false,
        }));

        // Add a message about the edit
        const editMessage: ChatMessage = {
          id: `msg-edit-${Date.now()}`,
          role: 'assistant',
          content: `✅ Updated **${fieldName}** to: "${newValue}"`,
          timestamp: new Date(),
        };

        setState((prev) => ({
          ...prev,
          chatMessages: [...prev.chatMessages, editMessage],
        }));
      } catch (error) {
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : 'Failed to update field. Please try again.';

        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }
    },
    [state.sessionId, state.document]
  );

  const handleReset = useCallback(async () => {
    if (state.sessionId) {
      try {
        await api.resetSession(state.sessionId);
      } catch (error) {
        console.error('Failed to reset session:', error);
      }
    }

    setState({
      sessionId: null,
      document: null,
      currentIndex: 0,
      progress: 0,
      isLoading: false,
      error: null,
      chatMessages: [],
      previewHtml: null,
      isComplete: false,
      downloadUrl: null,
    });
    setInitialMessage('');
    setUploadedFile(null);
  }, [state.sessionId]);

  // Note: Auto-refresh removed - preview is now updated with each chat response
  // for better performance and to avoid race conditions

  const hasDocument = state.document !== null;

  return (
    <main className="min-h-screen flex flex-col bg-white">
      {/* Premium Header */}
      <div className="border-b border-slate-200/50 bg-gradient-to-r from-white via-slate-50/30 to-white backdrop-blur-sm sticky top-0 z-40 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 transition-all duration-300">
                Lexsy
              </h1>
              <p className="text-sm text-slate-600 mt-1 transition-all duration-300">
                AI-powered legal document automation
              </p>
            </div>
            {state.document && (
              <div className="text-right animate-fadeIn">
                <div className="text-sm font-medium text-slate-700 transition-all duration-300">
                  {state.document.filename}
                </div>
                <div className="text-xs text-slate-500 mt-1 transition-all duration-300">
                  {Object.keys(state.document.filledValues).length} / {state.document.placeholders.length} fields
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-full w-full flex-1 flex overflow-hidden">
          {/* Error Display */}
          {state.error && (
            <div className="fixed top-20 left-4 right-4 max-w-md mx-auto z-50 animate-slideInRight">
              <Card className="border-destructive/50 bg-destructive/10 backdrop-blur-sm">
                <div className="p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <p className="text-sm text-destructive">{state.error}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setState((prev) => ({ ...prev, error: null }))}
                    className="ml-auto"
                  >
                    Dismiss
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Upload Zone - Only show when no document */}
          {!hasDocument && (
            <div className="px-4 md:px-8 py-12 flex items-center justify-center w-full animate-fadeIn">
              <div className="max-w-2xl w-full">
                <UploadZone
                  onUpload={handleUpload}
                  isLoading={state.isLoading}
                  uploadedFile={uploadedFile}
                />
              </div>
            </div>
          )}

          {/* Main Content - Fixed Sidebars with Scrollable Center */}
          {hasDocument && state.document && (
            <div className="flex-1 flex relative">
              {/* LEFT: Progress Tracker - FIXED POSITION */}
              <div className="hidden xl:block fixed left-0 top-[120px] bottom-[80px] w-72 z-30">
                <div className="h-full border-r border-slate-200/50 bg-gradient-to-b from-white to-slate-50/30 transition-all duration-300 shadow-sm">
                  <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
                    <ProgressTracker
                      placeholders={state.document.placeholders}
                      filledValues={state.document.filledValues}
                      currentIndex={state.currentIndex}
                      progress={state.progress}
                    />
                  </div>
                </div>
              </div>

              {/* CENTER: Document Preview - SCROLLABLE CONTENT */}
              <div className="flex-1 xl:ml-72 md:mr-[332px]">
                <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide">
                  <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8 transition-all duration-300">
                    <DocumentPreview
                      previewHtml={state.previewHtml}
                      isLoading={state.isLoading && !state.previewHtml}
                      onEditField={handleEditField}
                      sessionId={state.sessionId}
                      onFillField={handleFillFieldDirectly}
                      currentIndex={state.currentIndex}
                      placeholders={state.document?.placeholders || []}
                      filledValues={state.document?.filledValues || {}}
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT: AI Assistant - FIXED POSITION */}
              <div className="hidden md:block fixed right-10 top-[130px] bottom-[76px] w-80 z-60">
                <div className="h-full bg-white border-l border-slate-200/50 shadow-lg transition-all duration-300">
                  <ChatInterface
                    messages={state.chatMessages}
                    onSendMessage={handleSendMessage}
                    isLoading={state.isLoading}
                    disabled={state.isComplete}
                    initialMessage={initialMessage}
                    currentKey={state.document?.placeholders[state.currentIndex]?.id ?? state.document?.placeholders[state.currentIndex]?.key ?? null}
                    currentValue={
                      state.document?.placeholders[state.currentIndex]?.id
                        ? state.document?.filledValues[state.document.placeholders[state.currentIndex].id!] ?? ''
                        : state.document?.placeholders[state.currentIndex]?.key
                        ? state.document?.filledValues[state.document.placeholders[state.currentIndex].key] ?? ''
                        : ''
                    }
                  />
                </div>
              </div>

              {/* MOBILE: Chat Fixed Window at Bottom (NO SCROLL) */}
              {state.chatMessages.length > 0 && (
                <div className="md:hidden fixed bottom-20 right-4 left-4 max-w-md h-[35vh] bg-white border border-slate-200/50 rounded-2xl flex flex-col shadow-2xl z-50 animate-slideInRight overflow-hidden min-h-0">
                  <ChatInterface
                    messages={state.chatMessages}
                    onSendMessage={handleSendMessage}
                    isLoading={state.isLoading}
                    disabled={state.isComplete}
                    initialMessage={initialMessage}
                    currentKey={state.document?.placeholders[state.currentIndex]?.id ?? state.document?.placeholders[state.currentIndex]?.key ?? null}
                    currentValue={
                      state.document?.placeholders[state.currentIndex]?.id
                        ? state.document?.filledValues[state.document.placeholders[state.currentIndex].id!] ?? ''
                        : state.document?.placeholders[state.currentIndex]?.key
                        ? state.document?.filledValues[state.document.placeholders[state.currentIndex].key] ?? ''
                        : ''
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons Footer - Below main content */}
        {hasDocument && state.document && (
          <div className="border-t border-slate-200/50 bg-gradient-to-r from-white to-slate-50/30 backdrop-blur-sm transition-all duration-300">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
              {state.isComplete && state.downloadUrl ? (
                <>
                  <Button
                    onClick={handleDownload}
                    className="flex-1 order-1 sm:order-none bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg transition-all duration-300"
                    size="lg"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Document
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="flex-1 order-2 sm:order-none transition-all duration-300"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Start New
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleComplete}
                    disabled={
                      state.isLoading ||
                      state.progress < 100 ||
                      (state.document?.placeholders.length || 0) !==
                        Object.keys(state.document?.filledValues || {}).length
                    }
                    className="flex-1 order-1 sm:order-none bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                    size="lg"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {state.isLoading ? 'Processing...' : 'Complete'}
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="flex-1 order-2 sm:order-none transition-all duration-300"
                    disabled={state.isLoading}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Mobile Progress Bar - Shown only on small screens when document is open */}
        {hasDocument && state.document && (
          <div className="xl:hidden border-t border-slate-200/50 bg-gradient-to-r from-white to-slate-50/30 backdrop-blur-sm px-4 py-3 transition-all duration-300">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Progress</span>
                <span className="text-primary font-bold transition-all duration-500">{state.progress.toFixed(0)}%</span>
              </div>
              <div className="relative h-1.5 bg-slate-200/50 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500 ease-out shadow-sm"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <div className="flex gap-2 text-xs text-slate-600 transition-all duration-300">
                <span>{Object.keys(state.document.filledValues).length} completed</span>
                <span>•</span>
                <span>{state.document.placeholders.length - Object.keys(state.document.filledValues).length} remaining</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


