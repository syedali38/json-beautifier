import { stringify } from "./vendor/yaml.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const YAML_OPTIONS = {
  schema: "core",
  compat: "yaml-1.1",
  aliasDuplicateObjects: false,
  lineWidth: 80
};

const SAMPLE = {
  name: "Ada",
  active: true,
  score: null,
  city: "東京",
  tags: ["json", "yaml"],
  address: {},
  notes: [],
  yes: "yes",
  code: "01",
  version: "1.0",
  empty: "",
  note: "a: b # c",
  message: "line1\nline2"
};

const editor = document.getElementById("json-input");
const fileInput = document.getElementById("file-input");
const statusMessage = document.getElementById("status-message");
const yamlOutput = document.getElementById("yaml-output");
const yamlEmpty = document.getElementById("yaml-empty");

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = "status" + (type ? " " + type : "");
}

function showYaml(text) {
  yamlOutput.textContent = text;
  yamlOutput.hidden = false;
  yamlEmpty.hidden = true;
}

function clearYaml() {
  yamlOutput.textContent = "";
  yamlOutput.hidden = true;
  yamlEmpty.hidden = false;
}

function resetFileInput() {
  fileInput.value = "";
}

function convertEditor() {
  const raw = editor.value;
  if (!raw.trim()) {
    clearYaml();
    showStatus("Paste JSON or open a .json file first.", "error");
    return null;
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    clearYaml();
    const details = error && error.message ? error.message : "The text is not valid JSON.";
    showStatus("Invalid JSON: " + details, "error");
    return null;
  }
  let yaml;
  try {
    yaml = stringify(value, YAML_OPTIONS);
  } catch (error) {
    clearYaml();
    showStatus("The JSON could not be converted to YAML.", "error");
    return null;
  }
  showYaml(yaml);
  showStatus("JSON converted to YAML.", "success");
  return yaml;
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
  const yaml = convertEditor();
  if (yaml == null) return;
  copyText(yaml).then(function () {
    showStatus("YAML copied.", "success");
  }).catch(function () {
    showStatus("Could not copy the YAML. Use Download YAML instead.", "error");
  });
});

document.getElementById("download-btn").addEventListener("click", function () {
  const yaml = convertEditor();
  if (yaml == null) return;
  const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "converted-data.yaml";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Downloaded converted-data.yaml.", "success");
});

document.getElementById("sample-btn").addEventListener("click", function () {
  editor.value = JSON.stringify(SAMPLE, null, 2);
  convertEditor();
  showStatus("Sample JSON loaded and converted.", "success");
});

document.getElementById("clear-btn").addEventListener("click", function () {
  editor.value = "";
  resetFileInput();
  clearYaml();
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
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      clearYaml();
      const details = error && error.message ? error.message : "The text is not valid JSON.";
      showStatus("Invalid JSON: " + details, "error");
      return;
    }
    try {
      showYaml(stringify(value, YAML_OPTIONS));
    } catch (error) {
      clearYaml();
      showStatus("The JSON could not be converted to YAML.", "error");
      return;
    }
    showStatus("JSON file converted to YAML.", "success");
  };
  reader.onerror = function () {
    showStatus("The file could not be read. Choose a .json text file and try again.", "error");
  };
  reader.readAsText(file);
});
