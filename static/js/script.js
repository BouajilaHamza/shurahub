document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    let ws;

    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        ws.onopen = () => console.log('WebSocket connection established');
        ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
        ws.onclose = () => {
            console.log('WebSocket connection closed. Reconnecting...');
            setTimeout(connect, 3000);
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            ws.close();
        };
    }

    function getAvatarInitial(sender) {
        const s = sender.toLowerCase();
        if (s.includes('user')) return 'YOU';
        if (s.includes('gemma')) return 'G2';
        if (s.includes('llama')) return 'L3';
        if (s.includes('mixtral')) return 'MX';
        if (s.includes('qwen')) return 'QW'; 
        if (s.includes('kimi')) return 'KM';
        if (s.includes('gpt-oss')) return 'OS';
        return 'AI';
    }

    function handleServerMessage(data) {
        document.querySelectorAll('.typing-indicator').forEach(indicator => indicator.remove());

        const element = data.type === 'typing'
            ? createTypingIndicator(data.sender)
            : createMessageElement(data.sender, data.text);

        chatMessages.appendChild(element);
        scrollToBottom();
    }

    function createMessageElement(sender, text) {
        const messageEl = document.createElement('div');
        // Use a generic 'ai' class for all non-user messages for styling
        const senderClass = sender === 'user' ? 'user' : 'ai';
        messageEl.classList.add('message', senderClass);

        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        // Add a specific class for the model for potential individual styling
        avatar.classList.add(sender.split('/')[1]); 
        avatar.textContent = getAvatarInitial(sender);
        messageEl.appendChild(avatar);

        const contentEl = document.createElement('div');
        contentEl.classList.add('message-content');

        const senderEl = document.createElement('div');
        senderEl.classList.add('message-sender');
        senderEl.textContent = sender === 'user' ? 'You' : sender;
        contentEl.appendChild(senderEl);

        const textEl = document.createElement('div');
        textEl.classList.add('message-text');
        textEl.innerHTML = marked.parse(text);
        contentEl.appendChild(textEl);

        messageEl.appendChild(contentEl);
        return messageEl;
    }

    function createTypingIndicator(sender) {
        const typingEl = document.createElement('div');
        typingEl.classList.add('message', 'typing-indicator', 'ai');

        const avatar = document.createElement('div');
        avatar.classList.add('avatar', sender.split('/')[1]);
        avatar.textContent = getAvatarInitial(sender);
        typingEl.appendChild(avatar);

        const contentEl = document.createElement('div');
        contentEl.classList.add('message-content');
        contentEl.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
        typingEl.appendChild(contentEl);

        return typingEl;
    }

    function sendMessage() {
        const text = promptInput.value.trim();
        if (text && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ text }));
            const messageEl = createMessageElement('user', text);
            chatMessages.appendChild(messageEl);
            promptInput.value = '';
            scrollToBottom();
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    sendButton.addEventListener('click', sendMessage);
    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    connect();
});
