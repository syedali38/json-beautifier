(function () {
  var STORAGE_KEY = "jsonforgekit-analytics-consent";

  function readChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function writeChoice(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      return;
    }
  }

  function clearAnalyticsCookies() {
    var parts = document.cookie ? document.cookie.split(";") : [];
    var host = location.hostname;
    for (var i = 0; i < parts.length; i += 1) {
      var name = parts[i].split("=")[0].replace(/^\s+/, "");
      if (name.indexOf("_ga") !== 0) continue;
      var base = name + "=; Max-Age=0; path=/";
      document.cookie = base;
      document.cookie = base + "; domain=" + host;
      if (host.indexOf(".") !== -1) {
        document.cookie = base + "; domain=." + host;
      }
    }
  }

  function chooseGranted() {
    writeChoice("granted");
    if (typeof window.loadGoogleAnalytics === "function") {
      window.loadGoogleAnalytics();
    }
    hideBanner();
  }

  function chooseDenied() {
    writeChoice("denied");
    clearAnalyticsCookies();
    hideBanner();
  }

  function withdrawAnalytics() {
    window["ga-disable-G-TLZNPLNGX8"] = true;
    writeChoice("denied");
    clearAnalyticsCookies();
    location.reload();
  }

  var banner = document.createElement("div");
  banner.className = "consent-banner";
  banner.id = "consent-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-labelledby", "consent-title");
  banner.setAttribute("aria-describedby", "consent-text");
  banner.hidden = true;

  var title = document.createElement("p");
  title.className = "consent-title";
  title.id = "consent-title";
  title.textContent = "Analytics cookies";

  var text = document.createElement("p");
  text.className = "consent-text";
  text.id = "consent-text";
  text.textContent = "JSON you paste stays in this browser. Google Analytics runs only if you accept. Advertising storage stays off.";

  var actions = document.createElement("div");
  actions.className = "consent-actions";

  var accept = document.createElement("button");
  accept.type = "button";
  accept.className = "consent-btn consent-accept";
  accept.id = "consent-accept";
  accept.textContent = "Accept analytics";

  var reject = document.createElement("button");
  reject.type = "button";
  reject.className = "consent-btn consent-reject";
  reject.id = "consent-reject";
  reject.textContent = "Reject analytics";

  var policy = document.createElement("a");
  policy.href = "/privacy/";
  policy.textContent = "Privacy policy";

  var warning = document.createElement("div");
  warning.id = "consent-withdraw";
  warning.hidden = true;

  var warningText = document.createElement("p");
  warningText.className = "consent-text";
  warningText.id = "consent-withdraw-text";
  warningText.textContent = "Turning analytics off reloads this page. Text still in the editor will be lost.";

  var warningActions = document.createElement("div");
  warningActions.className = "consent-actions";

  var confirmWithdraw = document.createElement("button");
  confirmWithdraw.type = "button";
  confirmWithdraw.className = "consent-btn consent-reject";
  confirmWithdraw.id = "consent-withdraw-confirm";
  confirmWithdraw.textContent = "Turn off analytics";

  var cancelWithdraw = document.createElement("button");
  cancelWithdraw.type = "button";
  cancelWithdraw.className = "consent-btn consent-accept";
  cancelWithdraw.id = "consent-withdraw-cancel";
  cancelWithdraw.textContent = "Cancel";

  actions.appendChild(accept);
  actions.appendChild(reject);
  warningActions.appendChild(confirmWithdraw);
  warningActions.appendChild(cancelWithdraw);
  warning.appendChild(warningText);
  warning.appendChild(warningActions);
  banner.appendChild(title);
  banner.appendChild(text);
  banner.appendChild(actions);
  banner.appendChild(warning);
  banner.appendChild(policy);
  document.body.appendChild(banner);

  function showWithdrawWarning() {
    actions.hidden = true;
    warning.hidden = false;
    banner.setAttribute("aria-describedby", "consent-withdraw-text");
    cancelWithdraw.focus();
  }

  function hideWithdrawWarning() {
    warning.hidden = true;
    actions.hidden = false;
    banner.setAttribute("aria-describedby", "consent-text");
  }

  function showBanner(moveFocus) {
    hideWithdrawWarning();
    banner.hidden = false;
    if (moveFocus) accept.focus();
  }

  function hideBanner() {
    banner.hidden = true;
  }

  accept.addEventListener("click", function () {
    chooseGranted();
  });

  reject.addEventListener("click", function () {
    if (window.__ga4Loaded === true) {
      showWithdrawWarning();
      return;
    }
    chooseDenied();
  });

  cancelWithdraw.addEventListener("click", function () {
    hideWithdrawWarning();
    accept.focus();
  });

  confirmWithdraw.addEventListener("click", function () {
    withdrawAnalytics();
  });

  var reopen = document.getElementById("privacy-choices");
  if (reopen) {
    reopen.addEventListener("click", function () {
      showBanner(true);
    });
  }

  if (readChoice() !== "granted" && readChoice() !== "denied") {
    showBanner(false);
  }
})();
