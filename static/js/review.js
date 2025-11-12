
document.addEventListener('DOMContentLoaded', () => {
    const debatesList = document.getElementById('debates-list');

    /**
     * Shows a loading message or an error state.
     * @param {string} message The message to display.
     * @param {boolean} isError If true, displays the message as an error.
     */
    function showState(message, isError = false) {
        debatesList.innerHTML = ''; // Clear previous state
        const stateElement = document.createElement('div');
        stateElement.className = isError ? 'error-message' : 'loading-message';
        stateElement.textContent = message;
        debatesList.appendChild(stateElement);
    }

    /**
     * Creates a star rating component.
     * @param {string} debateId The ID of the debate.
     * @param {string} rater The role being rated (e.g., 'opener', 'final').
     * @returns {HTMLElement} The container for the star rating.
     */
    function createStarRating(debateId, rater) {
        const ratingContainer = document.createElement('div');
        ratingContainer.className = 'star-rating';
        ratingContainer.dataset.debateId = debateId;
        ratingContainer.dataset.rater = rater;

        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('span');
            star.className = 'star';
            star.dataset.value = i;
            star.innerHTML = '&#9733;'; // Star character
            star.addEventListener('click', () => {
                rateDebate(debateId, rater, i);
                updateStars(ratingContainer, i);
            });
            ratingContainer.appendChild(star);
        }
        return ratingContainer;
    }

    /**
     * Updates the visual state of the stars.
     * @param {HTMLElement} container The star rating container.
     * @param {number} rating The selected rating.
     */
    function updateStars(container, rating) {
        container.querySelectorAll('.star').forEach(star => {
            star.classList.toggle('selected', star.dataset.value <= rating);
        });
    }

    /**
     * Sends the rating to the server.
     * @param {string} debateId The ID of the debate.
     * @param {string} rater The role being rated.
     * @param {number} rating The rating value.
     */
    function rateDebate(debateId, rater, rating) {
        fetch('/rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ debate_id: debateId, rater, rating }),
        }).catch(error => console.error('Failed to submit rating:', error)); // Basic error logging
    }

    /**
     * Creates an element with a specified tag, class, and text content.
     * @param {string} tag The HTML tag for the element.
     * @param {string} className The CSS class name.
     * @param {string} [textContent] The text content of the element.
     * @returns {HTMLElement} The created element.
     */
    function createElement(tag, className, textContent) {
        const element = document.createElement(tag);
        element.className = className;
        if (textContent) {
            element.textContent = textContent;
        }
        return element;
    }

    /**
     * Renders a single debate into the list.
     * @param {object} debate The debate object to render.
     */
    function renderDebate(debate) {
        const debateElement = createElement('div', 'debate');

        const title = createElement('h2', '', `Debate ID: ${debate.debate_id}`);

        const userPromptContainer = createElement('div', 'prompt');
        const userPromptStrong = createElement('strong', '', 'You said: ');
        userPromptContainer.appendChild(userPromptStrong);
        userPromptContainer.append(debate.user_prompt);

        debateElement.append(title, userPromptContainer);

        // Render each agent's response
        const responses = [
            { role: 'opener', data: debate.opener },
            { role: 'critiquer', data: debate.critiquer },
            { role: 'synthesizer', data: debate.synthesizer, finalName: 'Final Verdict' },
        ];

        responses.forEach(({ role, data, finalName }) => {
            if (!data) return; // Don't render if data is missing

            const responseDiv = createElement('div', `response ${role}`);
            const strong = createElement('strong', '', `${finalName || role.charAt(0).toUpperCase() + role.slice(1)} (${data.model}):`);
            const responseText = createElement('p', '', data.response);

            responseDiv.append(strong, responseText);

            // Add rating section for opener and synthesizer
            if (role === 'opener' || role === 'synthesizer') {
                const ratingsDiv = createElement('div', 'ratings');
                const ratingsStrong = createElement('strong', '', `Rate this ${finalName || 'opening'}: `);
                const starRating = createStarRating(debate.debate_id, role === 'synthesizer' ? 'final' : 'opener');
                ratingsDiv.append(ratingsStrong, starRating);
                responseDiv.appendChild(ratingsDiv);
            }

            debateElement.appendChild(responseDiv);
        });

        debatesList.appendChild(debateElement);
    }

    /**
     * Main function to fetch and render all debates.
     */
    async function loadDebates() {
        showState('Loading debates...');
        try {
            const response = await fetch('/debates');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const debates = await response.json();

            debatesList.innerHTML = ''; // Clear loading message
            if (debates.length === 0) {
                showState('No debates found.');
                return;
            }
            debates.forEach(renderDebate);

        } catch (error) {
            console.error('Failed to load debates:', error);
            showState('Failed to load debates. Please try again later.', true);
        }
    }

    // Initial load
    loadDebates();
});
