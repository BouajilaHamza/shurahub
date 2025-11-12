document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('how-it-works-modal');
    const modalTrigger = document.getElementById('how-it-works-modal-trigger');
    const modalCloseButton = document.getElementById('modal-close-button');

    if (modal && modalTrigger && modalCloseButton) {
        // Show the modal
        modalTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            modal.classList.add('show');
        });

        // Hide the modal with the close button
        modalCloseButton.addEventListener('click', () => {
            modal.classList.remove('show');
        });

        // Hide the modal by clicking on the background
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        });

        // Hide the modal with the Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('show')) {
                modal.classList.remove('show');
            }
        });
    }

    console.log("Landing page interactive elements loaded.");
});
