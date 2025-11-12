document.addEventListener('DOMContentLoaded', () => {
    const leadSubmitButton = document.getElementById('lead-submit-button');
    const earlyAccessEmail = document.getElementById('early-access-email');

    async function submitLead() {
        const email = earlyAccessEmail.value.trim();
        if (email) {
            try {
                const response = await fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                if (response.ok) {
                    alert('Thank you! We will be in touch shortly with your free debate.');
                    earlyAccessEmail.value = '';
                } else {
                    alert('An error occurred. Please try again.');
                }
            } catch (error) {
                console.error('Error submitting lead:', error);
                alert('An error occurred. Please try again.');
            }
        } else {
            alert('Please enter a valid email address.');
        }
    }

    leadSubmitButton.addEventListener('click', submitLead);
});
