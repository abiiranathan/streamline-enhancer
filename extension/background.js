"use strict";

const SCRIPT_ID = "streamline-main-world";
const MATCHES = ["*://*.streamlinehealth.tech/*"];

let registrationPromise = null;

function getConfig() {
  return {
    id: SCRIPT_ID,
    matches: MATCHES,
    js: ["page.js"],
    runAt: "document_idle",
    world: "MAIN",
    allFrames: false
  };
}

async function registerOnce() {
  const config = getConfig();

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (existing.length > 0) {
      await chrome.scripting.updateContentScripts([config]);
    } else {
      await chrome.scripting.registerContentScripts([config]);
    }
    return;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);

    /* Another concurrent call already registered it, or it survived from a
       previous service worker start - either way the script is present. */
    if (message.indexOf("Duplicate script ID") !== -1) {
      return;
    }

    throw error;
  }
}

function ensureMainWorldScript() {
  if (!registrationPromise) {
    registrationPromise = registerOnce().catch((error) => {
      registrationPromise = null;
      console.error("Streamline: failed to register the main world script", error);
    });
  }
  return registrationPromise;
}

chrome.runtime.onInstalled.addListener(ensureMainWorldScript);
chrome.runtime.onStartup.addListener(ensureMainWorldScript);
ensureMainWorldScript();
