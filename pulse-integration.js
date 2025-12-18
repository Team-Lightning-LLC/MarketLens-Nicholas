// Portfolio Pulse Integration
// Manages view toggling for both left panel (Library/Pulse/Chat) and right panel (Research/White Label)

class PulseIntegration {
  constructor() {
    this.currentView = 'library'; // 'library', 'pulse', or 'chat'
    this.currentRightView = 'research'; // 'research' or 'whitelabel'
    this.libraryChatManager = null;
    this.init();
  }

  init() {
    this.setupToggle();
    this.setupRightToggle();
    this.initializePulseWidget();
    this.initializeLibraryChat();
  }

  setupToggle() {
    const libraryBtn = document.getElementById('viewLibrary');
    const pulseBtn = document.getElementById('viewPulse');
    const chatBtn = document.getElementById('viewChat');

    if (libraryBtn) {
      libraryBtn.addEventListener('click', () => this.switchView('library'));
    }

    if (pulseBtn) {
      pulseBtn.addEventListener('click', () => this.switchView('pulse'));
    }

    // NEW: Chat button handling
    if (chatBtn) {
      // Enable the button (remove disabled state)
      chatBtn.disabled = false;
      chatBtn.addEventListener('click', () => this.switchView('chat'));
    }
  }

  setupRightToggle() {
    const researchBtn = document.getElementById('viewResearch');
    const whiteLabelBtn = document.getElementById('viewWhiteLabel');

    if (researchBtn) {
      researchBtn.addEventListener('click', () => this.switchRightView('research'));
    }

    if (whiteLabelBtn) {
      whiteLabelBtn.addEventListener('click', () => this.switchRightView('whitelabel'));
    }
  }

  switchRightView(view) {
    if (this.currentRightView === view) return;

    this.currentRightView = view;

    const researchForm = document.getElementById('researchForm');
    const whiteLabelForm = document.getElementById('whiteLabelForm');
    const researchBtn = document.getElementById('viewResearch');
    const whiteLabelBtn = document.getElementById('viewWhiteLabel');

    if (view === 'research') {
      if (researchForm) researchForm.style.display = 'block';
      if (whiteLabelForm) whiteLabelForm.style.display = 'none';
      if (researchBtn) researchBtn.classList.add('active');
      if (whiteLabelBtn) whiteLabelBtn.classList.remove('active');

    } else if (view === 'whitelabel') {
      if (researchForm) researchForm.style.display = 'none';
      if (whiteLabelForm) whiteLabelForm.style.display = 'block';
      if (researchBtn) researchBtn.classList.remove('active');
      if (whiteLabelBtn) whiteLabelBtn.classList.add('active');
    }
  }

  switchView(view) {
    if (this.currentView === view) return;

    const previousView = this.currentView;
    this.currentView = view;

    const libraryContainer = document.getElementById('libraryContainer');
    const pulseContainer = document.getElementById('pulseContainer');
    const chatContainer = document.getElementById('chatContainer');
    const libraryBtn = document.getElementById('viewLibrary');
    const pulseBtn = document.getElementById('viewPulse');
    const chatBtn = document.getElementById('viewChat');

    // Hide all containers first
    if (libraryContainer) libraryContainer.style.display = 'none';
    if (pulseContainer) pulseContainer.style.display = 'none';
    if (chatContainer) chatContainer.style.display = 'none';

    // Remove active class from all buttons
    if (libraryBtn) libraryBtn.classList.remove('active');
    if (pulseBtn) pulseBtn.classList.remove('active');
    if (chatBtn) chatBtn.classList.remove('active');

    // Deactivate chat manager when leaving chat view
    if (previousView === 'chat' && this.libraryChatManager) {
      this.libraryChatManager.deactivate();
    }

    // Show selected view
    if (view === 'library') {
      if (libraryContainer) libraryContainer.style.display = 'flex';
      if (libraryBtn) libraryBtn.classList.add('active');

    } else if (view === 'pulse') {
      if (pulseContainer) pulseContainer.style.display = 'flex';
      if (pulseBtn) pulseBtn.classList.add('active');

      // Initialize pulse widget if not already done
      if (!window.portfolioPulse) {
        this.initializePulseWidget();
      }

    } else if (view === 'chat') {
      if (chatContainer) chatContainer.style.display = 'flex';
      if (chatBtn) chatBtn.classList.add('active');

      // Activate chat manager
      if (this.libraryChatManager) {
        this.libraryChatManager.activate();
      }
    }
  }

  initializePulseWidget() {
    if (window.portfolioPulse) return;
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.portfolioPulse = new PortfolioPulseWidget();
      });
    } else {
      window.portfolioPulse = new PortfolioPulseWidget();
    }
  }

  // NEW: Initialize Library Chat
  initializeLibraryChat() {
    const initChat = () => {
      // Wait for both app and LibraryChatManager to be available
      if (window.app && window.LibraryChatManager) {
        this.libraryChatManager = new LibraryChatManager(window.app);
        window.libraryChatManager = this.libraryChatManager;
        console.log('Library Chat Manager initialized');
      } else {
        // Retry after a short delay if dependencies aren't ready
        setTimeout(initChat, 100);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initChat);
    } else {
      setTimeout(initChat, 100);
    }
  }
}

// Initialize integration when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.pulseIntegration = new PulseIntegration();
});
