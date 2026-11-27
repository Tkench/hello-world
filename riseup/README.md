# RiseUp

A Chrome extension that adds what Articulate Rise 360 doesn't do itself. Courses published with RiseUp's styling work for learners without the extension.

## What it adds, and what it leaves to Rise

Before building, Rise's current features were checked (November 2026) so RiseUp doesn't duplicate them.

| Area | Rise already does (left to Rise) | RiseUp adds |
| --- | --- | --- |
| Course styling | Theme colours, theme fonts, block backgrounds and padding, Block Defaults with Apply to All (Labs) | Block corner radius and shadow, image corner radius, button radius / letter case / weight, heading letter case / weight, link colour and underline, custom CSS |
| Text | Heading and body font (including uploaded WOFF fonts), size, line height, letter spacing, colour | Text styles for **any word or phrase**: any Google Font, weight, italic, small caps, letter case, gradient text, shadow, highlight |
| Find and replace | Nothing built in (a beta has been mentioned in the community) | Find and replace in the open lesson, and **course-wide** find and replace through Rise's XLIFF translation export/import |
| Colour | Colour fields with hex input; brand colours with Brands (beta) | Eyedropper that picks from anywhere on screen, saved palettes, recent colours, WCAG contrast checker |

## Install (developer mode)

1. Download or clone this repository.
2. In Chrome or Edge, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `riseup` folder.
3. Open a course at rise.articulate.com. A **RiseUp** button appears at the bottom right.

## Using it

- **Styles tab**: course-wide styling. Changes show immediately in the editor.
- **Text tab**: add Google Fonts, create a text style, select a phrase in your course, and click **Apply to selected text**. Every occurrence of that phrase gets the style. In the editor it's marked with a dotted underline. The full style shows in Rise's Preview and in the published course.
- **Find tab**: searches the open lesson. **Replace all** goes through Rise's own editing, so Rise saves the change. Text in blocks that aren't editable yet is listed, but has to be clicked into first.
- **Colors tab**: pick from screen, copy hex codes into Rise's colour fields, keep palettes, check contrast.
- **Publish & tools** (button in the panel, or the toolbar icon):
  1. **Publish with RiseUp styling**: publish from Rise as normal (SCORM, xAPI, cmi5, AICC or Web), drop the zip in, and upload the `-riseup.zip` it gives you. Fonts can be included in the package so the course doesn't need Google Fonts at runtime.
  2. **Course-wide find and replace**: export the course's translation file (XLIFF) from Rise, replace text here, import the new file back into Rise.
  3. **Back up and share settings** as JSON.

Settings are stored per course in the browser (`chrome.storage.local`). Use export/import to share them with your team.

## How it works

- `src/content/`: the panel and live styling inside Rise. It never edits Rise's own content (Rise could save the extra markup). Inside the editor, styled phrases are shown with the CSS Custom Highlight API. In previews, they're wrapped in spans.
- `src/runtime/riseup-runtime.js`: the small script added to published courses. It applies text styles as Rise renders each lesson.
- `src/shared/`: logic shared by all parts, covered by unit tests: CSS generation, text rules, colour contrast, XLIFF, package patching and font download.
- `src/tools/`: the publish, XLIFF and backup page.

### Rise's markup

Rise's page structure isn't a public API and can change without notice. Every selector that depends on it is in `SELECTORS` at the top of `src/shared/css.js`, plus `courseIdFromUrl` in `src/shared/config.js`. **These still have to be checked against a live Rise account.** The automated tests use a stand-in page, not real Rise. If a style doesn't apply in Rise, inspect the element and update `SELECTORS`.

## Development

```bash
npm install
npm test            # unit tests
npm run test:e2e    # loads the extension in Chromium against a mock Rise page (needs Playwright)
npm run package     # riseup.zip for the Chrome Web Store
```

## Before publishing to the Chrome Web Store

- "Rise" is an Articulate trademark, and a product called "Rise Up" (an LMS, riseup.ai) already exists. Check the name before a public listing.
- Add a privacy policy. RiseUp sends nothing anywhere except requests to Google Fonts for the fonts you add.
