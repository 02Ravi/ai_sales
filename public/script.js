

class AISalesAgent {
  constructor() {
    this.currentSessionId = this.generateSessionId();
    this.isLoading = false;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateSessionDisplay();
    this.setWelcomeTime();
    this.checkConnection();
  }

  setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const newSessionBtn = document.getElementById('newSessionBtn');
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');

    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendMessage());
    }
    if (messageInput) {
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Auto-resize textarea
      messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
      });
    }

    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', () => this.startNewSession());
    }

    if (toggleSidebarBtn && sidebar) {
      // Toggle sidebar on mobile
      toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });

      // Close sidebar when clicking outside on mobile
      document.addEventListener('click', (e) => {
        if (
          window.innerWidth <= 768 &&
          !sidebar.contains(e.target) &&
          !toggleSidebarBtn.contains(e.target)
        ) {
          sidebar.classList.remove('open');
        }
      });
    }
  }

  // --- Markdown Renderer ---
  renderMarkdown(md = '') {
    const escape = (s) =>
      s.replace(/[&<>"']/g, (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]
      );

    let html = escape(md);

    // Code blocks & inline code
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold & italics
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Bullet lists
    const lines = html.split(/\r?\n/);
    let out = [],
      inList = false;
    for (const line of lines) {
      if (/^\s*-\s+/.test(line)) {
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push(`<li>${line.replace(/^\s*-\s+/, '')}</li>`);
      } else {
        if (inList) {
          out.push('</ul>');
          inList = false;
        }
        out.push(line === '' ? '<br>' : line);
      }
    }
    if (inList) out.push('</ul>');

    return out.join('\n');
  }

  async sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = (messageInput?.value || '').trim();

    if (!message || this.isLoading) return;

    if (messageInput) {
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }

    this.addMessage(message, 'user');
    this.setLoading(true);

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: this.currentSessionId,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('Failed to parse JSON:', e);
        this.addMessage('Sorry, bad response from server.', 'agent');
        return;
      }

      console.log('chat response:', data);

      const ok = typeof data.success === 'boolean' ? data.success : response.ok;

      if (ok) {
        // Prefer `response`, fall back to `message`
        const reply =
          (typeof data.response === 'string' && data.response) ||
          (typeof data.message === 'string' && data.message) ||
          'Okay.';

        this.addMessage(reply, 'agent');

        if (data.extractedData) {
          this.updateExtractedData(data.extractedData);
        }

        // If server echoes sessionId, keep UI in sync
        if (typeof data.sessionId === 'string' && data.sessionId !== this.currentSessionId) {
          this.currentSessionId = data.sessionId;
          this.updateSessionDisplay();
        }
      } else {
        this.addMessage(
          data?.error || 'Sorry, I encountered an error. Please try again.',
          'agent'
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.addMessage(
        "Sorry, I'm having trouble connecting. Please check your connection and try again.",
        'agent'
      );
    } finally {
      this.setLoading(false);
    }
  }

  addMessage(text, sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) {
      console.warn('#chatMessages not found');
      return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const content = document.createElement('div');
    content.className = 'message-content';

    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.innerHTML = this.renderMarkdown(text);

    const messageTime = document.createElement('div');
    messageTime.className = 'message-time';
    messageTime.textContent = this.formatTime(new Date());

    content.appendChild(messageText);
    content.appendChild(messageTime);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  updateExtractedData(data) {
    const sidebarContent = document.getElementById('sidebarContent');
    if (!sidebarContent) {
      console.warn('#sidebarContent not found');
      return;
    }

    // Only display selected sections; hide internal keys if ever passed in
    const sections = {};
    if (data.company && typeof data.company === 'object') sections.company = data.company;
    if (data.hiring && typeof data.hiring === 'object') sections.hiring = data.hiring;
    if (data.additional && typeof data.additional === 'object') sections.additional = data.additional;

    if (Object.keys(sections).length === 0) {
      sidebarContent.innerHTML = `
        <div class="no-data">
          <i class="fas fa-info-circle"></i>
          <p>No data extracted yet</p>
        </div>
      `;
      return;
    }

    let html = '';
    if (sections.company && Object.keys(sections.company).length > 0) {
      html += this.createDataCard('Company Information', sections.company, 'fas fa-building');
    }
    if (sections.hiring && Object.keys(sections.hiring).length > 0) {
      html += this.createDataCard('Hiring Requirements', sections.hiring, 'fas fa-users');
    }
    if (sections.additional && Object.keys(sections.additional).length > 0) {
      html += this.createDataCard('Additional Info', sections.additional, 'fas fa-info-circle');
    }

    sidebarContent.innerHTML = html;
  }

  createDataCard(title, data, icon) {
    let html = `
      <div class="data-card">
        <h4><i class="${icon}"></i>${title}</h4>
    `;

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === '') continue;

      // Pretty labels
      const displayKey = key
        .charAt(0)
        .toUpperCase() +
        key
          .slice(1)
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ');

      let displayValue = value;

      if (Array.isArray(value)) {
        displayValue = value.join(', ');
      } else if (typeof value === 'object') {
        // Special case: show budget nicely if present
        if ('min' in value || 'max' in value || 'currency' in value) {
          const parts = [];
          if (value.min != null) parts.push(`min ${value.currency || ''} ${value.min}`.trim());
          if (value.max != null) parts.push(`max ${value.currency || ''} ${value.max}`.trim());
          displayValue = parts.join(', ') || JSON.stringify(value);
        } else {
          displayValue = JSON.stringify(value, null, 2);
        }
      }

      html += `
        <div class="data-item">
          <span class="data-label">${displayKey}</span>
          <span class="data-value">${displayValue}</span>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  startNewSession() {
    this.currentSessionId = this.generateSessionId();
    this.updateSessionDisplay();

    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      const welcomeMessage = chatMessages.querySelector('.agent-message');
      chatMessages.innerHTML = '';
      if (welcomeMessage) chatMessages.appendChild(welcomeMessage);
    }

    const sidebarContent = document.getElementById('sidebarContent');
    if (sidebarContent) {
      sidebarContent.innerHTML = `
        <div class="no-data">
          <i class="fas fa-info-circle"></i>
          <p>No data extracted yet</p>
        </div>
      `;
    }

    this.addMessage('New session started. How can I help you today?', 'agent');
  }

  setLoading(loading) {
    this.isLoading = loading;
    const sendButton = document.getElementById('sendButton');
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (sendButton) sendButton.disabled = !!loading;
    if (loadingOverlay) {
      if (loading) loadingOverlay.classList.add('show');
      else loadingOverlay.classList.remove('show');
    }
  }

  async checkConnection() {
    try {
      const response = await fetch('/health');
      this.updateStatus(response.ok ? 'Connected' : 'Disconnected', response.ok);
    } catch {
      this.updateStatus('Disconnected', false);
    }
  }

  updateStatus(text, connected) {
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');

    if (statusText) statusText.textContent = text;
    if (statusDot) statusDot.style.background = connected ? '#4ade80' : '#ef4444';
  }

  updateSessionDisplay() {
    const sessionIdElement = document.getElementById('sessionId');
    if (sessionIdElement) {
      sessionIdElement.textContent = this.currentSessionId.substring(0, 8) + '...';
    }
  }

  setWelcomeTime() {
    const welcomeTime = document.getElementById('welcomeTime');
    if (welcomeTime) welcomeTime.textContent = this.formatTime(new Date());
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AISalesAgent();
});
