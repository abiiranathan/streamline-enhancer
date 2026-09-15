# Streamline Chrome Extension

A Manifest V3 browser extension that adds targeted fixes and quality-of-life
improvements to the Stre@mline EMR (`*.streamlinehealth.tech`).

## Features

### Prescription page
- Makes the **Quantity to dispense** field editable and recalculates the item
  price and grand total whenever it changes.
- Applies a light slate skin to the prescription table with a responsive,
  stacked layout on small screens.

### Clerkship / consultation page
- Defaults the attendance option to **New Attendance**.
- Improves the diagnosis search: results are matched case-insensitively with
  `String.prototype.indexOf` and ranked so that entries where the query starts
  a word (for example **Malaria**) appear above mid-word matches
  (for example Antimalarial). The main-world logic is injected through the
  `chrome.scripting` API to bypass the page's content security policy.

### Recent patients (all pages)
- A floating panel showing recently seen patients, remembered per browser.
- Extracts the full patient name and number from the consultation page and
  associates it with the `myVar` session selection.
- Distinguishes entries seen on the episodes page from the active
  consultation, and remembers the episode id.
- Quick actions on each entry:
  - **Episode summary** (`/patients/episode_summary/<id>`) as a printable PDF.
  - **Ward dispensing per chart** for consultation entries.

### Ward dispensing page
- When the "View Ward Prescription" modal is open, printing produces a single
  page: everything behind the modal is removed, the modal is expanded full
  width, text is forced black, and the table header is styled while the body
  stays black on white.

## Installation

1. Open `chrome://extensions` in Chrome (or a Chromium-based browser).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Reload any open Streamline tabs.

## Project structure

```
extension/
  manifest.json          Manifest V3 configuration
  background.js          Service worker; registers the main-world page script
  content.js             Prescription page fixes (isolated world)
  styles.css             Prescription table skin
  page.js                Diagnosis search logic (MAIN world)
  recent-patients.js     Recent patients panel + patient extraction
  recent-patients.css    Recent patients panel styling
  ward-print.js          Ward prescription modal print handling
  ward-print.css         Ward prescription print/table styling
```

## Permissions

- `scripting` — inject the main-world diagnosis search script.
- Host access to `*://*.streamlinehealth.tech/*`.

## Privacy

Saved page dumps (`*.html`) are intentionally excluded via `.gitignore` because
they can contain patient data and CSRF tokens. Never commit them.

## License

MIT — see [LICENSE](LICENSE). © Dr. Abiira Nathan.
