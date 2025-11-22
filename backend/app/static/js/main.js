document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    const converter = new showdown.Converter(); // Create a showdown converter

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
