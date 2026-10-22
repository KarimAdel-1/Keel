// The one line a business adds to its website. It reads which agent and layout from its own tag, then draws:
//   bubble: a round button in a bottom corner that opens the chat above it (full screen on a phone);
//   panel:  a tab on the edge of the page that slides the chat in at full height;
//   focus:  a button that opens the chat in the middle of the page, over a dimmed background;
//   inline: the chat inside the page, in the element marked data-keel-chat (or data-target).
// The chat itself is Keel's chat page in a frame, so it never touches the business's page or its styles.

const SCRIPT = String.raw`(function () {
  var tag = document.currentScript;
  if (!tag || !tag.dataset.agent) return;
  var agent = tag.dataset.agent;
  var origin = new URL(tag.src).origin;
  var chatUrl = function (mode) { return origin + "/chat/" + encodeURIComponent(agent) + "?embed=" + mode; };

  fetch(origin + "/api/chat/" + encodeURIComponent(agent) + "/config").then(function (r) { return r.json(); }).then(function (c) {
    if (!c || !c.available) return;
    var layout = tag.dataset.layout || c.layout || "bubble";
    var side = tag.dataset.position || c.position || "right";
    var color = c.color || "#4f46e5";
    var ink = (function (hex) {
      var v = [1, 3, 5].map(function (i) { var x = parseInt(hex.slice(i, i + 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] > 0.179 ? "#15171c" : "#ffffff";
    })(color);

    function frame(mode, css) {
      var f = document.createElement("iframe");
      f.src = chatUrl(mode);
      f.title = "Chat with " + (c.name || "us");
      f.allow = "clipboard-write";
      f.style.cssText = "border:0;background:transparent;" + css;
      return f;
    }

    if (layout === "inline") {
      var target = document.querySelector(tag.dataset.target || "[data-keel-chat]");
      if (!target) return;
      target.appendChild(frame("inline", "width:100%;height:" + (tag.dataset.height || target.style.height || "600px") + ";border-radius:16px;"));
      return;
    }

    var phone = function () { return window.innerWidth < 520; };
    var root = document.createElement("div");
    root.style.cssText = "position:fixed;z-index:2147483000;" + side + ":0;bottom:0;";
    document.body.appendChild(root);
    var open = false;
    var box = document.createElement("div");
    var chat;

    function place() {
      if (layout === "focus") {
        box.style.cssText = "position:fixed;inset:0;background:rgba(15,17,20,.5);display:" + (open ? "flex" : "none") + ";align-items:center;justify-content:center;padding:" + (phone() ? "0" : "24px") + ";";
        if (chat) chat.style.cssText = "border:0;background:transparent;width:" + (phone() ? "100%" : "min(640px,94vw)") + ";height:" + (phone() ? "100%" : "min(80vh,760px)") + ";border-radius:" + (phone() ? "0" : "18px") + ";box-shadow:0 24px 64px rgba(16,24,40,.35);";
      } else if (layout === "panel") {
        box.style.cssText = "position:fixed;top:0;bottom:0;" + side + ":0;width:" + (phone() ? "100vw" : "400px") + ";box-shadow:0 0 40px rgba(16,24,40,.25);transition:transform .25s ease;transform:translateX(" + (open ? "0" : (side === "left" ? "-110%" : "110%")) + ");";
      } else {
        box.style.cssText = phone()
          ? "position:fixed;inset:0;display:" + (open ? "block" : "none") + ";"
          : "position:fixed;bottom:92px;" + side + ":20px;width:380px;height:min(600px,calc(100vh - 120px));border-radius:18px;overflow:hidden;box-shadow:0 12px 48px rgba(16,24,40,.28);display:" + (open ? "block" : "none") + ";";
      }
    }

    // An open chat stays open on the website's next page (this tab only); the conversation itself carries on in the frame.
    var openKey = "keel-open:" + agent;
    var remember = function (v) { try { v ? sessionStorage.setItem(openKey, "1") : sessionStorage.removeItem(openKey); } catch (e) {} };
    var wasOpen = function () { try { return sessionStorage.getItem(openKey) === "1"; } catch (e) { return false; } };

    function toggle(next) {
      open = typeof next === "boolean" ? next : !open;
      remember(open);
      if (open && !chat) { chat = frame(layout, "width:100%;height:100%;"); box.appendChild(chat); }
      place();
      button.style.display = open && (phone() || layout === "panel" || layout === "focus") ? "none" : "flex";
      button.setAttribute("aria-expanded", String(open));
    }

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Chat with " + (c.name || "us"));
    if (layout === "focus") {
      button.textContent = tag.dataset.label || "Ask a question";
      button.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;padding:14px 22px;border:0;cursor:pointer;font:600 14px system-ui,sans-serif;display:flex;border-radius:999px;background:" + color + ";color:" + ink + ";box-shadow:0 8px 28px rgba(16,24,40,.3);";
      box.addEventListener("click", function (e) { if (e.target === box) toggle(false); });
    } else if (layout === "panel") {
      button.textContent = tag.dataset.label || "Chat with us";
      button.style.cssText = "position:fixed;top:50%;" + side + ":0;transform:translateY(-50%);writing-mode:vertical-rl;padding:16px 9px;border:0;cursor:pointer;font:600 13px system-ui,sans-serif;display:flex;background:" + color + ";color:" + ink + ";border-radius:" + (side === "left" ? "0 10px 10px 0" : "10px 0 0 10px") + ";box-shadow:0 6px 24px rgba(16,24,40,.25);";
    } else {
      button.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';
      button.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:" + color + ";color:" + ink + ";box-shadow:0 8px 28px rgba(16,24,40,.3);";
    }
    button.addEventListener("click", function () { toggle(); });
    root.appendChild(box);
    root.appendChild(button);
    place();
    if (wasOpen() && !phone()) toggle(true);
    window.addEventListener("resize", place);
    window.addEventListener("message", function (e) {
      if (e.origin === origin && e.data && e.data.keel === "close" && e.data.agent === agent) toggle(false);
    });
  }).catch(function () {});
})();`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
