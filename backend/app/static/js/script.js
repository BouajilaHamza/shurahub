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
    let currentDebateId = null; // Track which debate is currently loaded
    let debates = []; // Store fetched debates

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
            updateChatHeight();
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

                        setWorkingState(false);

                        updateChatHeight();
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
        updateChatHeight();
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
        updateChatHeight();
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

    function updateChatHeight() {
        const header = document.querySelector('.chat-header');
        const inputContainer = document.querySelector('.chat-input-container');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        const inputHeight = inputContainer ? inputContainer.getBoundingClientRect().height : 0;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const margin = 16; // small breathing room
        const chatHeight = Math.max(120, Math.floor(viewportHeight - headerHeight - inputHeight - margin));
        if (chatMessages) {
            chatMessages.style.height = `${chatHeight}px`;
            chatMessages.style.paddingBottom = `${inputHeight + 4}px`;
            chatMessages.style.scrollPadding = `0 ${inputHeight + 4}px`;
            chatMessages.style.scrollPaddingBottom = `${inputHeight + 4}px`;
        }
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
        updateChatHeight();
    });

    // Ensure the chat scrolls when input is focused on mobile so the input isn't hidden
    promptInput.addEventListener('focus', () => {
        setTimeout(() => {
            scrollToBottom();
            // Also adjust the chat input vertical position if the keyboard is visible.
            adjustInputForKeyboard();
        }, 250);
    });
    promptInput.addEventListener('blur', () => {
        // Restore default bottom offset after blur
        const inputContainer = document.querySelector('.chat-input-container');
        if (inputContainer) {
            inputContainer.style.bottom = '';
        }
    });

    function adjustInputForKeyboard() {
        const inputContainer = document.querySelector('.chat-input-container');
        if (!inputContainer) return;
        // Determine base offset from CSS variable to keep spec-driven spacing
        const computedStyles = getComputedStyle(inputContainer);
        const baseOffsetRaw = computedStyles.getPropertyValue('--chat-input-bottom-offset');
        const baseOffset = baseOffsetRaw ? parseInt(baseOffsetRaw, 10) || 8 : 8;
        if (window.visualViewport) {
            const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height);
            // Avoid large jumps — we'll raise the input just a little when keyboard opens
            // This keeps the input close to the bottom but prevents it from being hidden
            const extra = keyboardHeight > 0 ? Math.min(24, Math.max(4, Math.round(keyboardHeight * 0.05))) : 0;
            inputContainer.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${baseOffset + extra}px)`;
        } else {
            inputContainer.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${baseOffset}px)`;
        }
    }

    // Listen for viewport changes (keyboard show/hide) in supported browsers
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            // Only adjust if the prompt is focused (keyboard likely visible)
            adjustInputForKeyboard();
            updateChatHeight();
        });
    }

    window.addEventListener('resize', () => {
        updateChatHeight();
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
            const opened = sidebar.classList.toggle('open');
            overlay.classList.toggle('active', opened);
            document.body.classList.toggle('sidebar-open', opened);
            mobileMenuBtn.setAttribute('aria-expanded', String(opened));
        });
    }

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.classList.remove('sidebar-open');
        if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
    });

    // Sidebar close behavior handled by overlay, nav item clicks, or hamburger toggle

    // Close sidebar on Escape key for accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
            if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Close sidebar when a nav item is clicked (mobile behavior)
    document.querySelectorAll('.sidebar .nav-item, .sidebar .sidebar-footer a').forEach((navItem) => {
        navItem.addEventListener('click', () => {
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                document.body.classList.remove('sidebar-open');
                if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
            }
        });
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

    // --- History Management ---
    async function fetchDebates() {
        const historyList = document.getElementById('history-list');

        if (!window.USER_IS_LOGGED_IN) {
            // User is not logged in, show helpful message
            if (historyList) {
                historyList.innerHTML = '<div class="history-empty">Log in to see your debates</div>';
            }
            return;
        }

        console.log('[History] Fetching debates...');

        try {
            const response = await fetch('/api/debates', {
                credentials: 'include' // Send cookies for authentication
            });

            console.log('[History] Response status:', response.status);

            if (!response.ok) {
                console.error('[History] Response not OK:', response.status, response.statusText);
                throw new Error('Failed to fetch debates');
            }

            debates = await response.json();
            console.log('[History] Fetched debates:', debates.length, 'debates');

            populateHistoryList();

            // Auto-load the most recent debate if available
            if (debates.length > 0 && !currentDebateId) {
                console.log('[History] Auto-loading most recent debate');
                loadDebate(debates[0]);
            }
        } catch (error) {
            console.error('[History] Error fetching debates:', error);
            if (historyList) {
                historyList.innerHTML = '<div class="history-empty">Failed to load debates</div>';
            }
        }
    }

    function populateHistoryList() {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;

        if (debates.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No debates yet</div>';
            return;
        }

        historyList.innerHTML = debates.slice(0, 10).map(debate => {
            const date = new Date(debate.timestamp);
            const timeAgo = getTimeAgo(date);
            const isActive = currentDebateId === debate.debate_id;

            return `
                <div class="history-item ${isActive ? 'active' : ''}" data-debate-id="${debate.debate_id}">
                    <div class="history-item-prompt">${escapeHtml(debate.user_prompt)}</div>
                    <div class="history-item-time">${timeAgo}</div>
                </div>
            `;
        }).join('');

        // Attach click handlers
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const debateId = item.dataset.debateId;
                const debate = debates.find(d => d.debate_id === debateId);
                if (debate) loadDebate(debate);
            });
        });
    }

    function loadDebate(debate) {
        // Clear current chat
        chatMessages.innerHTML = '';
        currentShurahubMessage = null;
        streamBuffers = {};
        currentDebateId = debate.debate_id;

        // Add user message
        appendUserMessage(debate.user_prompt);

        // Create Shurahub message with debate content
        const messageElement = shurahubMessageTemplate.content.cloneNode(true);
        chatMessages.appendChild(messageElement);
        currentShurahubMessage = chatMessages.lastElementChild;

        const debateContent = currentShurahubMessage.querySelector('.debate-content');

        // Add opener
        if (debate.opener) {
            const openerEntry = createDebateEntry('opener', 'Opener', debate.opener);
            debateContent.appendChild(openerEntry);
        }

        // Add critiquer
        if (debate.critiquer) {
            const critiquerEntry = createDebateEntry('critiquer', 'Critiquer', debate.critiquer);
            debateContent.appendChild(critiquerEntry);
        }

        // Add synthesizer to final answer
        if (debate.synthesizer) {
            const finalAnswer = currentShurahubMessage.querySelector('.final-answer');
            if (finalAnswer) {
                const synthStr = (typeof debate.synthesizer === 'string')
                    ? debate.synthesizer
                    : (debate.synthesizer?.response || JSON.stringify(debate.synthesizer || {}));
                finalAnswer.innerHTML = marked.parse(synthStr);
            }
            const synthesizerEntry = createDebateEntry('synthesizer', 'Judge', debate.synthesizer);
            debateContent.appendChild(synthesizerEntry);
        }

        // Show debate transcript button and feedback
        const viewDebateButton = currentShurahubMessage.querySelector('.view-debate-button');
        if (viewDebateButton) {
            viewDebateButton.style.display = 'inline-flex';
        }
        const feedbackBlock = currentShurahubMessage.querySelector('.response-feedback');
        if (feedbackBlock) {
            feedbackBlock.hidden = false;
            const finalAnsText = (typeof debate.synthesizer === 'string') ? debate.synthesizer : (debate.synthesizer?.response || '');
            wireResponseFeedback(feedbackBlock, finalAnsText, debate.user_prompt);
        }

        // Update history list active state
        populateHistoryList();
        updateChatHeight();
        scrollToBottom();
    }

    function createDebateEntry(role, label, content) {
        const entry = document.createElement('div');
        entry.classList.add('debate-entry');
        entry.dataset.role = role;

        const heading = document.createElement('div');
        heading.className = 'debate-heading';

        const roleBadge = document.createElement('span');
        roleBadge.className = `role-badge ${role}`;
        roleBadge.textContent = label;

        const modelChip = document.createElement('span');
        modelChip.className = 'model-chip';
        // content can be a string or an object with shape {model, response}
        if (content && typeof content === 'object') {
            modelChip.textContent = content.model || 'Model';
        } else {
            modelChip.textContent = 'Model';
        }

        heading.appendChild(roleBadge);
        heading.appendChild(modelChip);

        const body = document.createElement('div');
        body.className = 'stream-text';

        // Ensure content is a string before parsing and handle object shapes (model, response)
        let contentStr = '';
        if (typeof content === 'string') {
            contentStr = content;
        } else if (content && typeof content === 'object') {
            contentStr = content.response || JSON.stringify(content);
        } else {
            contentStr = '';
        }
        body.innerHTML = marked.parse(contentStr);

        entry.appendChild(heading);
        entry.appendChild(body);

        return entry;
    }

    function clearChat() {
        chatMessages.innerHTML = '';
        currentShurahubMessage = null;
        streamBuffers = {};
        currentDebateId = null;
        promptInput.value = '';
        resizePrompt();
        updateSendState();
        populateHistoryList();
        setStatus('Ready for a new debate.');
    }

    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval !== 1 ? 's' : ''} ago`;
            }
        }

        return 'Just now';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    connect(); // Connect to the WebSocket on page load
    updateChatHeight();

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

    // New Debate button
    const newDebateBtn = document.getElementById('new-debate-btn');
    if (newDebateBtn) {
        newDebateBtn.addEventListener('click', () => {
            clearChat();
        });
    }

    // Header New Debate button (mobile). Wire to clearChat() for quick access on phones.
    const headerNewBtn = document.getElementById('header-new-debate-btn');
    if (headerNewBtn) {
        headerNewBtn.addEventListener('click', () => {
            clearChat();
            // If sidebar was open on mobile, close it
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    }

    // Fetch debates on page load (for logged-in users)
    if (window.USER_IS_LOGGED_IN) {
        fetchDebates();
    }
});
