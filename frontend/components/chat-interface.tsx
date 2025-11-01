'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  initialMessage?: string;
  currentKey?: string | null;
  currentValue?: string | null;
}

export function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  disabled = false,
  initialMessage,
  currentKey,
  currentValue,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (initialMessage && messages.length === 0) {
      // Initial message will be added by parent component
      inputRef.current?.focus();
    }
  }, [initialMessage, messages.length]);

  // Reset the input whenever the active placeholder changes
  useEffect(() => {
    if (currentKey === undefined) return;
    setInput((currentValue ?? '').toString());
  }, [currentKey, currentValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || disabled) return;

    onSendMessage(input.trim());
    setInput('');
  };

  const formatMessage = (content: string): string => {
    // Convert markdown-style formatting to HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');
  };

  return (
    <Card className="flex flex-col h-full border-2 border-gray-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardTitle className="flex items-center gap-2">
          <div className="rounded-full bg-primary/10 p-2">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <span>AI Assistant</span>
        </CardTitle>
      </CardHeader>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Show initial message only if no messages yet */}
          {messages.length === 0 && initialMessage && (
            <div className="flex gap-3 animate-fadeIn">
              <div className="rounded-full bg-primary/10 p-2 h-fit">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div
                  className="rounded-lg bg-gray-100 p-4 prose prose-sm max-w-none text-black"
                  dangerouslySetInnerHTML={{ __html: formatMessage(initialMessage) }}
                />
              </div>
            </div>
          )}

          {/* Show conversation messages */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3 animate-fadeIn',
                message.role === 'user' && 'flex-row-reverse'
              )}
            >
              <div
                className={cn(
                  'rounded-full p-2 h-fit',
                  message.role === 'user'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-primary/10 text-primary'
                )}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  'flex-1 rounded-lg p-4 max-w-[85%]',
                  message.role === 'user'
                    ? 'bg-secondary text-secondary-foreground ml-auto'
                    : 'bg-gray-100 text-black'
                )}
              >
                <div
                  className="prose prose-sm max-w-none text-black"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 animate-fadeIn">
              <div className="rounded-full bg-primary/10 p-2 h-fit">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="rounded-lg bg-gray-100 p-4 flex items-center gap-2 text-black">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-black">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer here..."
            disabled={isLoading || disabled}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading || disabled}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}

