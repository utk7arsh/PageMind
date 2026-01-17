// src/background.ts
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
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_PANEL"
    });
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/content.js"]
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          type: "TOGGLE_PANEL"
        }).catch(() => {
          console.error("PageMind: Could not send message to content script");
        });
      }, 100);
    } catch (injectError) {
      console.error("PageMind: Could not inject content script", injectError);
    }
  }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CHAT_REQUEST") {
    handleChatRequest(message.payload).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
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
});
async function handleChatRequest(request) {
  const { openaiApiKey } = await chrome.storage.sync.get(["openaiApiKey"]);
  if (!openaiApiKey) {
    return { error: "API key not configured. Click the extension icon and set your OpenAI API key." };
  }
  const systemPrompts = {
    explain: `You are a helpful learning assistant. Explain the given content clearly and concisely. Use examples when helpful. Break down complex concepts into digestible parts. Format your response with markdown for readability.`,
    quiz: `You are a quiz generator. Create an interactive quiz based on the given content. Generate 3-5 questions with multiple choice answers (A, B, C, D). After listing all questions, provide the correct answers at the end. Format with clear markdown.`,
    summarize: `You are a summarization expert. Provide a clear, concise summary of the given content. Use bullet points for key takeaways. Keep it brief but comprehensive.`,
    ask: `You are a helpful AI assistant. Answer questions about the given context clearly and helpfully. If you don't have enough information, ask for clarification. Format responses with markdown.`
  };
  const messages = [
    { role: "system", content: systemPrompts[request.mode] || systemPrompts.ask },
    ...request.context ? [{ role: "user", content: `Context from the page:

${request.context}` }] : [],
    ...request.messages
  ];
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages,
        max_completion_tokens: 2e3,
        temperature: request.mode === "quiz" ? 0.7 : 0.5
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "API request failed");
    }
    const data = await response.json();
    return { content: data.choices[0].message.content };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown error occurred" };
  }
}
