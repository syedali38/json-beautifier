const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE = [
  { name: "Ayesha", age: 28, city: "Karachi" },
  { name: "Bilal", age: 34, city: "Lahore", plan: "Pro" }
];

const editor = document.getElementById("json-input");
const fileInput = document.getElementById("file-input");
const statusMessage = document.getElementById("status-message");
const htmlOutput = document.getElementById("html-output");
const htmlEmpty = document.getElementById("html-empty");
const previewEmpty = document.getElementById("preview-empty");
const previewWrap = document.getElementById("preview-wrap");
const flattenInput = document.getElementById("flatten-input");
const sectionsInput = document.getElementById("sections-input");
const captionInput = document.getElementById("caption-input");
const classInput = document.getElementById("class-input");
const indentSelect = document.getElementById("indent");

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function showHtml(text, tableData) {
  htmlOutput.textContent = text;
  htmlOutput.hidden = false;
  htmlEmpty.hidden = true;
  renderPreview(tableData.headers, tableData.rows);
}

function clearHtml() {
  htmlOutput.textContent = "";
  htmlOutput.hidden = true;
  htmlEmpty.hidden = false;
  previewWrap.innerHTML = "";
  previewWrap.hidden = true;
  previewEmpty.hidden = false;
}

function resetFileInput() {
  fileInput.value = "";
}

function jsonErrorMessage(error) {
  const details = error && error.message ? error.message : "The text is not valid JSON.";
  return (
    "Invalid JSON: " +
    details +
    " Fix a missing comma, an unquoted key, or another syntax error, then convert again."
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainValue(value) {
  return value === null || typeof value !== "object";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value);
}

function formatCell(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    if (value.every(isPlainValue)) {
      return value.map(formatScalar).join("; ");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return formatScalar(value);
}

function flattenObject(obj, prefix, out) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const val = obj[key];
    const path = prefix ? prefix + "." + key : key;
    if (isPlainObject(val) && Object.keys(val).length > 0) {
      flattenObject(val, path, out);
    } else {
      out[path] = val;
    }
  }
  return out;
}

function collectTable(value, flattenOn) {
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new Error("unsupported-root");
  }
  const records = Array.isArray(value) ? value : [value];
  if (records.length === 0) {
    throw new Error("empty-array");
  }
  const rows = [];
  const headers = [];
  const seen = Object.create(null);
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!isPlainObject(record)) {
      throw new Error("array-items");
    }
    const flat = flattenOn ? flattenObject(record, "", {}) : record;
    rows.push(flat);
    const keys = Object.keys(flat);
    for (let k = 0; k < keys.length; k += 1) {
      const key = keys[k];
      if (!seen[key]) {
        seen[key] = true;
        headers.push(key);
      }
    }
  }
  return { headers: headers, rows: rows };
}

function jsonToTable(tableData, options) {
  const unit = options.indent === 4 ? "    " : "  ";
  const className = String(options.className || "").trim();
  const caption = String(options.caption || "").trim();
  const lines = [];
  lines.push(className ? '<table class="' + escapeHtml(className) + '">' : "<table>");
  if (caption) {
    lines.push(unit + "<caption>" + escapeHtml(caption) + "</caption>");
  }
  const headerRow = function (level) {
    lines.push(unit.repeat(level) + "<tr>");
    for (let i = 0; i < tableData.headers.length; i += 1) {
      lines.push(
        unit.repeat(level + 1) +
          '<th scope="col">' +
          escapeHtml(tableData.headers[i]) +
          "</th>"
      );
    }
    lines.push(unit.repeat(level) + "</tr>");
  };
  const bodyRows = function (level) {
    for (let r = 0; r < tableData.rows.length; r += 1) {
      const row = tableData.rows[r];
      lines.push(unit.repeat(level) + "<tr>");
      for (let i = 0; i < tableData.headers.length; i += 1) {
        lines.push(
          unit.repeat(level + 1) +
            "<td>" +
            escapeHtml(formatCell(row[tableData.headers[i]])) +
            "</td>"
        );
      }
      lines.push(unit.repeat(level) + "</tr>");
    }
  };
  if (options.includeSections) {
    lines.push(unit + "<thead>");
    headerRow(2);
    lines.push(unit + "</thead>");
    lines.push(unit + "<tbody>");
    bodyRows(2);
    lines.push(unit + "</tbody>");
  } else {
    headerRow(1);
    bodyRows(1);
  }
  lines.push("</table>");
  return lines.join("\n");
}

function renderPreview(headers, rows) {
  previewEmpty.hidden = true;
  previewWrap.hidden = false;
  previewWrap.innerHTML = "";
  const table = document.createElement("table");
  table.className = "preview";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (let i = 0; i < headers.length; i += 1) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = headers[i];
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (let r = 0; r < rows.length; r += 1) {
    const tr = document.createElement("tr");
    for (let i = 0; i < headers.length; i += 1) {
      const td = document.createElement("td");
      td.textContent = formatCell(rows[r][headers[i]]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  previewWrap.appendChild(table);
}

function convertErrorStatus(code) {
  if (code === "unsupported-root") {
    return "This converter needs a JSON object or an array of objects.";
  }
  if (code === "empty-array") {
    return "The array is empty. Add at least one object, then convert again.";
  }
  if (code === "array-items") {
    return "Each item in the array must be an object.";
  }
  return "The JSON could not be converted to an HTML table.";
}

function convertEditor() {
  const raw = editor.value;
  if (!raw.trim()) {
    clearHtml();
    showStatus("Paste JSON or open a .json file first.", "error");
    return null;
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    clearHtml();
    showStatus(jsonErrorMessage(error), "error");
    return null;
  }
  let tableData;
  let html;
  try {
    tableData = collectTable(value, flattenInput.checked);
    html = jsonToTable(tableData, {
      indent: Number(indentSelect.value),
      includeSections: sectionsInput.checked,
      caption: captionInput.value,
      className: classInput.value
    });
  } catch (error) {
    clearHtml();
    const code = error && error.message ? error.message : "";
    showStatus(convertErrorStatus(code), "error");
    return null;
  }
  showHtml(html, tableData);
  showStatus("JSON converted to an HTML table.", "success");
  return html;
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

document.getElementById("convert-btn").addEventListener("click", convertEditor);

document.getElementById("copy-btn").addEventListener("click", function () {
  const html = convertEditor();
  if (html == null) return;
  copyText(html).then(function () {
    showStatus("HTML copied.", "success");
  }).catch(function () {
    showStatus("Could not copy the HTML. Use Download HTML instead.", "error");
  });
});

document.getElementById("download-btn").addEventListener("click", function () {
  const html = convertEditor();
  if (html == null) return;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "table.html";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Downloaded table.html.", "success");
});

document.getElementById("sample-btn").addEventListener("click", function () {
  editor.value = JSON.stringify(SAMPLE, null, 2);
  convertEditor();
  showStatus("Sample JSON loaded and converted.", "success");
});

document.getElementById("clear-btn").addEventListener("click", function () {
  editor.value = "";
  resetFileInput();
  clearHtml();
  showStatus("Editor cleared.", "success");
  editor.focus();
});

fileInput.addEventListener("change", function () {
  const file = fileInput.files && fileInput.files[0];
  resetFileInput();
  if (!file) return;
  if (file.size === 0) {
    showStatus("This file is empty. Choose a JSON file with content.", "error");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showStatus("This file is larger than 5 MiB. Choose a JSON file of 5 MiB or smaller.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    const text = typeof reader.result === "string" ? reader.result : "";
    if (!text.trim()) {
      showStatus("This file contains only whitespace. Choose a file with JSON content.", "error");
      return;
    }
    editor.value = text;
    convertEditor();
    if (htmlOutput.hidden) return;
    showStatus("JSON file converted to an HTML table.", "success");
  };
  reader.onerror = function () {
    showStatus("The file could not be read. Choose a .json text file and try again.", "error");
  };
  reader.readAsText(file);
});
