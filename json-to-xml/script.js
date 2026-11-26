const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SAMPLE = {
  order: {
    id: 1001,
    total: 29.5,
    items: ["pen", "book"]
  }
};

const editor = document.getElementById("json-input");
const fileInput = document.getElementById("file-input");
const statusMessage = document.getElementById("status-message");
const xmlOutput = document.getElementById("xml-output");
const xmlEmpty = document.getElementById("xml-empty");
const rootNameInput = document.getElementById("root-name");
const indentSelect = document.getElementById("indent");
const declInput = document.getElementById("xml-decl");

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function showXml(text) {
  xmlOutput.textContent = text;
  xmlOutput.hidden = false;
  xmlEmpty.hidden = true;
}

function clearXml() {
  xmlOutput.textContent = "";
  xmlOutput.hidden = true;
  xmlEmpty.hidden = false;
}

function resetFileInput() {
  fileInput.value = "";
}

function sanitizeName(name) {
  let value = String(name == null ? "" : name);
  value = value.replace(/[^\w:.-]/g, "_");
  if (!value || /^[0-9.-]/.test(value)) {
    value = "_" + value;
  }
  return value;
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttr(value) {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}

function formatScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function jsonErrorMessage(error) {
  const details = error && error.message ? error.message : "The text is not valid JSON.";
  return (
    "Invalid JSON: " +
    details +
    " Fix a missing comma, an unquoted key, or another syntax error, then convert again."
  );
}

function jsonToXml(value, options) {
  const indentSize = options.indent === 4 ? 4 : 2;
  const indentUnit = " ".repeat(indentSize);
  let rootName = String(options.rootName || "").trim();
  if (!rootName) rootName = "root";
  rootName = sanitizeName(rootName);
  const lines = [];
  if (options.includeDecl) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }
  if (Array.isArray(value)) {
    lines.push("<" + rootName + ">");
    for (let i = 0; i < value.length; i += 1) {
      writeNodes(rootName, value[i], 1, lines, indentUnit);
    }
    lines.push("</" + rootName + ">");
  } else {
    writeElement(rootName, value, 0, lines, indentUnit);
  }
  return lines.join("\n");
}

function writeNodes(name, value, level, lines, indentUnit) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      writeNodes(name, value[i], level, lines, indentUnit);
    }
    return;
  }
  writeElement(name, value, level, lines, indentUnit);
}

function writeElement(name, value, level, lines, indentUnit) {
  const tag = sanitizeName(name);
  const pad = indentUnit.repeat(level);

  if (value === null) {
    lines.push(pad + "<" + tag + " />");
    return;
  }

  if (typeof value !== "object") {
    lines.push(pad + "<" + tag + ">" + escapeXmlText(formatScalar(value)) + "</" + tag + ">");
    return;
  }

  const attrs = [];
  const children = [];
  let textContent;
  let hasText = false;
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const child = value[key];
    if (key === "#text") {
      textContent = child;
      hasText = true;
    } else if (key.charAt(0) === "@") {
      attrs.push([sanitizeName(key.slice(1)), escapeXmlAttr(formatScalar(child))]);
    } else {
      children.push([key, child]);
    }
  }

  let attrStr = "";
  for (let i = 0; i < attrs.length; i += 1) {
    attrStr += " " + attrs[i][0] + '="' + attrs[i][1] + '"';
  }

  const visibleChildren = children.filter(function (entry) {
    return !(Array.isArray(entry[1]) && entry[1].length === 0);
  });

  if (visibleChildren.length === 0) {
    const inner = hasText ? escapeXmlText(formatScalar(textContent)) : "";
    if (!hasText && inner === "") {
      lines.push(pad + "<" + tag + attrStr + "></" + tag + ">");
      return;
    }
    lines.push(pad + "<" + tag + attrStr + ">" + inner + "</" + tag + ">");
    return;
  }

  lines.push(pad + "<" + tag + attrStr + ">");
  if (hasText) {
    lines.push(pad + indentUnit + escapeXmlText(formatScalar(textContent)));
  }
  for (let i = 0; i < visibleChildren.length; i += 1) {
    writeNodes(visibleChildren[i][0], visibleChildren[i][1], level + 1, lines, indentUnit);
  }
  lines.push(pad + "</" + tag + ">");
}

function convertEditor() {
  const raw = editor.value;
  if (!raw.trim()) {
    clearXml();
    showStatus("Paste JSON or open a .json file first.", "error");
    return null;
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    clearXml();
    showStatus(jsonErrorMessage(error), "error");
    return null;
  }
  let xml;
  try {
    xml = jsonToXml(value, {
      rootName: rootNameInput.value,
      indent: Number(indentSelect.value),
      includeDecl: declInput.checked
    });
  } catch (error) {
    clearXml();
    showStatus("The JSON could not be converted to XML.", "error");
    return null;
  }
  showXml(xml);
  showStatus("JSON converted to XML.", "success");
  return xml;
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
  const xml = convertEditor();
  if (xml == null) return;
  copyText(xml).then(function () {
    showStatus("XML copied.", "success");
  }).catch(function () {
    showStatus("Could not copy the XML. Use Download XML instead.", "error");
  });
});

document.getElementById("download-btn").addEventListener("click", function () {
  const xml = convertEditor();
  if (xml == null) return;
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "converted-data.xml";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Downloaded converted-data.xml.", "success");
});

document.getElementById("sample-btn").addEventListener("click", function () {
  editor.value = JSON.stringify(SAMPLE, null, 2);
  convertEditor();
  showStatus("Sample JSON loaded and converted.", "success");
});

document.getElementById("clear-btn").addEventListener("click", function () {
  editor.value = "";
  resetFileInput();
  clearXml();
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
    if (xmlOutput.hidden) return;
    showStatus("JSON file converted to XML.", "success");
  };
  reader.onerror = function () {
    showStatus("The file could not be read. Choose a .json text file and try again.", "error");
  };
  reader.readAsText(file);
});
