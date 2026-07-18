// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const root = resolve(import.meta.dirname, "..");
const contentScript = readFileSync(resolve(root, "dist", "unpacked", "content.js"), "utf8");
const styles = readFileSync(resolve(root, "styles.css"), "utf8");

function turnMarkup(id, actions, message = "A prompt") {
  return `
    <article data-testid="conversation-turn-${id}">
      <div data-message-author-role="user">${message}</div>
      <div class="actions">${actions}</div>
    </article>`;
}

function installOverflow(button, options = {}) {
  const state = { includeEdit: options.includeEdit ?? true, edits: 0 };
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const existing = document.querySelector(`[data-menu-for="${button.id}"]`);
    if (existing) {
      existing.remove();
      button.setAttribute("aria-expanded", "false");
      return;
    }

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.dataset.menuFor = button.id;
    if (state.includeEdit) {
      const edit = document.createElement("button");
      edit.setAttribute("role", "menuitem");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        state.edits += 1;
        menu.remove();
        button.setAttribute("aria-expanded", "false");
      });
      menu.append(edit);
    } else {
      menu.innerHTML = '<button role="menuitem">Share</button>';
    }
    document.body.append(menu);
    button.setAttribute("aria-expanded", "true");
  });
  return state;
}

async function settle(frames = 4) {
  for (let index = 0; index < frames; index += 1) {
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    await Promise.resolve();
  }
}

function boot(markup) {
  document.documentElement.setAttribute("data-reprompt-test", "");
  if (markup !== undefined) document.body.innerHTML = markup;
  window.eval(contentScript);
  return window.__REPROMPT_TEST__;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.documentElement.setAttribute("data-reprompt-test", "");
});

afterEach(() => {
  window.__REPROMPT_TEST__?.disconnect();
  delete window.__REPROMPT_TEST__;
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-reprompt-test");
});

describe("native edit relocation", () => {
  test("moves ChatGPT's existing Edit action immediately before Copy intact", () => {
    document.body.innerHTML = turnMarkup(
      1,
      '<span class="copy-wrapper"><button class="copy-native" aria-label="Copy">Copy</button></span><span class="edit-tooltip" data-tooltip-state="native"><button class="edit-native" aria-label="Edit message" title="Native tooltip">Edit</button></span>'
    );
    const edit = document.querySelector(".edit-native");
    const handler = vi.fn();
    edit.addEventListener("click", handler);

    boot();
    const relocated = document.querySelector(".edit-native");
    const copy = document.querySelector(".copy-native");
    const editWrapper = relocated.parentElement;

    expect(editWrapper.nextElementSibling).toBe(copy.parentElement);
    expect(relocated.getAttribute("title")).toBe("Native tooltip");
    expect(relocated.classList.contains("edit-native")).toBe(true);
    expect(editWrapper.dataset.tooltipState).toBe("native");
    expect(editWrapper.hasAttribute("data-reprompt-native-edit")).toBe(true);
    expect(document.querySelector("[data-reprompt-edit-button]")).toBeNull();

    relocated.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  test("leaves messages without a usable Copy/Edit combination untouched", async () => {
    const markup =
      turnMarkup(1, '<button class="edit-only" aria-label="Edit message">Edit</button>') +
      turnMarkup(2, '<button class="copy-only" aria-label="Copy">Copy</button>');
    boot(markup);
    await settle();

    expect(document.querySelector(".edit-only").hasAttribute("data-reprompt-native-edit")).toBe(false);
    expect(document.querySelectorAll("[data-reprompt-edit-button]")).toHaveLength(0);
    document.querySelectorAll("article").forEach((turn) =>
      expect(turn.classList.contains("reprompt-turn")).toBe(false)
    );
  });
});

describe("scoped overflow fallback", () => {
  test("injects one proxy per user message immediately before Copy without duplicates", async () => {
    document.body.innerHTML = Array.from({ length: 3 }, (_, index) =>
      turnMarkup(
        index,
        `<button id="message-more-${index}" aria-label="More actions">More</button><button aria-label="Copy">Copy</button>`
      )
    ).join("");
    document.querySelectorAll('[id^="message-more-"]').forEach((button) =>
      installOverflow(button)
    );

    const api = boot();
    await settle();

    const turns = document.querySelectorAll("article");
    expect(document.querySelectorAll("[data-reprompt-edit-button]")).toHaveLength(3);
    turns.forEach((turn) => {
      const proxy = turn.querySelector("[data-reprompt-edit-button]");
      expect(proxy.nextElementSibling.getAttribute("aria-label")).toBe("Copy");
      turn.append(document.createElement("span"));
    });

    await api.flush();
    await settle();
    turns.forEach((turn) => {
      expect(turn.querySelectorAll("[data-reprompt-edit-button]")).toHaveLength(1);
    });
  });

  test("creates a proxy only after finding Edit in that message's newly opened menu", async () => {
    const unrelated = document.createElement("div");
    unrelated.setAttribute("role", "menu");
    unrelated.innerHTML = '<button role="menuitem" id="unrelated-edit">Edit</button>';
    document.body.append(unrelated);
    const unrelatedClick = vi.fn();
    unrelated.querySelector("button").addEventListener("click", unrelatedClick);

    document.body.insertAdjacentHTML(
      "beforeend",
      turnMarkup(
        1,
        '<button id="message-more" aria-label="More actions">More</button><button aria-label="Copy">Copy</button>'
      )
    );
    const overflowState = installOverflow(document.querySelector("#message-more"));
    window.eval(contentScript);
    await settle();

    const proxy = document.querySelector("[data-reprompt-edit-button]");
    expect(proxy).not.toBeNull();
    expect(proxy.nextElementSibling.getAttribute("aria-label")).toBe("Copy");
    expect(document.querySelector('[data-menu-for="message-more"]')).toBeNull();

    proxy.click();
    expect(proxy.getAttribute("aria-busy")).toBe("true");
    await settle();
    expect(overflowState.edits).toBe(1);
    expect(unrelatedClick).not.toHaveBeenCalled();
    expect(proxy.hasAttribute("aria-busy")).toBe(false);
    expect(proxy.disabled).toBe(false);
  });

  test("cleans up a failed menu and exposes an accessible read-only notice", async () => {
    document.body.innerHTML = turnMarkup(
      1,
      '<button id="changing-more" aria-label="More actions">More</button><button aria-label="Copy">Copy</button>'
    );
    const overflowState = installOverflow(document.querySelector("#changing-more"));
    window.eval(contentScript);
    await settle();
    const proxy = document.querySelector("[data-reprompt-edit-button]");
    expect(proxy).not.toBeNull();

    overflowState.includeEdit = false;
    proxy.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await settle();

    expect(document.querySelector('[data-menu-for="changing-more"]')).toBeNull();
    const notice = document.querySelector('.reprompt-notice[role="status"]');
    expect(notice?.getAttribute("aria-live")).toBe("polite");
    expect(notice?.getAttribute("aria-atomic")).toBe("true");
    expect(notice?.textContent).toMatch(/read-only|no longer supports editing/i);
  });
});

describe("rerender and streaming reconciliation", () => {
  test("enhances SPA-added turns and handles a replaced React action row without duplicates", async () => {
    const api = boot("");
    document.body.insertAdjacentHTML(
      "beforeend",
      turnMarkup(
        1,
        '<button aria-label="Copy">Copy</button><button aria-label="Edit message">Edit</button>'
      )
    );
    await settle();
    const turn = document.querySelector("article");
    expect(turn.querySelector("[data-reprompt-native-edit]").nextElementSibling.getAttribute("aria-label")).toBe("Copy");

    const oldActions = turn.querySelector(".actions");
    const newActions = document.createElement("div");
    newActions.className = "actions";
    newActions.innerHTML =
      '<button class="new-copy" aria-label="Copy">Copy</button><button class="new-edit" aria-label="Edit message">Edit</button>';
    oldActions.replaceWith(newActions);
    await settle();

    expect(newActions.querySelector(".new-edit").nextElementSibling).toBe(
      newActions.querySelector(".new-copy")
    );
    expect(turn.querySelectorAll("[data-reprompt-native-edit]")).toHaveLength(1);
    expect(turn.querySelectorAll("[data-reprompt-edit-button]")).toHaveLength(0);
    expect(api.stats.initialScans).toBe(1);
  });

  test("batches long-chat streaming mutations without duplicate controls or full rescans", async () => {
    const chats = Array.from({ length: 80 }, (_, index) =>
      turnMarkup(
        index,
        '<button aria-label="Copy">Copy</button><button aria-label="Edit message">Edit</button>'
      )
    ).join("");
    const api = boot(`${chats}<article id="assistant-stream"><div></div></article>`);
    await settle();
    const reconciliationsBeforeStreaming = api.stats.turnReconciliations;
    const stream = document.querySelector("#assistant-stream div");
    const text = document.createTextNode("");
    stream.append(text);
    for (let index = 0; index < 200; index += 1) text.data += "token ";
    await settle();

    expect(api.stats.initialScans).toBe(1);
    expect(document.querySelectorAll("[data-reprompt-native-edit]")).toHaveLength(80);
    expect(document.querySelectorAll("[data-reprompt-edit-button]")).toHaveLength(0);
    expect(api.stats.mutationBatches).toBeLessThan(10);
    expect(api.stats.turnReconciliations).toBe(reconciliationsBeforeStreaming);
  });
});

describe("interaction styles", () => {
  test("keeps desktop, touch, editing, focus, and reduced-motion behavior explicit", () => {
    expect(styles).toMatch(/\.reprompt-edit-button\s*{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;/);
    expect(styles).toMatch(/\.reprompt-edit-button:focus-visible\s*{[\s\S]*?outline:/);
    expect(styles).toMatch(/@media \(hover: none\)[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?opacity:\s*1;/);
    expect(styles).toMatch(/:has\(textarea\)[\s\S]*?display:\s*none;/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none;/);
    expect(styles).not.toMatch(/cge-/);
  });
});
