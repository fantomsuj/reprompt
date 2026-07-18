(() => {
  "use strict";

  const EXTENSION_MARKER = "data-chatgpt-edit-button";
  const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';
  const NATIVE_EDIT_SELECTORS = [
    'button[data-testid="edit-turn-action-button"]',
    'button[data-testid*="edit"][data-testid*="turn"]',
    'button[aria-label="Edit message"]',
    'button[aria-label="Edit Message"]'
  ].join(",");
  const COPY_BUTTON_SELECTORS = [
    'button[data-testid="copy-turn-action-button"]',
    'button[data-testid*="copy"][data-testid*="turn"]',
    'button[aria-label="Copy"]',
    'button[aria-label="Copy message"]'
  ].join(",");
  const EDIT_LABEL = /\b(edit|modify|editar|modifier|bearbeiten|modifica|bewerken)\b/i;
  const COPY_LABEL = /\b(copy|copiar|copier|kopieren|copia|kopiëren)\b/i;
  const MORE_LABEL = /\b(more|actions?|options?|menu)\b/i;

  let scanQueued = false;

  function getTurn(message) {
    return (
      message.closest('[data-testid^="conversation-turn-"]') ||
      message.closest("article") ||
      message.closest('[class*="group/conversation-turn"]') ||
      message.parentElement
    );
  }

  function isOurButton(element) {
    return Boolean(element?.closest?.(`[${EXTENSION_MARKER}]`));
  }

  function getButtonLabel(button) {
    return [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  function findNativeEdit(turn) {
    const exact = [...turn.querySelectorAll(NATIVE_EDIT_SELECTORS)].find(
      (button) => !isOurButton(button)
    );

    if (exact) return exact;

    return [...turn.querySelectorAll("button")].find(
      (button) => !isOurButton(button) && EDIT_LABEL.test(getButtonLabel(button))
    );
  }

  function findCopyButton(turn) {
    const exact = [...turn.querySelectorAll(COPY_BUTTON_SELECTORS)].find(
      (button) => !isOurButton(button)
    );

    if (exact) return exact;

    return [...turn.querySelectorAll("button")].find(
      (button) => !isOurButton(button) && COPY_LABEL.test(getButtonLabel(button))
    );
  }

  function placeBeforeCopy(turn, button) {
    const copyButton = findCopyButton(turn);
    if (!copyButton) return false;

    const copyWrapper = copyButton.parentElement;
    const copyItem =
      copyWrapper?.tagName === "SPAN" && copyWrapper.children.length === 1
        ? copyWrapper
        : copyButton;

    if (copyItem.previousElementSibling !== button) {
      copyItem.parentNode.insertBefore(button, copyItem);
    }
    button.dataset.cgeInActions = "true";
    return true;
  }

  function markNativeEdit(turn) {
    const nativeEdit = findNativeEdit(turn);
    if (nativeEdit) nativeEdit.setAttribute("data-chatgpt-native-edit", "");
    return nativeEdit;
  }

  function waitForMenuEdit(timeout = 900) {
    return new Promise((resolve) => {
      const find = () => {
        const candidates = document.querySelectorAll(
          '[role="menuitem"], [role="option"], [data-radix-collection-item], button'
        );
        return [...candidates].find(
          (item) =>
            !isOurButton(item) &&
            item.getClientRects().length > 0 &&
            EDIT_LABEL.test(getButtonLabel(item))
        );
      };

      const immediate = find();
      if (immediate) {
        resolve(immediate);
        return;
      }

      const observer = new MutationObserver(() => {
        const edit = find();
        if (edit) finish(edit);
      });
      const timer = window.setTimeout(() => finish(null), timeout);

      function finish(value) {
        window.clearTimeout(timer);
        observer.disconnect();
        resolve(value);
      }

      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function tryOverflowMenu(turn) {
    const buttons = [...turn.querySelectorAll("button")].filter(
      (button) => !isOurButton(button)
    );
    const overflow =
      buttons.find((button) => MORE_LABEL.test(getButtonLabel(button))) ||
      buttons.find((button) => button.getAttribute("aria-haspopup") === "menu");

    if (!overflow) return false;

    overflow.click();
    const menuEdit = await waitForMenuEdit();
    if (!menuEdit) return false;

    menuEdit.click();
    return true;
  }

  function showNotice(message) {
    document.querySelector(".cge-notice")?.remove();

    const notice = document.createElement("div");
    notice.className = "cge-notice";
    notice.setAttribute("role", "status");
    notice.textContent = message;
    document.body.append(notice);

    requestAnimationFrame(() => notice.classList.add("cge-notice--visible"));
    window.setTimeout(() => {
      notice.classList.remove("cge-notice--visible");
      window.setTimeout(() => notice.remove(), 180);
    }, 3200);
  }

  async function activateEdit(turn, trigger) {
    if (trigger.dataset.busy === "true") return;
    trigger.dataset.busy = "true";

    try {
      turn.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      turn.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

      await new Promise((resolve) => requestAnimationFrame(resolve));
      const nativeEdit = markNativeEdit(turn);

      if (nativeEdit) {
        nativeEdit.click();
        return;
      }

      if (await tryOverflowMenu(turn)) return;

      showNotice("ChatGPT did not expose an edit action for this message.");
    } catch (error) {
      console.warn("[RePrompt] Could not open message editor", error);
      showNotice("Could not open the editor. Refresh ChatGPT and try again.");
    } finally {
      delete trigger.dataset.busy;
    }
  }

  function createEditButton(turn) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cge-edit-button";
    button.setAttribute(EXTENSION_MARKER, "");
    button.setAttribute("aria-label", "Edit message");
    button.setAttribute("data-tooltip", "Edit message");
    const svgNamespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(svgNamespace, "svg");
    const path = document.createElementNS(svgNamespace, "path");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("clip-rule", "evenodd");
    path.setAttribute(
      "d",
      "M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4784 6.06414 21.4784 8.93588 19.7071 10.7071L11.6135 18.8007C10.8766 19.5376 9.92793 20.0258 8.89999 20.1971L4.16441 20.9864C3.84585 21.0395 3.52127 20.9355 3.29291 20.7071C3.06454 20.4788 2.96053 20.1542 3.01362 19.8356L3.80288 15.1C3.9742 14.0721 4.46243 13.1234 5.19932 12.3865L13.2929 4.29291ZM13 7.41422L6.61353 13.8007C6.1714 14.2428 5.87846 14.8121 5.77567 15.4288L5.21656 18.7835L8.57119 18.2244C9.18795 18.1216 9.75719 17.8286 10.1993 17.3865L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z"
    );
    icon.append(path);
    button.append(icon);
    button.addEventListener("click", () => activateEdit(turn, button));
    return button;
  }

  function enhanceMessage(message) {
    const turn = getTurn(message);
    if (!turn) return;

    message.dataset.chatgptEditEnhanced = "true";
    turn.classList.add("cge-turn");
    markNativeEdit(turn);

    let button = turn.querySelector(`[${EXTENSION_MARKER}]`);
    if (!button) button = createEditButton(turn);
    placeBeforeCopy(turn, button);
  }

  function scan() {
    scanQueued = false;
    document.querySelectorAll(USER_MESSAGE_SELECTOR).forEach(enhanceMessage);
    document.querySelectorAll(".cge-turn").forEach(markNativeEdit);
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  const observer = new MutationObserver(queueScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
