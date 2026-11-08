const editor = document.getElementById("json-input");
const output = document.getElementById("json-output");
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

function clearOutput() {
  output.value = "";
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
    clearOutput();
    return;
  }

  output.value = JSON.stringify(parsed.value, null, 2);
  showStatus("JSON beautified successfully.", "success");
});

minifyButton.addEventListener("click", function () {
  const parsed = parseJsonFromEditor();
  if (!parsed.ok) {
    clearOutput();
    return;
  }

  output.value = JSON.stringify(parsed.value);
  showStatus("JSON minified successfully.", "success");
});

function copyUsingTextareaSelection() {
  output.focus();
  output.select();

  try {
    return document.execCommand("copy");
  } catch (error) {
    return false;
  }
}

copyButton.addEventListener("click", function () {
  const resultText = output.value;

  if (!resultText.trim()) {
    showStatus("Beautify or minify JSON first.", "error");
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(resultText)
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
  clearOutput();
  showStatus("Editor cleared.", "success");
  editor.focus();
});

editor.addEventListener("input", function () {
  if (!output.value) return;
  clearOutput();
  showStatus("", "");
});
