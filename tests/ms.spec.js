import { test, expect } from '@playwright/test';
import { attachCiArtifacts, attachCiPageDebug } from './support/ci-debug';
import { appRoute } from './support/config';
import { injectSession, readSession } from './support/session';
import { checkIfHoldingNeedsCalculation } from './support/select';
import {
    applyForShare,
    filterApplicableIpoShares,
    getAlreadyAppliedIpoShares,
    getApplicableShares,
} from './flows/asba';
import {
    getPurchaseSourceScripts,
    updatePurchaseSourceForScript,
} from './flows/purchase-source';
import { waitForEDISDataOrFallback } from './flows/edis';

// --- Session Setup ---
test.beforeEach(async ({ page }) => {
    attachCiPageDebug(page);
    const session = readSession();
    await injectSession(page, session);
    await page.goto(appRoute(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /my asba/i })).toBeVisible({ timeout: 30000 });
});

test.afterEach(async ({ page }, testInfo) => {
    await attachCiArtifacts(page, testInfo);
});

// --- Tests ---
test.describe.serial('Mero Share Automation', () => {

    test('Apply Share', async ({ page }) => {
        test.setTimeout(process.env.CI ? 120000 : 90000);
        const allShares = await getApplicableShares(page);
        const applicableShares = filterApplicableIpoShares(allShares);
        const alreadyAppliedShares = await getAlreadyAppliedIpoShares(page, allShares);

        if (applicableShares.length === 0 && alreadyAppliedShares.length === 0) {
            console.log('No shares to apply.');
            return;
        }

        for (const share of alreadyAppliedShares) {
            console.log(`Already applied for: ${share.companyName}`);
        }

        for (const share of applicableShares) {
            await applyForShare(page, share);
        }
    });

    test('Calculate Purchase Source', async ({ page }) => {
        const scripts = await getPurchaseSourceScripts(page);

        if (scripts.length === 0) {
            console.log('No scripts available.');
            return;
        }

        for (const script of scripts) {
            await updatePurchaseSourceForScript(page, script);
        }
    });
    test.describe('Calculate Holding & Edis', () => {
        test('Calculate myholding', async ({page}) => {   
        await page.getByRole('link', { name: ' My Purchase Source' }).click();
        await page.locator('a').filter({ hasText: 'My Holdings' }).click();
        
        // Wait for the select element to be visible
        await page.locator('#isin').waitFor({ state: 'visible' });
        
        // Get all available options from the select element
        const totalOptions = await page.locator('#isin option').count();
        const validOptionsCount = totalOptions - 1; // Exclude empty option
        
        console.log(`\nDebug: Total options count: ${totalOptions}, Valid options: ${validOptionsCount}`);
        
        // Check if there are no items to calculate
        if (validOptionsCount <= 0) {
            console.log('\n⚠️  There\'s no item to calculate my holding');
            return;
        }
        
        console.log(`\nFound ${validOptionsCount} valid ISIN options:\n`);
        
        // Get all option values and texts
        const optionsList = [];
        for (let i = 1; i < totalOptions; i++) {
            const optionValue = await page.locator(`#isin option`).nth(i).getAttribute('value');
            const optionText = await page.locator(`#isin option`).nth(i).textContent();
            optionsList.push({ value: optionValue, text: optionText.trim() });
            console.log(`  [${i}] ${optionText.trim()} (${optionValue})`);
        }
        
        console.log(`\nProcessing ${validOptionsCount} items:`);
        
        // Loop through each option
        for (let i = 0; i < optionsList.length; i++) {
            const { value: optionValue, text: optionName } = optionsList[i];
            
            console.log(`\n► Performing myholding of item name: ${optionName}`);
            
            // Select the option
            await page.locator('#isin').selectOption(optionValue);
            await page.getByRole('button', { name: 'Search' }).click();
            
            // Check if holding needs calculation (checkboxes present) or already calculated
            const needsCalculation = await checkIfHoldingNeedsCalculation(page);
            
            if (!needsCalculation) {
                console.log(`✓ Already calculated: ${optionName}, skipping`);
                continue;
            }
            
            // Proceed with calculation workflow
            await page.getByRole('checkbox').nth(1).check();
            await page.getByRole('button', { name: 'Proceed' }).click();
            await page.getByRole('checkbox').nth(1).check();           
            await page.getByRole('button', { name: 'Update' }).click();
            console.log(`✓ Completed ${optionName} myholding`);
        }
        
        console.log(`\n✓ Test completed successfully! Processed all ${validOptionsCount} items.`);
    

    });
        test('Calculate myedis', async ({ page }) => {
        await page.getByRole('link', { name: ' My EDIS' }).click();
        await page.locator('a').filter({ hasText: 'Transfer Shares' }).click();
        
        // Check if data exists or if "No EDIS for today" fallback is displayed
        const hasData = await waitForEDISDataOrFallback(page);
        if (!hasData) {
            console.log('✓ No EDIS data available for today, skipping remaining test steps');
            return;
        }
        
        await page.getByRole('cell', { name: '#' }).isVisible();
        await page.getByRole('cell', { name: '1', exact: true }).click();
        await page.getByRole('cell', { name: '1211002026083' }).click();
        await page.getByRole('cell', { name: '/04/30' }).click();
        await page.getByRole('cell', { name: 'View Detail' }).click();
        await page.getByRole('button', { name: 'View Detail' }).click();
        await page.getByRole('row', { name: '# Contract No. Settlement' }).getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Proceed' }).click();
        await page.getByText('I agree to deliver above').isVisible();
        await page.getByText('I agree to deliver above').locator('..').getByRole('checkbox').check();
        await page.getByText('I agree to deliver above').locator('..').getByRole('checkbox').isChecked();
        await page.getByRole('button', { name: 'Confirm' }).isVisible();
        await page.getByRole('button', { name: 'Confirm' }).click();
    });

    });

});
