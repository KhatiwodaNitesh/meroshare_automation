import { expect } from '@playwright/test';

async function readOptions(selectLocator) {
    return selectLocator.locator('option').evaluateAll((nodes) =>
        nodes
            .map((node) => ({
                value: node.value,
                label: node.textContent?.trim() ?? '',
            }))
            .filter((option) => option.value && option.label)
    );
}

export async function waitForSelectOptions(selectLocator, message, timeout = 30000) {
    await expect(selectLocator).toBeVisible();
    await expect.poll(
        async () => readOptions(selectLocator),
        {
            message,
            timeout,
        }
    ).not.toHaveLength(0);

    return readOptions(selectLocator);
}

export async function selectOptionByLabel(selectLocator, matcher, message) {
    const options = await waitForSelectOptions(selectLocator, message);
    const matchedOption = options.find((option) => matcher(option));

    if (!matchedOption) {
        return { options, matchedOption: null };
    }

    await selectLocator.selectOption(matchedOption.value);
    await expect(selectLocator).toHaveValue(matchedOption.value);
    return { options, matchedOption };
}

export async function selectFirstOption(selectLocator, message) {
    const options = await waitForSelectOptions(selectLocator, message);
    const selectedOption = options[0] ?? null;

    if (!selectedOption) {
        return { options, selectedOption: null };
    }

    await selectLocator.selectOption(selectedOption.value);
    await expect(selectLocator).toHaveValue(selectedOption.value);
    return { options, selectedOption };
}

/**
 * Check if holding needs calculation by detecting if checkboxes are present
 * Uses Promise.race() to determine if checkboxes appear (needs calculation) or if already calculated
 * @param {Page} page - Playwright page object
 * @returns {Promise<boolean>} - True if checkboxes are present (calculation needed), false if already calculated
 */
export async function checkIfHoldingNeedsCalculation(page) {
    try {
        const checkboxLocator = page.getByRole('checkbox').nth(1);
        
        // Race between detecting a checkbox or timing out
        // If checkbox appears first, return true; if timeout occurs first, return false
        return await Promise.race([
            checkboxLocator.waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
            // If checkbox doesn't appear within 5s, assume already calculated
            new Promise(resolve => setTimeout(() => resolve(false), 5500))
        ]);
    } catch (error) {
        // If any error occurs, assume already calculated (no checkboxes)
        return false;
    }
}
