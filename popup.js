async function getCurrentTabHostname() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return new URL(tab.url).hostname;
}

async function updateButtonState() {
  const hostname = await getCurrentTabHostname();
  chrome.storage.local.get(
    ["faviconExceptions", "faviconFailures", "faviconOverrideDisabled"],
    (result) => {
      const exceptions = result.faviconExceptions || [];
      const failures = result.faviconFailures || [];
      const disabledOverrides = result.faviconOverrideDisabled || {};
      const isException = exceptions.includes(hostname);
      const failed = failures.includes(hostname);
      const overrideDisabled = disabledOverrides[hostname];

      document.getElementById("toggle-exception").textContent = isException
        ? "➖ Remove from Exceptions"
        : "➕ Add to Exceptions";

      const toggleCheckbox = document.getElementById(
        "toggle-custom-favicon-checkbox"
      );
      toggleCheckbox.checked = !overrideDisabled;

      const status = document.getElementById("status");
      if (failed) {
        status.textContent =
          "⚠️ This site uses an SVG favicon and no fallback was found.";
      } else if (isException) {
        status.textContent = `${hostname} is currently EXCLUDED`;
      } else if (overrideDisabled) {
        status.textContent = `Custom favicon is DISABLED for ${hostname}`;
      } else {
        status.textContent = `${hostname} will be recolored.`;
      }
    }
  );
}
document.getElementById("retry").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Retry recoloring without refreshing the page
      (function retryFavicon() {
        function isWhiteish(r, g, b) {
          return r > 240 && g > 240 && b > 240;
        }

        function processFavicon(img) {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b] = data.slice(i, i + 3);
            if (isWhiteish(r, g, b)) {
              data[i] = 255;
              data[i + 1] = 255;
              data[i + 2] = 255;
            } else {
              data[i] = 250;
              data[i + 1] = 201;
              data[i + 2] = 0;
            }
          }

          ctx.putImageData(imageData, 0, 0);
          const newFaviconURL = canvas.toDataURL("image/png");

          let link = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
          }
          link.href = newFaviconURL;
        }

        const favicon = document.querySelector("link[rel~='icon']");
        const url = favicon ? favicon.href : "/favicon.ico";

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;

        img.onload = () => {
          processFavicon(img);
        };
      })();
    },
  });
});

document
  .getElementById("toggle-exception")
  .addEventListener("click", async () => {
    const hostname = await getCurrentTabHostname();
    chrome.storage.local.get(["faviconExceptions"], (result) => {
      let list = result.faviconExceptions || [];
      const isException = list.includes(hostname);

      if (isException) {
        list = list.filter((domain) => domain !== hostname);
        chrome.storage.local.set(
          { faviconExceptions: list },
          updateButtonState
        );
      } else {
        list.push(hostname);
        chrome.storage.local.set(
          { faviconExceptions: list },
          updateButtonState
        );
      }
    });
  });
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "favicon-failed") {
    chrome.storage.local.get(["faviconFailures"], (result) => {
      const failures = result.faviconFailures || [];
      if (!failures.includes(message.hostname)) {
        failures.push(message.hostname);
        chrome.storage.local.set({ faviconFailures: failures }, () => {
          updateButtonState(); // to re-render UI
        });
      }
    });
  }
});
document
  .getElementById("save-custom-favicon")
  .addEventListener("click", async () => {
    const url = document.getElementById("custom-favicon-url").value.trim();
    const hostname = await getCurrentTabHostname();

    if (!url || (!url.endsWith(".png") && !url.endsWith(".ico"))) {
      alert("Please enter a valid PNG or ICO URL.");
      return;
    }

    chrome.storage.local.get(["faviconOverrides"], (result) => {
      const overrides = result.faviconOverrides || {};
      overrides[hostname] = url;

      chrome.storage.local.set({ faviconOverrides: overrides }, () => {
        // Optionally refresh or trigger recolor
        document.getElementById("custom-favicon-url").value = "";
        document.getElementById(
          "status"
        ).textContent = `✅ Custom favicon set for ${hostname}`;
      });
    });
  });
let colorMode = "HEX";
const toggleColorModeButton = document.getElementById("toggle-color-mode");
const colorInput = document.getElementById("color-input");
const rgbInputs = document.getElementById("rgb-inputs");
const rInput = document.getElementById("r-input");
const gInput = document.getElementById("g-input");
const bInput = document.getElementById("b-input");
const presetsContainer = document.getElementById("presets");

// Toggle between RGB and HEX modes
toggleColorModeButton.addEventListener("click", () => {
  if (colorMode === "HEX") {
    colorMode = "RGB";
    toggleColorModeButton.textContent = "HEX";
    colorInput.style.display = "none";
    rgbInputs.style.display = "block";
  } else {
    colorMode = "HEX";
    toggleColorModeButton.textContent = "RGB";
    colorInput.style.display = "block";
    rgbInputs.style.display = "none";
  }
});

// Save the selected color to chrome.storage.local
function saveColor(rgb) {
  chrome.storage.local.set({ recolorRGB: rgb }, () => {
    alert("Recolor color saved successfully!");
  });
}

colorInput.addEventListener("change", () => {
  const colorValue = colorInput.value.trim();
  if (!/^#([0-9A-Fa-f]{6})$/.test(colorValue)) {
    alert("Invalid HEX color format. Use #RRGGBB.");
    return;
  }
  const rgb = [
    parseInt(colorValue.slice(1, 3), 16),
    parseInt(colorValue.slice(3, 5), 16),
    parseInt(colorValue.slice(5, 7), 16),
  ];
  saveColor(rgb);
});

[rInput, gInput, bInput].forEach((input) => {
  input.addEventListener("blur", () => {
    const r = parseInt(rInput.value) || 0;
    const g = parseInt(gInput.value) || 0;
    const b = parseInt(bInput.value) || 0;
    if ([r, g, b].some((val) => val < 0 || val > 255)) {
      alert("RGB values must be between 0 and 255.");
      return;
    }
    // Only save color if all inputs are valid and user clicks submit
  });
});

// Manage presets
function loadPresets() {
  chrome.storage.local.get("colorPresets", (result) => {
    const presets = result.colorPresets || ["#FAC900"];
    presetsContainer.innerHTML = "";
    presets.forEach((color) => {
      const button = document.createElement("button");
      button.className = "preset";
      button.textContent = color;
      button.style.backgroundColor = color;
      button.style.color = "white";
      button.style.border = "none";
      button.style.padding = "6px";
      button.style.borderRadius = "4px";
      button.style.cursor = "pointer";
      button.style.flex = "1 1 calc(25% - 8px)"; // Ensure 4 buttons per row
      button.style.overflow = "hidden";
      button.style.textOverflow = "ellipsis";
      button.style.whiteSpace = "nowrap";
      button.dataset.color = color;

      button.addEventListener("click", () => {
        if (deleteModeActive && color !== "#FAC900") {
          deletePreset(color);
          deleteModeActive = false;
          deleteModeButton.style.backgroundColor = "";
          deleteModeButton.style.color = "";
        } else if (!deleteModeActive) {
          if (colorMode === "HEX") {
            colorInput.value = color;
            colorInput.dispatchEvent(new Event("change"));
          } else {
            const rgb = [
              parseInt(color.slice(1, 3), 16),
              parseInt(color.slice(3, 5), 16),
              parseInt(color.slice(5, 7), 16),
            ];
            [rInput.value, gInput.value, bInput.value] = rgb;
            rInput.dispatchEvent(new Event("change"));
          }
        }
      });

      presetsContainer.appendChild(button);
    });
  });
}

function deletePreset(color) {
  chrome.storage.local.get("colorPresets", (result) => {
    const presets = result.colorPresets || [];
    const updatedPresets = presets.filter((preset) => preset !== color);
    chrome.storage.local.set({ colorPresets: updatedPresets }, loadPresets);
  });
}

function addPreset(color) {
  chrome.storage.local.get("colorPresets", (result) => {
    const presets = result.colorPresets || [];
    if (!presets.includes(color)) {
      presets.push(color);
      chrome.storage.local.set({ colorPresets: presets }, loadPresets);
    }
  });
}

// Load presets on startup
loadPresets();

document.getElementById("refresh-page").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.reload(tab.id);
});

document
  .getElementById("toggle-custom-favicon-checkbox")
  .addEventListener("change", async (e) => {
    const hostname = await getCurrentTabHostname();
    const checked = e.target.checked;

    chrome.storage.local.get(["faviconOverrideDisabled"], (result) => {
      const overrides = result.faviconOverrideDisabled || {};

      if (!checked) {
        overrides[hostname] = true; // Disable override
      } else {
        delete overrides[hostname]; // Enable override
      }

      chrome.storage.local.set(
        { faviconOverrideDisabled: overrides },
        updateButtonState
      );
    });
  });

const submitRgbButton = document.getElementById("submit-rgb");
const addPresetButton = document.getElementById("add-preset");
const deleteModeButton = document.getElementById("delete-mode");
let deleteModeActive = false;

// Toggle delete mode
deleteModeButton.addEventListener("click", () => {
  deleteModeActive = !deleteModeActive;
  deleteModeButton.style.backgroundColor = deleteModeActive ? "red" : "";
  deleteModeButton.style.color = deleteModeActive ? "white" : "";
});

// Save RGB color on submit button click
submitRgbButton.addEventListener("click", () => {
  const r = parseInt(rInput.value) || 0;
  const g = parseInt(gInput.value) || 0;
  const b = parseInt(bInput.value) || 0;
  if ([r, g, b].some((val) => val < 0 || val > 255)) {
    alert("RGB values must be between 0 and 255.");
    return;
  }
  saveColor([r, g, b]);
});

// Add current color as a preset
addPresetButton.addEventListener("click", () => {
  let color;
  if (colorMode === "HEX") {
    color = colorInput.value.trim();
    if (!/^#([0-9A-Fa-f]{6})$/.test(color)) {
      alert("Invalid HEX color format. Use #RRGGBB.");
      return;
    }
  } else {
    const r = parseInt(rInput.value) || 0;
    const g = parseInt(gInput.value) || 0;
    const b = parseInt(bInput.value) || 0;
    if ([r, g, b].some((val) => val < 0 || val > 255)) {
      alert("RGB values must be between 0 and 255.");
      return;
    }
    color = `#${((1 << 24) + (r << 16) + (g << 8) + b)
      .toString(16)
      .slice(1)
      .toUpperCase()}`;
  }
  addPreset(color);
});

updateButtonState();
