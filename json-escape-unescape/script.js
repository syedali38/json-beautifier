const MAX_INPUT_CHARS = 2000000;

function hasUnpairedSurrogate(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      i += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      return true;
    }
  }
  return false;
}

function tooLongMessage() {
  return "This text is longer than 2,000,000 characters. The input was not shortened.";
}

function escapeText(text) {
  if (text.length === 0) {
    return { ok: false, message: "Paste text to escape." };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, message: tooLongMessage() };
  }
  if (hasUnpairedSurrogate(text)) {
    return { ok: false, message: "This text contains an unpaired Unicode surrogate. Escape stopped so the JSON string stays valid." };
  }
  const literal = JSON.stringify(text).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return { ok: true, value: literal };
}

function unescapeText(text) {
  if (text.length === 0 || text.trim().length === 0) {
    return { ok: false, message: "Paste a JSON string to unescape. Include the surrounding double quotes." };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, message: tooLongMessage() };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (text.trim().charAt(0) !== '"') {
      return { ok: false, message: "Unescape expects one JSON string in double quotes, for example \"hello\\nworld\"." };
    }
    const details = error && error.message ? error.message : "The text is not a JSON string.";
    return { ok: false, message: "Invalid JSON string: " + details };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "Unescape accepts one JSON string. Objects, arrays, numbers, booleans, and null are not supported. The output has been cleared." };
  }
  if (hasUnpairedSurrogate(value)) {
    return { ok: false, message: "This JSON string contains an unpaired Unicode surrogate. Unescape stopped so the text is not corrupted." };
  }
  return { ok: true, value: value };
}

/* DOM */
if (typeof document !== "undefined") {
  const input = document.getElementById("text-input");
  const output = document.getElementById("text-output");
  const statusMessage = document.getElementById("status-message");
  let hasResult = false;

  function showStatus(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = "status" + (type ? " " + type : "");
  }

  function showResult(result, successText) {
    if (!result.ok) {
      output.value = "";
      hasResult = false;
      showStatus(result.message, "error");
      return;
    }
    output.value = result.value;
    hasResult = true;
    showStatus(successText, "success");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text);
      });
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (error) {
        ok = false;
      }
      document.body.removeChild(helper);
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  document.getElementById("escape-btn").addEventListener("click", function () {
    showResult(escapeText(input.value), "Text escaped as a JSON string.");
  });

  document.getElementById("unescape-btn").addEventListener("click", function () {
    showResult(unescapeText(input.value), "JSON string unescaped.");
  });

  document.getElementById("clear-btn").addEventListener("click", function () {
    input.value = "";
    output.value = "";
    hasResult = false;
    showStatus("Input and output cleared.", "success");
    input.focus();
  });

  document.getElementById("copy-btn").addEventListener("click", function () {
    if (!hasResult) {
      showStatus("Escape or unescape text before copying.", "error");
      return;
    }
    copyText(output.value).then(function () {
      showStatus("Output copied.", "success");
    }).catch(function () {
      showStatus("Could not copy the output. Select the output and copy it manually.", "error");
    });
  });
}
