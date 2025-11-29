document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('how-it-works-modal');
    const modalTrigger = document.getElementById('how-it-works-modal-trigger');
    const modalCloseButton = document.getElementById('modal-close-button');
    const navToggle = document.getElementById('nav-toggle');
    const mainNav = document.getElementById('main-nav');
    const feedbackForm = document.getElementById('feedback-form');
    const feedbackStatus = document.getElementById('feedback-status');
    const siteHost = window.location.host;

    const sendAnalytics = (eventName, metadata = {}) => {
        fetch('/engagement/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_name: eventName, metadata }),
        }).catch((error) => console.warn('Analytics tracking skipped:', error));
    };

    sendAnalytics('landing_view', { path: window.location.pathname });

    // Modal interactions
    if (modal && modalTrigger && modalCloseButton) {
        modalTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            modal.classList.add('show');
            sendAnalytics('modal_opened');
        });

        modalCloseButton.addEventListener('click', () => {
            modal.classList.remove('show');
        });

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('show')) {
                modal.classList.remove('show');
            }
        });
    }

    // Mobile navigation
    if (navToggle && mainNav) {
        navToggle.addEventListener('click', () => {
            const isOpen = mainNav.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', isOpen.toString());
        });

        mainNav.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                if (mainNav.classList.contains('open')) {
                    mainNav.classList.remove('open');
                    navToggle.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }

    // Track CTA interactions
    document.querySelectorAll('[data-track]').forEach((element) => {
        element.addEventListener('click', () => {
            const metadata = {};
            if (element.dataset.plan) {
                metadata.plan = element.dataset.plan;
            }
            sendAnalytics(element.dataset.track, metadata);
        });
    });

    // Redirect any external links to the chat so users stay inside the app
    document.querySelectorAll('a[href^="http"]').forEach((link) => {
        const url = new URL(link.href);
        if (url.host && url.host !== siteHost) {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                window.location.href = '/chat';
            });
        }
    });

    // Feedback capture
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(feedbackForm);
            const payload = {
                email: formData.get('email') || null,
                message: formData.get('message'),
                category: formData.get('category') || null,
            };

            try {
                if (feedbackStatus) {
                    feedbackStatus.textContent = 'Sending...';
                }
                const response = await fetch('/engagement/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    throw new Error('Request failed');
                }

                if (feedbackStatus) {
                    feedbackStatus.textContent = 'Thanks for sharing! We’ll follow up if needed.';
                }
                feedbackForm.reset();
                sendAnalytics('feedback_submitted', { category: payload.category });
            } catch (error) {
                console.error('Error submitting feedback:', error);
                if (feedbackStatus) {
                    feedbackStatus.textContent = 'Unable to send feedback right now. Please try again later.';
                }
            }
        });
    }
});
