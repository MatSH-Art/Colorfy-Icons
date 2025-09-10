chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetch-favicon") {
    fetch(message.url)
      .then((response) => {
        if (!response.ok) throw new Error("Network error");
        return response.blob();
      })
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch((error) => {
        console.error("Fetch failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Important! Keep message channel open
  }
});
