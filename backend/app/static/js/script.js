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

    // Mobile detection and tracking
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || window.innerWidth <= 768;
    const sessionStartTime = Date.now();
    let hasTrackedFirstPrompt = false;

    // Track mobile page view
    if (isMobile && typeof gtag === 'function') {
        gtag('event', 'mobile_page_view', {
            'event_category': 'mobile',
            'event_label': 'mobile_session_start',
            'screen_width': window.innerWidth,
            'user_logged_in': window.USER_IS_LOGGED_IN || false
        });
    }

    // Track session time on page unload
    window.addEventListener('beforeunload', () => {
        if (isMobile && typeof gtag === 'function') {
            const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);
            gtag('event', 'mobile_session_time', {
                'event_category': 'mobile',
                'event_label': 'session_duration',
                'value': sessionDuration
            });
        }
    });


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

    // Debounce timer and pending updates for smooth streaming
    let streamUpdateTimer = null;
    let pendingStreamUpdates = {};
    const STREAM_RENDER_DELAY = 100; // ms between renders for smoothness (ChatGPT uses ~100ms)

    function handleStreamChunk(data) {
        if (!currentShurahubMessage) return;
        const role = data.role || data.sender || 'stream';
        streamBuffers[role] = (streamBuffers[role] || '') + data.text;

        // Mark this role as needing an update
        pendingStreamUpdates[role] = {
            sender: data.sender,
            content: streamBuffers[role]
        };

        // Debounce the actual DOM update for smoother rendering
        if (!streamUpdateTimer) {
            streamUpdateTimer = setTimeout(() => {
                requestAnimationFrame(() => {
                    flushStreamUpdates();
                    streamUpdateTimer = null;
                });
            }, STREAM_RENDER_DELAY);
        }
    }

    function flushStreamUpdates() {
        if (!currentShurahubMessage) return;

        Object.entries(pendingStreamUpdates).forEach(([role, update]) => {
            const entry = getOrCreateDebateEntry(role, update.sender);
            if (!entry) return;

            const textTarget = entry.querySelector('.stream-text');
            if (textTarget) {
                // Add streaming class for cursor animation
                textTarget.classList.add('streaming');

                // Use a more efficient way to update - only if content changed
                const newHtml = marked.parse(update.content);
                if (textTarget.innerHTML !== newHtml) {
                    textTarget.innerHTML = newHtml;
                }
            }

            // Update final answer for synthesizer
            if (role === 'synthesizer') {
                const finalAnswer = currentShurahubMessage.querySelector('.final-answer');
                if (finalAnswer) {
                    // Add streaming class for cursor animation
                    finalAnswer.classList.add('streaming');

                    const newHtml = marked.parse(update.content);
                    if (finalAnswer.innerHTML !== newHtml) {
                        finalAnswer.innerHTML = newHtml;
                    }
                }
            }
        });

        // Clear pending updates
        pendingStreamUpdates = {};

        // Scroll after content update - use requestAnimationFrame for smooth timing
        requestAnimationFrame(scrollToBottom);
    }

    // Helper function to remove streaming indicators when done
    function removeStreamingIndicators() {
        if (!currentShurahubMessage) return;
        const streamingElements = currentShurahubMessage.querySelectorAll('.streaming');
        streamingElements.forEach(el => el.classList.remove('streaming'));
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
            setStreamingState(true);  // Enable streaming mode for instant scroll
            setStatus(data.mode === 'guest' ? 'Guest session: warming up the council...' : 'Council warming up...', true);
            scrollToBottom();  // Scroll to bottom for initial position
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
                const debateContainer = currentShurahubMessage.querySelector('.debate-container');

                if (viewDebateButton && debateContainer) {
                    viewDebateButton.style.display = 'inline-flex';
                    viewDebateButton.setAttribute('aria-expanded', 'false');
                    const label = viewDebateButton.querySelector('.label');
                    const chevron = viewDebateButton.querySelector('.chevron');
                    if (label) label.textContent = 'Open debate transcript';
                    if (chevron) chevron.style.transform = 'rotate(0deg)';
                    debateContainer.hidden = true;
                }
                const feedbackBlock = currentShurahubMessage.querySelector('.response-feedback');
                if (feedbackBlock) {
                    feedbackBlock.hidden = false;
                    wireResponseFeedback(feedbackBlock, answer, lastPrompt);
                }
                setWorkingState(false);
                setStatus('Ready for the next decision.');

                // Remove streaming cursor indicators and disable streaming mode
                removeStreamingIndicators();
                setStreamingState(false);  // Disable streaming mode, smooth scroll resumes

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

                // Track mobile debate completion
                if (isMobile && typeof gtag === 'function') {
                    gtag('event', 'mobile_debate_complete', {
                        'event_category': 'mobile',
                        'event_label': 'debate_finished',
                        'user_logged_in': window.USER_IS_LOGGED_IN || false
                    });
                }

                // Calculate and display debate weight meter
                updateDebateWeightMeter();

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

        // Track first prompt on mobile
        if (isMobile && !hasTrackedFirstPrompt && typeof gtag === 'function') {
            gtag('event', 'mobile_first_prompt', {
                'event_category': 'mobile',
                'event_label': 'first_question_submitted',
                'user_logged_in': window.USER_IS_LOGGED_IN || false
            });
            hasTrackedFirstPrompt = true;
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

    // Simple scroll - works on both desktop and mobile
    const scrollAnchor = document.getElementById('scroll-anchor');
    let isStreaming = false;
    const isMobileDevice = window.innerWidth <= 767;

    function scrollToBottom() {
        // Simple direct scroll to bottom - works on all devices
        if (chatMessages) {
            // Use instant scroll to prevent jitter
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function setStreamingState(streaming) {
        isStreaming = streaming;
        // When streaming starts, ensure we're at the bottom
        if (streaming) {
            scrollToBottom();
        }
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

            // Track mobile transcript views
            if (isMobile && isHidden && typeof gtag === 'function') {
                gtag('event', 'mobile_transcript_view', {
                    'event_category': 'mobile',
                    'event_label': 'debate_transcript_opened'
                });
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
                    <div class="history-item-content">
                        <div class="history-item-prompt">${escapeHtml(debate.user_prompt)}</div>
                        <div class="history-item-time">${timeAgo}</div>
                    </div>
                    <div class="history-item-actions">
                        <button class="history-action-btn" aria-label="More options" data-debate-id="${debate.debate_id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="12" cy="5" r="1"></circle>
                                <circle cx="12" cy="19" r="1"></circle>
                            </svg>
                        </button>
                        <div class="history-dropdown" data-debate-id="${debate.debate_id}">
                            <button class="history-dropdown-item delete-debate" data-debate-id="${debate.debate_id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                Delete
                            </button>
                            <button class="history-dropdown-item share-debate" data-debate-id="${debate.debate_id}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="18" cy="5" r="3"></circle>
                                    <circle cx="6" cy="12" r="3"></circle>
                                    <circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                </svg>
                                Share
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');


        // Attach click handlers
        historyList.querySelectorAll('.history-item').forEach(item => {
            // Click on the main item content to load debate
            const itemContent = item.querySelector('.history-item-content');
            if (itemContent) {
                itemContent.addEventListener('click', () => {
                    const debateId = item.dataset.debateId;
                    const debate = debates.find(d => d.debate_id === debateId);
                    if (debate) loadDebate(debate);
                });
            }

            // 3-dot menu toggle
            const actionBtn = item.querySelector('.history-action-btn');
            const dropdown = item.querySelector('.history-dropdown');
            if (actionBtn && dropdown) {
                actionBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent item click

                    // Close all other dropdowns
                    document.querySelectorAll('.history-dropdown').forEach(dd => {
                        if (dd !== dropdown) dd.classList.remove('active');
                    });

                    dropdown.classList.toggle('active');
                });
            }

            // Delete button
            const deleteBtn = item.querySelector('.delete-debate');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const debateId = deleteBtn.dataset.debateId;

                    if (!confirm('Are you sure you want to delete this debate?')) {
                        return;
                    }

                    try {
                        const response = await fetch(`/api/debates/${debateId}`, {
                            method: 'DELETE',
                            credentials: 'include'
                        });

                        if (response.ok) {
                            // Remove from debates array
                            debates = debates.filter(d => d.debate_id !== debateId);

                            // If the deleted debate was active, clear the chat
                            if (currentDebateId === debateId) {
                                clearChat();
                            }

                            // Refresh the history list
                            populateHistoryList();

                            // Close dropdown
                            dropdown.classList.remove('active');
                        } else {
                            alert('Failed to delete debate');
                        }
                    } catch (error) {
                        console.error('Error deleting debate:', error);
                        alert('Failed to delete debate');
                    }
                });
            }

            // Share button
            const shareBtn = item.querySelector('.share-debate');
            if (shareBtn) {
                shareBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const debateId = shareBtn.dataset.debateId;
                    const debate = debates.find(d => d.debate_id === debateId);

                    if (!debate) return;

                    // Create shareable text
                    const shareText = `Check out this debate: "${debate.user_prompt}"`;
                    const shareUrl = `${window.location.origin}/debate/${debateId}`;

                    // Try to use Web Share API if available
                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: 'Shurahub Debate',
                                text: shareText,
                                url: shareUrl
                            });
                            dropdown.classList.remove('active');
                        } catch (err) {
                            if (err.name !== 'AbortError') {
                                console.error('Error sharing:', err);
                            }
                        }
                    } else {
                        // Fallback: copy to clipboard
                        try {
                            await navigator.clipboard.writeText(shareUrl);

                            // Show feedback
                            const originalText = shareBtn.innerHTML;
                            shareBtn.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Copied!
                            `;

                            setTimeout(() => {
                                shareBtn.innerHTML = originalText;
                                dropdown.classList.remove('active');
                            }, 1500);
                        } catch (err) {
                            console.error('Error copying to clipboard:', err);
                            alert('Failed to copy link');
                        }
                    }
                });
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.history-item-actions')) {
                document.querySelectorAll('.history-dropdown').forEach(dd => {
                    dd.classList.remove('active');
                });
            }
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

    function updateDebateWeightMeter() {
        if (!currentShurahubMessage) return;

        const weightMeter = currentShurahubMessage.querySelector('.debate-weight-meter');
        if (!weightMeter) return;

        // Get debate content lengths (simple heuristic for now)
        const openerText = streamBuffers['opener'] || '';
        const critiquerText = streamBuffers['critiquer'] || '';

        // Calculate weights based on content length (you can make this more sophisticated)
        const openerLength = openerText.trim().length;
        const critiquerLength = critiquerText.trim().length;
        const total = openerLength + critiquerLength;

        if (total === 0) {
            // Default to 50/50 if no data
            weightMeter.style.display = 'none';
            return;
        }

        // Calculate percentages
        const openerPercent = Math.round((openerLength / total) * 100);
        const critiquerPercent = 100 - openerPercent;

        // Update the meter
        const openerBar = weightMeter.querySelector('.weight-opener');
        const critiquerBar = weightMeter.querySelector('.weight-critiquer');
        const insightText = weightMeter.querySelector('.weight-insight-text');

        if (openerBar && critiquerBar) {
            // Animate the bars
            setTimeout(() => {
                openerBar.style.width = `${openerPercent}%`;
                critiquerBar.style.width = `${critiquerPercent}%`;

                // Update percentages
                const openerPercentSpan = openerBar.querySelector('.weight-percent');
                const critiquerPercentSpan = critiquerBar.querySelector('.weight-percent');

                if (openerPercentSpan) openerPercentSpan.textContent = `${openerPercent}%`;
                if (critiquerPercentSpan) critiquerPercentSpan.textContent = `${critiquerPercent}%`;
            }, 100);
        }

        // Generate insight text
        if (insightText) {
            let insight = '';
            const diff = Math.abs(openerPercent - critiquerPercent);

            if (diff < 10) {
                insight = 'This was a balanced debate with both sides contributing equally.';
            } else if (openerPercent > critiquerPercent) {
                if (diff > 30) {
                    insight = `This decision strongly favored the Opener's arguments (${openerPercent}% weight).`;
                } else {
                    insight = `The Opener's perspective had slightly more influence on this decision.`;
                }
            } else {
                if (diff > 30) {
                    insight = `The Critiquer's counterarguments significantly shaped this decision (${critiquerPercent}% weight).`;
                } else {
                    insight = `The Critiquer's concerns were given slightly more consideration.`;
                }
            }

            insightText.textContent = insight;
        }

        // Show the meter with animation
        weightMeter.style.display = 'block';
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

    // Handle Quick Start Prompts - Event Delegation

    document.body.addEventListener('click', (event) => {
        const btn = event.target.closest('.ghost-button, .quick-start-prompt');
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
