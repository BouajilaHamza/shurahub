document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const emptyPromptInput = document.getElementById('empty-prompt-input');
    const chatPromptInput = document.getElementById('chat-prompt-input');
    const promptInput = chatPromptInput || document.getElementById('prompt-input'); // Fallback
    const emptySendButton = document.getElementById('empty-send-button');
    const chatSendButton = document.getElementById('chat-send-button');
    const sendButton = chatSendButton || document.getElementById('send-button'); // Fallback
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

    // Streaming variables (content is buffered, not rendered live)

    function parseArgument(text) {
        const lines = text.split('\n');
        const argument = {
            claim: '',
            explanation: '',
            evidence: '',
            counterargument: '',
            stance: 'Neutral',
            rawText: text
        };

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().startsWith('claim:')) argument.claim = trimmed.replace(/claim:/i, '').trim();
            else if (trimmed.toLowerCase().startsWith('explanation:')) argument.explanation = trimmed.replace(/explanation:/i, '').trim();
            else if (trimmed.toLowerCase().startsWith('evidence:')) argument.evidence = trimmed.replace(/evidence:/i, '').trim();
            else if (trimmed.toLowerCase().startsWith('counterargument:')) argument.counterargument = trimmed.replace(/counterargument:/i, '').trim();
            else if (trimmed.toLowerCase().startsWith('stance:')) argument.stance = trimmed.replace(/stance:/i, '').trim();
        });

        // If no structured claim found, use first non-empty line or raw text preview
        if (!argument.claim && text.trim()) {
            const firstLine = text.split('\n').find(l => l.trim());
            argument.claim = firstLine ? firstLine.substring(0, 100) + (firstLine.length > 100 ? '...' : '') : 'Drafting...';
        }

        return argument;
    }

    function parseSynthesis(text) {
        const sections = {
            summary: [],
            consensus: '',
            breakdown: '',
            citations: '',
            rawText: text
        };

        const lines = text.split('\n');
        let currentSection = '';

        lines.forEach(line => {
            const lowerLine = line.toLowerCase().trim();
            if (lowerLine.startsWith('summary:')) { currentSection = 'summary'; }
            else if (lowerLine.startsWith('consensus:')) {
                sections.consensus = line.replace(/consensus:/i, '').trim();
                currentSection = 'consensus';
            }
            else if (lowerLine.startsWith('breakdown:') || lowerLine.startsWith('decision breakdown:')) {
                sections.breakdown = line.replace(/(?:decision )?breakdown:/i, '').trim();
                currentSection = 'breakdown';
            }
            else if (lowerLine.startsWith('citations:')) { currentSection = 'citations'; }
            else {
                const trimmed = line.trim();
                if (currentSection === 'summary' && trimmed.startsWith('-')) {
                    sections.summary.push(trimmed.substring(1).trim());
                } else if (currentSection === 'breakdown' && trimmed) {
                    sections.breakdown += (sections.breakdown ? ' ' : '') + trimmed;
                } else if (currentSection === 'citations' && trimmed) {
                    sections.citations += line + '\n';
                } else if (currentSection === 'consensus' && trimmed && !sections.consensus) {
                    sections.consensus = trimmed;
                }
            }
        });

        // Fallback: if no consensus found, use the first substantial line
        if (!sections.consensus && text.trim().length > 20) {
            const firstGoodLine = lines.find(l => l.trim().length > 30 && !l.trim().startsWith('-'));
            if (firstGoodLine) sections.consensus = firstGoodLine.trim();
        }

        return sections;
    }

    function getOrCreateArgumentNode(role, sender) {
        if (!currentShurahubMessage) return null;
        const nodesContainer = currentShurahubMessage.querySelector('.debate-nodes-container');
        if (!nodesContainer) return null;

        let node = nodesContainer.querySelector(`.debate-node[data-role="${role}"]`);
        if (!node) {
            const slot = nodesContainer.querySelector(`.node-slot[data-role="${role}"]`);
            if (!slot) return null;

            const template = document.getElementById('argument-card-template');
            if (!template) return null;
            const clone = template.content.cloneNode(true);
            node = clone.querySelector('.debate-node');
            node.dataset.role = role;

            // Set model name
            const modelName = node.querySelector('.model-name');
            if (modelName) modelName.textContent = sender || 'Model';

            // Indentation for critiquer
            if (role === 'critiquer') {
                const elbow = node.querySelector('.connector-elbow');
                if (elbow) elbow.classList.remove('hidden');
            }

            slot.appendChild(clone);
            node = slot.querySelector(`.debate-node[data-role="${role}"]`);

            // Wire up expand button
            const expandBtn = node.querySelector('.expand-argument-btn');
            const details = node.querySelector('.extended-details');
            if (expandBtn && details) {
                expandBtn.addEventListener('click', () => {
                    const isHidden = details.classList.contains('hidden');
                    details.classList.toggle('hidden', !isHidden);
                    expandBtn.querySelector('.btn-label').textContent = isHidden ? 'Collapse' : 'Expand';
                    expandBtn.querySelector('.material-symbols-outlined').textContent = isHidden ? 'expand_less' : 'expand_more';

                    if (isHidden && typeof gtag === 'function') {
                        gtag('event', 'debate_tree_expand', {
                            'event_category': 'interaction',
                            'role': role
                        });
                    }
                });
            }
        }
        return node;
    }

    function handleStreamChunk(data) {
        if (!currentShurahubMessage) return;
        const role = data.role || data.sender || 'stream';

        // Just buffer the content - don't render during streaming
        streamBuffers[role] = (streamBuffers[role] || '') + data.text;

        // Show a simple "thinking" indicator for this role if not already visible
        const node = getOrCreateArgumentNode(role, data.sender);
        if (node) {
            const claimEl = node.querySelector('.claim-text');
            const explEl = node.querySelector('.explanation-text');
            if (claimEl && !claimEl.dataset.loaded) {
                claimEl.innerHTML = '<span class="animate-pulse">Thinking...</span>';
            }
            if (explEl && !explEl.dataset.loaded) {
                explEl.innerHTML = '<span class="text-slate-400 dark:text-slate-500 animate-pulse">Analyzing your question...</span>';
            }
        }
    }

    // flushStreamUpdates removed - we now render complete content only

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

            // Set the question title
            const titleEl = currentShurahubMessage.querySelector('.debate-title-text');
            if (titleEl) titleEl.textContent = lastPrompt;

            streamBuffers = {};
            setWorkingState(true);
            setStreamingState(true);
            setStatus(data.mode === 'guest' ? 'Guest session: warming up the council...' : 'Council warming up...', true);
            scrollToBottom();
            return;
        }

        if (data.sender === 'Shurahub' && data.text.toLowerCase().includes('error')) {
            setWorkingState(false);
            setStatus('We hit a snag. Please try again.');
        }

        if (currentShurahubMessage) {
            // Handle complete message from opener/critiquer (non-streaming final message)
            if (data.role === 'opener' || data.role === 'critiquer') {
                renderCompleteArgument(data.role, data.sender, data.text);
            }

            // Check for debate completion (synthesizer)
            if (data.text.startsWith('**Final Verdict:**') || (data.role === 'synthesizer' && data.text)) {
                // Render synthesis
                renderCompleteSynthesis(data.sender, data.text);

                // Show the feedback trigger button
                const feedbackTrigger = currentShurahubMessage.querySelector('.feedback-trigger');
                if (feedbackTrigger) {
                    feedbackTrigger.hidden = false;
                }

                // Show follow-up suggestions
                const followUpSection = currentShurahubMessage.querySelector('.follow-up-suggestions');
                if (followUpSection) {
                    followUpSection.hidden = false;
                }

                // Store context for feedback modal
                window.currentFeedbackContext = {
                    verdict: data.text,
                    prompt: lastPrompt
                };

                // Show feedback modal after user has time to read the result
                setTimeout(() => {
                    if (typeof showFeedbackModal === 'function') {
                        showFeedbackModal();
                    }
                }, 30000); // 30 seconds - gives ample time to read

                setWorkingState(false);
                setStatus('Ready for the next decision.');
                removeStreamingIndicators();
                setStreamingState(false);
                updateChatHeight();

                // Scroll to show the complete result
                scrollToBottom();

                // Track Golden Answer View
                if (typeof gtag === 'function') {
                    gtag('event', 'golden_answer_view', {
                        'event_category': 'engagement',
                        'prompt_title': lastPrompt
                    });
                }

                // First analysis tracking
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
            }
        }
    }

    // Render a complete argument card (after streaming is done)
    function renderCompleteArgument(role, sender, content) {
        if (!currentShurahubMessage) return;

        const node = getOrCreateArgumentNode(role, sender);
        if (!node) return;

        const arg = parseArgument(content);

        const claimEl = node.querySelector('.claim-text');
        const explEl = node.querySelector('.explanation-text');
        const evidenceEl = node.querySelector('.evidence-text');
        const counterEl = node.querySelector('.counter-text');
        const stanceEl = node.querySelector('.stance-label');
        const indicatorEl = node.querySelector('.stance-indicator');
        const dotEl = node.querySelector('.connector-dot');

        // Mark as loaded
        if (claimEl) {
            claimEl.textContent = arg.claim || 'Analysis complete';
            claimEl.dataset.loaded = 'true';
        }
        if (explEl) {
            explEl.innerHTML = marked.parse(arg.explanation || content.substring(0, 500));
            explEl.dataset.loaded = 'true';
        }
        if (evidenceEl) evidenceEl.textContent = arg.evidence;
        if (counterEl) {
            counterEl.textContent = arg.counterargument;
            const counterSection = node.querySelector('.counter-section');
            if (counterSection) counterSection.classList.toggle('hidden', !arg.counterargument);
        }

        if (stanceEl) {
            stanceEl.textContent = `Stance: ${arg.stance}`;
            let color = 'bg-primary';
            let textColor = 'text-primary';
            if (arg.stance.toLowerCase().includes('con') || arg.stance.toLowerCase().includes('against')) {
                color = 'bg-status-con'; textColor = 'text-status-con';
            } else if (arg.stance.toLowerCase().includes('pro') || arg.stance.toLowerCase().includes('for')) {
                color = 'bg-primary'; textColor = 'text-primary';
            } else if (arg.stance.toLowerCase().includes('neutral')) {
                color = 'bg-status-neutral'; textColor = 'text-status-neutral';
            }

            if (indicatorEl) indicatorEl.className = `stance-indicator absolute left-0 top-0 bottom-0 w-1 ${color}`;
            if (dotEl) dotEl.className = `connector-dot absolute left-[11px] top-6 w-[18px] h-[18px] rounded-full border-[3px] border-white dark:border-background-dark shadow-sm z-10 ${color}`;
            stanceEl.className = `stance-label text-[10px] font-bold uppercase tracking-wider ${textColor}`;
        }
    }

    // Render complete synthesis
    function renderCompleteSynthesis(sender, content) {
        if (!currentShurahubMessage) return;

        const sections = parseSynthesis(content);
        const summaryBullets = currentShurahubMessage.querySelector('.summary-bullets');
        const confidencePill = currentShurahubMessage.querySelector('.confidence-pill');

        // Update Golden Answer Summary
        if (summaryBullets && sections.summary.length > 0) {
            summaryBullets.innerHTML = sections.summary.map(bullet => `
                <div class="flex gap-2 items-start">
                    <span class="material-symbols-outlined text-primary text-base mt-0.5 shrink-0">arrow_right_alt</span>
                    <p class="text-sm leading-snug text-slate-600 dark:text-slate-300 font-medium">${bullet}</p>
                </div>
            `).join('');
        }

        if (confidencePill) {
            confidencePill.textContent = 'HIGH CONFIDENCE';
            confidencePill.classList.remove('animate-pulse');
        }

        // Render Synthesis node
        const synthNode = getOrCreateArgumentNode('synthesizer', sender);
        if (synthNode) {
            const claimEl = synthNode.querySelector('.claim-text');
            const explEl = synthNode.querySelector('.explanation-text');
            const stanceEl = synthNode.querySelector('.stance-label');
            const indicatorEl = synthNode.querySelector('.stance-indicator');
            const dotEl = synthNode.querySelector('.connector-dot');

            if (claimEl) {
                claimEl.textContent = sections.consensus || 'Verdict delivered';
                claimEl.dataset.loaded = 'true';
            }
            if (explEl) {
                explEl.innerHTML = marked.parse(sections.breakdown || content.substring(0, 500));
                explEl.dataset.loaded = 'true';
            }
            if (stanceEl) {
                stanceEl.textContent = 'Synthesis';
                stanceEl.className = 'stance-label text-[10px] font-bold uppercase tracking-wider text-status-neutral';
            }
            if (indicatorEl) indicatorEl.className = 'stance-indicator absolute left-0 top-0 bottom-0 w-1 bg-status-neutral';
            if (dotEl) dotEl.className = 'connector-dot absolute left-[11px] top-6 w-[18px] h-[18px] rounded-full border-[3px] border-white dark:border-background-dark shadow-sm z-10 bg-status-neutral';
        }
    }

    function sendMessage() {
        const activeInput = (document.getElementById('empty-state').style.display !== 'none')
            ? emptyPromptInput
            : chatPromptInput;

        const text = (activeInput ? activeInput.value : promptInput.value).trim();
        if (!text || isAwaitingResponse) return;

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setStatus('Connecting to the council...', true);
            return;
        }

        // Hide empty state on send and show chat input container
        const emptyState = document.getElementById('empty-state');
        const chatInputContainer = document.getElementById('chat-input-container');
        if (emptyState) emptyState.style.display = 'none';
        if (chatInputContainer) chatInputContainer.style.display = 'block';

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

        if (activeInput) activeInput.value = '';
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
        // Smooth scroll to bottom for polished UX
        if (chatMessages) {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
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

    if (emptySendButton) emptySendButton.addEventListener('click', sendMessage);
    if (chatSendButton) chatSendButton.addEventListener('click', sendMessage);

    [emptyPromptInput, chatPromptInput].forEach(input => {
        if (!input) return;
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
        input.addEventListener('input', () => {
            const count = input.value.length;
            const counter = input.parentElement.querySelector('.char-counter');
            if (counter) counter.textContent = `${count}/200`;

            resizePrompt();
            updateSendState();
            updateChatHeight();
        });
        input.addEventListener('focus', () => {
            setTimeout(() => {
                scrollToBottom();
                adjustInputForKeyboard();
            }, 250);
        });
        input.addEventListener('blur', () => {
            const inputContainer = document.getElementById('chat-input-container');
            if (inputContainer) {
                inputContainer.style.bottom = '';
            }
        });
    });

    // Follow-up button click handler (event delegation)
    document.body.addEventListener('click', (e) => {
        const followUpBtn = e.target.closest('.follow-up-btn');
        if (followUpBtn) {
            const followUpText = followUpBtn.dataset.followup;
            if (followUpText) {
                // Set the follow-up as the new prompt
                const activeInput = chatPromptInput || emptyPromptInput;
                if (activeInput) {
                    activeInput.value = followUpText;
                    resizePrompt();
                    updateSendState();
                    sendMessage();
                }
            }
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
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const opened = sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active', opened);
            document.body.classList.toggle('sidebar-open', opened);
            mobileMenuBtn.setAttribute('aria-expanded', String(opened));
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
        });
    }

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
        lastPrompt = debate.user_prompt;

        // Create Shurahub message with debate content
        const messageElement = shurahubMessageTemplate.content.cloneNode(true);
        chatMessages.appendChild(messageElement);
        currentShurahubMessage = chatMessages.lastElementChild;

        // Set the question title
        const titleEl = currentShurahubMessage.querySelector('.debate-title-text');
        if (titleEl) titleEl.textContent = debate.user_prompt;

        // Populate Opener
        if (debate.opener_response) {
            const node = getOrCreateArgumentNode('opener', debate.opener_model);
            if (node) {
                const arg = parseArgument(debate.opener_response);
                updateArgumentNode(node, arg);
            }
        }

        // Populate Critiquer
        if (debate.critiquer_response) {
            const node = getOrCreateArgumentNode('critiquer', debate.critiquer_model);
            if (node) {
                const arg = parseArgument(debate.critiquer_response);
                updateArgumentNode(node, arg);
            }
        }

        // Populate Synthesizer
        if (debate.synthesizer_response) {
            const sections = parseSynthesis(debate.synthesizer_response);
            const summaryBullets = currentShurahubMessage.querySelector('.summary-bullets');
            if (summaryBullets && sections.summary.length > 0) {
                summaryBullets.innerHTML = sections.summary.map(bullet => `
                    <div class="flex gap-2 items-start">
                        <span class="material-symbols-outlined text-primary text-base mt-0.5 shrink-0">arrow_right_alt</span>
                        <p class="text-sm leading-snug text-slate-600 dark:text-slate-300 font-medium">${bullet}</p>
                    </div>
                `).join('');
            }

            const synthNode = getOrCreateArgumentNode('synthesizer', debate.synthesizer_model);
            if (synthNode) {
                synthNode.querySelector('.claim-text').textContent = sections.consensus || 'Synthesis Result';
                synthNode.querySelector('.explanation-text').textContent = sections.breakdown;
            }
        }

        const feedbackBlock = currentShurahubMessage.querySelector('.response-feedback');
        if (feedbackBlock) {
            feedbackBlock.hidden = false;
            wireResponseFeedback(feedbackBlock, debate.synthesizer_response, debate.user_prompt);
        }

        populateHistoryList();
        updateChatHeight();
        scrollToBottom();
    }

    function updateArgumentNode(node, arg) {
        const claimEl = node.querySelector('.claim-text');
        const explEl = node.querySelector('.explanation-text');
        const evidenceEl = node.querySelector('.evidence-text');
        const counterEl = node.querySelector('.counter-text');
        const stanceEl = node.querySelector('.stance-label');
        const indicatorEl = node.querySelector('.stance-indicator');
        const dotEl = node.querySelector('.connector-dot');

        if (claimEl) claimEl.textContent = arg.claim;
        if (explEl) explEl.textContent = arg.explanation;
        if (evidenceEl) evidenceEl.textContent = arg.evidence;
        if (counterEl) {
            counterEl.textContent = arg.counterargument;
            const counterSection = node.querySelector('.counter-section');
            if (counterSection) counterSection.classList.toggle('hidden', !arg.counterargument);
        }

        if (stanceEl) {
            stanceEl.textContent = `Stance: ${arg.stance}`;
            let color = 'bg-primary';
            let textColor = 'text-primary';
            if (arg.stance.toLowerCase().includes('con')) { color = 'bg-status-con'; textColor = 'text-status-con'; }
            else if (arg.stance.toLowerCase().includes('neutral')) { color = 'bg-status-neutral'; textColor = 'text-status-neutral'; }

            if (indicatorEl) indicatorEl.className = `stance-indicator absolute left-0 top-0 bottom-0 w-1 ${color}`;
            if (dotEl) dotEl.className = `connector-dot absolute left-[11px] top-6 w-[18px] h-[18px] rounded-full border-[3px] border-white dark:border-background-dark shadow-sm z-10 ${color}`;
            stanceEl.className = `stance-label text-[10px] font-bold uppercase tracking-wider ${textColor}`;
        }
    }

    function clearChat() {
        chatMessages.innerHTML = '';
        currentShurahubMessage = null;
        streamBuffers = {};
        currentDebateId = null;
        if (emptyPromptInput) emptyPromptInput.value = '';
        if (chatPromptInput) chatPromptInput.value = '';

        // Ensure empty state is visible and chat input is hidden
        const emptyState = document.getElementById('empty-state');
        const chatInputContainer = document.getElementById('chat-input-container');
        if (emptyState) emptyState.style.display = 'flex';
        if (chatInputContainer) chatInputContainer.style.display = 'none';

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

    // --- Feedback Modal Logic ---
    const feedbackModal = document.getElementById('feedback-modal');
    const feedbackOptions = document.querySelectorAll('.feedback-option');
    const feedbackNote = document.getElementById('feedback-note');
    const feedbackSubmit = document.getElementById('feedback-submit');
    const feedbackSkip = document.getElementById('feedback-skip');
    const feedbackStatus = document.getElementById('feedback-status');
    let selectedRating = null;

    function showFeedbackModal() {
        if (feedbackModal) {
            feedbackModal.classList.remove('hidden');
            feedbackModal.classList.add('flex');
            selectedRating = null;
            feedbackOptions.forEach(opt => opt.classList.remove('border-primary', 'bg-primary/10'));
            if (feedbackSubmit) feedbackSubmit.disabled = true;
            if (feedbackNote) feedbackNote.value = '';
            if (feedbackStatus) feedbackStatus.textContent = '';
        }
    }

    function hideFeedbackModal() {
        if (feedbackModal) {
            feedbackModal.classList.add('hidden');
            feedbackModal.classList.remove('flex');
        }
    }

    feedbackOptions.forEach(option => {
        option.addEventListener('click', () => {
            feedbackOptions.forEach(opt => opt.classList.remove('border-primary', 'bg-primary/10'));
            option.classList.add('border-primary', 'bg-primary/10');
            selectedRating = option.dataset.rating;
            if (feedbackSubmit) feedbackSubmit.disabled = false;
        });
    });

    if (feedbackSkip) {
        feedbackSkip.addEventListener('click', hideFeedbackModal);
    }

    if (feedbackModal) {
        feedbackModal.addEventListener('click', (e) => {
            if (e.target === feedbackModal) {
                hideFeedbackModal();
            }
        });
    }

    if (feedbackSubmit) {
        feedbackSubmit.addEventListener('click', async () => {
            if (!selectedRating) return;

            feedbackSubmit.disabled = true;
            if (feedbackStatus) feedbackStatus.textContent = 'Sending...';

            const context = window.currentFeedbackContext || {};
            const payload = {
                email: null,
                category: 'council_response',
                message: `rating=${selectedRating}; prompt="${(context.prompt || '').slice(0, 140)}"; verdict="${(context.verdict || '').slice(0, 160)}"${feedbackNote && feedbackNote.value.trim() ? `; note=${feedbackNote.value.trim()}` : ''}`,
            };

            try {
                const response = await fetch('/engagement/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) throw new Error('Request failed');

                if (feedbackStatus) feedbackStatus.textContent = 'Thanks for the signal!';

                setTimeout(hideFeedbackModal, 1000);
            } catch (error) {
                console.error('Error submitting feedback:', error);
                if (feedbackStatus) feedbackStatus.textContent = 'Unable to send. Try again.';
                feedbackSubmit.disabled = false;
            }
        });
    }

    // Also wire up the "Rate this verdict" button in the debate
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.open-feedback-modal')) {
            showFeedbackModal();
        }
    });
});
