# RePrompt

RePrompt is a small Chrome extension that restores the pencil action on messages you send at `chatgpt.com`. The pencil appears immediately to the left of Copy, using ChatGPT's own edit flow and visual styling whenever possible.

## Install

### From a local build

1. Run `npm ci` and `npm run build`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the upper-right.
4. Click **Load unpacked**.
5. Choose the generated `dist/unpacked/` folder.
6. Refresh any open `chatgpt.com` tab.

### From a packaged build

1. Unzip `dist/reprompt-1.1.0.zip` into a permanent folder.
2. Follow the same **Load unpacked** steps and select the extracted folder.

Hover over or move keyboard focus into one of your sent messages. The pencil appears immediately to the left of Copy. On touch devices it remains visible and uses a larger touch target.

## How it works

- RePrompt first moves ChatGPT's existing Edit action next to Copy. This preserves ChatGPT's click handler, tooltip, classes, keyboard behavior, and accessibility metadata.
- If Edit is only available from a message's overflow menu, RePrompt adds a matching pencil that opens that specific message's native Edit action.
- It processes only new or changed conversation turns during streaming and reconciles controls after ChatGPT's in-app navigation or React rerenders.
- It never edits a message through private APIs. If ChatGPT does not offer Edit, RePrompt leaves the message alone.

## Compatibility

RePrompt 1.1.0 supports the current Chrome extension platform (Manifest V3) and only runs on `https://chatgpt.com/*`. It relies on semantic labels and attributes exposed by ChatGPT, with fallbacks for common action-row and overflow-menu variants.

ChatGPT controls which message types can be edited. Shared or read-only conversations, special message types, and messages whose native Edit action has been removed remain unchanged.

## Troubleshooting

- **The pencil does not appear:** Confirm the message has a Copy action and is editable through ChatGPT's own UI. Refresh the tab after installing or updating the extension.
- **A read-only notice appears:** ChatGPT opened the message menu but did not provide Edit. RePrompt intentionally does not bypass that restriction.
- **A detection notice appears:** ChatGPT's controls may still be rendering or its markup may have changed. Try again, then refresh the page. If the issue persists, include the Chrome and RePrompt versions when reporting it.
- **The extension does not load:** Open `chrome://extensions`, select RePrompt's **Errors** button if present, and confirm the complete extracted folder—not the ZIP itself—was selected.

## Privacy and permissions

RePrompt requests no optional permissions. Its only host access is `https://chatgpt.com/*`, which is required to place the pencil in ChatGPT's message action row.

The extension does not send network requests, use analytics, call ChatGPT APIs, read conversations into extension storage, or transmit message content. All DOM handling stays in the current ChatGPT tab.

## License

RePrompt is available under the [MIT License](LICENSE).

## Development

Requires Node.js 22 and the system `zip`/`unzip` commands.

```sh
npm ci
npm run typecheck       # Strict TypeScript validation without emitting files
npm test                # Build and run black-box DOM tests
npm run build           # Create the loadable extension in dist/unpacked/
npm run package         # Build and create dist/reprompt-<version>.zip
npm run package:verify  # Verify the release ZIP contents and version
npm run check           # Run all automated checks
```

`src/content.ts` is the source of truth. The build uses `tsc` directly—without a production bundler or runtime dependency—to emit the classic `content.js` referenced by the manifest. `npm run check` performs strict type checking, runs the DOM fixture tests, creates the versioned ZIP with stable file timestamps, and verifies its exact contents and manifest version. Pushes and pull requests run the same command in GitHub Actions.
