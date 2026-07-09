// Apre l'app in una finestra massimizzata (a tutto schermo), non un piccolo popup.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("app.html");
  // se gia' aperta, portala in primo piano
  const existing = await chrome.tabs.query({ url });
  if (existing && existing.length) {
    chrome.windows.update(existing[0].windowId, { focused: true, state: "maximized" });
    chrome.tabs.update(existing[0].id, { active: true });
    return;
  }
  chrome.windows.create({ url, type: "popup", state: "maximized" });
});
