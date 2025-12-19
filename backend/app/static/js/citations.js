// Citation System - Add inline source attribution to final answers

/**
 * Adds RAG-style citations to the final answer text
 * @param {string} finalAnswerHtml - The HTML content of the final answer
 * @param {string} openerText - The opener's argument text
 * @param {string} critiquerText - The critiquer's argument text
 * @returns {string} - HTML with citation markers added
 */
function addCitationsToAnswer(finalAnswerHtml, openerText, critiquerText) {
    // For now, we'll use a simple heuristic approach
    // In production, you'd want the LLM to include citation markers

    // This is a placeholder - the real implementation would:
    // 1. Ask the Judge/Synthesizer to include [1], [2] markers in its response
    // 2. Map those numbers to specific Opener/Critiquer quotes
    // 3. Parse the HTML and add interactive citation elements

    // For MVP, we'll just add the citation infrastructure
    return finalAnswerHtml;
}

/**
 * Creates a citation tooltip element
 * @param {number} citationNumber - The citation number (1, 2, 3...)
 * @param {string} source - 'opener' or 'critiquer'
 * @param {string} quoteText - The text from the source being cited
 * @returns {HTMLElement} - The citation element with tooltip
 */
function createCitationElement(citationNumber, source, quoteText) {
    const citation = document.createElement('span');
    citation.className = `citation from-${source}`;
    citation.textContent = citationNumber;
    citation.setAttribute('data-source', source);
    citation.setAttribute('data-quote', quoteText);

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'citation-tooltip';

    const header = document.createElement('div');
    header.className = 'citation-tooltip-header';

    const badge = document.createElement('span');
    badge.className = `badge ${source}`;
    badge.textContent = source === 'opener' ? 'Opener' : 'Critiquer';

    header.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'citation-tooltip-content';
    content.textContent = truncateText(quoteText, 150);

    tooltip.appendChild(header);
    tooltip.appendChild(content);
    citation.appendChild(tooltip);

    // Add click/hover handlers
    citation.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTooltip(citation);
    });

    // For desktop hover
    citation.addEventListener('mouseenter', () => {
        if (window.innerWidth > 768) {
            showTooltip(citation);
        }
    });

    citation.addEventListener('mouseleave', () => {
        if (window.innerWidth > 768) {
            hideTooltip(citation);
        }
    });

    return citation;
}

function toggleTooltip(citationElement) {
    const tooltip = citationElement.querySelector('.citation-tooltip');
    if (!tooltip) return;

    // Close all other tooltips first
    document.querySelectorAll('.citation-tooltip.active').forEach(t => {
        if (t !== tooltip) t.classList.remove('active');
    });

    tooltip.classList.toggle('active');
}

function showTooltip(citationElement) {
    const tooltip = citationElement.querySelector('.citation-tooltip');
    if (tooltip) tooltip.classList.add('active');
}

function hideTooltip(citationElement) {
    const tooltip = citationElement.querySelector('.citation-tooltip');
    if (tooltip) tooltip.classList.remove('active');
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Close tooltips when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.citation')) {
        document.querySelectorAll('.citation-tooltip.active').forEach(t => {
            t.classList.remove('active');
        });
    }
});

// Example usage (would be called from the main script):
/*
const finalAnswer = document.querySelector('.final-answer');
const citation1 = createCitationElement(1, 'opener', 'React has a larger ecosystem with 200k+ npm packages...');
const citation2 = createCitationElement(2, 'critiquer', 'Vue offers a gentler learning curve for beginners...');

// Insert citations at appropriate points in the text
// This would require text analysis or LLM-provided markers
*/
