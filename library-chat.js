// Library Chat Manager - FIXED v3
// Fixed: Input now properly re-enables after each message

class LibraryChatManager {
  constructor(app) {
    this.app = app;
    this.messages = [];
    this.chatHistory = [];
    this.currentChatId = null;
    this.selectedCollections = new Set();
    this.isStreaming = false;
    this.streamAbortController = null;
    
    this.STORAGE_KEY = 'library_chat_history';
    this.MAX_HISTORY = 50;
    
    this.init();
  }

  init() {
    this.loadChatHistory();
    this.bindEvents();
    this.renderSavedChats();
    this.renderWelcome();
    this.renderCollectionBar();
    
    // Update section title
    const recentSection = document.getElementById('recentChatsSection');
    if (recentSection) {
      const title = recentSection.querySelector('.chat-history-title');
      if (title) title.textContent = 'Saved Chats';
    }
    
    // Hide starred section (not using it)
    const starredSection = document.getElementById('starredChatsSection');
    if (starredSection) starredSection.style.display = 'none';
    
    console.log('Library Chat Manager initialized');
  }

  // ===== EVENT BINDING =====
  bindEvents() {
    document.getElementById('newChatBtn')?.addEventListener('click', () => this.startNewChat());
    document.getElementById('saveChatBtn')?.addEventListener('click', () => this.saveCurrentChat());

    const sendBtn = document.getElementById('libraryChatSend');
    const input = document.getElementById('libraryChatInput');
    
    sendBtn?.addEventListener('click', () => this.sendMessage());
    
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    this.bindCollectionSelector();

    document.getElementById('chatHistoryList')?.addEventListener('click', (e) => {
      const item = e.target.closest('.chat-history-item');
      if (!item) return;
      
      // Check if clicked directly on buttons
      if (e.target.classList.contains('chat-history-delete')) {
        e.stopPropagation();
        this.deleteChat(item.dataset.chatId);
        return;
      }
      
      if (e.target.classList.contains('chat-history-rename')) {
        e.stopPropagation();
        this.renameChat(item.dataset.chatId);
        return;
      }
      
      // Otherwise load the chat
      this.loadChat(item.dataset.chatId);
    });
  }

  bindCollectionSelector() {
    const btn = document.getElementById('collectionSelectorBtn');
    const popup = document.getElementById('collectionSelectorPopup');
    
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      popup?.classList.toggle('open');
      if (popup?.classList.contains('open')) {
        this.renderCollectionOptions();
      }
    });

    document.addEventListener('click', (e) => {
      if (popup?.classList.contains('open') && 
          !e.target.closest('#collectionSelectorPopup') && 
          !e.target.closest('#collectionSelectorBtn')) {
        popup.classList.remove('open');
      }
    });

    document.getElementById('closeCollectionPopup')?.addEventListener('click', () => {
      popup?.classList.remove('open');
    });

    document.getElementById('collectionSelectorList')?.addEventListener('click', (e) => {
      const option = e.target.closest('.collection-option');
      if (!option) return;

      const collectionId = option.dataset.collectionId;
      
      if (collectionId === 'all') {
        this.selectedCollections.clear();
      } else {
        if (this.selectedCollections.has(collectionId)) {
          this.selectedCollections.delete(collectionId);
        } else {
          this.selectedCollections.add(collectionId);
        }
      }

      this.renderCollectionOptions();
      this.renderCollectionBar();
    });
  }

  // ===== CHAT OPERATIONS =====
  startNewChat() {
    if (this.messages.length > 0) {
      this.autoSaveChat(); // Auto-save without prompting
    }

    this.currentChatId = null;
    this.messages = [];
    this.selectedCollections.clear();
    this.isStreaming = false;

    this.renderWelcome();
    this.renderCollectionBar();
    this.renderSavedChats();
    this.enableInput();
    document.getElementById('libraryChatInput')?.focus();
  }

  async sendMessage() {
    const input = document.getElementById('libraryChatInput');
    const message = input?.value?.trim();
    
    // Don't proceed if no message or already streaming
    if (!message || this.isStreaming) {
      console.log('Blocked: no message or streaming', { message: !!message, isStreaming: this.isStreaming });
      return;
    }

    // Clear input immediately
    input.value = '';
    input.style.height = 'auto';

    // Add user message to UI
    this.addMessage('user', message);

    // Set streaming state and disable input
    this.isStreaming = true;
    this.showThinking();
    this.disableInput();

    try {
      const task = this.buildTaskPrompt(message);
      console.log('Sending chat request...');

      const response = await this.executeChat(task);
      
      if (response.runId && response.workflowId) {
        await this.streamResponse(response.workflowId, response.runId);
      } else {
        throw new Error('Invalid API response - missing runId or workflowId');
      }

    } catch (error) {
      console.error('Chat error:', error);
      this.addMessage('ai', 'Sorry, there was an error processing your request. Please try again.');
    } finally {
      // CRITICAL: Always reset state in finally block
      console.log('Resetting state...');
      this.isStreaming = false;
      this.hideThinking();
      this.enableInput();
      document.getElementById('libraryChatInput')?.focus();
    }
  }

  buildTaskPrompt(question) {
    let task = '';

    if (this.selectedCollections.size > 0) {
      const collectionNames = Array.from(this.selectedCollections)
        .map(id => {
          const col = this.app.collectionsManager?.collections.find(c => c.id === id);
          return col ? col.name : null;
        })
        .filter(Boolean);

      task += `IMPORTANT: Only search documents from these collections: ${collectionNames.join(', ')}.\n`;
      task += `Collection IDs: ${Array.from(this.selectedCollections).join(', ')}\n\n`;
    } else {
      task += `Search across ALL documents in the library.\n\n`;
    }

    if (this.messages.length > 1) {
      const history = this.messages.slice(-10).map(m => 
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n');
      task += `Previous conversation:\n${history}\n\n`;
    }

    task += `Current question: ${question}`;
    return task;
  }

  async executeChat(task) {
    const response = await fetch(`${CONFIG.VERTESIA_API_BASE}/execute/async`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.VERTESIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'conversation',
        interaction: 'LibraryChat',
        data: { task },
        config: {
          environment: CONFIG.ENVIRONMENT_ID,
          model: CONFIG.MODEL
        },
        interactive: true,
        max_iterations: 100
      })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  }

  async streamResponse(workflowId, runId) {
    this.streamAbortController = new AbortController();
    
    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log('Stream timeout - aborting');
      this.streamAbortController?.abort();
    }, 120000); // 2 minute timeout

    const url = `${CONFIG.VERTESIA_API_BASE}/workflows/runs/${workflowId}/${runId}/stream?since=${Date.now()}&access_token=${CONFIG.VERTESIA_API_KEY}`;

    try {
      const response = await fetch(url, { signal: this.streamAbortController.signal });
      if (!response.ok) throw new Error(`Stream error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotAnswer = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;

          try {
            const data = JSON.parse(line.slice(5).trim());

            if (data.type === 'answer' && data.message && !gotAnswer) {
              const answer = this.extractAnswer(data.message);
              if (answer && answer.length > 10) {
                gotAnswer = true;
                this.hideThinking();
                this.addMessage('ai', answer);
                
                // Enable send button after 5 seconds if stream hangs
                setTimeout(() => {
                  if (this.isStreaming) {
                    console.log('Backup: enabling send after timeout');
                    this.enableInput();
                  }
                }, 5000);
              }
            }

            if (data.type === 'finish' || data.finish_reason === 'stop') {
              console.log('Stream finished');
              clearTimeout(timeoutId);
              return;
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }

      if (!gotAnswer) {
        this.hideThinking();
        this.addMessage('ai', 'I processed your request but couldn\'t generate a response. Please try rephrasing.');
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Stream error:', error);
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
      this.streamAbortController = null;
    }
  }

  extractAnswer(fullMessage) {
    if (!fullMessage) return '';
    
    const match = fullMessage.match(/\*\*3\.\s*Agent Answer:\*\*\s*([\s\S]*?)(?=\*\*\d+\.|$)/i);
    if (match) return match[1].trim();
    
    const altMatch = fullMessage.match(/Agent Answer[:\s]*([\s\S]*?)(?=User Query|Resources Search|$)/i);
    if (altMatch) return altMatch[1].trim();
    
    return fullMessage;
  }

  // ===== MESSAGE RENDERING =====
  addMessage(role, content) {
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    this.messages.push({ role, content, time, id: Date.now() });
    this.renderMessages();
  }

  renderWelcome() {
    const area = document.getElementById('chatMessagesArea');
    if (!area) return;

    area.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h3>Chat with Your Research Library</h3>
        <p>Ask questions about your documents. Select specific collections to focus your search.</p>
      </div>
    `;
  }

  renderMessages() {
    const area = document.getElementById('chatMessagesArea');
    if (!area) return;

    if (this.messages.length === 0) {
      this.renderWelcome();
      return;
    }

    area.innerHTML = this.messages.map(msg => `
      <div class="chat-msg ${msg.role}">
        <div class="chat-msg-avatar">${msg.role === 'user' ? 'U' : 'AI'}</div>
        <div class="chat-msg-content">
          <div class="chat-msg-bubble">${msg.role === 'ai' ? this.formatMessage(msg.content) : this.escape(msg.content)}</div>
          <div class="chat-msg-time">${msg.time}</div>
        </div>
      </div>
    `).join('');
    
    area.scrollTop = area.scrollHeight;
  }

  formatMessage(text) {
    if (!text) return '';
    let html = this.escape(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^[•\-]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    return html.split('\n\n').map(p => p.startsWith('<ul>') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showThinking() {
    const area = document.getElementById('chatMessagesArea');
    if (!area) return;

    // Remove existing thinking indicator first
    this.hideThinking();

    area.insertAdjacentHTML('beforeend', `
      <div class="chat-msg ai thinking" id="thinkingIndicator">
        <div class="chat-msg-avatar">AI</div>
        <div class="chat-msg-content">
          <div class="chat-msg-bubble">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
          </div>
        </div>
      </div>
    `);
    area.scrollTop = area.scrollHeight;
  }

  hideThinking() {
    document.getElementById('thinkingIndicator')?.remove();
  }

  enableTyping() {
    // Not needed anymore - textarea always enabled
  }

  enableInput() {
    // Only enable the send button
    const btn = document.getElementById('libraryChatSend');
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
    }
    this.isStreaming = false;
    console.log('Send button enabled');
  }

  disableInput() {
    // Only disable the send button - textarea stays enabled
    const btn = document.getElementById('libraryChatSend');
    if (btn) btn.disabled = true;
    console.log('Send button disabled');
  }

  // ===== COLLECTION SELECTOR =====
  renderCollectionBar() {
    const bar = document.getElementById('chatCollectionBar');
    if (!bar) return;

    let html = `<span class="collection-indicator-label">Searching:</span>`;

    if (this.selectedCollections.size === 0) {
      html += `<span class="collection-tag all-docs">All Documents</span>`;
    } else {
      const collections = this.app.collectionsManager?.collections || [];
      Array.from(this.selectedCollections).forEach(id => {
        const col = collections.find(c => c.id === id);
        if (col) {
          html += `
            <span class="collection-tag">
              ${this.escape(col.name)}
              <button class="collection-tag-remove" data-id="${id}">×</button>
            </span>
          `;
        }
      });
    }

    html += `
      <button class="collection-selector-btn" id="collectionSelectorBtn" title="Select collections">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    `;

    bar.innerHTML = html;

    // Rebind remove buttons
    bar.querySelectorAll('.collection-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedCollections.delete(btn.dataset.id);
        this.renderCollectionBar();
        this.renderCollectionOptions();
      });
    });

    // Rebind selector button
    document.getElementById('collectionSelectorBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = document.getElementById('collectionSelectorPopup');
      popup?.classList.toggle('open');
      if (popup?.classList.contains('open')) {
        this.renderCollectionOptions();
      }
    });
  }

  renderCollectionOptions() {
    const list = document.getElementById('collectionSelectorList');
    if (!list) return;

    const collections = this.app.collectionsManager?.collections || [];
    const allSelected = this.selectedCollections.size === 0;

    let html = `
      <div class="collection-option ${allSelected ? 'selected' : ''}" data-collection-id="all">
        <input type="checkbox" ${allSelected ? 'checked' : ''} readonly>
        <span class="collection-option-name">All Documents</span>
      </div>
    `;

    collections.forEach(col => {
      const isSelected = this.selectedCollections.has(col.id);
      const count = this.app.collectionsManager?.getDocumentCount?.(col.id) || 0;
      html += `
        <div class="collection-option ${isSelected ? 'selected' : ''}" data-collection-id="${col.id}">
          <input type="checkbox" ${isSelected ? 'checked' : ''} readonly>
          <span class="collection-option-name">${this.escape(col.name)}</span>
          <span class="collection-option-count">${count}</span>
        </div>
      `;
    });

    list.innerHTML = html;
  }

  // ===== CHAT HISTORY =====
  loadChatHistory() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      this.chatHistory = saved ? JSON.parse(saved) : [];
    } catch (e) {
      this.chatHistory = [];
    }
  }

  saveChatHistory() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.chatHistory.slice(0, this.MAX_HISTORY)));
    } catch (e) {}
  }

  // Auto-save without prompting (used when switching chats)
  autoSaveChat() {
    if (this.messages.length === 0) return;

    const firstMsg = this.messages.find(m => m.role === 'user');
    const title = firstMsg ? firstMsg.content.slice(0, 35) + (firstMsg.content.length > 35 ? '...' : '') : 'Untitled';

    const chat = {
      id: this.currentChatId || `chat_${Date.now()}`,
      title,
      messages: [...this.messages],
      collections: Array.from(this.selectedCollections),
      savedAt: new Date().toISOString()
    };

    const idx = this.chatHistory.findIndex(c => c.id === chat.id);
    if (idx >= 0) {
      chat.title = this.chatHistory[idx].title; // Keep existing title
      this.chatHistory[idx] = chat;
    } else {
      this.chatHistory.unshift(chat);
    }

    this.currentChatId = chat.id;
    this.saveChatHistory();
    this.renderSavedChats();
  }

  // Manual save with naming UI (used when clicking Save button)
  saveCurrentChat() {
    if (this.messages.length === 0) return;

    const firstMsg = this.messages.find(m => m.role === 'user');
    const defaultTitle = firstMsg ? firstMsg.content.slice(0, 35) + (firstMsg.content.length > 35 ? '...' : '') : 'Untitled';
    
    // Check if already saved
    const existing = this.currentChatId ? this.chatHistory.find(c => c.id === this.currentChatId) : null;
    
    this.showNamingModal(existing?.title || defaultTitle, (title) => {
      const chat = {
        id: this.currentChatId || `chat_${Date.now()}`,
        title: title,
        messages: [...this.messages],
        collections: Array.from(this.selectedCollections),
        savedAt: new Date().toISOString()
      };

      const idx = this.chatHistory.findIndex(c => c.id === chat.id);
      if (idx >= 0) {
        this.chatHistory[idx] = chat;
      } else {
        this.chatHistory.unshift(chat);
      }

      this.currentChatId = chat.id;
      this.saveChatHistory();
      this.renderSavedChats();
    });
  }

  renameChat(chatId) {
    const chat = this.chatHistory.find(c => c.id === chatId);
    if (!chat) return;
    
    this.showNamingModal(chat.title, (newTitle) => {
      chat.title = newTitle;
      this.saveChatHistory();
      this.renderSavedChats();
    });
  }

  showNamingModal(currentName, onSave) {
    // Remove existing modal if any
    document.getElementById('chatNamingModal')?.remove();
    
    const modal = document.createElement('div');
    modal.id = 'chatNamingModal';
    modal.className = 'chat-naming-modal';
    modal.innerHTML = `
      <div class="chat-naming-content">
        <input type="text" class="chat-naming-input" value="${this.escape(currentName)}" placeholder="Chat name..." maxlength="50" />
        <div class="chat-naming-actions">
          <button class="chat-naming-cancel">Cancel</button>
          <button class="chat-naming-save">Save</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('.chat-naming-input');
    const saveBtn = modal.querySelector('.chat-naming-save');
    const cancelBtn = modal.querySelector('.chat-naming-cancel');
    
    input.focus();
    input.select();
    
    const close = () => modal.remove();
    
    const save = () => {
      const title = input.value.trim() || currentName;
      onSave(title);
      close();
    };
    
    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') close();
    });
  }

  loadChat(chatId) {
    const chat = this.chatHistory.find(c => c.id === chatId);
    if (!chat) return;

    if (this.messages.length > 0 && this.currentChatId !== chatId) {
      this.autoSaveChat(); // Auto-save without prompting
    }

    this.currentChatId = chat.id;
    this.messages = [...chat.messages];
    this.selectedCollections = new Set(chat.collections || []);
    this.isStreaming = false;

    this.renderMessages();
    this.renderCollectionBar();
    this.renderSavedChats();
    this.enableInput();
  }

  deleteChat(chatId) {
    this.chatHistory = this.chatHistory.filter(c => c.id !== chatId);
    this.saveChatHistory();
    
    if (this.currentChatId === chatId) {
      this.startNewChat();
    } else {
      this.renderSavedChats();
    }
  }

  renderSavedChats() {
    const list = document.getElementById('chatHistoryList');
    if (!list) return;

    if (this.chatHistory.length === 0) {
      list.innerHTML = `<div class="chat-history-empty">No saved chats</div>`;
      return;
    }

    list.innerHTML = this.chatHistory.map(chat => {
      const isActive = chat.id === this.currentChatId;
      const date = new Date(chat.savedAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return `
        <div class="chat-history-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}">
          <div class="chat-history-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="chat-history-info">
            <div class="chat-history-name">${this.escape(chat.title)}</div>
            <div class="chat-history-meta">${dateStr}</div>
          </div>
          <button class="chat-history-rename" title="Rename">✎</button>
          <button class="chat-history-delete" title="Delete">×</button>
        </div>
      `;
    }).join('');
  }

  // ===== LIFECYCLE =====
  activate() {
    this.isStreaming = false; // Reset on activation
    if (this.messages.length > 0) {
      this.renderMessages();
    } else {
      this.renderWelcome();
    }
    this.renderCollectionBar();
    this.renderSavedChats();
    this.enableInput();
  }

  deactivate() {
    this.streamAbortController?.abort();
    this.isStreaming = false;
  }
}

window.LibraryChatManager = LibraryChatManager;
