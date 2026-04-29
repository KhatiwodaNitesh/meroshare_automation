/**
 * Helper function to check if "No EDIS for today" fallback message is displayed
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} - True if no data message is visible, false otherwise
 */
export async function hasNoEDISData(page) {
    try {
        const fallbackMessage = page.getByText('No EDIS for today');
        const isVisible = await fallbackMessage.isVisible({ timeout: 3000 });
        return isVisible;
    } catch (error) {
        return false;
    }
}

/**
 * Wait for either EDIS data to load or "No EDIS for today" fallback message
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} - True if data is present, false if no data fallback is shown
 */
export async function waitForEDISDataOrFallback(page) {
    try {
        // Wait for either the table header (indicating data) or fallback message
        const tableHeader = page.getByRole('cell', { name: '#' });
        const fallbackMessage = page.getByText('No EDIS for today');

        // Use Promise.race to see which appears first
        return await Promise.race([
            tableHeader.waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
            fallbackMessage.waitFor({ state: 'visible', timeout: 5000 }).then(() => false),
        ]);
    } catch (error) {
        // If neither appears, assume no data
        return false;
    }
}
