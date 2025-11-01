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
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-black">
            Lexsy Document Automation
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            AI-powered legal document automation for startups
          </p>
        </div>

        {/* Error Display */}
        {state.error && (
          <Card className="border-destructive bg-destructive/10">
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
        )}

        {/* Upload Zone - Only show when no document */}
        {!hasDocument && (
          <div className="max-w-2xl mx-auto">
            <UploadZone
              onUpload={handleUpload}
              isLoading={state.isLoading}
              uploadedFile={uploadedFile}
            />
          </div>
        )}

        {/* Main Content - Show when document is uploaded */}
        {hasDocument && state.document && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Chat and Progress */}
            <div className="lg:col-span-1 space-y-6">
              <ProgressTracker
                placeholders={state.document.placeholders}
                filledValues={state.document.filledValues}
                currentIndex={state.currentIndex}
                progress={state.progress}
              />

              <div className="h-[600px]">
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

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                {state.isComplete && state.downloadUrl ? (
                  <>
                    <Button
                      onClick={handleDownload}
                      className="w-full"
                      size="lg"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Document
                    </Button>
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      className="w-full"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Start New Document
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
                      className="w-full"
                      size="lg"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {state.isLoading ? 'Processing...' : 'Complete Document'}
                    </Button>
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      className="w-full"
                      disabled={state.isLoading}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reset Session
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Right Column - Document Preview */}
            <div className="lg:col-span-2">
              <div className="h-[600px]">
                <DocumentPreview
                  previewHtml={state.previewHtml}
                  isLoading={state.isLoading && !state.previewHtml}
                  onEditField={handleEditField}
                  sessionId={state.sessionId}
                  currentIndex={state.currentIndex}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

