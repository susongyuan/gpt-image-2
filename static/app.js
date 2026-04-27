const STORAGE_KEY = "gpt-image-2-conversations-v1";
const SETTINGS_KEY = "gpt-image-2-settings-v1";
const SESSION_API_KEY = "gpt-image-2-session-api-key";

const form = document.querySelector("#generateForm");
const statusPill = document.querySelector("#statusPill");
const messageList = document.querySelector("#messageList");
const historyList = document.querySelector("#historyList");
const conversationTitle = document.querySelector("#conversationTitle");
const conversationMeta = document.querySelector("#conversationMeta");
const logOutput = document.querySelector("#logOutput");
const imageInput = document.querySelector("#images");
const documentInput = document.querySelector("#documents");
const imageList = document.querySelector("#imageList");
const documentList = document.querySelector("#documentList");
const loadExample = document.querySelector("#loadExample");
const promptInput = document.querySelector("#prompt");
const newChatButton = document.querySelector("#newChat");
const clearHistoryButton = document.querySelector("#clearHistory");
const uiLanguage = document.querySelector("#uiLanguage");
const uiFont = document.querySelector("#uiFont");
const pasteHint = document.querySelector("#pasteHint");

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const DOCUMENT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "pdf", "docx"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const translations = {
  en: {
    idle: "Idle",
    generating: "Generating",
    done: "Done",
    error: "Error",
    newChat: "New chat",
    history: "History",
    clear: "Clear",
    newGeneration: "New generation",
    chatSubtitle: "Prompt, images, and documents can be combined in one request.",
    promptPlaceholder: "Ask for the image you want to create.",
    images: "Images",
    documents: "Documents",
    example: "Example",
    generate: "Generate",
    settings: "Settings",
    language: "Language",
    font: "Font",
    baseUrl: "Base URL",
    apiKey: "API Key",
    apiKeyPlaceholder: "Use .env if empty",
    model: "Model",
    size: "Size",
    quality: "Quality",
    format: "Format",
    count: "Count",
    background: "Background",
    moderation: "Moderation",
    disableProxy: "Disable proxy",
    emptyTitle: "Start with a prompt",
    emptyText: "Upload images or documents, then generate from the composer.",
    requestStarted: "Request started...",
    generated: "Generated",
    imagesUnit: "image(s)",
    open: "Open",
    download: "Download",
    pasteHint: "Paste screenshots or files with Ctrl+V, or drag files into this area.",
    pastedFiles: "Added files",
    unsupportedFiles: "Unsupported files",
    enterPrompt: "Enter a prompt or upload at least one document.",
    failed: "Request failed",
  },
  zh: {
    idle: "空闲",
    generating: "生成中",
    done: "完成",
    error: "错误",
    newChat: "新对话",
    history: "历史记录",
    clear: "清空",
    newGeneration: "新建生图",
    chatSubtitle: "提示词、图片和文档可以在同一次请求中组合使用。",
    promptPlaceholder: "输入你想生成的图片描述。回车发送，Shift+Enter 换行。",
    images: "图片",
    documents: "文档",
    example: "示例",
    generate: "生成",
    settings: "设置",
    language: "语言",
    font: "字体",
    baseUrl: "接口地址",
    apiKey: "API Key",
    apiKeyPlaceholder: "留空则使用 .env",
    model: "模型",
    size: "尺寸",
    quality: "质量",
    format: "格式",
    count: "数量",
    background: "背景",
    moderation: "审核",
    disableProxy: "禁用代理",
    emptyTitle: "从提示词开始",
    emptyText: "可以上传图片或文档，然后在输入框中生成。",
    requestStarted: "请求已开始...",
    generated: "已生成",
    imagesUnit: "张图片",
    open: "打开",
    download: "下载",
    pasteHint: "可用 Ctrl+V 粘贴截图或文件，也可以把文件拖到这里。",
    pastedFiles: "已添加文件",
    unsupportedFiles: "不支持的文件",
    enterPrompt: "请输入提示词，或至少上传一个可读取的文档。",
    failed: "请求失败",
  },
};

let conversations = loadConversations();
let activeConversationId = conversations[0]?.id || null;
if (!activeConversationId) {
  activeConversationId = createConversation(false).id;
}
let queuedImages = [];
let queuedDocuments = [];

function currentLanguage() {
  return uiLanguage?.value || "en";
}

function t(key) {
  return translations[currentLanguage()]?.[key] || translations.en[key] || key;
}

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadConversations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function formFields() {
  return Array.from(document.querySelectorAll("[form='generateForm'], #generateForm [name]")).filter(
    (field) => field.name && field.type !== "file"
  );
}

function saveSettings() {
  const settings = {};
  formFields().forEach((field) => {
    if (field.name === "api_key") {
      sessionStorage.setItem(SESSION_API_KEY, field.value || "");
      return;
    }
    settings[field.name] = field.type === "checkbox" ? field.checked : field.value;
  });
  settings.ui_language = uiLanguage.value;
  settings.ui_font = uiFont.value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function restoreSettings() {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    settings = {};
  }

  formFields().forEach((field) => {
    if (field.name === "api_key") {
      field.value = sessionStorage.getItem(SESSION_API_KEY) || "";
      return;
    }
    if (!(field.name in settings)) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(settings[field.name]);
    } else {
      field.value = settings[field.name];
    }
  });

  uiLanguage.value = settings.ui_language || "en";
  uiFont.value = settings.ui_font || "system";
  applyFont();
  applyLanguage();
}

function createConversation(shouldRender = true) {
  const conversation = {
    id: uid(),
    title: t("newGeneration"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
  };
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  saveConversations();
  if (shouldRender) render();
  return conversation;
}

function activeConversation() {
  return conversations.find((item) => item.id === activeConversationId) || conversations[0];
}

function titleFromPrompt(prompt) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return t("newGeneration");
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function setStatus(text, state = "") {
  statusPill.textContent = text;
  statusPill.className = `status-pill ${state}`.trim();
}

function fileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function fileExtension(file) {
  const name = file.name || "";
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function classifyFile(file) {
  const extension = fileExtension(file);
  if (IMAGE_EXTENSIONS.has(extension) || IMAGE_MIME_TYPES.has(file.type)) {
    return "image";
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  return "unsupported";
}

function uniqueAppend(existing, incoming) {
  const seen = new Set(existing.map(fileKey));
  incoming.forEach((file) => {
    const key = fileKey(file);
    if (!seen.has(key)) {
      existing.push(file);
      seen.add(key);
    }
  });
}

function syncInputFiles(input, files) {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
}

function addFiles(files) {
  const images = [];
  const documents = [];
  const unsupported = [];

  Array.from(files).forEach((file) => {
    const kind = classifyFile(file);
    if (kind === "image") {
      images.push(file);
    } else if (kind === "document") {
      documents.push(file);
    } else {
      unsupported.push(file.name || "unnamed");
    }
  });

  uniqueAppend(queuedImages, images);
  uniqueAppend(queuedDocuments, documents);
  syncInputFiles(imageInput, queuedImages);
  syncInputFiles(documentInput, queuedDocuments);
  renderFileLists();

  const totalAdded = images.length + documents.length;
  if (totalAdded || unsupported.length) {
    const parts = [];
    if (totalAdded) parts.push(`${t("pastedFiles")}: ${totalAdded}`);
    if (unsupported.length) parts.push(`${t("unsupportedFiles")}: ${unsupported.join(", ")}`);
    setLog(parts.join("\n"));
  }
}

function removeQueuedFile(kind, key) {
  if (kind === "image") {
    queuedImages = queuedImages.filter((file) => fileKey(file) !== key);
    syncInputFiles(imageInput, queuedImages);
  } else {
    queuedDocuments = queuedDocuments.filter((file) => fileKey(file) !== key);
    syncInputFiles(documentInput, queuedDocuments);
  }
  renderFileLists();
}

function renderFileList(files, target, kind) {
  target.innerHTML = "";
  files.forEach((file) => {
    const item = document.createElement("span");
    item.className = "file-token";
    item.title = file.name;
    item.textContent = file.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "file-remove";
    remove.dataset.kind = kind;
    remove.dataset.key = fileKey(file);
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.textContent = "x";

    item.appendChild(remove);
    target.appendChild(item);
  });
}

function renderFileLists() {
  renderFileList(queuedImages, imageList, "image");
  renderFileList(queuedDocuments, documentList, "document");
}

function setLog(message) {
  logOutput.textContent = message;
}

function fileNames(input) {
  return Array.from(input.files).map((file) => file.name);
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage() === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  if (statusPill.textContent === translations.en.idle || statusPill.textContent === translations.zh.idle) {
    setStatus(t("idle"));
  }
  render();
}

function applyFont() {
  document.body.dataset.font = uiFont.value;
}

function renderHistory() {
  historyList.innerHTML = "";
  conversations.forEach((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-item ${conversation.id === activeConversationId ? "active" : ""}`;
    button.dataset.id = conversation.id;

    const title = document.createElement("strong");
    title.textContent = conversation.title;

    const meta = document.createElement("span");
    meta.textContent = `${conversation.messages.length} message(s)`;

    button.append(title, meta);
    historyList.appendChild(button);
  });
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (message.text) {
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.text;
    bubble.appendChild(text);
  }

  if (message.attachments?.length) {
    const attachments = document.createElement("div");
    attachments.className = "attachment-summary";
    message.attachments.forEach((name) => {
      const token = document.createElement("span");
      token.className = "token";
      token.textContent = name;
      attachments.appendChild(token);
    });
    bubble.appendChild(attachments);
  }

  if (message.images?.length) {
    const grid = document.createElement("div");
    grid.className = "image-grid";
    message.images.forEach((image) => {
      const item = document.createElement("div");
      item.className = "result-item";
      if (image.width && image.height) {
        item.style.setProperty("--image-ratio", `${image.width} / ${image.height}`);
        item.style.setProperty("--image-width", `${image.width}px`);
        item.style.setProperty("--image-height", `${image.height}px`);
      }

      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.filename;
      if (image.width && image.height) {
        img.width = image.width;
        img.height = image.height;
      }

      const actions = document.createElement("div");
      actions.className = "result-actions";

      const link = document.createElement("a");
      link.href = image.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = t("open");

      const download = document.createElement("a");
      const fallbackDownloadUrl = image.url.includes("?") ? `${image.url}&download=1` : `${image.url}?download=1`;
      download.href = image.download_url || fallbackDownloadUrl;
      download.download = image.filename;
      download.textContent = t("download");

      actions.append(link, download);

      const caption = document.createElement("div");
      caption.className = "result-caption";
      caption.textContent =
        image.width && image.height ? `${image.filename} - ${image.width}x${image.height}` : image.filename;

      item.append(img, actions, caption);
      grid.appendChild(item);
    });
    bubble.appendChild(grid);
  }

  if (message.meta?.length) {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    message.meta.forEach((entry) => {
      const token = document.createElement("span");
      token.className = "token";
      token.textContent = entry;
      meta.appendChild(token);
    });
    bubble.appendChild(meta);
  }

  article.append(avatar, bubble);
  return article;
}

function renderMessages() {
  const conversation = activeConversation();
  messageList.innerHTML = "";
  conversationTitle.textContent = conversation?.title || t("newGeneration");
  conversationMeta.textContent = conversation?.updatedAt
    ? `${currentLanguage() === "zh" ? "更新于" : "Updated"} ${new Date(conversation.updatedAt).toLocaleString()}`
    : "";

  if (!conversation || conversation.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<h3>${t("emptyTitle")}</h3><p>${t("emptyText")}</p>`;
    messageList.appendChild(empty);
    return;
  }

  conversation.messages.forEach((message) => {
    messageList.appendChild(renderMessage(message));
  });
  messageList.scrollTop = messageList.scrollHeight;
}

function render() {
  renderHistory();
  renderMessages();
}

function appendMessage(message) {
  const conversation = activeConversation();
  conversation.messages.push({ id: uid(), createdAt: nowIso(), ...message });
  conversation.updatedAt = nowIso();
  if (conversation.messages.length === 1 && message.role === "user") {
    conversation.title = titleFromPrompt(message.text || "");
  }
  conversations = conversations.filter((item) => item.id !== conversation.id);
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  saveConversations();
  render();
}

function updateLastAssistant(message) {
  const conversation = activeConversation();
  let index = -1;
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    const item = conversation.messages[i];
    if (item.role === "assistant" && item.pending) {
      index = i;
      break;
    }
  }
  if (index >= 0) {
    conversation.messages[index] = {
      ...conversation.messages[index],
      ...message,
      pending: false,
      createdAt: nowIso(),
    };
  } else {
    conversation.messages.push({ id: uid(), role: "assistant", createdAt: nowIso(), ...message });
  }
  conversation.updatedAt = nowIso();
  saveConversations();
  render();
}

function resetComposerFiles() {
  queuedImages = [];
  queuedDocuments = [];
  syncInputFiles(imageInput, queuedImages);
  syncInputFiles(documentInput, queuedDocuments);
  renderFileLists();
}

imageInput.addEventListener("change", () => addFiles(imageInput.files));
documentInput.addEventListener("change", () => addFiles(documentInput.files));

imageList.addEventListener("click", (event) => {
  const button = event.target.closest(".file-remove");
  if (!button) return;
  removeQueuedFile(button.dataset.kind, button.dataset.key);
});

documentList.addEventListener("click", (event) => {
  const button = event.target.closest(".file-remove");
  if (!button) return;
  removeQueuedFile(button.dataset.kind, button.dataset.key);
});

document.addEventListener("paste", (event) => {
  const files = event.clipboardData?.files || [];
  if (!files.length) return;
  event.preventDefault();
  addFiles(files);
});

form.addEventListener("dragover", (event) => {
  event.preventDefault();
  form.classList.add("is-dragging");
});

form.addEventListener("dragleave", (event) => {
  if (!form.contains(event.relatedTarget)) {
    form.classList.remove("is-dragging");
  }
});

form.addEventListener("drop", (event) => {
  event.preventDefault();
  form.classList.remove("is-dragging");
  addFiles(event.dataTransfer?.files || []);
});

formFields().forEach((field) => {
  field.addEventListener("input", saveSettings);
  field.addEventListener("change", saveSettings);
});
uiLanguage.addEventListener("change", () => {
  saveSettings();
  applyLanguage();
});
uiFont.addEventListener("change", () => {
  saveSettings();
  applyFont();
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

historyList.addEventListener("click", (event) => {
  const button = event.target.closest(".history-item");
  if (!button) return;
  activeConversationId = button.dataset.id;
  render();
});

newChatButton.addEventListener("click", () => {
  promptInput.value = "";
  resetComposerFiles();
  createConversation();
});

clearHistoryButton.addEventListener("click", () => {
  conversations = [];
  localStorage.removeItem(STORAGE_KEY);
  createConversation();
  setLog("");
  setStatus(t("idle"));
});

loadExample.addEventListener("click", () => {
  promptInput.value =
    currentLanguage() === "zh"
      ? "为上传的产品生成一张清晰的电商宣传图。结合文档中的卖点，画面简洁、真实、有转化力。"
      : "Create a clean product advertisement image for the uploaded product. Use the document as campaign context. Keep the composition practical, high-converting, and suitable for an ecommerce listing.";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveSettings();

  const prompt = promptInput.value.trim();
  const imageNames = fileNames(imageInput);
  const documentNames = fileNames(documentInput);

  if (!prompt && documentNames.length === 0) {
    setStatus(t("error"), "error");
    setLog(t("enterPrompt"));
    return;
  }

  setStatus(t("generating"), "busy");
  setLog(t("requestStarted"));

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  const formData = new FormData(form);

  appendMessage({
    role: "user",
    text: prompt || (currentLanguage() === "zh" ? "根据上传文档生成图片。" : "Generate from uploaded document context."),
    attachments: [...imageNames.map((name) => `Image: ${name}`), ...documentNames.map((name) => `Document: ${name}`)],
  });
  appendMessage({
    role: "assistant",
    text: `${t("generating")}...`,
    pending: true,
  });
  promptInput.value = "";
  resetComposerFiles();

  try {
    const startedAt = performance.now();
    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    updateLastAssistant({
      text: `${t("generated")} ${payload.images.length} ${t("imagesUnit")}.`,
      images: payload.images,
      meta: [
        `${elapsed}s`,
        `${payload.prompt_chars} prompt chars`,
        `${payload.documents.length} document(s)`,
      ],
    });

    setLog(
      [
        `Finished in ${elapsed}s`,
        `Prompt characters: ${payload.prompt_chars}`,
        `Documents: ${payload.documents.length}`,
        `Images: ${payload.images.length}`,
      ].join("\n")
    );
    setStatus(t("done"), "done");
    promptInput.value = "";
    resetComposerFiles();
  } catch (error) {
    updateLastAssistant({
      text: error.message,
      meta: [t("failed")],
    });
    setStatus(t("error"), "error");
    setLog(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

restoreSettings();
setStatus(t("idle"));
render();
