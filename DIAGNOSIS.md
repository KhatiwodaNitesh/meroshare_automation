# Test Failure Diagnosis & Resolution Guide

## Executive Summary
Your tests are failing due to:
1. **Missing test credentials** (DP_NAME, MS_USERNAME, etc.) in `.env`
2. **Incorrect DOM selector** in purchase-source.js
3. **No valid session file** when SKIP_SETUP=1

---

## Issue #1: Missing Test Credentials (CRITICAL)

### Error Message
```
Error: Missing required environment variable: DP_NAME
```

### Root Cause
The `.env` file has all credential fields empty:
```
DP_NAME=
MS_USERNAME=
MS_PASSWORD=
DMAT_BANK_NAME=
CRN_NO=
KITTA_NO=
TRANS_PIN=
```

### Why It Fails
When `SKIP_SETUP=0` (or SKIP_SETUP is not set), the auth setup test runs and tries to access these credentials. Since they're empty, it throws: `Missing required environment variable: DP_NAME`

### Solution
Fill in your MeroShare credentials in `.env`:
```env
URL=https://meroshare.cdsc.com.np/#/

# Fresh login credentials
DP_NAME=YOUR_DP_NAME         # e.g., NABIL, NIC, SBI, etc.
MS_USERNAME=YOUR_USERNAME    # Your MeroShare username
MS_PASSWORD=YOUR_PASSWORD    # Your MeroShare password

# Live automation values
DMAT_BANK_NAME=YOUR_BANK_NAME  # e.g., NABIL
CRN_NO=YOUR_CRN_NO            # Client Registration Number
KITTA_NO=YOUR_KITTA_NO        # Kitta number for share applications
TRANS_PIN=YOUR_TRANSACTION_PIN # MeroShare transaction PIN
```

### Test Commands
```bash
# Option A: Fresh login + run tests (requires credentials above)
npm run test:setup    # Generate valid session file
npm test              # Run automation tests (will use saved session)

# Option B: Skip login, reuse existing session
# Ensure SKIP_SETUP=1 in .env and a valid session exists
npm test
```

---

## Issue #2: Incorrect DOM Selector

### Error Details
**File**: `tests/flows/purchase-source.js`, line 13

### Problem
```javascript
// WRONG - This selector doesn't exist in the DOM:
return page.locator('#browsers option').evaluateAll((nodes) => ...
```

The page doesn't have an element with id `browsers`. The correct selector should target `#script`.

### Fix Applied ✓
Changed to:
```javascript
// CORRECT - Selects all <option> elements within #script
return page.locator('#script option').evaluateAll((nodes) => ...
```

---

## Issue #3: Session File Missing

### Error Message
```
Error: Session file not found at playwright/.auth/session.json
Run the auth setup test first to generate it.
```

### Root Cause
The `.env` file has:
```
SKIP_SETUP=1
```

This **skips the auth setup**, but there's no pre-existing session file to load.

### Solution
Choose one approach:

#### Approach A: Generate a Fresh Session (Recommended for First Run)
```bash
# 1. Fill in credentials in .env (see Issue #1)
# 2. Remove or set SKIP_SETUP=0 in .env
# 3. Run auth setup to create session file
npm run test:setup

# 4. Optional: Re-enable SKIP_SETUP for faster test runs
# Set SKIP_SETUP=1 in .env
# 5. Run tests using the saved session
npm test
```

#### Approach B: Create a Manual Session File
If you have an existing Playwright session or authentication state:
```bash
# Create the session directory
mkdir -p playwright/.auth

# Add your session.json file here with browser auth state
# The file should contain cookies, localStorage, sessionStorage, etc.
```

---

## Testing Workflow

### First Time Setup
```bash
# 1. Clone repo and install deps
npm install

# 2. Update .env with YOUR credentials
# Edit .env and fill in all credential fields

# 3. Create session by running setup
# Make sure .env has SKIP_SETUP=0 (or commented out)
npm run test:setup

# 4. Enable skip-setup for future runs (optional)
# Set SKIP_SETUP=1 in .env to reuse session

# 5. Run tests with saved session
npm test           # All tests
npm run test:smoke # Smoke tests only
```

### Subsequent Runs (Session Already Exists)
```bash
# Session is saved in: playwright/.auth/session.json
# Tests will reuse it automatically
npm test
```

---

## Verification Checklist

- [ ] `.env` file has all credentials filled in
- [ ] Session file exists: `playwright/.auth/session.json` (or run `npm run test:setup`)
- [ ] DOM selector fix applied in `purchase-source.js` (Already fixed ✓)
- [ ] Run: `npm run test:smoke` to verify setup works
- [ ] Run: `npm test` to execute full automation suite

---

## Environment Variable Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `URL` | MeroShare application URL | `https://meroshare.cdsc.com.np/#/` |
| `DP_NAME` | Depository Participant name | `NABIL`, `NIC`, `SBI` |
| `MS_USERNAME` | Your MeroShare login username | `john.doe` |
| `MS_PASSWORD` | Your MeroShare login password | `SecurePass123!` |
| `DMAT_BANK_NAME` | Bank name for stock transactions | `NABIL` |
| `CRN_NO` | Client Registration Number | `12345` |
| `KITTA_NO` | Your kitta/unit number | `100` |
| `TRANS_PIN` | Transaction PIN for MeroShare | `1234` |
| `SKIP_SETUP` | Skip auth setup (1=skip, 0=run) | `1` |

---

## If Tests Still Fail

### Check Test Output
```bash
# Run with detailed output
npm test -- --verbose

# View HTML report (after test run)
npm run test:report
```

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| "Session file not found" | No valid session.json | Run `npm run test:setup` |
| "DP_NAME not found" | Credentials missing in .env | Fill credentials in .env |
| "My ASBA link not found" | Session expired or invalid | Re-run `npm run test:setup` |
| "element(s) not found" in purchase source | Wrong selector (now fixed) | Already applied ✓ |

---

## Next Steps

1. **Update `.env`** with your actual MeroShare credentials
2. **Run setup** to create a valid session: `npm run test:setup`
3. **Verify smoke tests** work: `npm run test:smoke`
4. **Run full suite**: `npm test`

The test suite is now structurally ready. All it needs is your credentials to authenticate!
