// PageMind AI - Background Service Worker

interface Message {
  type: string;
  payload?: unknown;
}

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  mode: 'explain' | 'quiz' | 'ask' | 'summarize';
  context?: string;
  model?: string;
}

interface StreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  error?: string;
}

// Available models
const MODELS = {
  'gpt-4o-mini': { name: 'GPT-4o Mini', description: 'Fast & cheap' },
  'gpt-4o': { name: 'GPT-4o', description: 'Balanced' },
  'gpt-4.1': { name: 'GPT-4.1', description: 'Most capable' },
};

// Create context menu items on install
chrome.runtime.onInstalled.addListener(() => {
  // Parent menu
  chrome.contextMenus.create({
    id: 'pagemind-parent',
    title: '🧠 PageMind AI',
    contexts: ['selection'],
  });

  // Submenu items
  chrome.contextMenus.create({
    id: 'pagemind-explain',
    parentId: 'pagemind-parent',
    title: '💡 Explain this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'pagemind-quiz',
    parentId: 'pagemind-parent',
    title: '📝 Quiz me on this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'pagemind-summarize',
    parentId: 'pagemind-parent',
    title: '📋 Summarize this',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'pagemind-ask',
    parentId: 'pagemind-parent',
    title: '❓ Ask about this',
    contexts: ['selection'],
  });

  // Set default model
  chrome.storage.sync.get(['selectedModel'], (result) => {
    if (!result.selectedModel) {
      chrome.storage.sync.set({ selectedModel: 'gpt-4o-mini' });
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  const selectedText = info.selectionText || '';
  let mode: 'explain' | 'quiz' | 'ask' | 'summarize' = 'ask';

  switch (info.menuItemId) {
    case 'pagemind-explain':
      mode = 'explain';
      break;
    case 'pagemind-quiz':
      mode = 'quiz';
      break;
    case 'pagemind-summarize':
      mode = 'summarize';
      break;
    case 'pagemind-ask':
      mode = 'ask';
      break;
    default:
      return;
  }

  // Send message to content script
  chrome.tabs.sendMessage(tab.id, {
    type: 'CONTEXT_MENU_ACTION',
    payload: { mode, selectedText },
  });
});

// Handle toolbar icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/content.js'],
      });
      
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id!, { type: 'TOGGLE_PANEL' }).catch(() => {
          console.error('PageMind: Could not send message to content script');
        });
      }, 100);
    } catch (injectError) {
      console.error('PageMind: Could not inject content script', injectError);
    }
  }
});

// Handle port connections for streaming
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'pagemind-stream') {
    port.onMessage.addListener(async (message: Message) => {
      if (message.type === 'STREAM_CHAT_REQUEST') {
        await handleStreamingChat(port, message.payload as ChatRequest);
      }
    });
  }
});

// Handle regular messages
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'GET_API_KEY') {
    chrome.storage.sync.get(['openaiApiKey'], (result) => {
      sendResponse({ apiKey: result.openaiApiKey });
    });
    return true;
  }

  if (message.type === 'SET_API_KEY') {
    const { apiKey } = message.payload as { apiKey: string };
    chrome.storage.sync.set({ openaiApiKey: apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_MODEL') {
    chrome.storage.sync.get(['selectedModel'], (result) => {
      sendResponse({ model: result.selectedModel || 'gpt-4o-mini' });
    });
    return true;
  }

  if (message.type === 'SET_MODEL') {
    const { model } = message.payload as { model: string };
    chrome.storage.sync.set({ selectedModel: model }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_MODELS') {
    sendResponse({ models: MODELS });
    return true;
  }

  if (message.type === 'GET_CHAT_HISTORY') {
    const { domain } = message.payload as { domain: string };
    chrome.storage.local.get([`chat_${domain}`], (result) => {
      sendResponse({ history: result[`chat_${domain}`] || [] });
    });
    return true;
  }

  if (message.type === 'SAVE_CHAT_HISTORY') {
    const { domain, messages } = message.payload as { domain: string; messages: unknown[] };
    chrome.storage.local.set({ [`chat_${domain}`]: messages }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CLEAR_CHAT_HISTORY') {
    const { domain } = message.payload as { domain: string };
    chrome.storage.local.remove([`chat_${domain}`], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleStreamingChat(port: chrome.runtime.Port, request: ChatRequest) {
  const { openaiApiKey, selectedModel } = await chrome.storage.sync.get(['openaiApiKey', 'selectedModel']);

  if (!openaiApiKey) {
    port.postMessage({ 
      type: 'error', 
      error: 'API key not configured. Click the extension icon and set your OpenAI API key.' 
    } as StreamChunk);
    return;
  }

  const systemPrompts: Record<string, string> = {
    explain: `You are a helpful learning assistant. Explain the given content clearly and concisely. Use examples when helpful. Break down complex concepts into digestible parts. Format your response with markdown for readability. Be concise but thorough.`,
    quiz: `You are a quiz generator. Create an interactive quiz based on the given content. Generate 3-5 questions with multiple choice answers (A, B, C, D). After listing all questions, provide the correct answers at the end. Format with clear markdown.`,
    summarize: `You are a summarization expert. Provide a clear, concise summary of the given content. Use bullet points for key takeaways. Keep it brief but comprehensive.`,
    ask: `You are a helpful AI assistant. Answer questions about the given context clearly and helpfully. If you don't have enough information, ask for clarification. Format responses with markdown. Be concise.`,
  };

  const messages = [
    { role: 'system', content: systemPrompts[request.mode] || systemPrompts.ask },
    ...(request.context
      ? [{ role: 'user', content: `Context from the page:\n\n${request.context}` }]
      : []),
    ...request.messages,
  ];

  const model = request.model || selectedModel || 'gpt-4o-mini';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 1500,
        temperature: request.mode === 'quiz' ? 0.7 : 0.4,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      port.postMessage({ 
        type: 'error', 
        error: error.error?.message || 'API request failed' 
      } as StreamChunk);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      port.postMessage({ type: 'error', error: 'No response body' } as StreamChunk);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            port.postMessage({ type: 'done' } as StreamChunk);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              port.postMessage({ type: 'chunk', content } as StreamChunk);
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    port.postMessage({ type: 'done' } as StreamChunk);
  } catch (error) {
    port.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    } as StreamChunk);
  }
}

export {};
