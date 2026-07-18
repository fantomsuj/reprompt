(() => {
  "use strict";

  type OverflowStatus = "available" | "unsupported" | "detection-failed";

  interface OverflowResult {
    status: OverflowStatus;
  }

  interface NativeMoveRecord {
    item: Element;
    button: HTMLButtonElement;
    turn: Element;
    copyItem: Element;
    originalParent: ParentNode | null;
    originalNextSibling: ChildNode | null;
    moved: boolean;
  }

  interface TurnState {
    probing?: boolean;
    overflowAvailable?: boolean;
  }

  interface RePromptTestApi {
    stats: {
      initialScans: number;
      mutationBatches: number;
      turnEnhancements: number;
      turnReconciliations: number;
    };
    flush: () => Promise<void>;
    disconnect: () => void;
  }

  const PROXY_MARKER = "data-reprompt-edit-button";
  const NATIVE_MARKER = "data-reprompt-native-edit";
  const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';
  const TURN_SELECTOR =
    '[data-testid^="conversation-turn-"], article, [class*="group/conversation-turn"]';
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
  const MENU_SELECTOR =
    '[role="menu"], [data-radix-menu-content], [data-reprompt-test-menu]';
  const MENU_ITEM_SELECTOR =
    '[role="menuitem"], [role="option"], [data-radix-collection-item], button';
  const EDIT_LABEL = /\b(edit|modify|editar|modifier|bearbeiten|modifica|bewerken)\b/i;
  const COPY_LABEL = /\b(copy|copiar|copier|kopieren|copia|kopiëren)\b/i;
  const MORE_LABEL = /\b(more|actions?|options?|menu)\b/i;
  const MENU_TIMEOUT = 900;

  const nativeMoves = new Map<Element, NativeMoveRecord>();
  const turnStates = new WeakMap<Element, TurnState>();
  const pendingTurns = new Set<Element>();
  const pendingMessages = new Set<Element>();
  const stats = {
    initialScans: 0,
    mutationBatches: 0,
    turnEnhancements: 0,
    turnReconciliations: 0
  };
  let batchQueued = false;

  function getTurn(element: Element | null): Element | null {
    const closest = element?.closest(TURN_SELECTOR);
    if (closest) return closest;
    return element?.matches?.(USER_MESSAGE_SELECTOR) ? element.parentElement : null;
  }

  function isOurButton(element: Element | null | undefined): boolean {
    return Boolean(element?.closest(`[${PROXY_MARKER}]`));
  }

  function getButtonLabel(button: Element): string {
    return [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.textContent
    ]
      .filter((label): label is string => Boolean(label))
      .join(" ")
      .trim();
  }

  function isVisible(element: Element | null | undefined): element is HTMLElement {
    if (
      !element ||
      (element instanceof HTMLElement && element.hidden) ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    const style = element.getAttribute("style") || "";
    return !/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style);
  }

  function findNativeEdit(turn: Element): HTMLButtonElement | undefined {
    const exact = [...turn.querySelectorAll<HTMLButtonElement>(NATIVE_EDIT_SELECTORS)].find(
      (button) => !isOurButton(button)
    );
    if (exact) return exact;

    return [...turn.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => !isOurButton(button) && EDIT_LABEL.test(getButtonLabel(button))
    );
  }

  function findCopyButton(turn: Element): HTMLButtonElement | undefined {
    const exact = [...turn.querySelectorAll<HTMLButtonElement>(COPY_BUTTON_SELECTORS)].find(
      (button) => !isOurButton(button)
    );
    if (exact) return exact;

    return [...turn.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => !isOurButton(button) && COPY_LABEL.test(getButtonLabel(button))
    );
  }

  function findOverflowButton(turn: Element): HTMLButtonElement | null {
    const buttons = [...turn.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) =>
        !isOurButton(button) &&
        button !== findCopyButton(turn) &&
        button !== findNativeEdit(turn)
    );
    return (
      buttons.find((button) => MORE_LABEL.test(getButtonLabel(button))) ||
      buttons.find((button) => button.getAttribute("aria-haspopup") === "menu") ||
      null
    );
  }

  function getActionItem(button: HTMLButtonElement | null | undefined): Element | null {
    const parent = button?.parentElement;
    if (
      parent &&
      (parent.tagName === "SPAN" ||
        (parent.tagName === "DIV" && (parent.parentElement?.childElementCount || 0) > 1)) &&
      parent.childElementCount === 1 &&
      !parent.matches(USER_MESSAGE_SELECTOR)
    ) {
      return parent;
    }
    return button || null;
  }

  function restoreNative(record: NativeMoveRecord): void {
    const { item, originalParent, originalNextSibling } = record;
    if (record.moved && originalParent) {
      try {
        if (originalNextSibling?.parentNode === originalParent) {
          originalParent.insertBefore(item, originalNextSibling);
        } else {
          originalParent.append(item);
        }
      } catch (error) {
        console.warn("[RePrompt] Could not restore ChatGPT's edit action", error);
      }
    }
    item.removeAttribute(NATIVE_MARKER);
    record.button.removeAttribute(NATIVE_MARKER);
    nativeMoves.delete(item);
  }

  function restoreNativeForTurn(turn: Element): void {
    for (const record of [...nativeMoves.values()]) {
      if (record.turn === turn) restoreNative(record);
    }
  }

  function reconcileNativeMoves(changedTurns: Set<Element>): void {
    for (const record of [...nativeMoves.values()]) {
      if (!record.turn.isConnected || !record.item.isConnected) {
        restoreNative(record);
        continue;
      }
      if (changedTurns.has(record.turn)) {
        stats.turnReconciliations += 1;
        const currentCopy = findCopyButton(record.turn);
        if (!currentCopy || getActionItem(currentCopy) !== record.copyItem) restoreNative(record);
      }
    }
  }

  function placeBeforeCopy(turn: Element, item: Element): boolean {
    const copyButton = findCopyButton(turn);
    if (!copyButton) return false;

    const copyItem = getActionItem(copyButton);
    const parent = copyItem?.parentNode;
    if (!parent || item === copyItem || item.contains(copyItem)) return false;

    if (item.nextElementSibling !== copyItem || item.parentNode !== parent) {
      parent.insertBefore(item, copyItem);
    }
    return true;
  }

  function relocateNativeEdit(turn: Element, button: HTMLButtonElement): boolean {
    const item = getActionItem(button);
    const copyButton = findCopyButton(turn);
    const copyItem = getActionItem(copyButton);
    if (!item || !copyItem?.parentNode) return false;

    const existing = nativeMoves.get(item);
    if (existing && existing.copyItem === copyItem) {
      placeBeforeCopy(turn, item);
      return true;
    }
    if (existing) restoreNative(existing);

    const record = {
      item,
      button,
      turn,
      copyItem,
      originalParent: item.parentNode,
      originalNextSibling: item.nextSibling,
      moved: item.parentNode !== copyItem.parentNode || item.nextElementSibling !== copyItem
    };

    try {
      if (!placeBeforeCopy(turn, item)) return false;
      item.setAttribute(NATIVE_MARKER, "");
      nativeMoves.set(item, record);
      return true;
    } catch (error) {
      if (record.moved) restoreNative(record);
      console.warn("[RePrompt] Could not place ChatGPT's edit action", error);
      return false;
    }
  }

  function getScopedMenu(
    overflow: HTMLButtonElement,
    previouslyVisible: Set<Element>
  ): Element | undefined {
    const controlledId = overflow.getAttribute("aria-controls");
    if (controlledId) {
      const controlled = document.getElementById(controlledId);
      if (controlled?.matches(MENU_SELECTOR) && isVisible(controlled)) return controlled;
    }

    return [...document.querySelectorAll(MENU_SELECTOR)].find(
      (menu) => isVisible(menu) && !previouslyVisible.has(menu)
    );
  }

  function waitForScopedMenu(
    overflow: HTMLButtonElement,
    previouslyVisible: Set<Element>,
    timeout = MENU_TIMEOUT
  ): Promise<Element | null> {
    return new Promise<Element | null>((resolve) => {
      let observer: MutationObserver | undefined;
      let timer: number | undefined;
      const finish = (menu: Element | null): void => {
        if (timer !== undefined) window.clearTimeout(timer);
        observer?.disconnect();
        resolve(menu);
      };
      const find = (): Element | undefined => getScopedMenu(overflow, previouslyVisible);
      const immediate = find();
      if (immediate) return finish(immediate);

      observer = new MutationObserver(() => {
        const menu = find();
        if (menu) finish(menu);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-hidden", "hidden", "style"]
      });
      timer = window.setTimeout(() => finish(null), timeout);
    });
  }

  function findMenuEdit(menu: Element): HTMLElement | undefined {
    return [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].find(
      (item) => !isOurButton(item) && isVisible(item) && EDIT_LABEL.test(getButtonLabel(item))
    );
  }

  function closeMenu(overflow: HTMLButtonElement, menu: Element | null): void {
    if (overflow.getAttribute("aria-expanded") === "true") {
      overflow.click();
      return;
    }
    const event =
      typeof KeyboardEvent === "function"
        ? new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        : new Event("keydown", { bubbles: true, cancelable: true });
    (menu || overflow).dispatchEvent(event);
  }

  async function inspectOverflow(
    turn: Element,
    { activate = false }: { activate?: boolean } = {}
  ): Promise<OverflowResult> {
    const overflow = findOverflowButton(turn);
    if (!overflow) return { status: "unsupported" };

    const previouslyVisible = new Set(
      [...document.querySelectorAll(MENU_SELECTOR)].filter(isVisible)
    );
    overflow.click();
    const menu = await waitForScopedMenu(overflow, previouslyVisible);
    if (!menu) {
      closeMenu(overflow, null);
      return { status: "detection-failed" };
    }

    const edit = findMenuEdit(menu);
    if (!edit) {
      closeMenu(overflow, menu);
      return { status: "unsupported" };
    }

    if (activate) edit.click();
    else closeMenu(overflow, menu);
    return { status: "available" };
  }

  function showNotice(message: string): void {
    document.querySelector(".reprompt-notice")?.remove();

    const notice = document.createElement("div");
    notice.className = "reprompt-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.setAttribute("aria-atomic", "true");
    notice.textContent = message;
    document.body.append(notice);

    requestAnimationFrame(() => notice.classList.add("reprompt-notice--visible"));
    window.setTimeout(() => {
      notice.classList.remove("reprompt-notice--visible");
      window.setTimeout(() => notice.remove(), 180);
    }, 3200);
  }

  async function activateProxy(turn: Element, trigger: HTMLButtonElement): Promise<void> {
    if (trigger.getAttribute("aria-busy") === "true") return;
    trigger.setAttribute("aria-busy", "true");
    trigger.disabled = true;

    try {
      const HoverEvent = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      turn.dispatchEvent(new HoverEvent("pointerover", { bubbles: true }));
      turn.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const nativeEdit = findNativeEdit(turn);
      if (nativeEdit) {
        nativeEdit.click();
        return;
      }

      const result = await inspectOverflow(turn, { activate: true });
      if (result.status === "unsupported") {
        showNotice("This message is read-only or no longer supports editing.");
      } else if (result.status === "detection-failed") {
        showNotice("Couldn’t find ChatGPT’s edit controls. Try again or refresh the page.");
      }
    } catch (error) {
      console.warn("[RePrompt] Could not open message editor", error);
      showNotice("Couldn’t find ChatGPT’s edit controls. Try again or refresh the page.");
    } finally {
      trigger.removeAttribute("aria-busy");
      trigger.disabled = false;
    }
  }

  function createProxyButton(turn: Element): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reprompt-edit-button";
    button.setAttribute(PROXY_MARKER, "");
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
    button.addEventListener("click", () => activateProxy(turn, button));
    return button;
  }

  async function ensureProxyFallback(turn: Element): Promise<void> {
    const state = turnStates.get(turn) || {};
    if (state.probing) return;
    if (state.overflowAvailable) {
      let proxy = turn.querySelector<HTMLButtonElement>(`[${PROXY_MARKER}]`);
      if (!proxy) proxy = createProxyButton(turn);
      if (placeBeforeCopy(turn, proxy)) turn.classList.add("reprompt-turn");
      return;
    }

    state.probing = true;
    turnStates.set(turn, state);
    const result = await inspectOverflow(turn);
    state.probing = false;
    state.overflowAvailable = result.status === "available";

    if (
      result.status === "available" &&
      turn.isConnected &&
      findCopyButton(turn) &&
      !findNativeEdit(turn)
    ) {
      const proxy =
        turn.querySelector<HTMLButtonElement>(`[${PROXY_MARKER}]`) || createProxyButton(turn);
      if (placeBeforeCopy(turn, proxy)) turn.classList.add("reprompt-turn");
    }
  }

  function enhanceTurn(turn: Element): void {
    if (!turn?.isConnected || !turn.querySelector(USER_MESSAGE_SELECTOR)) return;
    stats.turnEnhancements += 1;

    const copyButton = findCopyButton(turn);
    if (!copyButton) {
      restoreNativeForTurn(turn);
      turn.querySelectorAll(`[${PROXY_MARKER}]`).forEach((button) => button.remove());
      turn.classList.remove("reprompt-turn");
      return;
    }

    const nativeEdit = findNativeEdit(turn);
    if (nativeEdit) {
      turn.querySelectorAll(`[${PROXY_MARKER}]`).forEach((button) => button.remove());
      if (relocateNativeEdit(turn, nativeEdit)) turn.classList.add("reprompt-turn");
      return;
    }

    if (!turn.querySelector(`[${PROXY_MARKER}]`)) turn.classList.remove("reprompt-turn");
    ensureProxyFallback(turn);
  }

  function addMessagesWithin(node: Node): void {
    if (!(node instanceof Element)) return;
    if (node.matches(USER_MESSAGE_SELECTOR)) pendingMessages.add(node);
    node.querySelectorAll(USER_MESSAGE_SELECTOR).forEach((message) => pendingMessages.add(message));
  }

  function flushMutationBatch(): void {
    batchQueued = false;
    stats.mutationBatches += 1;
    for (const message of pendingMessages) {
      const turn = getTurn(message);
      if (turn) pendingTurns.add(turn);
    }
    pendingMessages.clear();

    reconcileNativeMoves(pendingTurns);
    const turns = [...pendingTurns];
    pendingTurns.clear();
    turns.forEach(enhanceTurn);
  }

  function queueBatch(): void {
    if (batchQueued) return;
    batchQueued = true;
    requestAnimationFrame(flushMutationBatch);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const targetTurn = getTurn(
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
      );
      if (targetTurn) pendingTurns.add(targetTurn);
      mutation.addedNodes.forEach(addMessagesWithin);
    }
    queueBatch();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
  stats.initialScans += 1;
  document.querySelectorAll(USER_MESSAGE_SELECTOR).forEach((message) => {
    const turn = getTurn(message);
    if (turn) enhanceTurn(turn);
  });

  if (document.documentElement.hasAttribute("data-reprompt-test")) {
    const testWindow = window as Window & { __REPROMPT_TEST__?: RePromptTestApi };
    testWindow.__REPROMPT_TEST__ = {
      stats,
      flush: () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        ),
      disconnect: () => observer.disconnect()
    };
  }
})();
