# Mobile visual QA

Generated from the production build on 2026-08-30 after the automated suite passed.

- Chromium viewport: 390 × 844
- WebKit viewport: 360 × 800
- Screens covered: onboarding, record home, live camera viewfinder, mock suggestion, comparison, completion, life ranking, profile / taste DNA
- Result: no horizontal document overflow in either viewport

The PNG files under `screenshots/` are retained as review evidence. They use only the bundled demo images and the local PWA icon; no user photo or personal content is included.

Automated checks remain the source of truth for interaction and persistence behavior. These screenshots are visual evidence, not a substitute for Jay's Safari/iPhone smoke test.

The Chromium camera screenshot uses Playwright's deterministic fake camera feed. It verifies the real `getUserMedia` UI and shutter path without capturing a person or room.

`screenshots-v4/` records the 2026-08-31 corrective pass: explicit public-AI-unavailable state, manual rank revision feedback, and the highest-level NO.01 ceremony. The images contain only bundled demo assets.
