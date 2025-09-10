function isWhiteish(r, g, b) {
  return r > 240 && g > 240 && b > 240;
}

function processImageToFavicon(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  chrome.storage.local.get("recolorRGB", (result) => {
    const [rNew, gNew, bNew] = result.recolorRGB || [250, 201, 0];

    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = data.slice(i, i + 3);
      if (isWhiteish(r, g, b)) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        data[i] = rNew;
        data[i + 1] = gNew;
        data[i + 2] = bNew;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const newFaviconURL = canvas.toDataURL("image/png");

    // Remove all existing icon links to avoid duplicates
    document.querySelectorAll("link[rel*='icon']").forEach((l) => l.remove());

    const newLink = document.createElement("link");
    newLink.rel = "icon";
    newLink.type = "image/png";
    newLink.href = newFaviconURL;

    document.head.appendChild(newLink);
  });
}

function replaceFavicon() {
  chrome.storage.local.get(
    ["faviconExceptions", "faviconOverrides", "faviconOverrideDisabled"],
    (result) => {
      const exceptions = result.faviconExceptions || [];
      const overrides = result.faviconOverrides || {};
      const disabledOverrides = result.faviconOverrideDisabled || {};
      const hostname = location.hostname;

      if (exceptions.includes(hostname)) return;

      const customFaviconURL = overrides[hostname];
      const overrideDisabled = disabledOverrides[hostname];

      if (customFaviconURL && !overrideDisabled) {
        // Ask background to fetch safely
        chrome.runtime.sendMessage(
          { type: "fetch-favicon", url: customFaviconURL },
          (response) => {
            if (!response || !response.success) {
              console.warn("Custom favicon failed to fetch:", response?.error);
              chrome.runtime.sendMessage({ type: "favicon-failed", hostname });
              return;
            }

            const img = new Image();
            img.src = response.dataUrl;

            img.onload = () => {
              const newFaviconURL = processImageToFavicon(img);

              // Remove all old icons
              document
                .querySelectorAll("link[rel*='icon']")
                .forEach((l) => l.remove());

              const newLink = document.createElement("link");
              newLink.rel = "icon";
              newLink.type = "image/png";
              newLink.href = newFaviconURL;

              document.head.appendChild(newLink);
            };

            img.onerror = () => {
              console.warn("Custom favicon image failed to load.");
              chrome.runtime.sendMessage({ type: "favicon-failed", hostname });
            };
          }
        );

        return; // Skip rest of replaceFavicon
      }

      const links = Array.from(document.querySelectorAll("link[rel*='icon']"));
      let faviconProcessed = false;

      const faviconCandidates = links
        .filter((link) => {
          const href = link.href;
          return (
            href.endsWith(".png") ||
            href.endsWith(".ico") ||
            href.endsWith(".svg")
          );
        })
        .map((link) => {
          const sizesAttr = link.getAttribute("sizes");
          const sizes = sizesAttr ? parseInt(sizesAttr.split("x")[0]) : 0;
          return { link, size: sizes };
        })
        .sort((a, b) => b.size - a.size); // Largest first

      if (faviconCandidates.length > 0) {
        const { link } = faviconCandidates[0];
        const href = link.href;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = href;

        img.onload = () => {
          const newFaviconURL = processImageToFavicon(img);

          // Remove all existing icon links to avoid duplicates
          links.forEach((l) => l.remove());

          const newLink = document.createElement("link");
          newLink.rel = "icon";
          newLink.type = "image/png";
          newLink.href = newFaviconURL;

          document.head.appendChild(newLink);
        };

        img.onerror = () => {
          console.warn("Could not load favicon image.");
          chrome.runtime.sendMessage({ type: "favicon-failed", hostname });
        };
      } else {
        chrome.runtime.sendMessage({ type: "favicon-failed", hostname });
      }
    }
  );
}

replaceFavicon();
setTimeout(replaceFavicon, 500);
setTimeout(replaceFavicon, 1500);
setTimeout(replaceFavicon, 3000);
