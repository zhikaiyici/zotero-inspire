import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";
export function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = { window: _window };
  } else {
    addon.data.prefs.window = _window;
  }
  const input = _window.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-tag_norecid`,
  ) as HTMLInputElement;
  input.disabled = !getPref("tag_enable");
  bindTagEnabler();
  bindFundingModeToggler();
}

function bindTagEnabler() {
  addon.data
    .prefs!.window.document.querySelector(
      `#zotero-prefpane-${config.addonRef}-tag_enable`,
    )
    ?.addEventListener("command", (e) => {
      const checkbox = e.target as XULCheckboxElement;
      const input = addon.data.prefs!.window.document.querySelector(
        `#zotero-prefpane-${config.addonRef}-tag_norecid`,
      ) as HTMLInputElement;
      input.disabled = !checkbox.checked;
      setPref("tag_enable", checkbox.checked);
    });
}

/**
 * Enable the custom-funder text box only while the "Custom list" mode is
 * selected, so it is clear the field is otherwise inactive.
 */
function bindFundingModeToggler() {
  const doc = addon.data.prefs!.window.document;
  const customInput = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-funding_filter_custom`,
  ) as HTMLInputElement | null;
  if (!customInput) return;

  const sync = () => {
    customInput.disabled = getPref("funding_filter_mode") !== "custom";
  };
  sync();

  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-funding_filter_mode`)
    ?.addEventListener("command", () => {
      // The radiogroup writes the pref via its `preference` binding; read it back
      // on the next tick so the disabled state reflects the new selection.
      addon.data.prefs!.window.setTimeout(sync, 0);
    });
}
