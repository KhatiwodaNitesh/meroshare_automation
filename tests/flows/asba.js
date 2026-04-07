import { expect } from '@playwright/test';
import { MEROSHARE_ENV, appRoute } from '../support/config';
import { ciLog } from '../support/ci-debug';
import { selectFirstOption, selectOptionByLabel } from '../support/select';

export async function goToASBA(page) {
    await page.goto(appRoute(), { waitUntil: 'domcontentloaded' });
    const myAsbaLink = page.getByRole('link', { name: /my asba/i });
    await expect(myAsbaLink).toBeVisible({ timeout: 30000 });
    await myAsbaLink.click();
    await expect(page).toHaveURL(/asba/);
}

export async function getApplicableShares(page) {
    const responsePromise = page.waitForResponse(
        (response) =>
            response.url().includes('/api/meroShare/companyShare/applicableIssue/') &&
            response.request().method() === 'POST',
        { timeout: 30000 }
    );

    await goToASBA(page);

    let response;
    try {
        response = await responsePromise;
    } catch (error) {
        ciLog('Applicable shares request not observed', {
            currentUrl: page.url(),
            pageTitle: await page.title().catch(() => null),
            alerts: await page
                .locator('[role="alert"], .toast-message, .error, .invalid-feedback, .mat-error')
                .allTextContents()
                .then((texts) => texts.map((text) => text.trim()).filter(Boolean).slice(0, 6))
                .catch(() => []),
            myAsbaVisible: await page
                .getByRole('link', { name: /my asba/i })
                .isVisible()
                .catch(() => false),
            companyListVisible: await page.locator('.company-list').isVisible().catch(() => false),
        });
        throw error;
    }

    const payload = await response.json();
    return payload.object ?? [];
}

export function filterApplicableIpoShares(shares) {
    return shares.filter(
        (share) =>
            !share.action &&
            share.shareTypeName === 'IPO' &&
            share.shareGroupName === 'Ordinary Shares' &&
            share.subGroup === 'For General Public'
    );
}

async function selectBank(page) {
    const bankSelect = page.locator('#selectBank');
    const { options, matchedOption } = await selectOptionByLabel(
        bankSelect,
        (option) => option.label.toLowerCase().includes(MEROSHARE_ENV.bankName.toLowerCase()),
        'Waiting for bank options to load'
    );

    if (!matchedOption) {
        ciLog('Bank dropdown options', options.map((option) => option.label).filter(Boolean));
        throw new Error(`Bank not found in dropdown: ${MEROSHARE_ENV.bankName}`);
    }

    ciLog('Selected bank', matchedOption.label);
}

async function selectAccount(page) {
    const accountSelect = page.locator('#accountNumber');
    const { selectedOption } = await selectFirstOption(
        accountSelect,
        'Waiting for account options to load'
    );

    if (!selectedOption) {
        throw new Error('No account options available in account dropdown.');
    }

    ciLog('Selected account', selectedOption.label);
}

async function openShareApplication(page, share) {
    await goToASBA(page);

    const companyRow = page.locator('.company-list').filter({
        has: page.locator('.company-name span[tooltip="Company Name"]', {
            hasText: share.companyName,
        }),
    });

    await expect(
        companyRow.locator('.company-name span[tooltip="Company Name"]')
    ).toBeVisible();
    await companyRow.locator('.action-buttons button').click();
    await expect(page.locator('#selectBank')).toBeVisible({ timeout: 15000 });
}

async function fillShareApplication(page) {
    await selectBank(page);
    await selectAccount(page);

    await page.fill('#appliedKitta', MEROSHARE_ENV.kitta);
    await expect(page.locator('#appliedKitta')).toHaveValue(MEROSHARE_ENV.kitta);

    await page.fill('#crnNumber', MEROSHARE_ENV.crn);
    await expect(page.locator('#crnNumber')).toHaveValue(MEROSHARE_ENV.crn);

    await page.check('#disclaimer');
    await expect(page.locator('#disclaimer')).toBeChecked();

    await page.getByRole('button', { name: /proceed/i }).click();
    await expect(page.locator('#transactionPIN')).toBeVisible({ timeout: 15000 });

    await page.fill('#transactionPIN', MEROSHARE_ENV.transactionPin);
}

async function submitShareApplication(page, share) {
    const applyButton = page.getByRole('button', { name: 'Apply' });
    await expect(applyButton).toBeVisible({ timeout: 15000 });
    await expect(applyButton).toBeEnabled({ timeout: 15000 });

    const seenCompanySharePosts = [];
    let dialogInfo = null;
    const responseListener = (response) => {
        if (
            response.request().method() === 'POST' &&
            response.url().includes('/api/meroShare/companyShare/')
        ) {
            seenCompanySharePosts.push({
                status: response.status(),
                url: response.url(),
            });
        }
    };
    const dialogListener = async (dialog) => {
        dialogInfo = {
            type: dialog.type(),
            message: dialog.message(),
        };
        ciLog('Browser dialog before apply', dialogInfo);
        await dialog.accept();
    };

    page.on('response', responseListener);
    page.on('dialog', dialogListener);

    let applyResponse;
    try {
        [applyResponse] = await Promise.all([
            page.waitForResponse(
                (response) =>
                    response.request().method() === 'POST' &&
                    response.url().includes('/api/meroShare/companyShare/') &&
                    !response.url().includes('/applicableIssue/'),
                { timeout: 20000 }
            ),
            applyButton.click(),
        ]);
    } catch (error) {
        const alerts = await page
            .locator('[role="alert"], .toast-message, .error, .invalid-feedback, .mat-error')
            .allTextContents()
            .catch(() => []);

        ciLog('Apply request not observed', {
            companyName: share.companyName,
            applyButtonEnabled: await applyButton.isEnabled().catch(() => false),
            transactionPinLength: await page
                .locator('#transactionPIN')
                .inputValue()
                .then((value) => value.length)
                .catch(() => 0),
            dialogInfo,
            seenCompanySharePosts,
            alerts: alerts.map((text) => text.trim()).filter(Boolean).slice(0, 6),
        });
        throw error;
    } finally {
        page.off('response', responseListener);
        page.off('dialog', dialogListener);
    }

    expect(applyResponse.status()).toBe(201);
    await expect(page.locator('#transactionPIN')).not.toBeVisible({ timeout: 15000 });
    console.log(`Applied for: ${share.companyName}`);
}

export async function applyForShare(page, share) {
    await openShareApplication(page, share);
    await fillShareApplication(page);
    await submitShareApplication(page, share);
}
