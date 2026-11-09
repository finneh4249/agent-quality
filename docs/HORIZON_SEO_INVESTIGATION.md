# Horizon SEO Score Investigation & Attribution Report

## Executive Summary

AQG reported a Lighthouse SEO score of **66/100** for the Horizon Vite/React frontend, causing a quality gate threshold failure (`66.0 < 95.0`).

A controlled investigation was conducted across Horizon's Git history to determine whether this failure was inherited from the original implementation, introduced by subsequent changes, or an artifact of the local audit environment.

## Attribution Matrix

| Finding | Original (Owen Miller `61796a7`) | Current (`feat/headless-poc` `c622a50`) | Attribution |
|---|---|---|---|
| **SEO Score** | N/A (Monolithic Django app; no standalone preview) | `66/100` (Measured on `http://127.0.0.1:5174/`) | **Introduced** in commit `50faa20` |
| **Failed Audit IDs** | No preview server in Git tree | 1. `is-crawlable` (Score: 0, Weight: 10)<br>2. `llms-txt` (Score: 0, Weight: 0)<br>3. `ard-schema` (Score: 0, Weight: 0) | Primary failure caused by `<meta name="robots" content="noindex, nofollow, noarchive" />`. |
| **Environment Differences** | Full Python/PostgreSQL/Wagtail stack required | Standalone Vite static preview (`static-preview/`) | Structural shift from Django server templates to static preview mocks. |

---

## Detailed Investigation

### 1. Authorship & Commit History
- **Original Baseline:** Owen Miller authored the repository through commit `61796a7` ("Running linting and tests for PRs", Mon Oct 12 2026). In this baseline, Horizon was a Django/Wagtail server application. Vite was used solely to compile CSS/JS assets (`"build": "vite build"`, `"dev": "vite build --watch"`). There was no `preview` script or `static-preview/` directory.
- **Introduction of Static Preview:** In commit `50faa20` ("Add self-contained multi-page static Horizon design preview with noindex", Sat Oct 17 2026), Ethan Cornwill introduced the `static-preview/` directory and added `"preview": "vite static-preview --host 127.0.0.1"` to `package.json`.

### 2. Root Cause of the 66/100 Score
Inspection of `static-preview/index.html` revealed:
```html
<meta name="robots" content="noindex, nofollow, noarchive" />
```
And `static-preview/robots.txt`:
```text
User-agent: *
Disallow: /
```
Lighthouse's `is-crawlable` audit has a heavy weight (10) in the SEO category. Because the page explicitly forbade search engine crawlers, Lighthouse scored `is-crawlable` as 0, dropping the overall SEO score by ~30 points.

### 3. Controlled Experimental Verification
To isolate the effect of the `noindex` directive, a controlled audit was executed in an isolated directory with identical Lighthouse and Chrome configurations:
1. In the first run (with `noindex` and `Disallow: /`), the SEO score was **66.0**.
2. In the controlled run (removing `noindex` and allowing crawling in `robots.txt`), the SEO score jumped to **100.0** (`SEO: ✓ 100.0 / 95`).

### 4. Conclusion & Recommendation
- **Attribution:** The failure was **introduced** in commit `50faa20` as an intentional safeguard to prevent staging design previews from being indexed by search engines.
- **Remediation:** For production releases, replace the staging `noindex` meta tag and `robots.txt` disallow with production crawl directives.
