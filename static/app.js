const STORAGE_KEY = "gpt-image-2-conversations-v1";
const SETTINGS_KEY = "gpt-image-2-settings-v1";
const API_KEY_STORAGE_KEY = "gpt-image-2-api-key";
const ATTACHMENT_DB_NAME = "gpt-image-2-attachments";
const ATTACHMENT_DB_VERSION = 1;
const ATTACHMENT_STORE_NAME = "files";

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
const stopGenerationButton = document.querySelector("#stopGeneration");
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
    useContext: "Use chat context",
    contextHint: "Sends recent chat text and recent generated images from this conversation as reference context.",
    batchPerImage: "Batch each uploaded image",
    batchHint: "When multiple images are uploaded, generate separately for each image instead of using all images as one reference set.",
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
    stop: "Stop",
    stopping: "Stopping...",
    stopped: "Stopped",
    deleteConversation: "Delete conversation",
    deletedConversation: "Deleted conversation",
    contextText: "context chars",
    contextImages: "context image(s)",
    batchMode: "batch mode",
    deleteMessage: "Delete",
    copyMessage: "Copy",
    editMessage: "Edit",
    resendMessage: "Send again",
    saveAndSend: "Save and send",
    cancelEdit: "Cancel",
    copiedMessage: "Copied message",
    deletedMessage: "Deleted message",
    editingMessage: "Editing in message",
    missingSavedFiles: "Saved attachments are not available. Please upload them again.",
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
    useContext: "使用对话上下文",
    contextHint: "自动携带当前对话最近文本和最近生成图片作为参考，不用反复上传上一张图。",
    batchPerImage: "按每张上传图批量生成",
    batchHint: "上传多张图片时，每张产品图独立请求一次，而不是把所有图片混在同一次参考图里。",
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
    stop: "停止",
    stopping: "正在停止...",
    stopped: "已停止",
    deleteConversation: "删除会话",
    deletedConversation: "已删除会话",
    contextText: "上下文字数",
    contextImages: "上下文图片",
    batchMode: "批量模式",
    deleteMessage: "删除",
    copyMessage: "复制",
    editMessage: "修改",
    resendMessage: "重发",
    saveAndSend: "保存发送",
    cancelEdit: "取消",
    copiedMessage: "已复制消息",
    deletedMessage: "已删除消息",
    editingMessage: "正在消息框内修改",
    missingSavedFiles: "原来的附件读取不到了，请重新上传一次。",
  },
};

let conversations = loadConversations();
let activeConversationId = conversations[0]?.id || null;
if (!activeConversationId) {
  activeConversationId = createConversation(false).id;
}
let queuedImages = [];
let queuedDocuments = [];
let editingMessageId = null;
let currentAbortController = null;
let attachmentDbPromise = null;
const attachmentCache = new Map();

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

function openAttachmentDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (attachmentDbPromise) return attachmentDbPromise;

  attachmentDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);

  return attachmentDbPromise;
}

async function saveAttachmentFiles(files, kind) {
  const refs = Array.from(files).map((file) => {
    const ref = {
      id: uid(),
      kind,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };
    attachmentCache.set(ref.id, file);
    return { ref, file };
  });

  const db = await openAttachmentDb();
  if (db && refs.length) {
    await new Promise((resolve) => {
      const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(ATTACHMENT_STORE_NAME);
      refs.forEach(({ ref, file }) => store.put({ ...ref, file }));
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
  }

  return refs.map(({ ref }) => ref);
}

async function loadAttachmentFiles(refs = []) {
  const files = [];
  const missing = [];
  const db = await openAttachmentDb();

  for (const ref of refs) {
    let file = attachmentCache.get(ref.id);
    if (!file && db) {
      const record = await new Promise((resolve) => {
        const transaction = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
        const request = transaction.objectStore(ATTACHMENT_STORE_NAME).get(ref.id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
      if (record?.file) {
        file = record.file;
        attachmentCache.set(ref.id, file);
      }
    }

    if (file) {
      files.push(file);
    } else {
      missing.push(ref);
    }
  }

  return { files, missing };
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
      localStorage.setItem(API_KEY_STORAGE_KEY, field.value || "");
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
      field.value = localStorage.getItem(API_KEY_STORAGE_KEY) || sessionStorage.getItem("gpt-image-2-session-api-key") || "";
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

function trimForContext(text, limit = 700) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}...` : cleaned;
}

function buildConversationContext() {
  const conversation = activeConversation();
  if (!conversation?.messages?.length) return "";

  const lines = conversation.messages
    .filter((message) => !message.pending)
    .slice(-8)
    .map((message) => {
      const role = message.role === "user" ? "User" : "Assistant";
      const parts = [];
      const text = trimForContext(message.text);
      if (text) parts.push(text);
      if (message.attachments?.length) parts.push(`Attachments: ${message.attachments.slice(0, 6).join(", ")}`);
      if (message.images?.length) {
        parts.push(`Generated images: ${message.images.map((image) => image.filename).slice(0, 4).join(", ")}`);
      }
      return parts.length ? `${role}: ${parts.join(" | ")}` : "";
    })
    .filter(Boolean);

  return lines.join("\n");
}

function previousGeneratedImageUrls(maxCount = 4) {
  const conversation = activeConversation();
  if (!conversation?.messages?.length) return [];

  const urls = [];
  for (let index = conversation.messages.length - 1; index >= 0 && urls.length < maxCount; index -= 1) {
    const message = conversation.messages[index];
    if (message.role !== "assistant" || message.pending || !message.images?.length) continue;
    message.images.forEach((image) => {
      if (urls.length < maxCount && image.url) urls.push(image.url);
    });
  }
  return urls;
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
    const item = document.createElement("div");
    item.className = `history-entry ${conversation.id === activeConversationId ? "active" : ""}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.dataset.id = conversation.id;

    const title = document.createElement("strong");
    title.textContent = conversation.title;

    const meta = document.createElement("span");
    meta.textContent = `${conversation.messages.length} message(s)`;

    button.append(title, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "history-delete";
    remove.dataset.id = conversation.id;
    remove.title = t("deleteConversation");
    remove.setAttribute("aria-label", t("deleteConversation"));
    remove.textContent = "x";

    item.append(button, remove);
    historyList.appendChild(item);
  });
}

function renderMessage(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;
  article.dataset.messageId = message.id;
  const isEditing = message.role === "user" && editingMessageId === message.id;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = message.role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (message.text || isEditing) {
    if (isEditing) {
      const editor = document.createElement("textarea");
      editor.className = "message-edit-input";
      editor.dataset.editInput = message.id;
      editor.value = message.text || "";
      editor.rows = Math.min(14, Math.max(4, editor.value.split("\n").length + 1));
      bubble.appendChild(editor);
    } else {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.text;
      bubble.appendChild(text);
    }
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

  if (!message.pending && (message.text || isEditing)) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const actionItems =
      isEditing
        ? [
            ["save-send", t("saveAndSend")],
            ["cancel-edit", t("cancelEdit")],
            ["delete", t("deleteMessage")],
          ]
        : message.role === "user"
        ? [
            ["copy", t("copyMessage")],
            ["edit", t("editMessage")],
            ["resend", t("resendMessage")],
            ["delete", t("deleteMessage")],
          ]
        : [
            ["copy", t("copyMessage")],
            ["delete", t("deleteMessage")],
          ];

    actionItems.forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `message-action message-action-${action}`;
      button.dataset.action = action;
      button.dataset.messageId = message.id;
      button.textContent = label;
      actions.appendChild(button);
    });

    bubble.appendChild(actions);
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
  const savedMessage = { id: uid(), createdAt: nowIso(), ...message };
  conversation.messages.push(savedMessage);
  conversation.updatedAt = nowIso();
  if (conversation.messages.length === 1 && message.role === "user") {
    conversation.title = titleFromPrompt(message.text || "");
  }
  conversations = conversations.filter((item) => item.id !== conversation.id);
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  saveConversations();
  render();
  return savedMessage;
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

function findActiveMessage(messageId) {
  const conversation = activeConversation();
  if (!conversation) return { conversation: null, message: null, index: -1 };
  const index = conversation.messages.findIndex((message) => message.id === messageId);
  return {
    conversation,
    message: index >= 0 ? conversation.messages[index] : null,
    index,
  };
}

function refreshConversationTitle(conversation) {
  const firstUserMessage = conversation.messages.find((message) => message.role === "user" && message.text);
  conversation.title = firstUserMessage ? titleFromPrompt(firstUserMessage.text) : t("newGeneration");
}

function deleteMessage(messageId) {
  const { conversation, index } = findActiveMessage(messageId);
  if (!conversation || index < 0) return;
  conversation.messages.splice(index, 1);
  refreshConversationTitle(conversation);
  conversation.updatedAt = nowIso();
  saveConversations();
  render();
  setLog(t("deletedMessage"));
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function copyMessageText(messageId) {
  const { message } = findActiveMessage(messageId);
  if (!message?.text) return;
  await copyTextToClipboard(message.text);
  setLog(t("copiedMessage"));
}

function loadMessageForEdit(messageId) {
  const { message } = findActiveMessage(messageId);
  if (!message?.text) return;
  editingMessageId = messageId;
  render();
  const editor = messageList.querySelector(`[data-edit-input="${CSS.escape(messageId)}"]`);
  if (editor) {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }
  setLog(t("editingMessage"));
}

async function filesForMessage(message) {
  const imageRefs = message.fileRefs?.images || [];
  const documentRefs = message.fileRefs?.documents || [];
  const [imageResult, documentResult] = await Promise.all([
    loadAttachmentFiles(imageRefs),
    loadAttachmentFiles(documentRefs),
  ]);
  return {
    imageFiles: imageResult.files,
    documentFiles: documentResult.files,
    missing: [...imageResult.missing, ...documentResult.missing],
  };
}

function buildFormData(prompt, imageFiles, documentFiles) {
  const formData = new FormData();
  formFields().forEach((field) => {
    if (field.name === "prompt") {
      formData.append("prompt", prompt);
    } else if (field.type === "checkbox") {
      if (field.checked) formData.append(field.name, field.value || "on");
    } else {
      formData.append(field.name, field.value || "");
    }
  });
  imageFiles.forEach((file) => formData.append("images", file, file.name));
  documentFiles.forEach((file) => formData.append("documents", file, file.name));
  return formData;
}

function setGeneratingUi(isGenerating) {
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = isGenerating;
  if (stopGenerationButton) {
    stopGenerationButton.disabled = !isGenerating;
  }
}

function attachmentSummaryFor(imageNames, documentNames, contextText, contextImages, batchPerImage) {
  const summary = [
    ...imageNames.map((name) => `Image: ${name}`),
    ...documentNames.map((name) => `Document: ${name}`),
  ];
  if (contextText) summary.push(`Context: ${contextText.length} chars`);
  if (contextImages.length) summary.push(`Previous images: ${contextImages.length}`);
  if (batchPerImage) summary.push(`Batch: ${imageNames.length} image(s)`);
  return summary;
}

async function submitGeneration({ prompt, imageFiles, documentFiles, existingMessageId = null }) {
  const imageNames = imageFiles.map((file) => file.name);
  const documentNames = documentFiles.map((file) => file.name);
  const existingLookup = existingMessageId ? findActiveMessage(existingMessageId) : null;

  if (!prompt && documentNames.length === 0) {
    setStatus(t("error"), "error");
    setLog(t("enterPrompt"));
    return;
  }

  if (currentAbortController) return;
  if (existingMessageId && !existingLookup?.message) return;

  saveSettings();
  setStatus(t("generating"), "busy");
  setLog(t("requestStarted"));
  setGeneratingUi(true);

  if (existingLookup?.message) {
    existingLookup.message.text =
      prompt || (currentLanguage() === "zh" ? "根据上传文档生成图片。" : "Generate from uploaded document context.");
    existingLookup.conversation.updatedAt = nowIso();
    refreshConversationTitle(existingLookup.conversation);
    editingMessageId = null;
    saveConversations();
    render();
  }

  const formData = buildFormData(prompt, imageFiles, documentFiles);
  const useContext = formData.get("use_context") === "on";
  const batchPerImage = formData.get("batch_per_image") === "on" && imageNames.length > 1;
  const contextText = useContext ? buildConversationContext() : "";
  const contextImages = useContext && !batchPerImage ? previousGeneratedImageUrls() : [];
  if (useContext) {
    formData.append("conversation_context", contextText);
    formData.append("previous_image_urls", JSON.stringify(contextImages));
  }

  const attachmentSummary = attachmentSummaryFor(imageNames, documentNames, contextText, contextImages, batchPerImage);

  if (existingMessageId) {
    existingLookup.message.attachments = attachmentSummary;
    existingLookup.conversation.updatedAt = nowIso();
    saveConversations();
    render();
  } else {
    const [imageRefs, documentRefs] = await Promise.all([
      saveAttachmentFiles(imageFiles, "image"),
      saveAttachmentFiles(documentFiles, "document"),
    ]);
    appendMessage({
      role: "user",
      text: prompt || (currentLanguage() === "zh" ? "根据上传文档生成图片。" : "Generate from uploaded document context."),
      attachments: attachmentSummary,
      fileRefs: {
        images: imageRefs,
        documents: documentRefs,
      },
    });
    promptInput.value = "";
    resetComposerFiles();
  }

  appendMessage({
    role: "assistant",
    text: `${t("generating")}...`,
    pending: true,
  });

  currentAbortController = new AbortController();
  try {
    const startedAt = performance.now();
    const response = await fetch("/api/generate", {
      method: "POST",
      body: formData,
      signal: currentAbortController.signal,
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
        `${payload.context_chars || 0} ${t("contextText")}`,
        `${payload.context_images || 0} ${t("contextImages")}`,
        payload.batch ? t("batchMode") : "",
      ].filter(Boolean),
    });

    setLog(
      [
        `Finished in ${elapsed}s`,
        `Prompt characters: ${payload.prompt_chars}`,
        `Documents: ${payload.documents.length}`,
        `Context characters: ${payload.context_chars || 0}`,
        `Context images: ${payload.context_images || 0}`,
        `Batch mode: ${payload.batch ? "yes" : "no"}`,
        payload.batch_items?.length
          ? `Batch items: ${payload.batch_items.map((item) => `${item.source} -> ${item.images}`).join(", ")}`
          : "",
        `Images: ${payload.images.length}`,
      ].filter(Boolean).join("\n")
    );
    setStatus(t("done"), "done");
  } catch (error) {
    const wasAborted = error.name === "AbortError";
    updateLastAssistant({
      text: wasAborted ? t("stopped") : error.message,
      meta: [wasAborted ? t("stopped") : t("failed")],
    });
    setStatus(wasAborted ? t("idle") : t("error"), wasAborted ? "" : "error");
    setLog(wasAborted ? t("stopped") : error.message);
  } finally {
    currentAbortController = null;
    setGeneratingUi(false);
  }
}

async function resendMessage(messageId) {
  const { message } = findActiveMessage(messageId);
  if (!message?.text || currentAbortController) return;
  const { imageFiles, documentFiles, missing } = await filesForMessage(message);
  if (missing.length) {
    setStatus(t("error"), "error");
    setLog(t("missingSavedFiles"));
    return;
  }
  await submitGeneration({ prompt: message.text, imageFiles, documentFiles });
}

async function saveEditedMessageAndSend(messageId) {
  const { message } = findActiveMessage(messageId);
  const editor = messageList.querySelector(`[data-edit-input="${CSS.escape(messageId)}"]`);
  if (!message || !editor || currentAbortController) return;

  const { imageFiles, documentFiles, missing } = await filesForMessage(message);
  if (missing.length) {
    setStatus(t("error"), "error");
    setLog(t("missingSavedFiles"));
    return;
  }
  await submitGeneration({
    prompt: editor.value.trim(),
    imageFiles,
    documentFiles,
    existingMessageId: messageId,
  });
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

messageList.addEventListener("click", async (event) => {
  const button = event.target.closest(".message-action");
  if (!button) return;

  const { action, messageId } = button.dataset;
  if (!messageId) return;

  if (action === "delete") {
    deleteMessage(messageId);
  } else if (action === "copy") {
    try {
      await copyMessageText(messageId);
    } catch (error) {
      setLog(error.message);
    }
  } else if (action === "edit") {
    loadMessageForEdit(messageId);
  } else if (action === "resend") {
    await resendMessage(messageId);
  } else if (action === "save-send") {
    await saveEditedMessageAndSend(messageId);
  } else if (action === "cancel-edit") {
    editingMessageId = null;
    render();
  }
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
  const deleteButton = event.target.closest(".history-delete");
  if (deleteButton) {
    const deleteId = deleteButton.dataset.id;
    conversations = conversations.filter((conversation) => conversation.id !== deleteId);
    if (!conversations.length) {
      createConversation(false);
    } else if (activeConversationId === deleteId) {
      activeConversationId = conversations[0].id;
    }
    editingMessageId = null;
    saveConversations();
    render();
    setLog(t("deletedConversation"));
    return;
  }

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

if (stopGenerationButton) {
  stopGenerationButton.addEventListener("click", () => {
    if (!currentAbortController) return;
    setStatus(t("stopping"), "busy");
    setLog(t("stopping"));
    currentAbortController.abort();
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitGeneration({
    prompt: promptInput.value.trim(),
    imageFiles: Array.from(imageInput.files),
    documentFiles: Array.from(documentInput.files),
  });
});

restoreSettings();
setStatus(t("idle"));
render();
