// src/background.ts
var MODELS = {
  "gpt-4o-mini": { name: "GPT-4o Mini", description: "Fast & cheap" },
  "gpt-4o": { name: "GPT-4o", description: "Balanced" },
  "gpt-4.1": { name: "GPT-4.1", description: "Most capable" }
};
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pagemind-parent",
    title: "\u{1F9E0} PageMind AI",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "pagemind-explain",
    parentId: "pagemind-parent",
    title: "\u{1F4A1} Explain this",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "pagemind-quiz",
    parentId: "pagemind-parent",
    title: "\u{1F4DD} Quiz me on this",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "pagemind-summarize",
    parentId: "pagemind-parent",
    title: "\u{1F4CB} Summarize this",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "pagemind-ask",
    parentId: "pagemind-parent",
    title: "\u2753 Ask about this",
    contexts: ["selection"]
  });
  chrome.storage.sync.get(["selectedModel"], (result) => {
    if (!result.selectedModel) {
      chrome.storage.sync.set({ selectedModel: "gpt-4o-mini" });
    }
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id)
    return;
  const selectedText = info.selectionText || "";
  let mode = "ask";
  switch (info.menuItemId) {
    case "pagemind-explain":
      mode = "explain";
      break;
    case "pagemind-quiz":
      mode = "quiz";
      break;
    case "pagemind-summarize":
      mode = "summarize";
      break;
    case "pagemind-ask":
      mode = "ask";
      break;
    default:
      return;
  }
  chrome.tabs.sendMessage(tab.id, {
    type: "CONTEXT_MENU_ACTION",
    payload: { mode, selectedText }
  });
});
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id)
    return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/content.js"]
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => {
          console.error("PageMind: Could not send message to content script");
        });
      }, 100);
    } catch (injectError) {
      console.error("PageMind: Could not inject content script", injectError);
    }
  }
});
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "pagemind-stream") {
    port.onMessage.addListener(async (message) => {
      if (message.type === "STREAM_CHAT_REQUEST") {
        await handleStreamingChat(port, message.payload);
      }
    });
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_API_KEY") {
    chrome.storage.sync.get(["openaiApiKey"], (result) => {
      sendResponse({ apiKey: result.openaiApiKey });
    });
    return true;
  }
  if (message.type === "SET_API_KEY") {
    const { apiKey } = message.payload;
    chrome.storage.sync.set({ openaiApiKey: apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === "GET_MODEL") {
    chrome.storage.sync.get(["selectedModel"], (result) => {
      sendResponse({ model: result.selectedModel || "gpt-4o-mini" });
    });
    return true;
  }
  if (message.type === "SET_MODEL") {
    const { model } = message.payload;
    chrome.storage.sync.set({ selectedModel: model }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === "GET_MODELS") {
    sendResponse({ models: MODELS });
    return true;
  }
  if (message.type === "GET_CHAT_HISTORY") {
    const { domain } = message.payload;
    chrome.storage.local.get([`chat_${domain}`], (result) => {
      sendResponse({ history: result[`chat_${domain}`] || [] });
    });
    return true;
  }
  if (message.type === "SAVE_CHAT_HISTORY") {
    const { domain, messages } = message.payload;
    chrome.storage.local.set({ [`chat_${domain}`]: messages }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === "CLEAR_CHAT_HISTORY") {
    const { domain } = message.payload;
    chrome.storage.local.remove([`chat_${domain}`], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
async function handleStreamingChat(port, request) {
  const { openaiApiKey, selectedModel } = await chrome.storage.sync.get(["openaiApiKey", "selectedModel"]);
  if (!openaiApiKey) {
    port.postMessage({
      type: "error",
      error: "API key not configured. Click the extension icon and set your OpenAI API key."
    });
    return;
  }
  const systemPrompts = {
    explain: `You are a helpful learning assistant. Explain the given content clearly and concisely. Use examples when helpful. Break down complex concepts into digestible parts. Format your response with markdown for readability. Be concise but thorough.`,
    quiz: `You are a quiz generator. Create an interactive quiz based on the given content. Generate 3-5 questions with multiple choice answers (A, B, C, D). After listing all questions, provide the correct answers at the end. Format with clear markdown.`,
    summarize: `You are a summarization expert. Provide a clear, concise summary of the given content. Use bullet points for key takeaways. Keep it brief but comprehensive.`,
    ask: `You are a helpful AI assistant. Answer questions about the given context clearly and helpfully. If you don't have enough information, ask for clarification. Format responses with markdown. Be concise.`
  };
  const messages = [
    { role: "system", content: systemPrompts[request.mode] || systemPrompts.ask },
    ...request.context ? [{ role: "user", content: `Context from the page:

${request.context}` }] : [],
    ...request.messages
  ];
  const model = request.model || selectedModel || "gpt-4o-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 1500,
        temperature: request.mode === "quiz" ? 0.7 : 0.4,
        stream: true
      })
    });
    if (!response.ok) {
      const error = await response.json();
      port.postMessage({
        type: "error",
        error: error.error?.message || "API request failed"
      });
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      port.postMessage({ type: "error", error: "No response body" });
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            port.postMessage({ type: "done" });
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              port.postMessage({ type: "chunk", content });
            }
          } catch (e) {
          }
        }
      }
    }
    port.postMessage({ type: "done" });
  } catch (error) {
    port.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
}
