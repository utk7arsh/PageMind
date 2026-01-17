import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

type Mode = 'explain' | 'quiz' | 'ask' | 'summarize';

interface ModeConfig {
  icon: string;
  label: string;
  placeholder: string;
  color: string;
}

interface ModelInfo {
  name: string;
  description: string;
}

const MODES: Record<Mode, ModeConfig> = {
  explain: {
    icon: '💡',
    label: 'Explain',
    placeholder: 'Ask for clarification...',
    color: 'from-amber-500 to-orange-500',
  },
  quiz: {
    icon: '📝',
    label: 'Quiz',
    placeholder: 'Ask a follow-up question...',
    color: 'from-emerald-500 to-teal-500',
  },
  ask: {
    icon: '❓',
    label: 'Ask',
    placeholder: 'Type your question...',
    color: 'from-indigo-500 to-purple-500',
  },
  summarize: {
    icon: '📋',
    label: 'Summarize',
    placeholder: 'Ask about the summary...',
    color: 'from-cyan-500 to-blue-500',
  },
};

const QUICK_ACTIONS = [
  { label: 'ELI5', prompt: 'Explain this like I\'m 5 years old' },
  { label: 'Key Points', prompt: 'What are the key takeaways?' },
  { label: 'Examples', prompt: 'Give me practical examples' },
  { label: 'Pros & Cons', prompt: 'What are the pros and cons?' },
];

// Markdown renderer component
function MarkdownContent({ content }: { content: string }) {
  const html = parseMarkdown(content);
  return (
    <div
      className="prose prose-invert prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-pm-bg rounded-lg p-3 overflow-x-auto my-2"><code class="text-xs font-mono text-pm-text">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-pm-bg px-1.5 py-0.5 rounded text-xs font-mono text-pm-accent">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-pm-text font-semibold">$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em class="text-pm-text-muted italic">$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-pm-text mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-pm-text mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-pm-text mt-4 mb-2">$1</h1>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-pm-text list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-pm-text list-decimal">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="my-2">')
    .replace(/\n/g, '<br/>');
}

// Get current domain
function getDomain(): string {
  try {
    return window.location.hostname || 'default';
  } catch {
    return 'default';
  }
}

// Main App Component
function PageMindApp() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [mode, setMode] = useState<Mode>('ask');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContext, setSelectedContext] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [size, setSize] = useState({ width: 420, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'se' | 's' | 'e' | 'w' | 'sw' | 'ne' | 'nw' | 'n' | null>(null);
  const [contextInvalidated, setContextInvalidated] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [availableModels, setAvailableModels] = useState<Record<string, ModelInfo>>({});
  const [showQuickActions, setShowQuickActions] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, startX: 0, startY: 0 });
  const streamingMessageId = useRef<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load settings and chat history on mount
  useEffect(() => {
    const init = async () => {
      try {
        if (!chrome.runtime?.id) {
          setContextInvalidated(true);
          return;
        }

        // Get API key
        chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            if (errorMsg.includes('Extension context invalidated')) {
              setContextInvalidated(true);
            }
            return;
          }
          if (!response?.apiKey) {
            setHasApiKey(false);
            setShowSettings(true);
          }
        });

        // Get model
        chrome.runtime.sendMessage({ type: 'GET_MODEL' }, (response) => {
          if (!chrome.runtime.lastError && response?.model) {
            setSelectedModel(response.model);
          }
        });

        // Get available models
        chrome.runtime.sendMessage({ type: 'GET_MODELS' }, (response) => {
          if (!chrome.runtime.lastError && response?.models) {
            setAvailableModels(response.models);
          }
        });

        // Load chat history for this domain
        chrome.runtime.sendMessage(
          { type: 'GET_CHAT_HISTORY', payload: { domain: getDomain() } },
          (response) => {
            if (!chrome.runtime.lastError && response?.history?.length) {
              setMessages(response.history.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })));
            }
          }
        );

        // Load saved panel size
        chrome.storage.local.get(['pagemind_size'], (result) => {
          if (result.pagemind_size) {
            setSize(result.pagemind_size);
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Extension context invalidated')) {
          setContextInvalidated(true);
        }
      }
    };

    init();

    // Periodically check context validity
    const interval = setInterval(() => {
      if (!chrome.runtime?.id) {
        setContextInvalidated(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Save chat history when messages change
  useEffect(() => {
    if (messages.length > 0 && !messages.some(m => m.isStreaming)) {
      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'SAVE_CHAT_HISTORY',
            payload: { domain: getDomain(), messages },
          });
        }
      } catch {
        // Ignore errors
      }
    }
  }, [messages]);

  const handleSendMessage = useCallback(async (content?: string, currentMode?: Mode) => {
    const messageContent = content || input.trim();
    if (!messageContent || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    // Create streaming assistant message
    const assistantId = (Date.now() + 1).toString();
    const streamingMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, streamingMessage]);
    setInput('');
    setIsLoading(true);
    streamingMessageId.current = assistantId;

    try {
      if (!chrome.runtime?.id) {
        setContextInvalidated(true);
        throw new Error('Extension context invalidated');
      }

      // Use port for streaming
      const port = chrome.runtime.connect({ name: 'pagemind-stream' });
      
      port.onMessage.addListener((chunk: { type: string; content?: string; error?: string }) => {
        if (chunk.type === 'chunk' && chunk.content) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk.content }
                : m
            )
          );
        } else if (chunk.type === 'done') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false }
                : m
            )
          );
          setIsLoading(false);
          streamingMessageId.current = null;
          port.disconnect();
        } else if (chunk.type === 'error') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `❌ Error: ${chunk.error}`, isStreaming: false }
                : m
            )
          );
          if (chunk.error?.includes('API key')) {
            setHasApiKey(false);
            setShowSettings(true);
          }
          setIsLoading(false);
          streamingMessageId.current = null;
          port.disconnect();
        }
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          if (errorMsg.includes('Extension context invalidated')) {
            setContextInvalidated(true);
          }
        }
        setIsLoading(false);
      });

      // Send request
      port.postMessage({
        type: 'STREAM_CHAT_REQUEST',
        payload: {
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          mode: currentMode || mode,
          context: selectedContext,
          model: selectedModel,
        },
      });
    } catch (error) {
      let errorMessage = 'Something went wrong';
      if (error instanceof Error) {
        if (error.message.includes('Extension context invalidated')) {
          errorMessage = 'Extension was reloaded. Please refresh this page.';
          setContextInvalidated(true);
        } else {
          errorMessage = error.message;
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `❌ Error: ${errorMessage}`, isStreaming: false }
            : m
        )
      );
      setIsLoading(false);
    }
  }, [input, isLoading, messages, mode, selectedContext, selectedModel]);

  // Listen for events
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);

    const handleContextAction = (event: CustomEvent) => {
      const { mode: newMode, selectedText } = event.detail as { mode: Mode; selectedText: string };
      setMode(newMode);
      setSelectedContext(selectedText);
      setIsOpen(true);

      const prompts: Record<Mode, string> = {
        explain: `Please explain this:\n\n"${selectedText}"`,
        quiz: `Create a quiz based on this:\n\n"${selectedText}"`,
        summarize: `Summarize this:\n\n"${selectedText}"`,
        ask: `About this:\n\n"${selectedText}"`,
      };

      if (newMode !== 'ask') {
        handleSendMessage(prompts[newMode], newMode);
      } else {
        setInput('');
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };

    window.addEventListener('pagemind-toggle', handleToggle);
    window.addEventListener('pagemind-context-action', handleContextAction as EventListener);

    return () => {
      window.removeEventListener('pagemind-toggle', handleToggle);
      window.removeEventListener('pagemind-context-action', handleContextAction as EventListener);
    };
  }, [handleSendMessage]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, showSettings]);

  // Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    if (target.closest('.pm-drag-handle')) {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      } else if (target.closest('.pm-resize-handle')) {
        const handle = target.closest('.pm-resize-handle');
        const direction = handle?.getAttribute('data-direction') as 'se' | 's' | 'e' | 'w' | 'sw' | 'ne' | 'n';
        setIsResizing(true);
        setResizeDirection(direction);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
        startX: position.x,
        startY: position.y,
      };
      }
  }, [position, size]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      } else if (isResizing && resizeDirection) {
        const deltaX = e.clientX - resizeStart.current.x;
        const deltaY = e.clientY - resizeStart.current.y;
        
        let newWidth = size.width;
        let newHeight = size.height;
        let newX = position.x;
        let newY = position.y;

        // Handle horizontal resizing
        if (resizeDirection === 'e' || resizeDirection === 'se' || resizeDirection === 'ne') {
          // Resize from right edge - dragging right expands, dragging left contracts
          newWidth = Math.max(320, Math.min(1000, resizeStart.current.width + deltaX));
        } else if (resizeDirection === 'w' || resizeDirection === 'sw' || resizeDirection === 'nw') {
          // Resize from left edge - dragging right expands left, dragging left contracts from left
          // When dragging right (positive deltaX), width increases and panel moves left (right value increases)
          const widthChange = deltaX; // Positive deltaX = increase width
          const minWidth = 320;
          const maxWidth = 1000;
          const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.current.width + widthChange));
          
          // Calculate how much the width actually changed
          const actualWidthChange = constrainedWidth - resizeStart.current.width;
          // Move panel left (increase right/X) when width increases
          newX = resizeStart.current.startX + actualWidthChange;
          newWidth = constrainedWidth;
        }

        // Handle vertical resizing
        if (resizeDirection === 's' || resizeDirection === 'se' || resizeDirection === 'sw') {
          // Resize from bottom edge - dragging down expands, dragging up contracts
          newHeight = Math.max(400, Math.min(1000, resizeStart.current.height + deltaY));
        } else if (resizeDirection === 'n' || resizeDirection === 'ne' || resizeDirection === 'nw') {
          // Resize from top edge - dragging down expands up, dragging up contracts from top
          // When dragging down (positive deltaY), height increases and panel moves up (bottom value increases)
          const heightChange = deltaY; // Positive deltaY = increase height
          const minHeight = 400;
          const maxHeight = 1000;
          const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.current.height + heightChange));
          
          // Calculate how much the height actually changed
          const actualHeightChange = constrainedHeight - resizeStart.current.height;
          // Move panel up (increase bottom/Y) when height increases
          newY = resizeStart.current.startY + actualHeightChange;
          newHeight = constrainedHeight;
        }

        setSize({ width: newWidth, height: newHeight });
        if (newX !== position.x && (resizeDirection === 'w' || resizeDirection === 'sw' || resizeDirection === 'nw')) {
          setPosition(prev => ({ ...prev, x: newX }));
        }
        if (newY !== position.y && (resizeDirection === 'n' || resizeDirection === 'ne' || resizeDirection === 'nw')) {
          setPosition(prev => ({ ...prev, y: newY }));
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
      if (isResizing) {
        const finalSize = {
          width: Math.max(320, Math.min(800, size.width)),
          height: Math.max(400, Math.min(900, size.height)),
        };
        setIsResizing(false);
        setResizeDirection(null);
        // Save size preference
        try {
          if (chrome.runtime?.id) {
            chrome.storage.local.set({ pagemind_size: finalSize });
          }
        } catch {
          // Ignore
        }
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, resizeDirection, size]);

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) return;

    try {
      if (!chrome.runtime?.id) {
        setContextInvalidated(true);
        return;
      }

      chrome.runtime.sendMessage(
        { type: 'SET_API_KEY', payload: { apiKey: apiKeyInput.trim() } },
        (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || '';
            if (errorMsg.includes('Extension context invalidated')) {
              setContextInvalidated(true);
            } else {
              alert(`Error: ${errorMsg}`);
            }
            return;
          }
          setHasApiKey(true);
          setShowSettings(false);
          setApiKeyInput('');
        }
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Extension context invalidated')) {
        setContextInvalidated(true);
      }
    }
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    try {
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ type: 'SET_MODEL', payload: { model } });
      }
    } catch {
      // Ignore
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setSelectedContext('');
    try {
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({
          type: 'CLEAR_CHAT_HISTORY',
          payload: { domain: getDomain() },
        });
      }
    } catch {
      // Ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickAction = (prompt: string) => {
    setShowQuickActions(false);
    if (selectedContext) {
      handleSendMessage(`${prompt} for: "${selectedContext.slice(0, 200)}"`);
    } else {
      handleSendMessage(prompt);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[2147483647] animate-slide-up"
      style={{
        right: `${position.x}px`,
        bottom: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        pointerEvents: 'auto',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-pm-surface rounded-2xl border border-pm-border shadow-2xl shadow-black/50 overflow-hidden flex flex-col h-full relative"
           style={{ height: `${size.height}px` }}>
        
        {/* Header */}
        <div className="pm-drag-handle cursor-move bg-gradient-to-r from-pm-surface to-pm-surface-hover px-5 py-3.5 border-b border-pm-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <span className="text-xl">🧠</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-pm-text tracking-tight">PageMind AI</h1>
                <p className="text-xs text-pm-text-muted/80 font-medium">{getDomain()}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-xl hover:bg-pm-surface-hover/80 text-pm-text-muted hover:text-pm-text transition-all hover:scale-105"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={() => setIsPinned(!isPinned)}
                className={`p-2 rounded-xl transition-all hover:scale-105 ${isPinned ? 'bg-pm-accent/20 text-pm-accent' : 'hover:bg-pm-surface-hover/80 text-pm-text-muted hover:text-pm-text'}`}
                title={isPinned ? 'Unpin' : 'Pin'}
              >
                <svg className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl hover:bg-red-500/20 text-pm-text-muted hover:text-red-400 transition-all hover:scale-105"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {contextInvalidated ? (
          <div className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-pm-text">Extension Reloaded</h3>
            <p className="text-sm text-pm-text-muted">Please refresh to continue.</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Refresh Page
            </button>
          </div>
        ) : showSettings ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-pm-text mb-2">OpenAI API Key</label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-pm-bg border border-pm-border rounded-lg text-pm-text placeholder-pm-text-muted focus:outline-none focus:border-pm-accent transition-colors"
              />
              <p className="mt-2 text-xs text-pm-text-muted">Stored locally, only sent to OpenAI.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-pm-text mb-2">Model</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(availableModels).map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => handleModelChange(id)}
                    className={`p-3 rounded-lg text-left transition-all ${
                      selectedModel === id
                        ? 'bg-pm-surface-hover border border-pm-accent'
                        : 'bg-pm-bg border border-pm-border hover:border-pm-accent'
                    }`}
                  >
                    <div className="text-sm font-medium text-pm-text">{info.name}</div>
                    <div className="text-xs text-pm-text-muted">{info.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveApiKey}
              className="w-full py-2 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Save Settings
            </button>
            {hasApiKey && (
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-2 px-4 bg-pm-surface-hover text-pm-text rounded-lg font-medium hover:bg-pm-border transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mode Selector */}
            <div className="px-4 py-2.5 border-b border-pm-border bg-pm-bg flex-shrink-0">
              <div className="flex gap-1.5">
                {(Object.entries(MODES) as [Mode, ModeConfig][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      mode === key
                        ? `bg-gradient-to-r ${config.color} text-white shadow-lg shadow-black/30 scale-105`
                        : 'text-pm-text-muted hover:text-pm-text hover:bg-pm-surface-hover/70'
                    }`}
                  >
                    <span className="mr-1.5">{config.icon}</span>
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model indicator */}
            <div className="px-4 py-2 border-b border-pm-border bg-pm-bg flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-pm-text-muted/90 font-medium">
                Model: <span className="text-pm-accent font-semibold">{availableModels[selectedModel]?.name || selectedModel}</span>
              </span>
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="text-xs text-pm-text-muted hover:text-red-400 transition-colors font-medium px-2 py-1 rounded-lg hover:bg-red-500/10"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Context */}
            {selectedContext && (
              <div className="px-4 py-2.5 bg-pm-bg border-b border-pm-border flex-shrink-0">
                <div className="flex items-start gap-2.5">
                  <span className="text-xs text-pm-accent font-semibold shrink-0">Context:</span>
                  <p className="text-xs text-pm-text-muted/90 line-clamp-2 flex-1 leading-relaxed">
                    "{selectedContext.slice(0, 120)}{selectedContext.length > 120 ? '...' : ''}"
                  </p>
                  <button onClick={() => setSelectedContext('')} className="text-pm-text-muted hover:text-red-400 shrink-0 transition-colors p-0.5 rounded hover:bg-red-500/10">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ minHeight: 0 }}>
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-purple-600/20 flex items-center justify-center shadow-lg">
                    <span className="text-4xl">{MODES[mode].icon}</span>
                  </div>
                  <h3 className="text-base font-bold text-pm-text mb-2">
                    {mode === 'quiz' && 'Ready to test your knowledge?'}
                    {mode === 'explain' && 'Need something explained?'}
                    {mode === 'summarize' && 'Want a quick summary?'}
                    {mode === 'ask' && 'What would you like to know?'}
                  </h3>
                  <p className="text-sm text-pm-text-muted/80 font-medium">Select text and right-click, or type below</p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-indigo-500/20'
                        : 'bg-pm-surface-hover border border-pm-border text-pm-text'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    ) : (
                      <>
                        <MarkdownContent content={message.content} />
                        {message.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-pm-accent animate-pulse ml-1.5 rounded" />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Actions */}
            {showQuickActions && (
              <div className="px-4 py-2.5 border-t border-pm-border bg-pm-bg flex-shrink-0">
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleQuickAction(action.prompt)}
                      className="px-3 py-1.5 text-xs font-medium bg-pm-surface-hover border border-pm-border rounded-full text-pm-text-muted hover:text-pm-text hover:border-pm-accent hover:bg-pm-surface transition-all"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-pm-border bg-pm-surface flex-shrink-0">
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowQuickActions(!showQuickActions)}
                  className={`p-2.5 rounded-xl border transition-all ${
                    showQuickActions
                      ? 'bg-pm-surface-hover border-pm-accent text-pm-accent shadow-lg'
                      : 'bg-pm-bg border-pm-border text-pm-text-muted hover:text-pm-text hover:border-pm-accent hover:scale-105'
                  }`}
                  title="Quick actions"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={MODES[mode].placeholder}
                    rows={1}
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 bg-pm-bg border border-pm-border rounded-xl text-sm text-pm-text placeholder-pm-text-muted resize-none focus:outline-none focus:border-pm-accent focus:ring-2 focus:ring-pm-accent/30 transition-all disabled:opacity-50"
                    style={{ minHeight: '44px', maxHeight: '120px' }}
                  />
                </div>
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 hover:scale-105 transition-all shadow-lg shadow-indigo-500/30"
                >
                  {isLoading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-center text-xs text-pm-text-muted/70 mt-2.5 font-medium">
                Press <kbd className="px-2 py-0.5 bg-pm-bg rounded-md text-pm-text-muted border border-pm-border text-xs font-mono">Enter</kbd> to send
              </p>
            </div>

            {/* Resize Handles */}
            {/* Bottom-right corner */}
            <div className="pm-resize-handle absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20" data-direction="se">
              <div className="absolute bottom-0.5 right-0.5 w-4 h-4 border-r-2 border-b-2 border-pm-border/50 rounded-br-lg hover:border-pm-accent transition-colors" />
            </div>
            {/* Bottom edge */}
            <div className="pm-resize-handle absolute bottom-0 left-0 right-0 h-3 cursor-s-resize z-10" data-direction="s" />
            {/* Right edge */}
            <div className="pm-resize-handle absolute top-0 bottom-0 right-0 w-3 cursor-e-resize z-10" data-direction="e" />
            {/* Left edge */}
            <div className="pm-resize-handle absolute top-0 bottom-0 left-0 w-3 cursor-w-resize z-10" data-direction="w" />
            {/* Bottom-left corner */}
            <div className="pm-resize-handle absolute bottom-0 left-0 w-5 h-5 cursor-sw-resize z-20" data-direction="sw">
              <div className="absolute bottom-0.5 left-0.5 w-4 h-4 border-l-2 border-b-2 border-pm-border/50 rounded-bl-lg hover:border-pm-accent transition-colors" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Mount
function mountApp() {
  if (document.getElementById('pagemind-host')) return;
  if (document.body) {
    doMount();
  } else {
    document.addEventListener('DOMContentLoaded', doMount);
  }
}

function doMount() {
  if (document.getElementById('pagemind-host')) return;

  const host = document.createElement('div');
  host.id = 'pagemind-host';
  host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  document.body.appendChild(host);

  const shadowHost = document.createElement('div');
  host.appendChild(shadowHost);

  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('dist/content.css');
  shadowRoot.appendChild(styleLink);

  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700&display=swap';
  shadowRoot.appendChild(fontLink);

  const appContainer = document.createElement('div');
  appContainer.id = 'pagemind-root';
  shadowRoot.appendChild(appContainer);

  createRoot(appContainer).render(<PageMindApp />);
}

mountApp();

// Message listener
try {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message.type === 'TOGGLE_PANEL') {
        if (!document.getElementById('pagemind-host')) {
          mountApp();
          setTimeout(() => window.dispatchEvent(new CustomEvent('pagemind-toggle')), 100);
        } else {
          window.dispatchEvent(new CustomEvent('pagemind-toggle'));
        }
        sendResponse({ success: true });
      }

      if (message.type === 'CONTEXT_MENU_ACTION') {
        if (!document.getElementById('pagemind-host')) {
          mountApp();
        }
        window.dispatchEvent(new CustomEvent('pagemind-context-action', { detail: message.payload }));
        sendResponse({ success: true });
      }
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
    return true;
  });
} catch {
  console.warn('PageMind: Could not set up message listener');
}
