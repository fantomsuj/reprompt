# Chrome Web Store listing

## Product details

**Name**

RePrompt for ChatGPT

**Summary**

Restores the pencil edit button on your sent ChatGPT messages.

**Category**

Productivity

**Language**

English

**Detailed description**

RePrompt restores fast access to ChatGPT's message editor by placing the pencil action immediately next to Copy on messages you send.

It uses ChatGPT's existing edit flow and visual styling whenever possible, so editing a prompt feels native and familiar.

Features:

- Restores the pencil beside Copy on editable sent messages
- Uses ChatGPT's native editing interface
- Handles in-app navigation, streaming, and interface rerenders
- Runs only on chatgpt.com
- Makes no network requests and uses no analytics
- Stores and transmits no conversation data
- Open source under the MIT License

RePrompt does not bypass ChatGPT's editing restrictions. Read-only conversations and message types that ChatGPT does not allow you to edit remain unchanged.

RePrompt is an independent open-source project and is not affiliated with or endorsed by OpenAI.

## URLs

**Homepage URL**

https://github.com/fantomsuj/reprompt

**Support URL**

https://github.com/fantomsuj/reprompt/issues

**Privacy policy URL**

https://github.com/fantomsuj/reprompt/blob/main/PRIVACY.md

## Privacy practices

**Single purpose**

Restore convenient access to ChatGPT's existing native message edit action by placing a pencil button next to Copy on editable user messages.

**Host permission justification**

RePrompt runs only on `https://chatgpt.com/*` because it must inspect ChatGPT's message action rows and relocate or open the site's existing edit control. It does not access any other websites.

**Remote code**

No. All executable code is included in the extension package.

**User data disclosure**

Declare website content because the extension locally examines the structure and labels of controls on chatgpt.com. Explain that this processing stays in the current tab and that no content is collected, transmitted, retained, sold, or shared. The extension does not use analytics, advertising, tracking, external servers, extension storage, or APIs.

Certify that data is not sold, is not used for purposes unrelated to the extension's single purpose, is not used for creditworthiness or lending, and complies with the Chrome Web Store Limited Use requirements.

## Distribution

- Visibility: Public
- Pricing: Free
- Regions: All regions
- Mature content: No

## Test instructions

1. Install the extension and open `https://chatgpt.com/`.
2. Start a conversation and send a message.
3. Hover over the sent message's action row.
4. Confirm that a pencil appears immediately before Copy.
5. Click the pencil and confirm that ChatGPT's native message editor opens.

No extension-specific account or credentials are required. The reviewer may use any ChatGPT account that can send and edit messages.

## Upload assets

- Package: `dist/reprompt-1.1.0.zip`
- Store icon: `assets/icon-128.png`
- Screenshot 1: `marketing/chrome-web-store/screenshot-pencil.png`
- Screenshot 2: `marketing/chrome-web-store/screenshot-editor.png`
- Small promo tile: `marketing/chrome-web-store/small-promo.png`
