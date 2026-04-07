import { expect } from '@playwright/test';
import { BASE_URL } from '../support/config';

export async function openPurchaseSource(page) {
    await page.goto(`${BASE_URL}dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'My Purchase Source' }).click();
    await expect(page).toHaveURL(/purchase/);
    await expect(page.locator('#script')).toBeVisible({ timeout: 30000 });
}

export async function getPurchaseSourceScripts(page) {
    await openPurchaseSource(page);
    return page.locator('#browsers option').evaluateAll((nodes) =>
        nodes
            .map((node) => node.value.trim())
            .filter(Boolean)
    );
}

function getToastMessages(page) {
    return page.locator('#toast-container .toast-message');
}

export async function expectPurchaseSourceUpdate(page) {
    const toastMessages = getToastMessages(page);

    await expect.poll(
        async () => {
            const messages = await toastMessages.allTextContents().catch(() => []);
            return messages.map((message) => message.trim()).filter(Boolean);
        },
        {
            message: 'Waiting for purchase source update confirmation',
            timeout: 15000,
        }
    ).toContainEqual(expect.stringMatching(/success|updated|saved/i));
}

export async function updatePurchaseSourceForScript(page, script) {
    await openPurchaseSource(page);
    await page.locator('#script').fill(script);
    await expect(page.locator('#script')).toHaveValue(script);
    await page.getByRole('button', { name: 'Search' }).click();

    const resultRow = page
        .locator('tbody.table__body tr.table__body-row')
        .filter({ has: page.locator('td', { hasText: script.trim() }) })
        .first();

    await expect(resultRow).toBeVisible();

    const rowCheckbox = resultRow.locator('input[type="checkbox"]').first();
    await rowCheckbox.check();
    await expect(rowCheckbox).toBeChecked();

    await page.getByRole('button', { name: 'Proceed' }).click();
    await page.locator('input.disclaimer').check();
    await expect(page.locator('input.disclaimer')).toBeChecked();
    await page.getByRole('button', { name: 'Update' }).click();
    await expectPurchaseSourceUpdate(page);

    console.log(`Purchase source calculated for: ${script}`);
}
