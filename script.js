const editor = document.getElementById("json-input");
const statusMessage = document.getElementById("status-message");
const beautifyButton = document.getElementById("beautify-btn");
const minifyButton = document.getElementById("minify-btn");
const copyButton = document.getElementById("copy-btn");
const validateButton = document.getElementById("validate-btn");
const clearButton = document.getElementById("clear-btn");

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function parseJsonFromEditor() {
  const rawText = editor.value.trim();

  if (!rawText) {
    showStatus("Please paste some JSON first.", "error");
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(rawText) };
  } catch (error) {
    const details = error && error.message ? error.message : "Unknown parsing error";
    showStatus("Invalid JSON: " + details, "error");
    return { ok: false };
  }
}

beautifyButton.addEventListener("click", function () {
  const parsed = parseJsonFromEditor();
  if (!parsed.ok) {
    return;
  }

  editor.value = JSON.stringify(parsed.value, null, 2);
  showStatus("JSON beautified successfully.", "success");
});

minifyButton.addEventListener("click", function () {
  const parsed = parseJsonFromEditor();
  if (!parsed.ok) {
    return;
  }

  editor.value = JSON.stringify(parsed.value);
  showStatus("JSON minified successfully.", "success");
});

function copyUsingTextareaSelection() {
  editor.focus();
  editor.select();

  try {
    return document.execCommand("copy");
  } catch (error) {
    return false;
  }
}

copyButton.addEventListener("click", function () {
  const rawText = editor.value;

  if (!rawText.trim()) {
    showStatus("Please paste some JSON first.", "error");
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(rawText)
      .then(function () {
        showStatus("JSON copied to clipboard.", "success");
      })
      .catch(function () {
        if (copyUsingTextareaSelection()) {
          showStatus("JSON copied to clipboard.", "success");
        } else {
          showStatus(
            "Could not copy JSON. Your browser blocked clipboard access. Select the text and press Ctrl+C (or Cmd+C on Mac).",
            "error"
          );
        }
      });
    return;
  }

  if (copyUsingTextareaSelection()) {
    showStatus("JSON copied to clipboard.", "success");
  } else {
    showStatus(
      "Could not copy JSON. Your browser blocked clipboard access. Select the text and press Ctrl+C (or Cmd+C on Mac).",
      "error"
    );
  }
});

validateButton.addEventListener("click", function () {
  const rawText = editor.value.trim();

  if (!rawText) {
    showStatus("Please enter JSON to validate.", "error");
    return;
  }

  try {
    JSON.parse(rawText);
    showStatus("Valid JSON! No errors found.", "success");
  } catch (error) {
    const details = error && error.message ? error.message : "Unknown parsing error";
    showStatus("Invalid JSON: " + details, "error");
  }
});

clearButton.addEventListener("click", function () {
  editor.value = "";
  showStatus("Editor cleared.", "success");
  editor.focus();
});
