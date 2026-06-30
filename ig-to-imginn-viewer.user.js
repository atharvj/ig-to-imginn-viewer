// ==UserScript==
// @name         IG to Imginn Viewer
// @namespace    https://github.com/atharvj/ig-to-imginn-viewer
// @version      0.4.5
// @description  Opens public Instagram links in Imginn and shows Imginn posts in a popup instead of leaving the profile page.
// @author       Atharv Joshi
// @license      MIT
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @match        https://m.instagram.com/*
// @match        https://imginn.com/*
// @match        https://www.imginn.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  const VIEWER_ORIGIN = "https://imginn.com";
  const SCRIPT_NAME = "IG to Imginn Viewer";
  const MODAL_ID = "igiv-post-modal";
  const STYLE_ID = "igiv-style";
  const FRAME_STYLE_ID = "igiv-frame-style";
  const MODAL_OPEN_CLASS = "igiv-modal-open";
  const HIDDEN_CLASS = "igiv-hidden";

  const LOGIN_PATH_RE = /^\/accounts\/login\/?$/;
  const INSTAGRAM_POST_PATH_RE = /^\/p\/([^/?#]+)\/?$/;
  const INSTAGRAM_REEL_PATH_RE = /^\/reel\/([^/?#]+)\/?$/;
  const INSTAGRAM_TV_PATH_RE = /^\/tv\/([^/?#]+)\/?$/;
  const PROFILE_PATH_RE = /^\/([A-Za-z0-9._]{1,30})(?:\/(reels|tagged|channel|guides))?\/?$/;
  const VIEWER_POST_PATH_RE = /^\/(?:([A-Za-z0-9._]{1,30})\/)?(p|reel|tv)\/([^/?#]+)\/?$/;

  const RESERVED_PROFILE_SEGMENTS = new Set([
    "about",
    "accounts",
    "api",
    "challenge",
    "developer",
    "direct",
    "explore",
    "graphql",
    "legal",
    "oauth",
    "p",
    "privacy",
    "reel",
    "stories",
    "terms",
    "tv",
  ]);

  let activeFrame = null;
  let activeOpenLink = null;
  let activeTitle = null;
  let activePostCandidates = [];
  let activePostCandidateIndex = -1;
  let activePreview = null;

  function parseUrl(value, base) {
    try {
      return new URL(value, base || window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isInstagramHost(hostname) {
    return hostname === "instagram.com" || hostname.endsWith(".instagram.com");
  }

  function isViewerHost(hostname) {
    return hostname === "imginn.com" || hostname.endsWith(".imginn.com");
  }

  function isModifiedClick(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  }

  function cleanPathPart(value) {
    return encodeURIComponent(decodeURIComponent(value));
  }

  function closestAnchor(target) {
    return target && typeof target.closest === "function" ? target.closest("a[href]") : null;
  }

  function isProfilePath(pathname) {
    const match = pathname.match(PROFILE_PATH_RE);
    return Boolean(match && !RESERVED_PROFILE_SEGMENTS.has(match[1].toLowerCase()));
  }

  function viewerProfileUsernameFromPath(pathname) {
    const match = pathname.match(PROFILE_PATH_RE);
    if (!match || RESERVED_PROFILE_SEGMENTS.has(match[1].toLowerCase())) return "";

    return match[1];
  }

  function currentViewerProfileUsername() {
    const currentUrl = parseUrl(window.location.href);
    if (!currentUrl || !isViewerHost(currentUrl.hostname)) return "";

    return viewerProfileUsernameFromPath(currentUrl.pathname);
  }

  function viewerPostInfo(url) {
    if (!url || !isViewerHost(url.hostname)) return null;

    const match = url.pathname.match(VIEWER_POST_PATH_RE);
    if (!match) return null;

    const owner = match[1] || "";
    if (owner && RESERVED_PROFILE_SEGMENTS.has(owner.toLowerCase())) return null;

    return {
      owner,
      kind: match[2],
      code: match[3],
    };
  }

  function isViewerPostUrl(url) {
    return Boolean(viewerPostInfo(url));
  }

  function isViewerProfileUrl(url) {
    return Boolean(url && isViewerHost(url.hostname) && isProfilePath(url.pathname));
  }

  function sameViewerOriginUrl(url) {
    const nextUrl = new URL(url.href);
    nextUrl.protocol = window.location.protocol;
    nextUrl.hostname = window.location.hostname;
    nextUrl.port = window.location.port;
    return nextUrl.href;
  }

  function viewerPostUrl(owner, kind, code) {
    const ownerPath = owner ? `/${cleanPathPart(owner)}` : "";
    return `${window.location.origin}${ownerPath}/${kind}/${cleanPathPart(code)}/`;
  }

  function addUniqueUrl(urls, value) {
    if (!urls.includes(value)) {
      urls.push(value);
    }
  }

  function candidateUrlsForPost(url) {
    const info = viewerPostInfo(url);
    if (!info) return [];

    const urls = [];
    const profileOwner = info.owner || currentViewerProfileUsername();
    const kinds = [info.kind, ...["p", "reel", "tv"].filter((kind) => kind !== info.kind)];

    for (const kind of kinds) {
      if (profileOwner) {
        addUniqueUrl(urls, viewerPostUrl(profileOwner, kind, info.code));
      }

      addUniqueUrl(urls, viewerPostUrl("", kind, info.code));
    }

    addUniqueUrl(urls, sameViewerOriginUrl(url));
    return urls;
  }

  function instagramUrlFromLoginRedirect(url) {
    if (!LOGIN_PATH_RE.test(url.pathname)) return null;

    const next = url.searchParams.get("next");
    if (!next) return null;

    const target = parseUrl(next, url.origin);
    if (!target || !isInstagramHost(target.hostname)) return null;

    return target;
  }

  function imginnUrlForInstagramUrl(url) {
    const loginTarget = instagramUrlFromLoginRedirect(url);
    if (loginTarget) return imginnUrlForInstagramUrl(loginTarget);

    const postMatch = url.pathname.match(INSTAGRAM_POST_PATH_RE) || url.pathname.match(INSTAGRAM_TV_PATH_RE);
    if (postMatch) {
      return `${VIEWER_ORIGIN}/p/${cleanPathPart(postMatch[1])}/`;
    }

    const reelMatch = url.pathname.match(INSTAGRAM_REEL_PATH_RE);
    if (reelMatch) {
      return `${VIEWER_ORIGIN}/reel/${cleanPathPart(reelMatch[1])}/`;
    }

    const profileMatch = url.pathname.match(PROFILE_PATH_RE);
    if (!profileMatch) return null;

    const username = profileMatch[1];
    if (RESERVED_PROFILE_SEGMENTS.has(username.toLowerCase())) return null;

    const tab = profileMatch[2] ? `/${profileMatch[2]}` : "";
    return `${VIEWER_ORIGIN}/${cleanPathPart(username)}${tab}/`;
  }

  function redirectInstagramToViewer() {
    const currentUrl = parseUrl(window.location.href);
    if (!currentUrl || !isInstagramHost(currentUrl.hostname)) return;

    const viewerUrl = imginnUrlForInstagramUrl(currentUrl);
    if (!viewerUrl) return;

    window.stop();
    window.location.replace(viewerUrl);
    console.info(`${SCRIPT_NAME}: redirected to ${viewerUrl}`);
  }

  function onReady(callback) {
    if (document.body) {
      callback();
      return;
    }

    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[data-igiv-viewer-page="true"] ins.adsbygoogle,
      html[data-igiv-viewer-page="true"] iframe[id^="aswift_"],
      html[data-igiv-viewer-page="true"] iframe[src*="googlesyndication"],
      html[data-igiv-viewer-page="true"] iframe[src*="doubleclick"],
      html[data-igiv-viewer-page="true"] [id*="google_ads"],
      html[data-igiv-viewer-page="true"] [class*="adsbygoogle"] {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
      }

      html[data-igiv-viewer-page="true"] [data-igiv-hidden-spacer="true"] {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
      }

      .${HIDDEN_CLASS} {
        display: none !important;
        height: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
        padding: 0 !important;
      }

      body.${MODAL_OPEN_CLASS} {
        overflow: hidden !important;
      }

      #${MODAL_ID} {
        align-items: center !important;
        background: rgba(0, 0, 0, 0.66) !important;
        box-sizing: border-box !important;
        display: none !important;
        inset: 0 !important;
        justify-content: center !important;
        padding: 18px !important;
        position: fixed !important;
        z-index: 2147483647 !important;
      }

      #${MODAL_ID}[data-visible="true"] {
        display: flex !important;
      }

      #${MODAL_ID} [data-igiv-panel] {
        background: #fff !important;
        border-radius: 8px !important;
        box-shadow: 0 18px 55px rgba(0, 0, 0, 0.42) !important;
        display: flex !important;
        flex-direction: column !important;
        height: min(860px, calc(100vh - 36px)) !important;
        max-width: 1120px !important;
        min-height: 420px !important;
        overflow: hidden !important;
        width: min(1120px, calc(100vw - 36px)) !important;
      }

      #${MODAL_ID} [data-igiv-bar] {
        align-items: center !important;
        border-bottom: 1px solid #dbdbdb !important;
        box-sizing: border-box !important;
        display: none !important;
        flex: 0 0 auto !important;
        gap: 10px !important;
        height: 0 !important;
        min-height: 48px !important;
        overflow: hidden !important;
        padding: 8px 10px !important;
      }

      #${MODAL_ID} [data-igiv-title] {
        color: #111 !important;
        flex: 1 1 auto !important;
        font: 700 14px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        letter-spacing: 0 !important;
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      #${MODAL_ID} a,
      #${MODAL_ID} button {
        align-items: center !important;
        appearance: none !important;
        background: #fff !important;
        border: 1px solid #cfcfcf !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        color: #111 !important;
        cursor: pointer !important;
        display: inline-flex !important;
        flex: 0 0 auto !important;
        font: 700 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        height: 32px !important;
        justify-content: center !important;
        letter-spacing: 0 !important;
        padding: 0 10px !important;
        text-decoration: none !important;
      }

      #${MODAL_ID} [data-igiv-open] {
        background: #0095f6 !important;
        border-color: #0095f6 !important;
        color: #fff !important;
      }

      #${MODAL_ID} [data-igiv-frame-wrap] {
        background: #fff !important;
        display: flex !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        position: relative !important;
      }

      #${MODAL_ID} iframe {
        background: #fff !important;
        border: 0 !important;
        flex: 1 1 auto !important;
        height: 100% !important;
        width: 100% !important;
      }

      #${MODAL_ID} [data-igiv-loading] {
        align-items: center !important;
        background: #fff !important;
        color: #555 !important;
        display: none !important;
        font: 600 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        inset: 0 !important;
        justify-content: center !important;
        letter-spacing: 0 !important;
        position: absolute !important;
      }

      #${MODAL_ID}[data-loading="true"] [data-igiv-loading] {
        display: flex !important;
      }

      @media (max-width: 760px) {
        #${MODAL_ID} {
          padding: 0 !important;
        }

        #${MODAL_ID} [data-igiv-panel] {
          border-radius: 0 !important;
          height: 100vh !important;
          max-width: none !important;
          min-height: 100vh !important;
          width: 100vw !important;
        }

        #${MODAL_ID} [data-igiv-bar] {
          gap: 6px !important;
        }

        #${MODAL_ID} a,
        #${MODAL_ID} button {
          font-size: 12px !important;
          padding: 0 8px !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function createModal() {
    ensureStyles();

    const existing = document.getElementById(MODAL_ID);
    if (existing) return existing;

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Imginn post popup");

    const panel = document.createElement("section");
    panel.setAttribute("data-igiv-panel", "true");

    const bar = document.createElement("div");
    bar.setAttribute("data-igiv-bar", "true");

    activeTitle = document.createElement("strong");
    activeTitle.setAttribute("data-igiv-title", "true");
    activeTitle.textContent = "Post";

    activeOpenLink = document.createElement("a");
    activeOpenLink.setAttribute("data-igiv-open", "true");
    activeOpenLink.target = "_blank";
    activeOpenLink.rel = "noopener noreferrer";
    activeOpenLink.textContent = "Open Page";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", closeModal);

    bar.append(activeTitle, activeOpenLink, closeButton);

    const frameWrap = document.createElement("div");
    frameWrap.setAttribute("data-igiv-frame-wrap", "true");

    activeFrame = document.createElement("iframe");
    activeFrame.title = "Imginn post";
    activeFrame.loading = "eager";
    activeFrame.addEventListener("load", handleFrameLoad);

    const loading = document.createElement("div");
    loading.setAttribute("data-igiv-loading", "true");
    loading.textContent = "Loading post...";

    frameWrap.append(activeFrame, loading);
    panel.append(bar, frameWrap);
    modal.appendChild(panel);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    document.body.appendChild(modal);
    return modal;
  }

  function openPostModal(url, sourceElement) {
    onReady(() => {
      const modal = createModal();

      modal.dataset.visible = "true";
      document.body.classList.add(MODAL_OPEN_CLASS);

      activeTitle.textContent = postTitleFromUrl(url);
      activePostCandidates = candidateUrlsForPost(url);
      activePostCandidateIndex = 0;
      activePreview = postPreviewFromElement(sourceElement);

      loadActivePostCandidate();
    });
  }

  function loadActivePostCandidate() {
    const modal = document.getElementById(MODAL_ID);
    const postUrl = activePostCandidates[activePostCandidateIndex];
    if (!modal || !postUrl) return;

    modal.dataset.loading = "true";
    activeOpenLink.href = postUrl;

    delete activeFrame.dataset.igivFallback;
    activeFrame.removeAttribute("srcdoc");
    activeFrame.src = postUrl;
  }

  function tryNextPostCandidate() {
    if (activePostCandidateIndex + 1 >= activePostCandidates.length) {
      showPreviewFallback();
      return false;
    }

    activePostCandidateIndex += 1;
    loadActivePostCandidate();
    return true;
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    modal.dataset.visible = "false";
    modal.dataset.loading = "false";
    document.body.classList.remove(MODAL_OPEN_CLASS);

    try {
      activeFrame.contentDocument.querySelectorAll("audio, video").forEach((media) => {
        media.pause();
      });
    } catch (_) {
      // The iframe can still be closed even if the browser blocks media access.
    }

    if (activeFrame) {
      activeFrame.removeAttribute("src");
      activeFrame.removeAttribute("srcdoc");
    }

    activePostCandidates = [];
    activePostCandidateIndex = -1;
    activePreview = null;
  }

  function postTitleFromUrl(url) {
    const info = viewerPostInfo(url);
    if (!info) return "Post";

    const kind = info.kind === "reel" ? "Reel" : "Post";
    const code = info.code || "";
    return code ? `${kind} ${code}` : kind;
  }

  function postPreviewFromElement(sourceElement) {
    if (!sourceElement) return null;

    const container =
      sourceElement.closest("article, li, [class*='post'], [class*='item'], [class*='photo'], [class*='media']") ||
      sourceElement;
    const image = sourceElement.querySelector("img") || container.querySelector("img");
    const video = sourceElement.querySelector("video") || container.querySelector("video");
    const textCandidates = [
      image && image.alt,
      sourceElement.getAttribute("aria-label"),
      sourceElement.getAttribute("title"),
      container.textContent,
    ]
      .filter(Boolean)
      .map((value) => value.trim().replace(/\s+/g, " "))
      .filter(Boolean);

    return {
      imageSrc: image ? image.currentSrc || image.src : "",
      imageAlt: image ? image.alt || "" : "",
      videoSrc: video ? video.currentSrc || video.src : "",
      text: textCandidates[0] || "",
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function isContentNotFoundFrame(frameDocument) {
    const title = (frameDocument.title || "").toLowerCase();
    const text = (frameDocument.body ? frameDocument.body.innerText || "" : "").replace(/\s+/g, " ").toLowerCase();

    return (
      title.includes("content not found") ||
      text.includes("content not found") ||
      text.includes("content has been deleted")
    );
  }

  function showPreviewFallback() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    modal.dataset.loading = "false";
    activeFrame.dataset.igivFallback = "true";

    const preview = activePreview || {};
    const mediaHtml = preview.videoSrc
      ? `<video controls playsinline src="${escapeHtml(preview.videoSrc)}"></video>`
      : preview.imageSrc
        ? `<img src="${escapeHtml(preview.imageSrc)}" alt="${escapeHtml(preview.imageAlt || "Post preview")}">`
        : `<div data-empty-preview>No preview image was available from this card.</div>`;
    const triedLinks = activePostCandidates
      .map((url) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></li>`)
      .join("");

    activeFrame.srcdoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      color: #111;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
    }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      min-height: 100vh;
    }
    [data-media] {
      align-items: center;
      background: #050505;
      display: flex;
      justify-content: center;
      min-height: 420px;
    }
    img, video {
      display: block;
      max-height: 100vh;
      max-width: 100%;
      object-fit: contain;
    }
    [data-info] {
      border-left: 1px solid #dbdbdb;
      box-sizing: border-box;
      padding: 18px;
    }
    h1 {
      font-size: 17px;
      line-height: 1.3;
      margin: 0 0 10px;
    }
    p {
      color: #555;
      margin: 0 0 14px;
    }
    [data-caption] {
      color: #111;
      overflow-wrap: anywhere;
    }
    ul {
      margin: 10px 0 0;
      padding-left: 18px;
    }
    a {
      color: #00376b;
      overflow-wrap: anywhere;
    }
    [data-empty-preview] {
      color: #ddd;
      padding: 20px;
      text-align: center;
    }
    @media (max-width: 760px) {
      main {
        display: block;
      }
      [data-info] {
        border-left: 0;
        border-top: 1px solid #dbdbdb;
      }
    }
  </style>
</head>
<body>
  <main>
    <section data-media>${mediaHtml}</section>
    <section data-info>
      <h1>Imginn could not open the post detail page</h1>
      <p>The profile card loaded, but every known Imginn detail URL returned Content Not Found. Comments and tagged users are only available if Imginn exposes the post page.</p>
      ${preview.text ? `<p data-caption>${escapeHtml(preview.text)}</p>` : ""}
      <p>URLs tried:</p>
      <ul>${triedLinks}</ul>
    </section>
  </main>
</body>
</html>`;
  }

  function visibleRect(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return null;
    }

    return rect;
  }

  function viewerPostLinksIn(element) {
    return Array.from(element.querySelectorAll("a[href]")).filter((link) => {
      const targetUrl = parseUrl(link.href, window.location.href);
      return isViewerPostUrl(targetUrl) && Boolean(link.querySelector("img, video, picture"));
    });
  }

  function findPostGridContainer() {
    const firstPostLink = viewerPostLinksIn(document).find((link) => visibleRect(link));
    if (!firstPostLink) return null;

    let node = firstPostLink;
    while (node && node !== document.body && node.nodeType === Node.ELEMENT_NODE) {
      const postLinkCount = viewerPostLinksIn(node).length;
      const rect = visibleRect(node);

      if (rect && postLinkCount >= 3) {
        return node;
      }

      node = node.parentElement;
    }

    return null;
  }

  function hideFloatingDownloadAll(gridTop) {
    for (const element of document.querySelectorAll("a, button, span, div")) {
      if ((element.textContent || "").trim() !== "Download All") continue;

      const rect = visibleRect(element);
      if (!rect || rect.top > gridTop || gridTop - rect.bottom > 700) continue;

      const target = element.closest("a, button") || element;
      target.dataset.igivHiddenSpacer = "true";
    }
  }

  function normalizedText(element) {
    return (element.textContent || "").trim().replace(/\s+/g, " ");
  }

  function hideCompactTextBlock(element) {
    const initialText = normalizedText(element);
    let target = element;
    let parent = element.parentElement;

    while (parent && parent !== document.body) {
      const parentText = normalizedText(parent);
      const parentRect = visibleRect(parent);
      if (!parentRect || parentText.length > 260 || parentRect.height > 170) break;
      if (/share\s*to\s*:/i.test(initialText) && /posts\s+stories\s+reels/i.test(parentText)) break;

      target = parent;
      parent = parent.parentElement;
    }

    target.dataset.igivHiddenSpacer = "true";
  }

  function hideShareAndDownloadRows() {
    for (const element of document.body.querySelectorAll("div, section, p, span, nav, ul, li, a, button")) {
      if (element.id === MODAL_ID || element.closest(`#${MODAL_ID}`)) continue;

      const text = normalizedText(element);
      if (!text) continue;

      if (/share\s*to\s*:/i.test(text) && /twitter|reddit|line|snap/i.test(text)) {
        hideCompactTextBlock(element);
        continue;
      }

      if (text === "Download All") {
        hideCompactTextBlock(element);
      }
    }
  }

  function hideEmptySpacersBeforeGrid(gridTop) {
    for (const element of document.body.querySelectorAll("div, section, aside")) {
      if (element.id === MODAL_ID || element.closest(`#${MODAL_ID}`)) continue;
      if (element.querySelector("img, video, picture, input, textarea, select")) continue;

      const rect = visibleRect(element);
      if (!rect || rect.bottom > gridTop || rect.height < 96 || rect.width < 240) continue;

      const text = (element.textContent || "").trim().replace(/\s+/g, " ");
      if (text.length > 40) continue;

      element.dataset.igivHiddenSpacer = "true";
    }
  }

  function bottomOfProfileControlsBefore(gridTop) {
    const controlPatterns = [/share\s*to/i, /posts\s+stories\s+reels\s+tagged/i, /posts\s+stories\s+reels/i];
    let bestBottom = 0;

    for (const element of document.body.querySelectorAll("div, section, nav, ul, p")) {
      if (element.id === MODAL_ID || element.closest(`#${MODAL_ID}`)) continue;

      const rect = visibleRect(element);
      if (!rect || rect.top >= gridTop || rect.height > 180) continue;

      const text = (element.textContent || "").trim().replace(/\s+/g, " ");
      if (!text || text === "Download All") continue;

      if (controlPatterns.some((pattern) => pattern.test(text))) {
        bestBottom = Math.max(bestBottom, rect.bottom);
      }
    }

    return bestBottom;
  }

  function bottomOfPostTabsBefore(gridTop) {
    let bestBottom = 0;

    for (const element of document.body.querySelectorAll("div, section, nav, ul")) {
      if (element.id === MODAL_ID || element.closest(`#${MODAL_ID}`)) continue;

      const rect = visibleRect(element);
      if (!rect || rect.top >= gridTop || rect.height > 120 || rect.width < 240) continue;

      const text = normalizedText(element);
      if (/posts\s+stories\s+reels\s+tagged/i.test(text) || /posts\s+stories\s+reels/i.test(text)) {
        bestBottom = Math.max(bestBottom, rect.bottom);
      }
    }

    return bestBottom;
  }

  function compactViewerProfilePage() {
    if (!isViewerProfileUrl(parseUrl(window.location.href))) return;

    document.documentElement.dataset.igivViewerPage = "true";
    hideShareAndDownloadRows();

    const grid = findPostGridContainer();
    if (!grid) return;

    grid.style.removeProperty("margin-top");
    grid.style.removeProperty("transform");
    grid.style.removeProperty("position");
    const originalGridRect = visibleRect(grid);
    if (!originalGridRect) return;

    hideFloatingDownloadAll(originalGridRect.top);
    hideEmptySpacersBeforeGrid(originalGridRect.top);
    hideShareAndDownloadRows();

    window.requestAnimationFrame(() => {
      const gridRect = visibleRect(grid);
      if (!gridRect) return;

      const tabsBottom = bottomOfPostTabsBefore(gridRect.top);
      const controlsBottom = tabsBottom || bottomOfProfileControlsBefore(gridRect.top);
      if (!controlsBottom) return;

      const desiredGap = 8;
      const currentGap = gridRect.top - controlsBottom;
      if (currentGap <= desiredGap) return;

      const maxPullUp = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        window.innerHeight * 6,
        6000
      );
      let pullUpBy = Math.min(currentGap - desiredGap, maxPullUp);
      grid.style.setProperty("position", "relative", "important");
      grid.style.setProperty("transform", `translateY(-${Math.round(pullUpBy)}px)`, "important");
      grid.dataset.igivCompacted = "true";

      window.requestAnimationFrame(() => {
        const movedGridRect = visibleRect(grid);
        if (!movedGridRect) return;

        const anchorBottom = controlsBottom;
        const remainingGap = movedGridRect.top - anchorBottom;
        if (remainingGap <= desiredGap) return;

        pullUpBy = Math.min(pullUpBy + remainingGap - desiredGap, maxPullUp);
        grid.style.setProperty("transform", `translateY(-${Math.round(pullUpBy)}px)`, "important");
      });
    });
  }

  function handleFrameLoad() {
    const modal = document.getElementById(MODAL_ID);

    try {
      const frameDocument = activeFrame.contentDocument;

      if (activeFrame.dataset.igivFallback !== "true" && frameDocument && isContentNotFoundFrame(frameDocument)) {
        tryNextPostCandidate();
        return;
      }

      if (modal) modal.dataset.loading = "false";
      prepareFrameDocument(frameDocument, activeFrame.contentWindow.location.href);
    } catch (_) {
      // If Imginn changes origins or browser isolation blocks access, the iframe still works normally.
      if (modal) modal.dataset.loading = "false";
    }
  }

  function frameVisibleRect(element) {
    const view = element.ownerDocument.defaultView;
    if (!view) return null;

    const rect = element.getBoundingClientRect();
    const style = view.getComputedStyle(element);

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return null;
    }

    return rect;
  }

  function hideFrameElement(element) {
    if (element && element.nodeType === Node.ELEMENT_NODE) {
      element.classList.add(HIDDEN_CLASS);
    }
  }

  function frameChromeBlockFor(element) {
    let target = element;
    let parent = element.parentElement;

    while (parent && parent !== element.ownerDocument.body) {
      const rect = frameVisibleRect(parent);
      const text = normalizedText(parent);

      if (!rect || rect.top > 285 || rect.height > 180 || text.length > 320) {
        break;
      }

      target = parent;
      parent = parent.parentElement;
    }

    return target;
  }

  function hideFrameChrome(frameDocument) {
    if (!frameDocument.body) return;

    for (const element of frameDocument.querySelectorAll("header, nav, [role='banner']")) {
      hideFrameElement(element);
    }

    for (const input of frameDocument.querySelectorAll("input, textarea")) {
      const label = `${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""}`;
      if (/search\s*users/i.test(label) || /search/i.test(label)) {
        hideFrameElement(frameChromeBlockFor(input.closest("form") || input));
      }
    }

    for (const element of frameDocument.body.querySelectorAll("div, section, p, span, h1, h2, a")) {
      const rect = frameVisibleRect(element);
      if (!rect || rect.top > 285 || rect.height > 180) continue;

      const text = normalizedText(element);
      if (!text) continue;

      if (/^imginn$/i.test(text) || /instagram story viewer/i.test(text) || /search\s*users/i.test(text)) {
        hideFrameElement(frameChromeBlockFor(element));
      }
    }
  }

  function prepareFrameDocument(frameDocument, frameHref) {
    if (!frameDocument || !frameDocument.documentElement) return;

    frameDocument.documentElement.dataset.igivFramed = "true";

    if (!frameDocument.getElementById(FRAME_STYLE_ID)) {
      const style = frameDocument.createElement("style");
      style.id = FRAME_STYLE_ID;
      style.textContent = `
        body {
          background: #fff !important;
          margin: 0 !important;
        }

        body > header,
        body > footer,
        body > nav,
        header,
        nav,
        [role="banner"],
        .${HIDDEN_CLASS} {
          display: none !important;
          height: 0 !important;
          margin: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
          padding: 0 !important;
        }

        a {
          cursor: pointer !important;
        }
      `;
      (frameDocument.head || frameDocument.documentElement).appendChild(style);
    }

    hideFrameChrome(frameDocument);

    if (frameDocument.documentElement.dataset.igivClickHandler !== "true") {
      frameDocument.documentElement.dataset.igivClickHandler = "true";

      frameDocument.addEventListener(
        "click",
        (event) => {
          const link = closestAnchor(event.target);
          if (!link) return;

          const targetUrl = parseUrl(link.href, frameHref);
          if (!targetUrl || !isViewerHost(targetUrl.hostname)) return;

          if (isViewerPostUrl(targetUrl)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openPostModal(targetUrl, link);
            return;
          }

          if (isViewerProfileUrl(targetUrl)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeModal();
            window.location.assign(sameViewerOriginUrl(targetUrl));
          }
        },
        true
      );
    }
  }

  function handleViewerClick(event) {
    if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) return;

    const link = closestAnchor(event.target);
    if (!link) return;

    const targetUrl = parseUrl(link.href, window.location.href);
    if (!isViewerPostUrl(targetUrl)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openPostModal(targetUrl, link);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      closeModal();
    }
  }

  function installProfileCompactor() {
    onReady(() => {
      ensureStyles();
      compactViewerProfilePage();

      let queued = false;
      const schedule = () => {
        if (queued) return;
        queued = true;

        window.requestAnimationFrame(() => {
          queued = false;
          compactViewerProfilePage();
        });
      };

      const observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      window.addEventListener("resize", schedule, { passive: true });
    });
  }

  function installViewerModal() {
    document.addEventListener("click", handleViewerClick, true);
    document.addEventListener("keydown", handleKeydown, true);
    installProfileCompactor();
    console.info(`${SCRIPT_NAME}: Imginn popup mode is active.`);
  }

  const currentUrl = parseUrl(window.location.href);
  if (!currentUrl) return;

  if (isInstagramHost(currentUrl.hostname)) {
    redirectInstagramToViewer();
    return;
  }

  if (isViewerHost(currentUrl.hostname)) {
    installViewerModal();
  }
})();
