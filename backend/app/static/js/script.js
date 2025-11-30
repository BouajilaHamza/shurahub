document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const exampleButton = document.getElementById('example-button');
    const statusBar = document.getElementById('chat-status');
    const chatInputShell = document.querySelector('.chat-input');
    const userMessageTemplate = document.getElementById('user-message-template');
    const shurahubMessageTemplate = document.getElementById('shurahub-message-template');

    let ws;
    let currentShurahubMessage;
    let typingIndicatorTimeout;
    let lastPrompt = '';
    let isAwaitingResponse = false;
    let streamBuffers = {};

    const examplePrompt = "Decide between Next.js and Astro for a 3k-page content site that updates daily.";

    function setStatus(message, isActive = false) {
        if (!statusBar) return;
        statusBar.textContent = message;
        statusBar.classList.toggle('active', isActive);
    }

    function setWorkingState(isWorking) {
        isAwaitingResponse = isWorking;
        if (chatInputShell) {
            chatInputShell.classList.toggle('busy', isWorking);
        }
        sendButton.setAttribute('aria-busy', isWorking ? 'true' : 'false');
        updateSendState();
    }

    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setStatus('Connected. Start a new debate.');
        };
        ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
        ws.onclose = () => {
            setStatus('Reconnecting to the council...', true);
            setWorkingState(false);
            setTimeout(connect, 2000);
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setStatus('Connection hiccup. Retrying...', true);
        };
    }

    const roleLabels = {
        opener: 'Opener',
        critiquer: 'Critiquer',
        synthesizer: 'Judge',
    };

    function getOrCreateDebateEntry(role, sender) {
        if (!currentShurahubMessage) return null;
        const debateContent = currentShurahubMessage.querySelector('.debate-content');
        if (!debateContent) return null;

        let entry = debateContent.querySelector(`.debate-entry[data-role="${role}"]`);
        if (!entry) {
            entry = document.createElement('div');
            entry.classList.add('debate-entry');
            entry.dataset.role = role;
            const heading = document.createElement('div');
            heading.className = 'debate-heading';
            const roleBadge = document.createElement('span');
            roleBadge.className = `role-badge ${role}`;
            roleBadge.textContent = roleLabels[role] || role;
            const modelChip = document.createElement('span');
            modelChip.className = 'model-chip';
            modelChip.textContent = sender || 'Model';
            heading.appendChild(roleBadge);
            heading.appendChild(modelChip);
            const body = document.createElement('div');
            body.className = 'stream-text';
            entry.appendChild(heading);
            entry.appendChild(body);
            debateContent.appendChild(entry);
        } else {
            const chip = entry.querySelector('.model-chip');
            if (chip && sender) {
                chip.textContent = sender;
            }
        }
        return entry;
    }

    function handleStreamChunk(data) {
        if (!currentShurahubMessage) return;
        const role = data.role || data.sender || 'stream';
        streamBuffers[role] = (streamBuffers[role] || '') + data.text;
        const entry = getOrCreateDebateEntry(role, data.sender);
        if (!entry) return;
        const textTarget = entry.querySelector('.stream-text');
        if (textTarget) {
            textTarget.innerHTML = marked.parse(streamBuffers[role]);
        }

        if (role === 'synthesizer') {
            const finalAnswer = currentShurahubMessage.querySelector('.final-answer');
            if (finalAnswer) {
                finalAnswer.innerHTML = marked.parse(streamBuffers[role]);
            }
        }
        scrollToBottom();
    }

    function handleServerMessage(data) {
        if (data.type === 'typing') {
            showTypingIndicator(data.sender);
            setStatus(`${data.sender} is drafting...`, true);
            return;
        }

        if (data.type === 'stream') {
            handleStreamChunk(data);
            return;
        }

        clearTimeout(typingIndicatorTimeout);
        removeTypingIndicator();

        if (data.sender === 'Shurahub' && data.text === 'Initiating collaborative debate...') {
            const messageElement = shurahubMessageTemplate.content.cloneNode(true);
            chatMessages.appendChild(messageElement);
            currentShurahubMessage = chatMessages.lastElementChild;
            streamBuffers = {};
            setWorkingState(true);
            setStatus(data.mode === 'guest' ? 'Guest session: warming up the council...' : 'Council warming up...', true);
            scrollToBottom();
            return;
        }

        if (data.sender === 'Shurahub' && data.text.toLowerCase().includes('error')) {
            setWorkingState(false);
            setStatus('We hit a snag. Please try again.');
        }

        if (currentShurahubMessage) {
            const debateContent = currentShurahubMessage.querySelector('.debate-content');
            const finalAnswer = currentShurahubMessage.querySelector('.final-answer');

            if (data.text.startsWith('**Final Verdict:**')) {
                const answer = data.text.replace('**Final Verdict:**', '').trim();
                finalAnswer.innerHTML = marked.parse(answer || streamBuffers['synthesizer'] || '');
                const viewDebateButton = currentShurahubMessage.querySelector('.view-debate-button');
                if (viewDebateButton) {
                    viewDebateButton.style.display = 'inline-flex';
                    viewDebateButton.setAttribute('aria-expanded', 'false');
                    const label = viewDebateButton.querySelector('.label');
                    const chevron = viewDebateButton.querySelector('.chevron');
                    if (label) label.textContent = 'Open debate transcript';
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                    const debateContainer = currentShurahubMessage.querySelector('.debate-container');
                    if (debateContainer) debateContainer.hidden = true;
                }
                const feedbackBlock = currentShurahubMessage.querySelector('.response-feedback');
                if (feedbackBlock) {
                    feedbackBlock.hidden = false;
                    wireResponseFeedback(feedbackBlock, answer, lastPrompt);
                }
                setWorkingState(false);
                setStatus('Ready for the next decision.');

                // --- GA4 Key Events Implementation ---

                // 1. initial_analysis_gen
                // Fired when a user successfully completes the Quick-Start flow and generates their very first Decision Analysis.
                const hasGenerated = localStorage.getItem('shurahub_first_analysis_generated');
                if (!hasGenerated) {
                    if (typeof gtag === 'function') {
                        gtag('event', 'initial_analysis_gen', {
                            'event_category': 'onboarding',
                            'event_label': 'first_groq_run'
                        });
                    }
                    localStorage.setItem('shurahub_first_analysis_generated', 'true');
                }

                // 2. project_saved (for logged-in users) & 3. register_to_save (setup for guests)
                if (window.USER_IS_LOGGED_IN) {
                    // For logged-in users, the project is auto-saved by the backend.
                    if (typeof gtag === 'function') {
                        gtag('event', 'project_saved', {
                            'event_category': 'engagement',
                            'event_label': 'auto_save_logged_in'
                        });
                    }
                } else {
                    // For guests, show "Save Analysis" button to trigger registration
                    const debateActions = currentShurahubMessage.querySelector('.debate-actions');
                    if (debateActions && !debateActions.querySelector('.save-analysis-btn')) {
                        const saveBtn = document.createElement('button');
                        saveBtn.className = 'view-debate-button save-analysis-btn';
                        saveBtn.innerHTML = '<span class="label">Save Analysis</span>';
                        saveBtn.style.marginLeft = '0.5rem';
                        saveBtn.style.display = 'inline-flex'; // Ensure it's visible

                        saveBtn.addEventListener('click', () => {
                            const modal = document.getElementById('register-save-modal');
                            if (modal) {
                                modal.classList.add('active');
                                // We don't track here, we track on the "Register Now" click in the modal
                            }
                        });

                        debateActions.appendChild(saveBtn);
                    }
                }
            } else {
                const role = data.role || 'update';
                const entry = getOrCreateDebateEntry(role, data.sender);
                if (entry) {
                    const textTarget = entry.querySelector('.stream-text');
                    if (textTarget) {
                        textTarget.innerHTML = marked.parse(data.text);
                    }
                } else if (debateContent) {
                    const debateEntry = document.createElement('div');
                    debateEntry.classList.add('debate-entry');
                    const sender = `<b>${data.sender}:</b>`;
                    const response = marked.parse(data.text);
                    debateEntry.innerHTML = `${sender}<br>${response}`;
                    debateContent.appendChild(debateEntry);
                }
            }
        }
        scrollToBottom();
    }

    function sendMessage() {
        const text = promptInput.value.trim();
        if (!text || isAwaitingResponse) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setStatus('Connecting to the council...', true);
            return;
        }

        ws.send(JSON.stringify({ text }));
        lastPrompt = text;
        streamBuffers = {};
        appendUserMessage(text);
        promptInput.value = '';
        resizePrompt();
        setWorkingState(true);
        setStatus('Council drafting your verdict...', true);
        scrollToBottom();
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
        const button = event.target.closest('.view-debate-button');
        if (button) {
            const debateContainer = button.closest('.message-content').querySelector('.debate-container');
            const isHidden = debateContainer.hasAttribute('hidden');
            debateContainer.hidden = !isHidden;
            button.setAttribute('aria-expanded', String(!isHidden));
            const label = button.querySelector('.label');
            const chevron = button.querySelector('.chevron');
            if (label) {
                label.textContent = isHidden ? 'Hide debate transcript' : 'Open debate transcript';
            }
            if (chevron) {
                chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        }
    });

    function resizePrompt() {
        promptInput.style.height = 'auto';
        promptInput.style.height = `${Math.min(promptInput.scrollHeight, 160)}px`;
    }

    function updateSendState() {
        const hasText = Boolean(promptInput.value.trim());
        sendButton.disabled = !hasText || isAwaitingResponse;
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

    if (exampleButton) {
        exampleButton.addEventListener('click', () => {
            promptInput.value = examplePrompt;
            resizePrompt();
            updateSendState();
            sendMessage();
        });
    }

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

    // Redirect any external links to the chat to keep guests inside the product
    document.querySelectorAll('a[href^="http"]').forEach((link) => {
        const url = new URL(link.href);
        if (url.host && url.host !== window.location.host) {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                window.location.href = '/chat';
            });
        }
    });

    connect(); // Connect to the WebSocket on page load

    // Register to Save Modal Logic
    const registerSaveModal = document.getElementById('register-save-modal');
    const registerModalClose = document.getElementById('register-modal-close');
    const btnRegisterSave = document.getElementById('btn-register-save');

    if (registerSaveModal) {
        if (registerModalClose) {
            registerModalClose.addEventListener('click', () => {
                registerSaveModal.classList.remove('active');
            });
        }

        // Close on click outside
        registerSaveModal.addEventListener('click', (e) => {
            if (e.target === registerSaveModal) {
                registerSaveModal.classList.remove('active');
            }
        });

        if (btnRegisterSave) {
            btnRegisterSave.addEventListener('click', () => {
                // Event 2: register_to_save
                if (typeof gtag === 'function') {
                    gtag('event', 'register_to_save', {
                        'event_category': 'conversion_prompt',
                        'event_label': 'guest_conversion_attempt'
                    });
                }
            });
        }
    }

    // Handle Ghost Buttons (Suggested Questions)
    // Handle Ghost Buttons (Suggested Questions) - Event Delegation
    document.body.addEventListener('click', (event) => {
        const btn = event.target.closest('.ghost-button');
        if (btn) {
            const prompt = btn.dataset.prompt;
            if (prompt) {
                promptInput.value = prompt;
                resizePrompt();
                updateSendState();
                sendMessage();
            }
        }
    });
});
