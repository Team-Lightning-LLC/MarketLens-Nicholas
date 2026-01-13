// Markdown Document Viewer and PDF Generator with Streaming Chat + TOC
class MarkdownViewer {
  constructor() {
    this.currentContent = '';
    this.currentTitle = '';
    this.currentDocId = null;
    this.chatOpen = false;
    this.chatMessages = [];
    this.streamAbortController = null;
    this.hasReceivedAnswer = false;  // FIX: Initialize flag
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Close viewer
    document.getElementById('closeViewer')?.addEventListener('click', () => {
      this.closeViewer();
    });

    // Download PDF
    document.getElementById('downloadPDF')?.addEventListener('click', () => {
      this.generatePDF();
    });

    // Toggle chat
    document.getElementById('chatToggle')?.addEventListener('click', () => {
      this.toggleChat();
    });

    // Send chat message
    document.getElementById('chatSend')?.addEventListener('click', () => {
      this.sendMessage();
    });

    // Enter to send (Shift+Enter for new line)
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Add download chat button dynamically
    this.addDownloadChatButton();
    
    // Panel tabs (Chat / Follow Up) - ADDED FROM FILE 1
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });
    
    // Follow Up context input - ADDED FROM FILE 1
    document.getElementById('followupContext')?.addEventListener('input', (e) => {
      this.updateFollowupCharCount();
      this.updateFollowupButton();
    });
    
    // Generate Follow Up button - ADDED FROM FILE 1
    document.getElementById('generateFollowup')?.addEventListener('click', () => {
      this.generateFollowUp();
    });
    
    // Follow up modifier segmented controls - ADDED FROM FILE 1
    this.setupFollowupModifiers();

    // Click outside to close
    const dialog = document.getElementById('viewer');
    dialog?.addEventListener('click', (e) => {
      const rect = dialog.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right || 
                     e.clientY < rect.top || e.clientY > rect.bottom;
      if (outside) this.closeViewer();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dialog?.open) {
        this.closeViewer();
      }
    });
  }

  // Add download chat button to input container
  addDownloadChatButton() {
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (!chatInputContainer) return;

    const buttonStack = document.createElement('div');
    buttonStack.className = 'chat-button-stack';
    buttonStack.innerHTML = `
      <button id="chatDownload" class="chat-download-btn" title="Download conversation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
      </button>
    `;

    const sendButton = document.getElementById('chatSend');
    if (sendButton) {
      chatInputContainer.removeChild(sendButton);
      buttonStack.appendChild(sendButton);
      chatInputContainer.appendChild(buttonStack);

      document.getElementById('chatDownload')?.addEventListener('click', () => {
        this.downloadChatHistory();
      });
    }
  }

  // Download chat history as markdown
  downloadChatHistory() {
    if (this.chatMessages.length === 0) {
      alert('No conversation to download yet.');
      return;
    }

    let markdown = `# Chat with ${this.currentTitle}\n\n`;
    markdown += `Date: ${new Date().toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    })}\n\n`;
    markdown += `---\n\n`;

    this.chatMessages.forEach((msg, index) => {
      const role = msg.role === 'user' ? '**You**' : '**Assistant**';
      markdown += `${role}: ${msg.content}\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${this.currentTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Extract headings for TOC
  extractHeadings(markdown) {
    const headings = [];
    const lines = markdown.split('\n');
    
    lines.forEach(line => {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = this.generateHeadingId(text);
        headings.push({ level, text, id });
      }
    });
    
    return headings;
  }

  // Generate unique ID from heading text
  generateHeadingId(text) {
    let cleanText;
    
    if (typeof text === 'string') {
      cleanText = text;
    } else if (text && typeof text.toString === 'function') {
      cleanText = text.toString();
    } else {
      cleanText = String(text || '');
    }
    
    const strippedText = cleanText.replace(/<[^>]*>/g, '');
    
    return strippedText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Render markdown with IDs on headings
  renderMarkdownWithIds(markdown) {
    const processedMarkdown = this.addHeadingIds(markdown);
    return marked.parse(processedMarkdown);
  }

  // Add IDs to headings in the markdown text directly
  addHeadingIds(markdown) {
    const lines = markdown.split('\n');
    
    return lines.map(line => {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const hashes = match[1];
        const text = match[2].trim();
        const id = this.generateHeadingId(text);
        
        const level = hashes.length;
        return `<h${level} id="${id}">${text}</h${level}>`;
      }
      return line;
    }).join('\n');
  }

  // Build TOC HTML
  buildTOC(headings) {
    if (headings.length === 0) {
      return '<div class="toc-empty">No sections found</div>';
    }
    
    return headings.map(h => `
      <div class="toc-item toc-level-${h.level}" data-target="${h.id}">
        <span class="toc-text">${h.text}</span>
      </div>
    `).join('');
  }

  // Setup TOC navigation
  setupTOCNavigation() {
    const tocItems = document.querySelectorAll('.toc-item');
    
    tocItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          targetElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
          
          tocItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        }
      });
    });

    const viewerDocument = document.querySelector('.viewer-document');
    if (viewerDocument) {
      viewerDocument.addEventListener('scroll', () => {
        this.updateActiveTOCItem();
      });
    }
  }

  // Update active TOC item based on scroll position
  updateActiveTOCItem() {
    const tocItems = document.querySelectorAll('.toc-item');
    const headings = Array.from(document.querySelectorAll('.viewer-document h1, .viewer-document h2, .viewer-document h3'));
    
    let activeHeading = null;
    const scrollTop = document.querySelector('.viewer-document')?.scrollTop || 0;
    
    for (let i = headings.length - 1; i >= 0; i--) {
      if (headings[i].offsetTop <= scrollTop + 100) {
        activeHeading = headings[i];
        break;
      }
    }
    
    if (activeHeading) {
      const activeId = activeHeading.id;
      
      tocItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.target === activeId) {
          item.classList.add('active');
        }
      });
    }
  }

  // Open formatted markdown viewer with TOC
  openViewer(markdownContent, title, docId) {
    if (!marked || typeof marked.parse !== 'function') {
      console.error('Marked.js library not loaded');
      alert('Markdown library not loaded. Please refresh the page.');
      return;
    }

    if (this.currentDocId && this.currentDocId !== docId) {
      console.log('Switching documents, closing existing stream');
      this.closeStream();
    }

    this.currentContent = markdownContent;
    this.currentTitle = title;
    this.currentDocId = docId;
    this.workflowId = null;
    this.chatMessages = [];
    this.chatOpen = false;

    const dialog = document.getElementById('viewer');
    const titleElement = document.getElementById('viewerTitle');
    const viewerFrame = document.getElementById('viewerFrame');
    const container = document.querySelector('.viewer-container');
    const chatToggle = document.getElementById('chatToggle');

    if (titleElement) {
      titleElement.textContent = title || 'Research Document';
    }

    if (container) {
      container.classList.remove('chat-open');
    }
    if (chatToggle) {
      chatToggle.classList.remove('active');
    }

    try {
      const headings = this.extractHeadings(markdownContent);
      const htmlContent = this.renderMarkdownWithIds(markdownContent);
      
      if (viewerFrame) {
        viewerFrame.innerHTML = `
          <div class="viewer-toc">
            <div class="toc-header">Contents</div>
            <div class="toc-list">
              ${this.buildTOC(headings)}
            </div>
          </div>
          <div class="viewer-document">
            ${htmlContent}
          </div>
        `;
        viewerFrame.className = 'viewer-content with-toc';
        
        this.setupTOCNavigation();
      }

      if (dialog) {
        dialog.showModal();
      }
    } catch (error) {
      console.error('Error rendering markdown:', error);
      if (viewerFrame) {
        viewerFrame.innerHTML = `<div class="error">Failed to render document: ${error.message}</div>`;
      }
      if (dialog) {
        dialog.showModal();
      }
    }
  }

  // Toggle chat panel
  toggleChat() {
    this.chatOpen = !this.chatOpen;
    
    const container = document.querySelector('.viewer-container');
    const chatToggle = document.getElementById('chatToggle');
    const chatDocTitle = document.getElementById('chatDocTitle');
    
    if (this.chatOpen) {
      container?.classList.add('chat-open');
      chatToggle?.classList.add('active');
      
      if (chatDocTitle) {
        chatDocTitle.textContent = this.currentTitle;
      }
      
      if (this.chatMessages.length === 0) {
        this.showChatEmptyState();
      } else {
        this.renderChatMessages();
      }
      
    } else {
      container?.classList.remove('chat-open');
      chatToggle?.classList.remove('active');
    }
  }

  // Show empty state in chat
  showChatEmptyState() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = `
      <div class="chat-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p>Ask questions about this document to get deeper insights</p>
      </div>
    `;
  }

  // Send chat message with streaming
  async sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    if (!chatInput) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    this.addMessage('user', message);
    
    chatInput.value = '';
    chatInput.disabled = true;
    if (chatSend) chatSend.disabled = true;
    
    this.addThinkingMessage();
    
    // FIX: Reset the answer flag before starting new request
    this.hasReceivedAnswer = false;
    
    try {
      console.log('Sending message for document:', this.currentDocId);
      
      const conversationHistory = this.chatMessages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');
      
      const response = await vertesiaAPI.chatWithDocument({
        document_id: this.currentDocId,
        question: message,
        conversation_history: conversationHistory
      });
      
      console.log('Async response:', response);
      
      this.openStream(response.workflowId, response.runId);
      
    } catch (error) {
      console.error('Chat error:', error);
      this.removeThinkingMessage();
      this.addMessage('assistant', 'Sorry, there was an error processing your question.');
      
      chatInput.disabled = false;
      if (chatSend) chatSend.disabled = false;
      chatInput.focus();
    }
  }

  // Open streaming connection
  openStream(workflowId, runId) {
    console.log('Opening new stream for workflowId:', workflowId, 'runId:', runId);
    
    this.streamAbortController = new AbortController();
    
    vertesiaAPI.streamWorkflowMessages(
      workflowId,
      runId,
      this.streamAbortController.signal,
      
      (data) => {
        console.log('Stream message received:', data);
        
if (data.type === 'answer' && data.message && !this.hasReceivedAnswer) {
  // Extract clean answer from structured agent response
  const cleanAnswer = vertesiaAPI.extractAnswer(data.message);
  
  // FIX: Only accept and set flag if we have meaningful content
  // This prevents empty/partial answers from blocking the real answer
  if (cleanAnswer && cleanAnswer.trim().length > 10) {
    this.hasReceivedAnswer = true;
    this.removeThinkingMessage();
    this.addMessage('assistant', cleanAnswer);
    this.reEnableInput();
    console.log('Accepted answer:', cleanAnswer.substring(0, 80) + '...');
  } else {
    console.log('Skipping empty/short answer, waiting for real content:', data.message.substring(0, 50));
  }
}
      },
      
      () => {
        console.log('Stream completed');
        this.streamAbortController = null;
      },
      
      (error) => {
        console.error('Stream error:', error);
        this.removeThinkingMessage();
        this.addMessage('assistant', 'Sorry, there was an error with the response stream.');
        this.streamAbortController = null;
        this.reEnableInput();
      }
    );
  }

  // Close streaming connection
  closeStream() {
    if (this.streamAbortController) {
      console.log('Aborting stream');
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
  }

  // Add thinking indicator
  addThinkingMessage() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'chat-message assistant thinking';
    thinkingDiv.id = 'thinking-indicator';
    thinkingDiv.innerHTML = `
      <div class="chat-message-bubble">
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    
    chatMessages.appendChild(thinkingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Remove thinking indicator
  removeThinkingMessage() {
    const thinking = document.getElementById('thinking-indicator');
    if (thinking) thinking.remove();
  }

  // Re-enable input after response
  reEnableInput() {
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.focus();
    }
    if (chatSend) {
      chatSend.disabled = false;
    }
  }

  // Add message to chat
  addMessage(role, content) {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
    
    this.chatMessages.push({ role, content, timestamp });
    this.renderChatMessages();
  }

  // Format assistant message content for readability
  formatChatMessage(content) {
    if (!content) return '';
    
    // Escape HTML first for security
    const div = document.createElement('div');
    div.textContent = content;
    let formatted = div.innerHTML;
    
    // Convert bullet points (• or - at start of line) to styled list items
    formatted = formatted.replace(/^[•\-]\s+(.+)$/gm, '<div class="chat-bullet">• $1</div>');
    
    // Bold text (**text**)
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert double line breaks to paragraphs
    const paragraphs = formatted.split('\n\n').filter(p => p.trim());
    formatted = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    
    return formatted;
  }

  // Render all chat messages
  renderChatMessages() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = this.chatMessages.map(msg => {
      // Format assistant messages for readability, escape user messages
      const content = msg.role === 'assistant' 
        ? this.formatChatMessage(msg.content)
        : this.escapeHtml(msg.content);
      
      return `
        <div class="chat-message ${msg.role}">
          <div class="chat-message-bubble">${content}</div>
          <div class="chat-message-time">${msg.timestamp}</div>
        </div>
      `;
    }).join('');
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Close viewer and cleanup
  closeViewer() {
    const dialog = document.getElementById('viewer');
    const viewerFrame = document.getElementById('viewerFrame');
    const container = document.querySelector('.viewer-container');
    const chatToggle = document.getElementById('chatToggle');
    
    this.closeStream();
    
    if (viewerFrame) {
      viewerFrame.innerHTML = '';
      viewerFrame.className = 'viewer-content';
    }

    if (container) {
      container.classList.remove('chat-open');
    }
    if (chatToggle) {
      chatToggle.classList.remove('active');
    }
    
    this.chatOpen = false;
    this.chatMessages = [];

    if (dialog?.open) {
      dialog.close();
    }

    this.currentContent = '';
    this.currentTitle = '';
    this.currentDocId = null;
  }

  // Generate PDF - Use browser's native print functionality
  generatePDF() {
    if (!this.currentContent) {
      console.error('No content to generate PDF');
      return;
    }

    this.generatePDFFromContent(this.currentContent, this.currentTitle);
  }

  // Generate PDF from content (used by both viewer and library download)
  generatePDFFromContent(content, title) {
    // Create print window
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups and try again.');
      return;
    }

    const htmlContent = marked.parse(content);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            @page {
              margin: 0.5in;
              size: letter portrait;
            }
            body {
              margin: 0;
              padding: 0;
            }
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            color: #1f2d3d;
            max-width: 900px;
            margin: 0 auto;
            padding: 30px;
          }
          
          h1 {
            font-size: 28px;
            color: #336F51;
            border-bottom: 3px solid #336F51;
            padding-bottom: 12px;
            margin: 30px 0 20px 0;
            font-weight: 700;
            page-break-after: avoid;
          }
          
          h2 {
            font-size: 22px;
            color: #1f2d3d;
            margin: 25px 0 15px 0;
            font-weight: 600;
            border-left: 4px solid #336F51;
            padding-left: 12px;
            page-break-after: avoid;
          }
          
          h3 {
            font-size: 18px;
            color: #1f2d3d;
            margin: 20px 0 12px 0;
            font-weight: 600;
            page-break-after: avoid;
          }
          
          p {
            margin-bottom: 16px;
            orphans: 3;
            widows: 3;
          }
          
          strong {
            color: #336F51;
            font-weight: 600;
          }
          
          ul, ol {
            margin: 16px 0;
            padding-left: 24px;
          }
          
          li {
            margin-bottom: 8px;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 14px;
            page-break-inside: avoid;
          }
          
          th {
            background-color: #f8f9fb;
            border: 1px solid #e0e5ea;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
          }
          
          td {
            border: 1px solid #e0e5ea;
            padding: 10px 8px;
          }
          
          tr:nth-child(even) {
            background-color: #fafbfc;
          }
          
          /* Prevent awkward breaks */
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
          }
          
          table, figure {
            page-break-inside: avoid;
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then trigger print dialog
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.print();
        // Close window after printing (user may cancel, so delay)
        setTimeout(() => printWindow.close(), 100);
      }, 250);
    };
  }
  
  // ===== FOLLOW UP RESEARCH METHODS - ADDED FROM FILE 1 =====
  
  // Switch between Chat and Follow Up tabs
  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab content
    document.getElementById('chatTab')?.classList.toggle('hidden', tabName !== 'chat');
    document.getElementById('followupTab')?.classList.toggle('hidden', tabName !== 'followup');
  }
  
  // Setup segmented controls for Follow Up modifiers
  setupFollowupModifiers() {
    const modifiersContainer = document.getElementById('followupModifiers');
    if (!modifiersContainer) return;
    
    modifiersContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-option');
      if (!btn) return;
      
      const seg = btn.closest('.seg');
      if (!seg) return;
      
      // Update active state
      seg.querySelectorAll('.seg-option').forEach(option => {
        option.classList.remove('is-active');
      });
      
      btn.classList.add('is-active');
    });
  }
  
  // Update character count for Follow Up context
  updateFollowupCharCount() {
    const textarea = document.getElementById('followupContext');
    const counter = document.getElementById('followupCharCount');
    
    if (textarea && counter) {
      counter.textContent = textarea.value.length;
    }
  }
  
  // Update Follow Up button state
  updateFollowupButton() {
    const textarea = document.getElementById('followupContext');
    const button = document.getElementById('generateFollowup');
    
    if (textarea && button) {
      button.disabled = textarea.value.trim().length === 0;
    }
  }
  
  // Get selected modifiers from Follow Up form
  getFollowupModifiers() {
    const modifiers = {};
    
    document.querySelectorAll('#followupModifiers .seg').forEach(seg => {
      const activeOption = seg.querySelector('.seg-option.is-active');
      if (activeOption) {
        const group = activeOption.dataset.group;
        const value = activeOption.dataset.value;
        if (group && value) {
          modifiers[group] = value;
        }
      }
    });
    
    return modifiers;
  }
  
  // Generate Follow Up research
  async generateFollowUp() {
    const contextInput = document.getElementById('followupContext');
    const button = document.getElementById('generateFollowup');
    
    if (!contextInput || !button) return;
    
    const context = contextInput.value.trim();
    if (!context) return;
    
    // Disable button during generation
    button.disabled = true;
    
    try {
      const modifiers = this.getFollowupModifiers();
      
      // Create research data for follow-up
      const researchData = {
        context: context,
        modifiers: modifiers,
        parent_document_id: this.currentDocId
      };
      
      // Start the follow-up research
      await researchEngine.startResearch(researchData);
      
      // Show brief toast notification
      this.showBriefToast('Follow-up research started');
      
      // Reset form
      contextInput.value = '';
      this.updateFollowupCharCount();
      button.disabled = true;
      
    } catch (error) {
      console.error('Failed to start follow-up research:', error);
      this.showBriefToast('Failed to start follow-up research');
      button.disabled = false;
    }
  }
  
  // Show brief toast notification (fades after 3 seconds)
  showBriefToast(message) {
    // Create toast if it doesn't exist
    let toast = document.getElementById('briefToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'briefToast';
      toast.className = 'brief-toast';
      document.body.appendChild(toast);
    }
    
    // Set message and show
    toast.textContent = message;
    toast.classList.remove('hide');
    toast.classList.add('show');
    
    // Hide after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
    }, 3000);
  }
}

// Create global instance
const markdownViewer = new MarkdownViewer();
