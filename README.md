# Family Tree

Local-first family tree editor in a single HTML file. No build step, no backend.

Live: https://nanot1m.github.io/my-genealogical-tree/

## Features

- Miro-style canvas: wheel or trackpad pans, pinch or ⌘+wheel zooms, space+drag, fit to screen
- Cards with photo, name, birth surname, birth and death dates, living toggle, age
- Parents, siblings, children, multiple spouses with marriage dates and status (married, partners, separated, divorced)
- Link existing people as spouse, child or parent; relationship arrows (close, conflict, distant, cut off, custom label)
- Genogram markers: miscarriage, abortion, stillborn cards and a "line ended" glyph
- Automatic layout: couples as units, parents centered over children, in-law branches on the outer side, birth-date sibling order, crossing-minimizing passes
- Photo cropper with zoom, drag, 90° rotation and straightening; crops stay editable
- Keyboard-first: arrows navigate, Enter edits, P/C/S/M/L create or link, ⌫ deletes, ⌘Z undo, ? shows all shortcuts
- Touch: tap to select, edit sheet, action bar, pinch zoom
- English, Russian, German
- Binary `.ftree` file with all images embedded; legacy `.json` imports
- Autosave to the open file (Chrome, Edge) or to an on-device library (Safari, iOS, Firefox) with Download for a copy
- Launch screen with recent files and unsaved-draft recovery
- PDF export through the print dialog

## Run locally

Open `index.html` in a browser, or serve the folder:

```
npm start
```

## Tests

End-to-end tests with Playwright cover the requirements above on a desktop and a phone profile.

```
npm install
npx playwright install chromium
npm test
```

Tests run on every push and pull request; the Pages deploy only happens when they pass.

## File format

`FTREE` magic + version byte, a length-prefixed UTF-8 JSON block (people, families, relations, image table), then each image as a length-prefixed JPEG.
