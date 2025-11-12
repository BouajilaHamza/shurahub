
document.addEventListener('DOMContentLoaded', () => {
    const leadSubmitButton = document.getElementById('lead-submit-button');
    const earlyAccessEmail = document.getElementById('early-access-email');

    function showToast(message, isSuccess = true) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `toast-notification ${isSuccess ? 'success' : 'error'}`;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

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
                    showToast('Thank you! We will be in touch shortly with your free debate.');
                    earlyAccessEmail.value = '';
                } else {
                    showToast('An error occurred. Please try again.', false);
                }
            } catch (error) {
                console.error('Error submitting lead:', error);
                showToast('An error occurred. Please try again.', false);
            }
        } else {
            showToast('Please enter a valid email address.', false);
        }
    }

    leadSubmitButton.addEventListener('click', submitLead);
});
