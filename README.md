# RePrompt

RePrompt is a small Chrome extension that restores the pencil action on messages you send at `chatgpt.com`. The pencil appears immediately to the left of Copy, using ChatGPT's own edit flow and visual styling whenever possible.

## Install

### Set up with Codex or Claude Code

After cloning or downloading this repository, open the project folder in Codex or Claude Code and paste this prompt:

```text
I downloaded the RePrompt repository and opened it in this coding agent. Please set it up as a local Chrome extension for me.

Inspect the repository instructions, confirm that Node.js 22 or newer is available, install the dependencies with `npm ci`, and build the extension with `npm run build`. Verify that the finished extension contains both `dist/unpacked/manifest.json` and `dist/unpacked/content.js`.

Then help me install it in Chrome. If you can control Chrome, open `chrome://extensions`, turn on Developer mode, click Load unpacked, and select this repository's `dist/unpacked/` folder. If you cannot control Chrome's Extensions page, give me the absolute path to `dist/unpacked/` and concise instructions for completing those clicks myself.

Finally, have me refresh any open `chatgpt.com` tab and verify that hovering over one of my messages shows the pencil immediately before Copy. Do not change the extension's source code unless a setup or build error requires a fix; if anything fails, diagnose it and rerun the failed step.
```

The coding agent can install dependencies, build the extension, and verify the output. Loading an unpacked extension is completed manually in Chrome because Chrome requires you to select the extension directory through its Extensions page.

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
