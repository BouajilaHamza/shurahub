function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('.material-icons-outlined');

    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}
