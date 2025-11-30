document.addEventListener('DOMContentLoaded', async () => {
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');

    const converter = new showdown.Converter(); // Create a showdown converter

    const ensureVisitor = async () => {
        const storageKey = 'shurahubVisitor';
        const existing = localStorage.getItem(storageKey);
        if (existing) {
            try {
                return JSON.parse(existing);
            } catch (e) {
                console.warn('Unable to parse stored visitor info, regenerating.', e);
            }
        }

        const visitorId = (crypto.randomUUID ? crypto.randomUUID() : `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const username = `Guest-${visitorId.slice(0, 8)}`;

        try {
            await fetch('/engagement/visitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitor_id: visitorId, username })
            });
        } catch (e) {
            console.warn('Visitor registration failed; continuing anonymously.', e);
        }

        const payload = { visitor_id: visitorId, username };
        localStorage.setItem(storageKey, JSON.stringify(payload));
        return payload;
    };

    const visitor = await ensureVisitor();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = visitor?.visitor_id ? `/ws?visitor_id=${encodeURIComponent(visitor.visitor_id)}` : '/ws';
    const ws = new WebSocket(`${protocol}//${window.location.host}${wsPath}`);

    ws.onopen = () => {
        console.log('WebSocket connection established');
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const senderClass = message.sender.replace(/[^a-zA-Z0-9]/g, '-');

        // Remove existing typing indicator for this sender
        const existingIndicator = document.getElementById(`typing-${senderClass}`);
        if (existingIndicator) {
            existingIndicator.remove();
        }

        const messageElement = document.createElement('div');

        if (message.type === 'typing') {
            messageElement.id = `typing-${senderClass}`;
            messageElement.className = `message typing-indicator`;
            messageElement.innerHTML = `<strong>${message.sender}:</strong> is typing...`;
        } else {
            messageElement.className = `message ${senderClass}`;
            const htmlContent = converter.makeHtml(message.text);
            messageElement.innerHTML = `<strong>${message.sender}:</strong> ${htmlContent}`;
        }

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
    };

    const sendMessage = () => {
        const text = promptInput.value;
        if (text && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ text }));
            const messageElement = document.createElement('div');
            messageElement.className = 'message user';
            // No markdown conversion for user input
            messageElement.innerHTML = `<strong>You:</strong> ${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}`;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            promptInput.value = '';
        }
    };

    sendButton.addEventListener('click', sendMessage);
    promptInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });
});
