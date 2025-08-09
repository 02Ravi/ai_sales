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

        sendButton.addEventListener('click', () => this.sendMessage());
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

        // New session button
        newSessionBtn.addEventListener('click', () => this.startNewSession());

        // Toggle sidebar on mobile
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !toggleSidebarBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message || this.isLoading) return;

        // Clear input and reset height
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Add user message to chat
        this.addMessage(message, 'user');

        // Show loading
        this.setLoading(true);

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.currentSessionId
                })
            });

            const data = await response.json();

            if (data.success) {
                // Add AI response to chat
                this.addMessage(data.response, 'agent');
                
                // Update extracted data in sidebar
                if (data.extractedData) {
                    this.updateExtractedData(data.extractedData);
                }
            } else {
                this.addMessage('Sorry, I encountered an error. Please try again.', 'agent');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage('Sorry, I\'m having trouble connecting. Please check your connection and try again.', 'agent');
        } finally {
            this.setLoading(false);
        }
    }

    addMessage(text, sender) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        if (sender === 'user') {
            avatar.innerHTML = '<i class="fas fa-user"></i>';
        } else {
            avatar.innerHTML = '<i class="fas fa-robot"></i>';
        }

        const content = document.createElement('div');
        content.className = 'message-content';

        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = text;

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
        
        if (!data || Object.keys(data).length === 0) {
            sidebarContent.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-info-circle"></i>
                    <p>No data extracted yet</p>
                </div>
            `;
            return;
        }

        let html = '';

        // Company Information
        if (data.company && Object.keys(data.company).length > 0) {
            html += this.createDataCard('Company Information', data.company, 'fas fa-building');
        }

        // Hiring Requirements
        if (data.hiring && Object.keys(data.hiring).length > 0) {
            html += this.createDataCard('Hiring Requirements', data.hiring, 'fas fa-users');
        }

        // Additional Information
        if (data.additional && Object.keys(data.additional).length > 0) {
            html += this.createDataCard('Additional Info', data.additional, 'fas fa-info-circle');
        }

        sidebarContent.innerHTML = html;
    }

    createDataCard(title, data, icon) {
        let html = `
            <div class="data-card">
                <h4><i class="${icon}"></i>${title}</h4>
        `;

        for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined && value !== '') {
                const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                let displayValue = value;

                if (Array.isArray(value)) {
                    displayValue = value.join(', ');
                } else if (typeof value === 'object') {
                    displayValue = JSON.stringify(value, null, 2);
                }

                html += `
                    <div class="data-item">
                        <span class="data-label">${displayKey}</span>
                        <span class="data-value">${displayValue}</span>
                    </div>
                `;
            }
        }

        html += '</div>';
        return html;
    }

    startNewSession() {
        this.currentSessionId = this.generateSessionId();
        this.updateSessionDisplay();
        
        // Clear chat messages except the welcome message
        const chatMessages = document.getElementById('chatMessages');
        const welcomeMessage = chatMessages.querySelector('.agent-message');
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
            chatMessages.appendChild(welcomeMessage);
        }

        // Clear extracted data
        const sidebarContent = document.getElementById('sidebarContent');
        sidebarContent.innerHTML = `
            <div class="no-data">
                <i class="fas fa-info-circle"></i>
                <p>No data extracted yet</p>
            </div>
        `;

        // Add new session message
        this.addMessage('New session started. How can I help you today?', 'agent');
    }

    setLoading(loading) {
        this.isLoading = loading;
        const sendButton = document.getElementById('sendButton');
        const loadingOverlay = document.getElementById('loadingOverlay');

        if (loading) {
            sendButton.disabled = true;
            loadingOverlay.classList.add('show');
        } else {
            sendButton.disabled = false;
            loadingOverlay.classList.remove('show');
        }
    }

    async checkConnection() {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                this.updateStatus('Connected', true);
            } else {
                this.updateStatus('Disconnected', false);
            }
        } catch (error) {
            this.updateStatus('Disconnected', false);
        }
    }

    updateStatus(text, connected) {
        const statusText = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');
        
        statusText.textContent = text;
        statusDot.style.background = connected ? '#4ade80' : '#ef4444';
    }

    updateSessionDisplay() {
        const sessionIdElement = document.getElementById('sessionId');
        sessionIdElement.textContent = this.currentSessionId.substring(0, 8) + '...';
    }

    setWelcomeTime() {
        const welcomeTime = document.getElementById('welcomeTime');
        welcomeTime.textContent = this.formatTime(new Date());
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AISalesAgent();
});
