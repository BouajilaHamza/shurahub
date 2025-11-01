document.addEventListener('DOMContentLoaded', () => {
    const debateList = document.getElementById('debate-list');

    fetch('/debates')
        .then(response => response.json())
        .then(debates => {
            debates.forEach(debate => {
                const debateElement = document.createElement('div');
                debateElement.className = 'debate';
                debateElement.innerHTML = `
                    <h2>Debate ID: ${debate.debate_id}</h2>
                    <p><strong>You said:</strong> ${debate.user_prompt}</p>
                    
                    <div class="response opener">
                        <strong>Opener (${debate.opener.model}):</strong>
                        <p>${debate.opener.response}</p>
                        <div class="ratings"><strong>Rate this opening:</strong> <div class="star-rating" data-debate-id="${debate.debate_id}" data-rater="opener"></div></div>
                    </div>
                    
                    <div class="response critiquer">
                        <strong>Critiquer (${debate.critiquer.model}):</strong>
                        <p>${debate.critiquer.response}</p>
                    </div>

                    <div class="response synthesizer">
                        <strong>Final Verdict (${debate.synthesizer.model}):</strong>
                        <p>${debate.synthesizer.response}</p>
                        <div class="ratings"><strong>Rate this final verdict:</strong> <div class="star-rating" data-debate-id="${debate.debate_id}" data-rater="final"></div></div>
                    </div>
                `;
                debateList.appendChild(debateElement);
            });
        })
        .then(() => {
            // Add star rating functionality after debates are loaded
            document.querySelectorAll('.star-rating').forEach(rating_div => {
                for (let i = 1; i <= 5; i++) {
                    const star = document.createElement('span');
                    star.className = 'star';
                    star.dataset.value = i;
                    star.innerHTML = '&#9733;'; // Star character
                    star.addEventListener('click', () => {
                        rateDebate(rating_div.dataset.debateId, rating_div.dataset.rater, i);
                        updateStars(rating_div, i);
                    });
                    rating_div.appendChild(star);
                }
            });
        });
});

function updateStars(rating_div, rating) {
    rating_div.querySelectorAll('.star').forEach(star => {
        star.classList.toggle('selected', star.dataset.value <= rating);
    });
}

function rateDebate(debateId, rater, rating) {
    fetch('/rate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ debate_id: debateId, rater: rater, rating: rating }),
    });
}
