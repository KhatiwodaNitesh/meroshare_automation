import path from 'path';

export function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const IS_CI = !!process.env.CI;
export const URL = requireEnv('URL');
export const BASE_URL = `${URL}#/`;
export const SESSION_FILE = path.join(__dirname, '../../playwright/.auth/session.json');

export const AUTH_ENV = {
    dpName: requireEnv('DP_NAME'),
    username: requireEnv('MS_USERNAME'),
    password: requireEnv('MS_PASSWORD'),
};

export const MEROSHARE_ENV = {
    bankName: requireEnv('DMAT_BANK_NAME'),
    kitta: requireEnv('KITTA_NO'),
    crn: requireEnv('CRN_NO'),
    transactionPin: requireEnv('TRANS_PIN'),
};
