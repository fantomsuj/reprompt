# PromptPencil

A small Chrome extension that restores the classic pencil action on messages you send at `chatgpt.com`.

The extension does not call ChatGPT APIs, read your conversation into storage, or send data anywhere. It finds ChatGPT's own edit control and opens the native editor, preserving ChatGPT's normal resubmit and conversation-branch behavior.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the upper-right.
3. Click **Load unpacked**.
4. Choose this `ChatGPT Edit` folder.
5. Refresh an open `chatgpt.com` conversation.

Hover over one of your sent messages. The pencil appears immediately to the left of Copy in the action row below the message; click it to open ChatGPT's native message editor.

## How it works

- Detects user-authored messages through ChatGPT's semantic `data-message-author-role="user"` marker.
- Re-applies itself as ChatGPT navigates between conversations without full page reloads.
- Proxies ChatGPT's native edit button, including UI variants where it lives in an action menu.
- Uses no permissions beyond running on `https://chatgpt.com/*`.

## Limitations

ChatGPT decides whether a particular message can be edited. For example, shared/read-only conversations or special message types may not expose a native edit action. In that case, the extension shows a short notice instead of modifying the conversation through an unsupported private API.
