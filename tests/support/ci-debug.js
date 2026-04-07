import { ACTIVE_USER_ID, IS_CI, RUN_ID } from './config';

const PAGE_DEBUG = new WeakMap();
const RUN_LABEL = ACTIVE_USER_ID ?? RUN_ID ?? 'unknown-user';

function pushBounded(items, item, limit = 250) {
    items.push(item);
    if (items.length > limit) items.shift();
}

export function ciLog(message, payload) {
    if (!IS_CI) return;
    const prefix = `[CI][${RUN_LABEL}]`;
    if (payload === undefined) {
        console.log(`${prefix}[DEBUG] ${message}`);
        return;
    }

    console.log(`${prefix}[DEBUG] ${message}: ${JSON.stringify(payload)}`);
}

export function attachCiPageDebug(page) {
    if (!IS_CI) return;

    const state = {
        requests: [],
        responses: [],
        requestFailures: [],
        consoleMessages: [],
        pageErrors: [],
        dialogs: [],
    };

    const requestListener = (request) => {
        pushBounded(state.requests, {
            method: request.method(),
            resourceType: request.resourceType(),
            url: request.url(),
        });
    };

    const responseListener = (response) => {
        pushBounded(state.responses, {
            method: response.request().method(),
            resourceType: response.request().resourceType(),
            status: response.status(),
            url: response.url(),
        });
    };

    const requestFailedListener = (request) => {
        pushBounded(state.requestFailures, {
            method: request.method(),
            resourceType: request.resourceType(),
            failure: request.failure()?.errorText ?? 'unknown',
            url: request.url(),
        });
    };

    const consoleListener = (message) => {
        pushBounded(state.consoleMessages, {
            type: message.type(),
            text: message.text(),
            location: message.location(),
        });
    };

    const pageErrorListener = (error) => {
        pushBounded(state.pageErrors, {
            message: error.message,
            stack: error.stack,
        });
    };

    const dialogListener = (dialog) => {
        pushBounded(state.dialogs, {
            type: dialog.type(),
            message: dialog.message(),
        });
    };

    page.on('request', requestListener);
    page.on('response', responseListener);
    page.on('requestfailed', requestFailedListener);
    page.on('console', consoleListener);
    page.on('pageerror', pageErrorListener);
    page.on('dialog', dialogListener);

    PAGE_DEBUG.set(page, {
        state,
        listeners: {
            requestListener,
            responseListener,
            requestFailedListener,
            consoleListener,
            pageErrorListener,
            dialogListener,
        },
    });
}

export async function attachCiArtifacts(page, testInfo) {
    if (!IS_CI) return;

    const debug = PAGE_DEBUG.get(page);
    if (!debug) return;

    const { state, listeners } = debug;
    page.off('request', listeners.requestListener);
    page.off('response', listeners.responseListener);
    page.off('requestfailed', listeners.requestFailedListener);
    page.off('console', listeners.consoleListener);
    page.off('pageerror', listeners.pageErrorListener);
    page.off('dialog', listeners.dialogListener);

    const payload = {
        userId: RUN_LABEL,
        title: testInfo.title,
        status: testInfo.status,
        expectedStatus: testInfo.expectedStatus,
        url: page.url(),
        requests: state.requests,
        responses: state.responses,
        requestFailures: state.requestFailures,
        consoleMessages: state.consoleMessages,
        pageErrors: state.pageErrors,
        dialogs: state.dialogs,
    };

    await testInfo.attach('ci-page-debug.json', {
        body: Buffer.from(JSON.stringify(payload, null, 2)),
        contentType: 'application/json',
    });

    if (testInfo.status !== testInfo.expectedStatus) {
        const html = await page.content().catch(() => null);
        if (html) {
            await testInfo.attach('ci-page-content.html', {
                body: Buffer.from(html),
                contentType: 'text/html',
            });
        }
    }
}
