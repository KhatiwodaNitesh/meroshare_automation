import { expect } from '@playwright/test';
import { MEROSHARE_ENV, appRoute } from '../support/config';
import { ciLog } from '../support/ci-debug';
import { selectFirstOption, selectOptionByLabel } from '../support/select';

const APPLY_ISSUE_PATH = '/api/meroShare/companyShare/applicableIssue/';
const APPLY_SHARE_PATHS = [
    '/api/meroShare/applicantForm/share/apply',
    '/api/meroShare/companyShare/',
];

function isApplicableIssueResponse(response) {
    return (
        response.request().method() === 'POST' &&
        response.url().includes(APPLY_ISSUE_PATH)
    );
}

function isShareApplyResponse(response) {
    if (response.request().method() !== 'POST') {
        return false;
    }

    const url = response.url();
    return APPLY_SHARE_PATHS.some((path) => url.includes(path)) && !url.includes(APPLY_ISSUE_PATH);
}

function normalizeWhitespace(value) {
    return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeDomSubGroup(value) {
    return normalizeWhitespace(value).replace(/\s*\([^)]+\)\s*$/, '').trim();
}

function normalizeApiShare(share) {
    return {
        ...share,
        companyName: normalizeWhitespace(share.companyName),
        subGroup: normalizeWhitespace(share.subGroup),
        shareTypeName: normalizeWhitespace(share.shareTypeName),
        shareGroupName: normalizeWhitespace(share.shareGroupName),
    };
}

function normalizeDomShare(share) {
    return {
        ...share,
        companyName: normalizeWhitespace(share.companyName),
        subGroup: normalizeDomSubGroup(share.subGroup),
        shareTypeName: normalizeWhitespace(share.shareTypeName),
        shareGroupName: normalizeWhitespace(share.shareGroupName),
        actions: Array.isArray(share.actions)
            ? share.actions.map((label) => normalizeWhitespace(label))
            : [],
    };
}

function buildShareKey(share) {
    return [
        normalizeWhitespace(share.companyName),
        normalizeWhitespace(share.subGroup),
        normalizeWhitespace(share.shareTypeName),
        normalizeWhitespace(share.shareGroupName),
    ].join('|');
}

function dedupeShares(shares) {
    const seenShareKeys = new Set();

    return shares.filter((share) => {
        const companyName = normalizeWhitespace(share.companyName);
        if (!companyName) {
            return false;
        }

        const shareKey = buildShareKey(share);
        if (!shareKey || seenShareKeys.has(shareKey)) {
            return false;
        }

        seenShareKeys.add(shareKey);
        return true;
    });
}

function isGeneralPublicOrdinaryIpoFromApi(share) {
    return (
        normalizeWhitespace(share.shareTypeName) === 'IPO' &&
        normalizeWhitespace(share.shareGroupName) === 'Ordinary Shares' &&
        normalizeWhitespace(share.subGroup) === 'For General Public'
    );
}

function isGeneralPublicOrdinaryIpoFromDom(share) {
    return (
        normalizeWhitespace(share.shareTypeName) === 'IPO' &&
        normalizeWhitespace(share.shareGroupName) === 'Ordinary Shares' &&
        normalizeDomSubGroup(share.subGroup) === 'For General Public'
    );
}

async function readResponsePayload(response) {
    try {
        return await response.json();
    } catch {
        try {
            return await response.text();
        } catch {
            return null;
        }
    }
}

export async function goToASBA(page) {
    await page.goto(appRoute(), { waitUntil: 'domcontentloaded' });
    const myAsbaLink = page.getByRole('link', { name: /my asba/i });
    await expect(myAsbaLink).toBeVisible({ timeout: 30000 });
    await myAsbaLink.click();
    await expect(page).toHaveURL(/asba/);
}

export async function getApplicableShares(page) {
    const responsePromise = page.waitForResponse(
        isApplicableIssueResponse,
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
        (share) => !share.action && isGeneralPublicOrdinaryIpoFromApi(share)
    );
}

async function readShareRows(page) {
    return page.locator('.company-list').evaluateAll((rows) =>
        rows.map((row) => {
            const readText = (selector) =>
                row.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

            return {
                companyName: readText('.company-name span[tooltip="Company Name"]'),
                subGroup: readText('.company-name span[tooltip="Sub Group"]'),
                shareTypeName: readText('.company-name span[tooltip="Share Type"]'),
                shareGroupName: readText('.company-name span[tooltip="Share Group"]'),
                actions: Array.from(row.querySelectorAll('.action-buttons button')).map(
                    (button) => button.textContent?.replace(/\s+/g, ' ').trim() ?? ''
                ),
            };
        })
    );
}

async function waitForShareListToRender(page, shares) {
    const expectedShareKeys = dedupeShares(
        shares
            .filter(isGeneralPublicOrdinaryIpoFromApi)
            .map((share) => normalizeApiShare(share))
    ).map((share) => buildShareKey(share));

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    if (expectedShareKeys.length === 0) {
        await page.locator('.company-list').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        return;
    }

    await expect.poll(
        async () => {
            const visibleShareKeys = (await readShareRows(page))
                .map((share) => normalizeDomShare(share))
                .map((share) => buildShareKey(share));

            return expectedShareKeys.some((shareKey) => visibleShareKeys.includes(shareKey));
        },
        {
            timeout: 15000,
            message: 'Waiting for ASBA share rows to render',
        }
    ).toBe(true);
}

export async function getAlreadyAppliedIpoShares(page, shares = []) {
    await waitForShareListToRender(page, shares);

    return dedupeShares(
        (await readShareRows(page))
            .map((share) => normalizeDomShare(share))
            .filter((share) => {
                const actionLabels = share.actions.map((label) => label.toLowerCase());
                return (
                    isGeneralPublicOrdinaryIpoFromDom(share) &&
                    actionLabels.includes('edit') &&
                    !actionLabels.includes('apply')
                );
            })
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

    const seenApplyResponses = [];
    let dialogInfo = null;
    const responseListener = (response) => {
        if (isShareApplyResponse(response)) {
            seenApplyResponses.push({
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
    let applyPayload = null;
    try {
        [applyResponse] = await Promise.all([
            page.waitForResponse(isShareApplyResponse, { timeout: 20000 }),
            applyButton.click(),
        ]);

        applyPayload = await readResponsePayload(applyResponse);
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
            seenApplyResponses,
            alerts: alerts.map((text) => text.trim()).filter(Boolean).slice(0, 6),
        });
        throw error;
    } finally {
        page.off('response', responseListener);
        page.off('dialog', dialogListener);
    }

    if (applyResponse.status() !== 201) {
        ciLog('Apply request failed', {
            companyName: share.companyName,
            status: applyResponse.status(),
            url: applyResponse.url(),
            responseBody: applyPayload,
        });

        const responseMessage =
            typeof applyPayload === 'string'
                ? applyPayload.trim()
                : applyPayload?.message ?? JSON.stringify(applyPayload);

        throw new Error(
            `Apply request failed for ${share.companyName}: ${applyResponse.status()}${responseMessage ? ` - ${responseMessage}` : ''}`
        );
    }

    await expect(page.locator('#transactionPIN')).not.toBeVisible({ timeout: 15000 });
    console.log(`Applied for: ${share.companyName}`);
}

export async function applyForShare(page, share) {
    await openShareApplication(page, share);
    await fillShareApplication(page);
    await submitShareApplication(page, share);
}
