document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const userMessageTemplate = document.getElementById('user-message-template');
    const shurahubMessageTemplate = document.getElementById('shurahub-message-template');

    let ws;
    let currentShurahubMessage;
    let typingIndicatorTimeout;
    let lastPrompt = '';

    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log('WebSocket connection established');
        ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
        ws.onclose = () => {
            console.log('WebSocket connection closed. Reconnecting...');
            setTimeout(connect, 3000); // Try to reconnect every 3 seconds
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            ws.close();
        };
    }

    function handleServerMessage(data) {
        clearTimeout(typingIndicatorTimeout);
        removeTypingIndicator();

        if (data.type === 'typing') {
            showTypingIndicator(data.sender);
            return;
        }

        if (data.sender === 'Shurahub' && data.text === 'Initiating collaborative debate...') {
            const messageElement = shurahubMessageTemplate.content.cloneNode(true);
            chatMessages.appendChild(messageElement);
            currentShurahubMessage = chatMessages.lastElementChild;
            scrollToBottom();
            return;
        }

        if (currentShurahubMessage) {
            const debateContent = currentShurahubMessage.querySelector('.debate-content');
            const finalAnswer = currentShurahubMessage.querySelector('.final-answer');

            if (data.text.startsWith('**Final Verdict:**')) {
                const answer = data.text.replace('**Final Verdict:**', '').trim();
                finalAnswer.innerHTML = marked.parse(answer);
                const viewDebateButton = currentShurahubMessage.querySelector('.view-debate-button');
                viewDebateButton.style.display = 'block';
                const feedbackBlock = currentShurahubMessage.querySelector('.response-feedback');
                if (feedbackBlock) {
                    feedbackBlock.hidden = false;
                    wireResponseFeedback(feedbackBlock, answer, lastPrompt);
                }
            } else {
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
            lastPrompt = text;
            appendUserMessage(text);
            promptInput.value = '';
            resizePrompt();
            updateSendState();
            scrollToBottom();
        }
    }

    function appendUserMessage(text) {
        const messageElement = userMessageTemplate.content.cloneNode(true);
        const content = messageElement.querySelector('.message-content');
        content.textContent = text;
        chatMessages.appendChild(messageElement);
    }

    function showTypingIndicator(sender) {
        let typingIndicator = document.getElementById('typing-indicator');
        if (!typingIndicator) {
            typingIndicator = document.createElement('div');
            typingIndicator.id = 'typing-indicator';
            typingIndicator.classList.add('message', 'typing-indicator');
            chatMessages.appendChild(typingIndicator);
        }
        typingIndicator.innerHTML = `<em>${sender} is typing...</em>`;
        scrollToBottom();

        // Fallback to remove indicator if no new message arrives
        typingIndicatorTimeout = setTimeout(removeTypingIndicator, 5000);
    }

    function removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }


    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
        });
    }

    chatMessages.addEventListener('click', (event) => {
        if (event.target.classList.contains('view-debate-button')) {
            const button = event.target;
            const debateContainer = button.parentElement.querySelector('.debate-container');
            if (debateContainer.style.display === 'none') {
                debateContainer.style.display = 'block';
                button.textContent = 'Hide Debate';
            } else {
                debateContainer.style.display = 'none';
                button.textContent = 'View Debate';
            }
        }
    });

    function resizePrompt() {
        promptInput.style.height = 'auto';
        promptInput.style.height = `${Math.min(promptInput.scrollHeight, 160)}px`;
    }

    function updateSendState() {
        const hasText = Boolean(promptInput.value.trim());
        sendButton.disabled = !hasText;
    }

    function wireResponseFeedback(block, finalAnswer, promptText) {
        const chips = block.querySelectorAll('.feedback-chip');
        const noteField = block.querySelector('textarea');
        const submitButton = block.querySelector('.submit-feedback');
        const status = block.querySelector('.feedback-status');
        let rating = null;

        const updateState = () => {
            submitButton.disabled = !rating;
        };

        chips.forEach((chip) => {
            chip.addEventListener('click', () => {
                chips.forEach((button) => button.classList.remove('selected'));
                chip.classList.add('selected');
                rating = chip.dataset.rating;
                status.textContent = '';
                updateState();
            });
        });

        submitButton.addEventListener('click', async () => {
            if (!rating) return;

            submitButton.disabled = true;
            status.textContent = 'Sending...';

            const payload = {
                email: null,
                category: 'council_response',
                message: `rating=${rating}; prompt="${promptText.slice(0, 140)}"; verdict="${finalAnswer.slice(0, 160)}"${noteField.value.trim() ? `; note=${noteField.value.trim()}` : ''}`,
            };

            try {
                const response = await fetch('/engagement/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    throw new Error('Request failed');
                }

                status.textContent = 'Thanks for the signal.';
                chips.forEach((chip) => (chip.disabled = true));
                if (noteField) {
                    noteField.disabled = true;
                }
            } catch (error) {
                console.error('Error submitting feedback:', error);
                status.textContent = 'Unable to send feedback right now.';
                submitButton.disabled = false;
            }
        });
    }

    sendButton.addEventListener('click', sendMessage);
    promptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    promptInput.addEventListener('input', () => {
        resizePrompt();
        updateSendState();
    });

    resizePrompt();
    updateSendState();

    // Mobile Menu Logic
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });

    connect(); // Connect to the WebSocket on page load
});