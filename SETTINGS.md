# MeroShare Playwright Automation - Settings Guide

Complete guide to configure and run the MeroShare Playwright automation suite.

---

## Table of Contents

1. [Environment Variables (.env)](#environment-variables)
2. [Playwright Configuration](#playwright-configuration)
3. [GitHub Actions Setup](#github-actions-setup)
4. [NPM Scripts](#npm-scripts)
5. [Project Structure](#project-structure)
6. [Running Tests Locally](#running-tests-locally)
7. [Running Tests in CI/CD](#running-tests-in-cicd)
8. [Troubleshooting](#troubleshooting)

---

## Environment Variables

### File Location
```
.env  (local development)
```

### Configuration Options

#### Basic URL Configuration
```env
URL=https://meroshare.cdsc.com.np/#/
```
- **Purpose**: Base URL of the MeroShare application
- **Format**: Must end with `/#/` for proper routing
- **Example**: `https://meroshare.cdsc.com.np/#/`
- **When to change**: Only if deploying to different MeroShare environment

#### Authentication Setup Mode
```env
SKIP_SETUP=1
```
- **Purpose**: Control whether to run auth setup test
- **Values**:
  - `1` or `true`: Skip login, reuse saved session (`playwright/.auth/session.json`)
  - `0` or `false` (or omitted): Run fresh login with credentials below
- **Default**: `1` (skip setup)
- **Use Case**:
  - Set to `0` when credentials change or session expired
  - Set to `1` for faster recurring runs

#### Fresh Login Credentials
Used when `SKIP_SETUP=0`:

```env
DP_NAME=YOUR_DP_NAME
MS_USERNAME=YOUR_USERNAME
MS_PASSWORD=YOUR_PASSWORD
```

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `DP_NAME` | Depository Participant name | `NABIL`, `NIC`, `GLOBAL IME BANK` | Yes (if SKIP_SETUP=0) |
| `MS_USERNAME` | MeroShare login username | `john.doe` | Yes (if SKIP_SETUP=0) |
| `MS_PASSWORD` | MeroShare login password | `SecurePass123!` | Yes (if SKIP_SETUP=0) |

#### Live Automation Credentials
Used when running actual automation (applying for shares, updating purchase source):

```env
DMAT_BANK_NAME=YOUR_BANK_NAME
CRN_NO=YOUR_CRN_NO
KITTA_NO=YOUR_KITTA_NO
TRANS_PIN=YOUR_TRANSACTION_PIN
```

| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `DMAT_BANK_NAME` | Bank for share transactions | `NABIL` | Yes (for share apply tests) |
| `CRN_NO` | Client Registration Number | `12345` | Yes (for share apply tests) |
| `KITTA_NO` | Kitta/unit number for shares | `100` | Yes (for share apply tests) |
| `TRANS_PIN` | MeroShare transaction PIN | `1234` | Yes (for share apply tests) |

### Example Configuration

**For Smoke Testing Only** (read-only):
```env
URL=https://meroshare.cdsc.com.np/#/
SKIP_SETUP=1
# No credentials needed
```

**For Fresh Login + Testing**:
```env
URL=https://meroshare.cdsc.com.np/#/
SKIP_SETUP=0
DP_NAME=NABIL
MS_USERNAME=john.doe
MS_PASSWORD=SecurePass123!
DMAT_BANK_NAME=NABIL
CRN_NO=12345
KITTA_NO=100
TRANS_PIN=1234
```

**For CI/CD** (see [GitHub Actions Setup](#github-actions-setup)):
- Use GitHub Secrets instead
- Set `AUTOMATION_USER_N` environment variables

---

## Playwright Configuration

### File Location
```
playwright.config.js
```

### Key Configuration Values

#### Test Directory & Patterns
```javascript
testDir: './tests',
```
- **Purpose**: Where Playwright looks for test files
- **Pattern**: Files matching `*.spec.js` or `.setup.js`

#### Execution Options
```javascript
fullyParallel: false,
forbidOnly: !!process.env.CI,
retries: process.env.CI ? 1 : 0,
timeout: 90 * 1000,
workers: 1,
```

| Setting | Value | Purpose |
|---------|-------|---------|
| `fullyParallel` | `false` | Tests run sequentially (required for session sharing) |
| `forbidOnly` | CI-dependent | Prevents `.only` tests in CI pipelines |
| `retries` | `0` (local), `1` (CI) | Auto-retry failed tests in CI |
| `timeout` | `90000ms` (90s) | Max time per test before timeout |
| `workers` | `1` | Single browser worker (prevents conflicts) |

#### Reporter Configuration
```javascript
reporter: [
    [
        'html',
        {
            open: process.env.CI ? 'never' : 'on-failure',
            outputFolder: reportOutputFolder,
        },
    ],
],
```
- **HTML Report**: Generated in `playwright-report/`
- **Local**: Opens automatically on test failure
- **CI**: Reports only available as artifacts

#### Output Directories
```javascript
outputDir: testResultsOutputDir,
```
- **Screenshots**: `test-results/` (only on failure)
- **Videos**: `test-results/` (only on failure)
- **Traces**: `test-results/` (only on failure)

#### Session Isolation
```javascript
projects: [
    {
        name: 'setup',
        testMatch: /auth\.setup\.js/,
    },
    {
        name: 'chromium',
        testMatch: /ms\.spec\.js/,
        use: { ...devices['Desktop Chrome'] },
        dependencies: ['setup'],
    },
    {
        name: 'smoke',
        testMatch: /smoke\.spec\.js/,
        use: { ...devices['Desktop Chrome'] },
        dependencies: ['setup'],
    },
]
```

| Project | Purpose | Depends On |
|---------|---------|-----------|
| `setup` | Runs `auth.setup.js` - creates session file | None |
| `chromium` | Runs `ms.spec.js` - main automation | `setup` |
| `smoke` | Runs `smoke.spec.js` - read-only checks | `setup` |

---

## GitHub Actions Setup

### File Location
```
.github/workflows/daily.yml
```

### Workflow Configuration

#### Schedule
```yaml
on:
  schedule:
    - cron: "15 7 * * *"  # Daily at 1:00 PM Nepal Time (UTC+5:45)
  workflow_dispatch:       # Can be triggered manually
```

#### Environment Variables
```yaml
env:
  URL: https://meroshare.cdsc.com.np/#/
  AUTOMATION_USER_1: ${{ secrets.AUTOMATION_USER_1 || '' }}
  AUTOMATION_USER_2: ${{ secrets.AUTOMATION_USER_2 || '' }}
  # ... up to AUTOMATION_USER_20
```

#### Required GitHub Secrets

Each secret should be a JSON object with this structure:

```json
{
  "dpName": "NABIL",
  "username": "john.doe",
  "password": "SecurePass123!",
  "bankName": "NABIL",
  "crn": "12345",
  "kitta": "100",
  "transactionPin": "1234",
  "id": "user-1"
}
```

**To Add Secrets**:
1. Go to GitHub Repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `AUTOMATION_USER_1` (or `AUTOMATION_USER_2`, etc.)
4. Value: JSON string (above)
5. Click **Add secret**

**Example for User 1**:
```
Name: AUTOMATION_USER_1
Value: {"dpName":"NABIL","username":"***","password":"***","bankName":"NABIL","crn":"12345","kitta":"100","transactionPin":"***","id":"user-1"}
```

#### Jobs

**Smoke Job** (Non-mutating):
- Runs smoke checks for all configured users
- Must pass before mutation job starts
- Runs `npm run test:ci:smoke:multi`

**CI Job** (Mutating - Optional):
- Runs actual automation (applies for shares, updates purchase source)
- Only runs if `run_live: true` in workflow dispatch
- Runs `npm run test:ci:multi`

**Security Job** (Optional):
- Runs dependency checks
- Uses `npm audit`

### Triggering Workflow

**Automatic (Daily)**:
- Runs automatically at 1:00 PM Nepal Time every day
- Cron: `15 7 * * *` (7:15 UTC = 1:00 Nepal Time)

**Manual Trigger**:
1. Go to **Actions** tab in GitHub
2. Select **Daily MeroShare Automation**
3. Click **Run workflow**
4. (Optional) Enter `user_ids` (comma-separated)
5. (Optional) Set `run_live: true` to run mutations
6. Click **Run workflow**

### Workflow Output

**Artifacts** (available for 7 days):
- `playwright-report-smoke`: Smoke test HTML report
- `test-results-smoke`: Smoke test results logs
- `playwright-report-ci`: Full automation HTML report
- `test-results-ci`: Full automation results logs

---

## NPM Scripts

### Available Commands

#### Local Testing

```bash
npm test
```
- **Purpose**: Run all tests (setup + full automation)
- **Uses**: Single worker, 1 project at a time
- **Requires**: Valid session or SKIP_SETUP=0 with credentials
- **Time**: ~5-10 minutes per user

```bash
npm run test:smoke
```
- **Purpose**: Run smoke tests only (read-only, no mutations)
- **Uses**: Single worker
- **Time**: ~2-3 minutes
- **Safe for**: Testing without making changes

```bash
npm run test:setup
```
- **Purpose**: Run authentication setup (login and save session)
- **Uses**: Single worker, `setup` project only
- **Requires**: SKIP_SETUP=0 and credentials in .env
- **Generates**: `playwright/.auth/session.json`
- **Time**: ~1-2 minutes

```bash
npm run test:headed
```
- **Purpose**: Run tests with visible browser window (debugging)
- **Uses**: Single worker, shows UI
- **Helpful for**: Debugging test steps visually

#### CI/CD Testing

```bash
npm run test:ci
```
- **Purpose**: Run in CI mode (setup + main automation)
- **Uses**: Single worker, chromium project only
- **Called by**: GitHub Actions

```bash
npm run test:ci:smoke
```
- **Purpose**: Run CI smoke tests
- **Uses**: Single worker, smoke project only

```bash
npm run test:ci:multi
```
- **Purpose**: Run CI tests for all configured users
- **Discovers**: AUTOMATION_USER_N variables
- **Runs**: Multiple users sequentially
- **Called by**: GitHub Actions

```bash
npm run test:ci:smoke:multi
```
- **Purpose**: Run CI smoke tests for all users
- **Called by**: GitHub Actions smoke job

#### Reporting

```bash
npm run test:report
```
- **Purpose**: Open the last HTML test report
- **Launches**: Browser with interactive report
- **Located at**: `playwright-report/index.html`

### Script Reference Table

| Command | Local | CI | Purpose |
|---------|-------|----|---------| 
| `npm test` | ✅ | ❌ | Full automation |
| `npm run test:smoke` | ✅ | ❌ | Smoke tests only |
| `npm run test:setup` | ✅ | ❌ | Auth setup |
| `npm run test:headed` | ✅ | ❌ | Visual debugging |
| `npm run test:ci` | ❌ | ✅ | CI full automation |
| `npm run test:ci:smoke` | ❌ | ✅ | CI smoke |
| `npm run test:ci:multi` | ❌ | ✅ | CI multi-user |
| `npm run test:ci:smoke:multi` | ❌ | ✅ | CI smoke multi |
| `npm run test:report` | ✅ | ✅ | View HTML report |

---

## Project Structure

```
meroshare_automation/
├── .env                          # Local environment variables (NOT in git)
├── .env.example                  # Example configuration template
├── .gitignore                    # Excludes .env, credentials, reports
├── .github/
│   └── workflows/
│       └── daily.yml             # GitHub Actions workflow
├── playwright.config.js          # Playwright configuration
├── package.json                  # NPM dependencies & scripts
├── DIAGNOSIS.md                  # Troubleshooting guide
├── SETTINGS.md                   # This file
├── playwright/
│   ├── report/                   # Generated HTML reports
│   └── .auth/
│       ├── session.json          # Saved browser session (NOT in git)
│       └── [user-id]/            # Per-user sessions
│           └── session.json
├── test-results/                 # Test execution artifacts
│   ├── [test-name]/
│   │   ├── screenshot.png        # On-failure screenshots
│   │   ├── trace.zip             # Browser trace for debugging
│   │   └── video.webm            # Test video
│   └── .last-run.json            # Last execution status
├── tests/
│   ├── auth.setup.js             # Authentication setup test
│   ├── ms.spec.js                # Main automation tests
│   ├── smoke.spec.js             # Read-only smoke tests
│   ├── flows/                    # Reusable test workflows
│   │   ├── auth.js               # Login flow
│   │   ├── asba.js               # ASBA share application flow
│   │   └── purchase-source.js    # Purchase source update flow
│   └── support/                  # Test utilities
│       ├── config.js             # Configuration & env reading
│       ├── session.js            # Session persistence
│       ├── select.js             # Dropdown/select helpers
│       └── ci-debug.js           # CI debugging utilities
└── scripts/
    ├── run-multi-user-ci.mjs     # Multi-user CI runner
    └── generate-workflow-secrets.mjs  # Secret generator
```

### Key Directories

| Directory | Purpose | Git |
|-----------|---------|-----|
| `tests/` | Test files & flows | ✅ Committed |
| `playwright/.auth/` | Session files | ❌ Ignored |
| `test-results/` | Test artifacts | ❌ Ignored |
| `playwright-report/` | HTML reports | ❌ Ignored |
| `.github/workflows/` | CI/CD configuration | ✅ Committed |

---

## Running Tests Locally

### Initial Setup (First Time)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install

# 3. Configure credentials in .env
# Edit .env with your MeroShare credentials
nano .env  # or use VS Code

# 4. Run auth setup to create session
npm run test:setup

# 5. Enable skip-setup for faster runs (optional)
# Edit .env: set SKIP_SETUP=1
```

### Running Smoke Tests

```bash
# Quick read-only verification
npm run test:smoke

# With HTML report
npm run test:smoke
npm run test:report  # Opens report in browser
```

### Running Full Automation

```bash
# Run all tests (setup + automation)
npm test

# View the results
npm run test:report
```

### Debugging with Visible Browser

```bash
# Open browser window and watch test run
npm run test:headed

# Or use Playwright Inspector
npx playwright test --debug
```

### Running Specific Tests

```bash
# Run only ASBA share tests
npx playwright test ms.spec.js

# Run only smoke tests
npx playwright test smoke.spec.js

# Run only auth setup
npx playwright test auth.setup.js

# Run with specific filter
npx playwright test --grep "Apply Share"
```

---

## Running Tests in CI/CD

### GitHub Actions Workflow

**Automatic Execution**:
```
Every day at 1:00 PM Nepal Time (7:15 UTC)
```

**Manual Trigger**:
1. Go to **Actions** tab
2. Select **Daily MeroShare Automation**
3. Click **Run workflow**
4. (Optional) Enter comma-separated user IDs: `user-1,user-2`
5. (Optional) Check `run_live` to run mutations
6. Click **Run workflow**

### Workflow Steps

1. **Checkout Code**: Pull latest from repository
2. **Setup Node.js**: Install Node.js 20
3. **Install Dependencies**: `npm ci`
4. **Install Browsers**: `npx playwright install chromium`
5. **Smoke Checks**: Run `npm run test:ci:smoke:multi` (must pass)
6. **Upload Smoke Report**: Save artifacts
7. **Mutation Tests** (if `run_live=true`): Run `npm run test:ci:multi`
8. **Upload Full Report**: Save artifacts

### Multi-User Execution

The workflow automatically discovers all configured users:

```bash
AUTOMATION_USER_1 = {...}  # Discovered ✅
AUTOMATION_USER_2 = {...}  # Discovered ✅
AUTOMATION_USER_5 = {...}  # Discovered ✅
AUTOMATION_USER_10 = {}    # Skipped (empty)
```

Each user runs **sequentially** (one after another):
- User 1 → Smoke checks ✅ → Automation (if enabled) ✅
- User 2 → Smoke checks ✅ → Automation (if enabled) ✅
- ...

**Total Time**: ~5-10 minutes per user

### Viewing CI Results

1. Go to **Actions** tab in GitHub
2. Click the workflow run
3. View **Logs** for real-time output
4. Download **Artifacts** for reports:
   - `playwright-report-smoke`
   - `test-results-smoke`
   - `playwright-report-ci` (if mutations run)
   - `test-results-ci` (if mutations run)

---

## Troubleshooting

### Session Issues

**Problem**: `Session file not found at playwright/.auth/session.json`

**Solution**:
```bash
# Option 1: Generate new session
npm run test:setup

# Option 2: Disable skip-setup
# Edit .env: set SKIP_SETUP=0
# Then run:
npm test
```

---

### Missing Credentials Error

**Problem**: `Missing required environment variable: DP_NAME`

**Solution**:
```env
# Edit .env and fill:
DP_NAME=YOUR_DP_NAME
MS_USERNAME=YOUR_USERNAME
MS_PASSWORD=YOUR_PASSWORD
DMAT_BANK_NAME=YOUR_BANK_NAME
CRN_NO=YOUR_CRN_NO
KITTA_NO=YOUR_KITTA_NO
TRANS_PIN=YOUR_TRANSACTION_PIN
```

Then retry: `npm test:setup`

---

### Timeout Errors

**Problem**: `Test timeout of 90000ms exceeded`

**Solution**:
```bash
# Increase timeout (edit playwright.config.js)
timeout: 120 * 1000,  # 120 seconds

# Or run specific test with more time:
npx playwright test --timeout=120000
```

---

### Browser Crashes

**Problem**: Browser window closes unexpectedly

**Solution**:
```bash
# 1. Restart Playwright browsers
npx playwright install --with-deps

# 2. Clear session and retry
rm playwright/.auth/session.json
npm run test:setup

# 3. Run with debugging
npm run test:headed
```

---

### GitHub Actions Failures

**Problem**: Workflow fails but local tests pass

**Solution**:
1. Check **Actions** tab for logs
2. Compare **CI environment** vs **Local environment**
3. Verify **GitHub Secrets** are correctly set:
   ```
   Settings → Secrets and variables → Actions
   ```
4. Check **secret format**: Must be valid JSON
5. Re-trigger workflow: **Run workflow** button

---

### Multi-User Issues

**Problem**: Only some users run in CI/CD

**Solution**:
- Check GitHub Secrets are named correctly: `AUTOMATION_USER_1`, `AUTOMATION_USER_2`, etc.
- Verify secrets have values (not empty)
- Verify JSON format is valid:
  ```json
  {"dpName":"...","username":"...","password":"...","bankName":"...","crn":"...","kitta":"...","transactionPin":"..."}
  ```

---

## Best Practices

### 1. Credential Management
- ✅ Use `.env` only for local development
- ✅ Use GitHub Secrets for CI/CD
- ❌ Never commit `.env` file
- ❌ Never share credentials

### 2. Session Management
- ✅ Keep `SKIP_SETUP=1` for faster local runs
- ✅ Run `npm run test:setup` when credentials change
- ✅ Let CI auto-regenerate sessions daily
- ❌ Don't manually edit `session.json`

### 3. Test Execution
- ✅ Always run `npm run test:smoke` before `npm test`
- ✅ Use `--headed` flag only for debugging
- ✅ Check reports after each run
- ✅ Commit only `.env.example`, not `.env`

### 4. GitHub Actions
- ✅ Keep workflow schedule reasonable (daily)
- ✅ Monitor **Artifacts** for test reports
- ✅ Use manual trigger only when needed
- ✅ Archive old artifacts to save storage

---

## Reference

For more details, see:
- [DIAGNOSIS.md](DIAGNOSIS.md) - Troubleshooting guide
- [Playwright Docs](https://playwright.dev)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

---

**Last Updated**: April 9, 2026
**Version**: 1.0
