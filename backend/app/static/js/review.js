document.addEventListener('DOMContentLoaded', () => {
    const debatesList = document.getElementById('debates-list');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');

    let allDebates = []; // Store all debates locally
    let debounceTimer;

    // --- Utility Functions ---

    function debounce(func, delay) {
        return function (...args) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function showState(message, isError = false) {
        debatesList.innerHTML = '';
        const stateElement = document.createElement('div');
        stateElement.className = isError ? 'error-message' : 'loading-message';
        stateElement.textContent = message;
        debatesList.appendChild(stateElement);
    }

    function createElement(tag, className, textContent) {
        const element = document.createElement(tag);
        element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    }

    // --- Rating Functions ---

    function createStarRating(debateId, rater, currentRating) {
        const ratingContainer = createElement('div', 'star-rating');
        ratingContainer.dataset.debateId = debateId;
        ratingContainer.dataset.rater = rater;

        for (let i = 1; i <= 5; i++) {
            const star = createElement('span', 'star');
            star.dataset.value = i;
            star.innerHTML = '&#9733;';
            star.addEventListener('click', () => {
                rateDebate(debateId, rater, i);
                updateStars(ratingContainer, i);
            });
            ratingContainer.appendChild(star);
        }

        if (currentRating) {
            updateStars(ratingContainer, currentRating);
        }
        return ratingContainer;
    }

    function updateStars(container, rating) {
        container.querySelectorAll('.star').forEach(star => {
            star.classList.toggle('selected', star.dataset.value <= rating);
        });
    }

    function rateDebate(debateId, rater, rating) {
        fetch('/rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ debate_id: debateId, rater, rating }),
        }).catch(error => console.error('Failed to submit rating:', error));
    }

    // --- Rendering Logic ---

    function renderDebates() {
        localStorage.setItem('reviewSearchTerm', searchInput.value);
        localStorage.setItem('reviewSortBy', sortSelect.value);

        debatesList.innerHTML = '';
        let debatesToRender = [...allDebates];

        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            debatesToRender = debatesToRender.filter(debate =>
                [debate.user_prompt, debate.opener?.response, debate.critiquer?.response, debate.synthesizer?.response]
                    .some(text => text?.toLowerCase().includes(searchTerm))
            );
        }

        const sortBy = sortSelect.value;
        debatesToRender.sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.timestamp) - new Date(a.timestamp);
            if (sortBy === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
            if (sortBy === 'rating') {
                const ratingA = (a.opener_rating || 0) + (a.final_rating || 0);
                const ratingB = (b.opener_rating || 0) + (b.final_rating || 0);
                return ratingB - ratingA;
            }
            return 0;
        });

        if (debatesToRender.length === 0) {
            if (allDebates.length === 0) {
                showState('No debates found in the archive yet.');
                const startButton = createElement('a', 'nav-button cta-button', 'Start New Debate');
                startButton.href = '/';
                startButton.style.display = 'inline-block';
                startButton.style.marginTop = '1rem';
                debatesList.appendChild(startButton);
            } else {
                showState('No debates match your search criteria.');
            }
            return;
        }

        const resultCount = createElement('div', 'result-count', `${debatesToRender.length} debate(s) found.`);
        debatesList.appendChild(resultCount);

        debatesToRender.forEach(renderSingleDebate);
    }

    function renderSingleDebate(debate) {
        const debateElement = createElement('div', 'debate');
        debateElement.innerHTML = `
            <h2>Debate ID: ${debate.debate_id}</h2>
            <p class="timestamp">${new Date(debate.timestamp).toLocaleString()}</p>
            <div class="prompt"><strong>You said:</strong> ${debate.user_prompt}</div>
        `;

        const responses = [
            { role: 'opener', data: debate.opener, rating: debate.opener_rating },
            { role: 'critiquer', data: debate.critiquer },
            { role: 'synthesizer', data: debate.synthesizer, finalName: 'Final Verdict', rating: debate.final_rating },
        ];

        responses.forEach(({ role, data, finalName, rating }) => {
            if (!data) return;

            const responseDiv = createElement('div', `response ${role}`);
            responseDiv.innerHTML = `<strong>${finalName || role.charAt(0).toUpperCase() + role.slice(1)} (${data.model}):</strong><p>${data.response}</p>`;

            if (role === 'opener' || role === 'synthesizer') {
                const rater = role === 'synthesizer' ? 'final' : 'opener';
                const ratingsDiv = createElement('div', 'ratings');
                ratingsDiv.appendChild(createElement('strong', '', `Rate this ${finalName || 'opening'}: `));
                ratingsDiv.appendChild(createStarRating(debate.debate_id, rater, rating));
                responseDiv.appendChild(ratingsDiv);
            }
            debateElement.appendChild(responseDiv);
        });

        debatesList.appendChild(debateElement);
    }

    // --- Initialization ---

    async function loadDebates() {
        showState('Loading debates...');
        try {
            const response = await fetch('/debates');
            if (response.status === 401) {
                showState('Please log in to view your debates.');
                const loginButton = createElement('a', 'nav-button login-button', 'Log in');
                loginButton.href = '/login';
                debatesList.appendChild(loginButton);
                return;
            }
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            allDebates = await response.json();

            searchInput.value = localStorage.getItem('reviewSearchTerm') || '';
            sortSelect.value = localStorage.getItem('reviewSortBy') || 'newest';

            renderDebates();
        } catch (error) {
            console.error('Failed to load debates:', error);
            showState('Failed to load debates. Please try again later.', true);
        }
    }

    searchInput.addEventListener('input', debounce(renderDebates, 300));
    sortSelect.addEventListener('change', renderDebates);

    loadDebates();
});