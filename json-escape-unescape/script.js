const MAX_INPUT_CHARS = 2000000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

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
  const exampleSelect = document.getElementById("example-select");
  const fileInput = document.getElementById("file-input");
  const fileMessage = document.getElementById("file-message");
  const EXAMPLES = {
    quotes: "Ali said \"hi\" and the path is C:\\Users\\Ali",
    multiline: "Line 1\n\tLine 2\n\t\tLine 3",
    "json-string": "\"C:\\\\Users\\\\Ali said \\\"hi\\\"\\n\\tNext\""
  };
  let hasResult = false;
  let resultKind = null;
  let fileLoadId = 0;
  const DOWNLOAD_NAMES = {
    escape: "json-escaped.txt",
    unescape: "json-unescaped.txt"
  };

  function showStatus(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = "status" + (type ? " " + type : "");
  }

  function showFileMessage(text, type) {
    const isError = type === "error";
    fileMessage.setAttribute("role", isError ? "alert" : "status");
    fileMessage.setAttribute("aria-live", isError ? "assertive" : "polite");
    fileMessage.textContent = text;
    fileMessage.className = "file-status" + (type ? " " + type : "");
  }

  function clearFileMessage() {
    fileMessage.setAttribute("role", "status");
    fileMessage.setAttribute("aria-live", "polite");
    fileMessage.textContent = "";
    fileMessage.className = "file-status";
  }

  function fileExtension(name) {
    const base = String(name || "").split(/[/\\]/).pop();
    const dot = base.lastIndexOf(".");
    if (dot < 0 || dot === base.length - 1) return "";
    return base.slice(dot + 1).toLowerCase();
  }

  function invalidateResult() {
    hasResult = false;
    resultKind = null;
  }

  function showResult(result, successText, kind) {
    if (!result.ok) {
      output.value = "";
      invalidateResult();
      showStatus(result.message, "error");
      return;
    }
    output.value = result.value;
    hasResult = true;
    resultKind = kind;
    showStatus(successText, "success");
  }

  function downloadResult() {
    const filename = DOWNLOAD_NAMES[resultKind];
    if (!hasResult || !filename) {
      showStatus("Escape or Unescape before downloading. There is no current result to download.", "error");
      return;
    }
    const blob = new Blob([output.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus("Downloaded " + filename + ".", "success");
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

  exampleSelect.addEventListener("change", function () {
    const example = EXAMPLES[exampleSelect.value];
    if (!example) return;
    input.value = example;
    invalidateResult();
  });

  input.addEventListener("input", function () {
    invalidateResult();
  });

  document.getElementById("open-file-btn").addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;

    const loadId = ++fileLoadId;
    const extension = fileExtension(file.name);
    if (extension !== "txt" && extension !== "json") {
      showFileMessage("Choose a .txt or .json file. This file was not opened, and the current text was left unchanged.", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showFileMessage("This file is larger than 5 MiB. It was not opened, and the current text was left unchanged.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      if (loadId !== fileLoadId) return;
      if (typeof reader.result !== "string") {
        showFileMessage("The file could not be read. The current text was left unchanged.", "error");
        return;
      }
      input.value = reader.result;
      invalidateResult();
      showFileMessage("Loaded " + (file.name || "file") + ". Choose Escape or Unescape when you are ready.", "success");
    };
    reader.onerror = function () {
      if (loadId !== fileLoadId) return;
      showFileMessage("The file could not be read. The current text was left unchanged.", "error");
    };
    try {
      reader.readAsText(file, "UTF-8");
    } catch (error) {
      if (loadId !== fileLoadId) return;
      showFileMessage("The file could not be read. The current text was left unchanged.", "error");
    }
  });

  document.getElementById("escape-btn").addEventListener("click", function () {
    showResult(escapeText(input.value), "Text escaped as a JSON string.", "escape");
  });

  document.getElementById("unescape-btn").addEventListener("click", function () {
    showResult(unescapeText(input.value), "JSON string unescaped.", "unescape");
  });

  document.getElementById("clear-btn").addEventListener("click", function () {
    input.value = "";
    output.value = "";
    invalidateResult();
    exampleSelect.value = "";
    clearFileMessage();
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

  document.getElementById("download-btn").addEventListener("click", downloadResult);
}
