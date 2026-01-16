# 🧠 PageMind AI

A powerful Chrome extension that brings AI-powered learning directly to any webpage. Ask questions, generate quizzes, get explanations, and summarize content without ever leaving the page.

![PageMind AI](./icons/icon.svg)

## ✨ Features

- **💡 Explain** - Get clear, detailed explanations of complex concepts
- **📝 Quiz Me** - Auto-generate quizzes from any content to test your knowledge
- **📋 Summarize** - Get quick, concise summaries of long articles or text
- **❓ Ask** - Ask any question about the page content

### Key Highlights

- 🖱️ **Right-click Context Menu** - Select any text and right-click to interact with AI
- ⌨️ **Keyboard Shortcut** - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) to toggle the panel
- 🎨 **Beautiful Dark UI** - Sleek, modern interface that doesn't disrupt your browsing
- 🔒 **Privacy First** - Your API key is stored locally and only communicates with OpenAI
- 📱 **Draggable Panel** - Move the chat panel anywhere on your screen

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/chromeChat.git
   cd chromeChat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate icons**
   ```bash
   node scripts/generate-icons.js
   ```

4. **Build the extension**
   ```bash
   npm run build
   ```

5. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `chromeChat` folder

6. **Configure API Key**
   - Click the PageMind AI icon in your toolbar
   - Enter your OpenAI API key in the settings
   - Start using the extension!

### Development

For development with auto-reload:

```bash
# Watch for TypeScript changes
npm run build:js -- --watch

# In another terminal, watch for CSS changes
npm run watch:css
```

## 📖 Usage

### Method 1: Context Menu (Right-click)

1. Select any text on a webpage
2. Right-click to open the context menu
3. Choose from:
   - 🧠 **PageMind AI** → **💡 Explain this**
   - 🧠 **PageMind AI** → **📝 Quiz me on this**
   - 🧠 **PageMind AI** → **📋 Summarize this**
   - 🧠 **PageMind AI** → **❓ Ask about this**

### Method 2: Keyboard Shortcut

- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type your question or select a mode

### Method 3: Click the Extension Icon

- Click the PageMind AI icon in your toolbar
- The panel will open on the current page

## 🛠️ Project Structure

```
chromeChat/
├── manifest.json        # Chrome extension manifest
├── package.json         # Node.js dependencies
├── tsconfig.json        # TypeScript configuration
├── tailwind.config.js   # Tailwind CSS configuration
├── options.html         # Settings page
├── icons/               # Extension icons
│   ├── icon.svg
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.ts    # Service worker (API calls, context menu)
│   ├── content.tsx      # React overlay UI
│   └── styles/
│       └── content.css  # Tailwind styles
├── dist/                # Built files (generated)
│   ├── background.js
│   ├── content.js
│   └── content.css
└── scripts/
    └── generate-icons.js
```

## 🎨 Customization

### Changing the Model

Edit `src/background.ts` and modify the `model` parameter:

```typescript
body: JSON.stringify({
  model: 'gpt-4o',  // Change to 'gpt-4', 'gpt-3.5-turbo', etc.
  // ...
})
```

### Adjusting System Prompts

Customize the AI behavior by editing the `systemPrompts` object in `src/background.ts`.

## 🔧 Troubleshooting

### Extension not loading?
- Make sure you've run `npm run build`
- Check that the `dist/` folder exists with built files
- Try reloading the extension in `chrome://extensions/`

### API errors?
- Verify your API key is correct
- Check you have sufficient OpenAI credits
- Ensure the API key has access to the model you're using

### Panel not appearing?
- Refresh the page
- Try the keyboard shortcut `Cmd+Shift+P`
- Check the browser console for errors

## 📄 License

MIT License - feel free to use this project however you'd like!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Made with ❤️ for learners everywhere
