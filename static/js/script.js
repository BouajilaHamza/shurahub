document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const userMessageTemplate = document.getElementById('user-message-template');
    const shurahubMessageTemplate = document.getElementById('shurahub-message-template');

    let ws;
    let currentShurahubMessage;

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

    function handleServerMessage(data) {
        if (data.sender === 'Shurahub' && data.text === 'Initiating collaborative debate...') {
            // Create a new message container for the whole interaction
            const messageElement = shurahubMessageTemplate.content.cloneNode(true);
            chatMessages.appendChild(messageElement);
            currentShurahubMessage = chatMessages.lastElementChild;
            scrollToBottom();
            return;
        }

        if (currentShurahubMessage) {
            const debateContent = currentShurahubMessage.querySelector('.debate-content');
            const finalAnswer = currentShurahubMessage.querySelector('.final-answer');

            // Final Verdict (Synthesizer)
            if (data.text.startsWith('**Final Verdict:**')) {
                const answer = data.text.replace('**Final Verdict:**', '').trim();
                finalAnswer.innerHTML = marked.parse(answer);
                const viewDebateButton = currentShurahubMessage.querySelector('.view-debate-button');
                viewDebateButton.style.display = 'block'; // Show the button

            } else { // Opener and Critiquer
                const debateEntry = document.createElement('div');
                debateEntry.classList.add('debate-entry');
                const sender = `<b>${data.sender}:</b>`;
                const response = marked.parse(data.text);
                debateEntry.innerHTML = `${sender}<br>${response}`;
                debateContent.appendChild(debateEntry);
            }
        }
        scrollToBottom();
    }

    function sendMessage() {
        const text = promptInput.value.trim();
        if (text && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ text }));
            appendUserMessage(text);
            promptInput.value = '';
            scrollToBottom();
        }
    }

    function appendUserMessage(text) {
        const messageElement = userMessageTemplate.content.cloneNode(true);
        const content = messageElement.querySelector('.message-content');
        content.textContent = text;
        chatMessages.appendChild(messageElement);
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Event listener for the 'View Debate' button (using event delegation)
    chatMessages.addEventListener('click', (event) => {
        if (event.target.classList.contains('view-debate-button')) {
            const button = event.target;
            const debateContainer = button.previousElementSibling;
            if (debateContainer.style.display === 'none') {
                debateContainer.style.display = 'block';
                button.textContent = 'Hide Debate';
            } else {
                debateContainer.style.display = 'none';
                button.textContent = 'View Debate';
            }
        }
    });

    sendButton.addEventListener('click', sendMessage);
    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    connect();
});
