# Resume Generator

## Overview

Generates a PDF resume from JSON Resume data stored in a GitHub Gist (`5489290125ff3707caf8d51cb6cdc8a0`). The gist follows the [JSON Resume schema](https://github.com/jsonresume/resume-schema) with a custom `expirationDate` field on certificates.

## Architecture

- `generate.js` — Fetches resume data from the gist, renders it into `template.html`, and uses Puppeteer to produce `NicholasJonesResume.pdf`
- `template.html` — HTML/CSS template with `{{placeholder}}` tokens
- `.github/workflows/generate.yml` — Regenerates the PDF on push to main, daily at midnight UTC, or manual dispatch

## Key Concepts

- **Resume data lives in the gist, not in this repo.** To update resume content (jobs, certs, education, etc.), update the gist via `gh api`.
- **Certification expiration dates** are stored as `expirationDate` (year string) on each cert in the gist. Certs without `expirationDate` display "NED" (no expiration date).
- **Certs are categorized** into security vs cloud columns using keyword lists (`SECURITY_CERT_KEYWORDS`, `CLOUD_CERT_KEYWORDS`).
- **Work experience** is grouped by company with multiple positions shown under one header.

## Commands

- `npm run generate` — Generate the PDF locally (requires Puppeteer/Chrome)
- `npm ci` — Install dependencies

## Updating the Gist

```bash
# Download
gh api gists/5489290125ff3707caf8d51cb6cdc8a0 --jq '.files["resume.json"].content' > tmp_resume.json

# Edit tmp_resume.json, then push back:
node -e "
const fs = require('fs');
const content = fs.readFileSync('tmp_resume.json', 'utf-8');
const payload = JSON.stringify({files: {'resume.json': {content}}});
fs.writeFileSync('tmp_payload.json', payload);
"
gh api gists/5489290125ff3707caf8d51cb6cdc8a0 --method PATCH --input tmp_payload.json
```
