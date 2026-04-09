import path from 'path';

export function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function requireUserField(user, fieldName) {
    const value = user?.[fieldName];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Missing required field "${fieldName}" in MS_USER_JSON.`);
    }
    return value.trim();
}

function readActiveUser() {
    const rawValue = process.env.MS_USER_JSON?.trim();
    if (!rawValue) return null;

    let user;
    try {
        user = JSON.parse(rawValue);
    } catch (error) {
        throw new Error(`Invalid MS_USER_JSON: ${error.message}`);
    }

    if (!user || typeof user !== 'object' || Array.isArray(user)) {
        throw new Error('Invalid MS_USER_JSON: expected a JSON object.');
    }

    return user;
}

function readRunId(activeUser) {
    const runId = process.env.MS_RUN_ID?.trim() || activeUser?.id?.trim() || '';
    if (!runId) return null;

    if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
        throw new Error(
            `Invalid MS_RUN_ID "${runId}". Use only letters, numbers, ".", "_" or "-".`
        );
    }

    return runId;
}

function readUserValue(activeUser, fieldName, envName) {
    return activeUser ? requireUserField(activeUser, fieldName) : requireEnv(envName);
}

function createLazyUserEnv(fieldMap) {
    const env = {};

    for (const [key, [fieldName, envName]] of Object.entries(fieldMap)) {
        Object.defineProperty(env, key, {
            enumerable: true,
            get() {
                return readUserValue(ACTIVE_USER, fieldName, envName);
            },
        });
    }

    return Object.freeze(env);
}

function normalizeOriginUrl(rawUrl) {
    return `${rawUrl.replace(/#.*$/, '').replace(/\/+$/, '')}/`;
}

function buildRouteUrl(originUrl, route = '') {
    const normalizedRoute = route.replace(/^#?\/?/, '');
    return normalizedRoute ? `${originUrl}#/${normalizedRoute}` : `${originUrl}#/`;
}

export const IS_CI = !!process.env.CI;
export const URL = normalizeOriginUrl(requireEnv('URL'));
export const BASE_URL = buildRouteUrl(URL);
export const ACTIVE_USER = readActiveUser();
export const ACTIVE_USER_ID = ACTIVE_USER ? requireUserField(ACTIVE_USER, 'id') : null;
export const RUN_ID = readRunId(ACTIVE_USER);
export const SESSION_FILE = RUN_ID
    ? path.join(__dirname, '../../playwright/.auth', RUN_ID, 'session.json')
    : path.join(__dirname, '../../playwright/.auth/session.json');

export const AUTH_ENV = createLazyUserEnv({
    dpName: ['dpName', 'DP_NAME'],
    username: ['username', 'MS_USERNAME'],
    password: ['password', 'MS_PASSWORD'],
});

export const MEROSHARE_ENV = createLazyUserEnv({
    bankName: ['bankName', 'DMAT_BANK_NAME'],
    kitta: ['kitta', 'KITTA_NO'],
    crn: ['crn', 'CRN_NO'],
    transactionPin: ['transactionPin', 'TRANS_PIN'],
});

export function appRoute(route = '') {
    return buildRouteUrl(URL, route);
}
