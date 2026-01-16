import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type Mode = 'explain' | 'quiz' | 'ask' | 'summarize';

interface ModeConfig {
  icon: string;
  label: string;
  placeholder: string;
  color: string;
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
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Check for API key on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_API_KEY' }, (response) => {
      if (!response?.apiKey) {
        setHasApiKey(false);
        setShowSettings(true);
      }
    });
  }, []);

  const handleSendMessage = useCallback(async (content?: string, currentMode?: Mode) => {
    const messageContent = content || input.trim();
    if (!messageContent || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        payload: {
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          mode: currentMode || mode,
          context: selectedContext,
        },
      });

      if (response.error) {
        if (response.error.includes('API key')) {
          setHasApiKey(false);
          setShowSettings(true);
        }
        throw new Error(response.error);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, mode, selectedContext]);

  // Listen for custom events from content script message handler
  useEffect(() => {
    const handleToggle = () => {
      setIsOpen((prev) => !prev);
    };

    const handleContextAction = (event: CustomEvent) => {
      const { mode: newMode, selectedText } = event.detail as { mode: Mode; selectedText: string };
      setMode(newMode);
      setSelectedContext(selectedText);
      setIsOpen(true);
      
      // Auto-send the first message based on mode
      const prompts: Record<Mode, string> = {
        explain: `Please explain this:\n\n"${selectedText}"`,
        quiz: `Create a quiz based on this content:\n\n"${selectedText}"`,
        summarize: `Summarize this:\n\n"${selectedText}"`,
        ask: `I have a question about this:\n\n"${selectedText}"\n\nWhat would you like to know?`,
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, showSettings]);

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.pm-drag-handle')) {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    }
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);


  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) return;
    
    chrome.runtime.sendMessage({
      type: 'SET_API_KEY',
      payload: { apiKey: apiKeyInput.trim() },
    }, () => {
      setHasApiKey(true);
      setShowSettings(false);
      setApiKeyInput('');
    });
  };

  const handleClearChat = () => {
    setMessages([]);
    setSelectedContext('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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
        width: '420px',
        maxHeight: '600px',
        pointerEvents: 'auto',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Glass morphism container */}
      <div className="bg-pm-surface/95 backdrop-blur-xl rounded-2xl border border-pm-border shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
           style={{ maxHeight: '600px' }}>
        
        {/* Header */}
        <div className="pm-drag-handle cursor-move bg-gradient-to-r from-pm-surface to-pm-surface-hover px-4 py-3 border-b border-pm-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-glow">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-pm-text tracking-tight">PageMind AI</h1>
                <p className="text-xs text-pm-text-muted">Learning Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-lg hover:bg-pm-surface-hover text-pm-text-muted hover:text-pm-text transition-colors"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={() => setIsPinned(!isPinned)}
                className={`p-2 rounded-lg transition-colors ${isPinned ? 'bg-pm-accent/20 text-pm-accent' : 'hover:bg-pm-surface-hover text-pm-text-muted hover:text-pm-text'}`}
                title={isPinned ? 'Unpin' : 'Pin'}
              >
                <svg className="w-4 h-4" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-pm-error/20 text-pm-text-muted hover:text-pm-error transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {showSettings ? (
          /* Settings Panel */
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-pm-text mb-2">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-pm-bg border border-pm-border rounded-lg text-pm-text placeholder-pm-text-muted focus:outline-none focus:border-pm-accent focus:ring-1 focus:ring-pm-accent transition-colors"
              />
              <p className="mt-2 text-xs text-pm-text-muted">
                Your API key is stored locally and never sent to any server except OpenAI.
              </p>
            </div>
            <button
              onClick={handleSaveApiKey}
              className="w-full py-2 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Save API Key
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
            <div className="px-3 py-2 border-b border-pm-border bg-pm-bg/50">
              <div className="flex gap-1">
                {(Object.entries(MODES) as [Mode, ModeConfig][]).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      mode === key
                        ? `bg-gradient-to-r ${config.color} text-white shadow-md`
                        : 'text-pm-text-muted hover:text-pm-text hover:bg-pm-surface-hover'
                    }`}
                  >
                    <span className="mr-1">{config.icon}</span>
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Context Badge */}
            {selectedContext && (
              <div className="px-3 py-2 bg-pm-accent/10 border-b border-pm-border">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-pm-accent font-medium shrink-0">Context:</span>
                  <p className="text-xs text-pm-text-muted line-clamp-2 flex-1">
                    "{selectedContext.slice(0, 100)}{selectedContext.length > 100 ? '...' : ''}"
                  </p>
                  <button
                    onClick={() => setSelectedContext('')}
                    className="text-pm-text-muted hover:text-pm-error shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: '350px', minHeight: '200px' }}>
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                    <span className="text-3xl">{MODES[mode].icon}</span>
                  </div>
                  <h3 className="text-sm font-medium text-pm-text mb-1">
                    {mode === 'quiz' && 'Ready to test your knowledge?'}
                    {mode === 'explain' && 'Need something explained?'}
                    {mode === 'summarize' && 'Want a quick summary?'}
                    {mode === 'ask' && 'What would you like to know?'}
                  </h3>
                  <p className="text-xs text-pm-text-muted">
                    Select text on the page and right-click, or type below
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                        : 'bg-pm-surface-hover border border-pm-border text-pm-text'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <MarkdownContent content={message.content} />
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="bg-pm-surface-hover border border-pm-border rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-pm-accent rounded-full animate-typing" style={{ animationDelay: '0s' }} />
                      <span className="w-2 h-2 bg-pm-accent rounded-full animate-typing" style={{ animationDelay: '0.2s' }} />
                      <span className="w-2 h-2 bg-pm-accent rounded-full animate-typing" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-pm-border bg-pm-surface">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={MODES[mode].placeholder}
                    rows={1}
                    className="w-full px-4 py-2.5 bg-pm-bg border border-pm-border rounded-xl text-sm text-pm-text placeholder-pm-text-muted resize-none focus:outline-none focus:border-pm-accent focus:ring-1 focus:ring-pm-accent transition-colors"
                    style={{ minHeight: '44px', maxHeight: '120px' }}
                  />
                </div>
                <div className="flex gap-1 shrink-0">
                  {messages.length > 0 && (
                    <button
                      onClick={handleClearChat}
                      className="p-2.5 rounded-xl bg-pm-bg border border-pm-border text-pm-text-muted hover:text-pm-error hover:border-pm-error/50 transition-colors"
                      title="Clear chat"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shadow-glow"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-center text-xs text-pm-text-muted mt-2">
                Press <kbd className="px-1.5 py-0.5 bg-pm-bg rounded text-pm-text-muted border border-pm-border">Enter</kbd> to send
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Mount the app
function mountApp() {
  // Check if already mounted
  if (document.getElementById('pagemind-host')) {
    return;
  }

  // Wait for body to be ready
  if (document.body) {
    doMount();
  } else {
    document.addEventListener('DOMContentLoaded', doMount);
  }
}

function doMount() {
  // Double check
  if (document.getElementById('pagemind-host')) {
    return;
  }

  const host = document.createElement('div');
  host.id = 'pagemind-host';
  host.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
  document.body.appendChild(host);

  const shadowHost = document.createElement('div');
  host.appendChild(shadowHost);
  
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  
  // Add styles to shadow DOM
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('dist/content.css');
  shadowRoot.appendChild(styleLink);

  // Add Google Fonts
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Satoshi:wght@400;500;600;700&display=swap';
  shadowRoot.appendChild(fontLink);

  const appContainer = document.createElement('div');
  appContainer.id = 'pagemind-root';
  shadowRoot.appendChild(appContainer);

  createRoot(appContainer).render(<PageMindApp />);
}

// Initialize immediately
mountApp();

// Also listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_PANEL') {
    // Ensure app is mounted
    if (!document.getElementById('pagemind-host')) {
      mountApp();
      // Wait a bit for React to render
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('pagemind-toggle'));
      }, 100);
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
  
  return true;
});
