/* ============================================
   Flowdo — Beautiful Task Manager
   Application Logic
   ============================================ */

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────
  let tasks = JSON.parse(localStorage.getItem("flowdo-tasks") || "[]");
  let currentFilter = "all";
  let currentCategory = null;
  let currentSort = "newest";
  let searchQuery = "";
  let editingTaskId = null;

  // ── DOM References ─────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const addTaskInput = $("#add-task-input");
  const addTaskOptions = $("#add-task-options");
  const addTaskSubmit = $("#add-task-submit");
  const tasksList = $("#tasks-list");
  const emptyState = $("#empty-state");
  const tasksCount = $("#tasks-count");
  const searchInput = $("#search-input");
  const modalOverlay = $("#modal-overlay");
  const modalClose = $("#modal-close");
  const modalTitle = $("#modal-task-title");
  const modalNotes = $("#modal-task-notes");
  const modalDate = $("#modal-date");
  const modalCategory = $("#modal-category");
  const modalImportant = $("#modal-important");
  const modalSave = $("#modal-save");
  const modalDelete = $("#modal-delete");
  const themeToggle = $("#theme-toggle");
  const greetingEl = $("#greeting");
  const pageTitleEl = $("#page-title");
  const progressValue = $("#progress-value");
  const progressFill = $("#progress-fill");
  const progressDetail = $("#progress-detail");
  const optionDate = $("#option-date");
  const taskDateInput = $("#task-date-input");
  const optionCategory = $("#option-category");
  const optionImportant = $("#option-important");
  const mobileMenuBtn = $("#mobile-menu-btn");
  const sidebar = $("#sidebar");

  // ── Helpers ─────────────────────────────────────────
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function saveTasks() {
    localStorage.setItem("flowdo-tasks", JSON.stringify(tasks));
  }

  function getTodayString() {
    return new Date().toISOString().split("T")[0];
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
    if (d.getTime() === yesterday.getTime()) return "Yesterday";

    const options = { month: "short", day: "numeric" };
    if (d.getFullYear() !== today.getFullYear()) options.year = "numeric";
    return d.toLocaleDateString("en-US", options);
  }

  function isOverdue(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  // ── Filtering & Sorting ────────────────────────────
  function getFilteredTasks() {
    let filtered = [...tasks];

    // Apply nav filter
    switch (currentFilter) {
      case "today":
        filtered = filtered.filter((t) => t.dueDate === getTodayString());
        break;
      case "important":
        filtered = filtered.filter((t) => t.important);
        break;
      case "completed":
        filtered = filtered.filter((t) => t.completed);
        break;
    }

    // Apply category filter
    if (currentCategory) {
      filtered = filtered.filter((t) => t.category === currentCategory);
    }

    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q)),
      );
    }

    // Sort
    switch (currentSort) {
      case "newest":
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        filtered.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "priority":
        filtered.sort((a, b) => {
          if (a.important !== b.important) return b.important ? 1 : -1;
          return b.createdAt - a.createdAt;
        });
        break;
    }

    // Always show incomplete tasks before completed
    if (currentFilter !== "completed") {
      filtered.sort((a, b) =>
        a.completed === b.completed ? 0 : a.completed ? 1 : -1,
      );
    }

    return filtered;
  }

  // ── Rendering ──────────────────────────────────────
  function renderTasks() {
    const filtered = getFilteredTasks();
    tasksList.innerHTML = "";

    if (filtered.length === 0) {
      emptyState.style.display = "flex";
      tasksList.style.display = "none";
    } else {
      emptyState.style.display = "none";
      tasksList.style.display = "flex";

      filtered.forEach((task, i) => {
        const el = createTaskElement(task);
        el.style.animationDelay = `${i * 0.04}s`;
        tasksList.appendChild(el);
      });
    }

    tasksCount.textContent = `${filtered.length} task${filtered.length !== 1 ? "s" : ""}`;
    updateProgress();
    updateBadges();
  }

  function createTaskElement(task) {
    const div = document.createElement("div");
    div.className = `task-item${task.completed ? " completed" : ""}${task.important ? " important" : ""}`;
    div.dataset.id = task.id;

    const dueDateHTML = task.dueDate
      ? `<span class="task-meta-item ${isOverdue(task.dueDate) && !task.completed ? "overdue" : ""}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                ${formatDate(task.dueDate)}
               </span>`
      : "";

    const categoryHTML = task.category
      ? `<span class="task-category-badge ${task.category}">${task.category}</span>`
      : "";

    div.innerHTML = `
            <button class="task-checkbox ${task.completed ? "checked" : ""}" data-action="toggle" aria-label="Toggle completion">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </button>
            <div class="task-body" data-action="edit">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    ${dueDateHTML}
                    ${categoryHTML}
                </div>
            </div>
            <div class="task-actions">
                <button class="task-star ${task.important ? "active" : ""}" data-action="star" aria-label="Toggle important">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </button>
                <button class="task-delete" data-action="delete" aria-label="Delete task">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;

    return div;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Badges & Progress ──────────────────────────────
  function updateBadges() {
    const all = tasks.length;
    const today = tasks.filter((t) => t.dueDate === getTodayString()).length;
    const important = tasks.filter((t) => t.important).length;
    const completed = tasks.filter((t) => t.completed).length;

    $("#badge-all").textContent = all;
    $("#badge-today").textContent = today;
    $("#badge-important").textContent = important;
    $("#badge-completed").textContent = completed;
  }

  function updateProgress() {
    const todayTasks = tasks.filter((t) => t.dueDate === getTodayString());
    const total = todayTasks.length;
    const done = todayTasks.filter((t) => t.completed).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    progressValue.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
    progressDetail.textContent = `${done} of ${total} tasks done`;
  }

  // ── Task CRUD ──────────────────────────────────────
  function addTask(title) {
    if (!title.trim()) return;

    const task = {
      id: generateId(),
      title: title.trim(),
      notes: "",
      dueDate: taskDateInput.value || getTodayString(),
      category: optionCategory.value || "",
      important: optionImportant.classList.contains("active"),
      completed: false,
      createdAt: Date.now(),
    };

    tasks.unshift(task);
    saveTasks();
    renderTasks();

    // Reset inputs
    addTaskInput.value = "";
    taskDateInput.value = "";
    optionCategory.value = "";
    optionImportant.classList.remove("active");
    updateDateLabel();
  }

  function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      saveTasks();
      renderTasks();
    }
  }

  function deleteTask(id) {
    const el = tasksList.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add("removing");
      setTimeout(() => {
        tasks = tasks.filter((t) => t.id !== id);
        saveTasks();
        renderTasks();
      }, 400);
    }
  }

  function toggleImportant(id) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.important = !task.important;
      saveTasks();
      renderTasks();
    }
  }

  // ── Modal ──────────────────────────────────────────
  function openModal(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    editingTaskId = id;
    modalTitle.value = task.title;
    modalNotes.value = task.notes || "";
    modalDate.value = task.dueDate || "";
    modalCategory.value = task.category || "";

    if (task.important) {
      modalImportant.classList.add("active");
    } else {
      modalImportant.classList.remove("active");
    }

    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
    setTimeout(() => modalTitle.focus(), 300);
  }

  function closeModal() {
    modalOverlay.classList.remove("active");
    document.body.style.overflow = "";
    editingTaskId = null;
  }

  function saveModal() {
    if (!editingTaskId) return;
    const task = tasks.find((t) => t.id === editingTaskId);
    if (!task) return;

    const title = modalTitle.value.trim();
    if (!title) {
      modalTitle.focus();
      return;
    }

    task.title = title;
    task.notes = modalNotes.value.trim();
    task.dueDate = modalDate.value;
    task.category = modalCategory.value;
    task.important = modalImportant.classList.contains("active");

    saveTasks();
    renderTasks();
    closeModal();
  }

  function deleteFromModal() {
    if (!editingTaskId) return;
    closeModal();
    setTimeout(() => deleteTask(editingTaskId), 200);
  }

  // ── Theme ──────────────────────────────────────────
  function initTheme() {
    const savedTheme = localStorage.getItem("flowdo-theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("flowdo-theme", next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const sunIcon = themeToggle.querySelector(".sun-icon");
    const moonIcon = themeToggle.querySelector(".moon-icon");
    if (theme === "dark") {
      sunIcon.style.display = "block";
      moonIcon.style.display = "none";
    } else {
      sunIcon.style.display = "none";
      moonIcon.style.display = "block";
    }
  }

  // ── Date Label ─────────────────────────────────────
  function updateDateLabel() {
    const dateSpan = optionDate.querySelector("span");
    const val = taskDateInput.value;
    dateSpan.textContent = val ? formatDate(val) : "Today";
  }

  // ── Navigation ─────────────────────────────────────
  function setActiveNav(filter) {
    currentFilter = filter;
    currentCategory = null;

    $$(".nav-item").forEach((btn) => btn.classList.remove("active"));
    const target = $(`.nav-item[data-filter="${filter}"]`);
    if (target) target.classList.add("active");

    $$(".category-item").forEach((btn) => btn.classList.remove("active"));

    const titles = {
      all: "All Tasks",
      today: "Today",
      important: "Important",
      completed: "Completed",
    };
    pageTitleEl.textContent = titles[filter] || "All Tasks";

    renderTasks();
  }

  function setActiveCategory(category) {
    currentCategory = category;
    currentFilter = "all";

    $$(".nav-item").forEach((btn) => btn.classList.remove("active"));
    $$(".category-item").forEach((btn) => btn.classList.remove("active"));

    const target = $(`.category-item[data-category="${category}"]`);
    if (target) target.classList.add("active");

    pageTitleEl.textContent =
      category.charAt(0).toUpperCase() + category.slice(1);
    renderTasks();
  }

  // ── Event Listeners ────────────────────────────────

  // Add task focus / blur to show options
  addTaskInput.addEventListener("focus", () => {
    addTaskOptions.classList.add("visible");
  });

  // Submit task
  addTaskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTask(addTaskInput.value);
    }
    if (e.key === "Escape") {
      addTaskInput.blur();
      addTaskOptions.classList.remove("visible");
    }
  });

  addTaskSubmit.addEventListener("click", () => {
    addTask(addTaskInput.value);
  });

  // Date option
  taskDateInput.addEventListener("change", updateDateLabel);

  // Important option
  optionImportant.addEventListener("click", () => {
    optionImportant.classList.toggle("active");
  });

  // Click outside add-task to close options
  document.addEventListener("click", (e) => {
    const card = $("#add-task-card");
    if (!card.contains(e.target)) {
      addTaskOptions.classList.remove("visible");
    }
  });

  // Task list interactions (delegation)
  tasksList.addEventListener("click", (e) => {
    const taskItem = e.target.closest(".task-item");
    if (!taskItem) return;
    const id = taskItem.dataset.id;

    const action = e.target.closest("[data-action]");
    if (!action) return;

    switch (action.dataset.action) {
      case "toggle":
        toggleTask(id);
        break;
      case "edit":
        openModal(id);
        break;
      case "star":
        toggleImportant(id);
        break;
      case "delete":
        deleteTask(id);
        break;
    }
  });

  // Navigation
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveNav(btn.dataset.filter);
      closeMobileMenu();
    });
  });

  // Categories
  $$(".category-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveCategory(btn.dataset.category);
      closeMobileMenu();
    });
  });

  // Sort
  $$(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentSort = btn.dataset.sort;
      renderTasks();
    });
  });

  // Search
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderTasks();
  });

  // Modal
  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  modalSave.addEventListener("click", saveModal);
  modalDelete.addEventListener("click", deleteFromModal);
  modalImportant.addEventListener("click", () => {
    modalImportant.classList.toggle("active");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("active")) {
      closeModal();
    }
  });

  // Theme
  themeToggle.addEventListener("click", toggleTheme);

  // Mobile menu
  function closeMobileMenu() {
    sidebar.classList.remove("open");
  }

  mobileMenuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
      if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        closeMobileMenu();
      }
    }
  });

  // ── Notifications ─────────────────────────────────────
  const notifToggleBtn = $("#notif-toggle");
  const notifPanel = $("#notif-panel");
  const notifDot = $("#notif-dot");
  const notifEnabled = $("#notif-enabled");
  const notifTimeInput = $("#notif-time");
  const notifStatus = $("#notif-status");

  let notifSettings = JSON.parse(localStorage.getItem("flowdo-notif") || "{}");

  function saveNotifSettings() {
    localStorage.setItem("flowdo-notif", JSON.stringify(notifSettings));
  }

  function getNotifSettings() {
    return {
      enabled: notifSettings.enabled || false,
      time: notifSettings.time || "21:00",
      lastNotifDate: notifSettings.lastNotifDate || "",
    };
  }

  function initNotifications() {
    const settings = getNotifSettings();
    notifEnabled.checked = settings.enabled;
    notifTimeInput.value = settings.time;
    updateNotifUI();

    if (settings.enabled) {
      startNotifScheduler();
    }
  }

  function updateNotifUI() {
    const settings = getNotifSettings();
    const statusEl = notifStatus;
    const statusText = statusEl.querySelector("span");

    if (settings.enabled) {
      notifDot.classList.add("visible");
      notifToggleBtn.classList.add("active");
      statusEl.classList.add("enabled");
      statusText.textContent = `Reminder set for ${formatTime12h(settings.time)} every night`;
    } else {
      notifDot.classList.remove("visible");
      notifToggleBtn.classList.remove("active");
      statusEl.classList.remove("enabled");
      statusText.textContent = "Enable notifications to get nightly reminders";
    }
  }

  function formatTime12h(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
  }

  async function requestNotifPermission() {
    if (!("Notification" in window)) {
      showNotifToast(
        "Notifications not supported",
        "Your browser doesn't support notifications.",
      );
      return false;
    }

    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      showNotifToast(
        "Notifications blocked",
        "Please allow notifications in your browser settings.",
      );
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  let notifInterval = null;

  function startNotifScheduler() {
    if (notifInterval) clearInterval(notifInterval);

    notifInterval = setInterval(() => {
      checkAndNotify();
    }, 30000); // Check every 30 seconds

    // Also check immediately
    checkAndNotify();
  }

  function stopNotifScheduler() {
    if (notifInterval) {
      clearInterval(notifInterval);
      notifInterval = null;
    }
  }

  function checkAndNotify() {
    const settings = getNotifSettings();
    if (!settings.enabled) return;

    const now = new Date();
    const todayStr = getTodayString();

    // Already notified today
    if (settings.lastNotifDate === todayStr) return;

    const [targetH, targetM] = settings.time.split(":").map(Number);
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    if (currentH === targetH && currentM >= targetM) {
      sendNightlyNotification();
      notifSettings.lastNotifDate = todayStr;
      saveNotifSettings();
    }
  }

  function sendNightlyNotification() {
    const pendingTasks = tasks.filter((t) => !t.completed);
    const todayTasks = tasks.filter(
      (t) => t.dueDate === getTodayString() && !t.completed,
    );
    const importantTasks = tasks.filter((t) => t.important && !t.completed);

    let body = "";
    if (pendingTasks.length === 0) {
      body = "🎉 All tasks completed! Great job today!";
    } else {
      const parts = [];
      if (todayTasks.length > 0) parts.push(`${todayTasks.length} due today`);
      if (importantTasks.length > 0)
        parts.push(`${importantTasks.length} important`);
      parts.push(`${pendingTasks.length} total pending`);
      body = `📋 ${parts.join(" • ")}`;

      if (pendingTasks.length <= 3) {
        body += "\n" + pendingTasks.map((t) => `• ${t.title}`).join("\n");
      }
    }

    // Send notification via Service Worker (works on iOS PWA)
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title: "Flowdo — Nightly Reminder",
        body: body,
      });
    } else if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      // Fallback: direct browser notification
      const notification = new Notification("Flowdo — Nightly Reminder", {
        body: body,
        icon: "./icon-192.png",
        tag: "flowdo-nightly",
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => notification.close(), 10000);
    }

    // In-app toast
    const msg =
      pendingTasks.length === 0
        ? "All tasks completed! Enjoy your evening 🌙"
        : `You have ${pendingTasks.length} pending task${pendingTasks.length !== 1 ? "s" : ""}`;
    showNotifToast("Nightly Reminder", msg);
  }

  function showNotifToast(title, message) {
    // Remove existing toast
    const existing = document.querySelector(".notif-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "notif-toast";
    toast.innerHTML = `
            <div class="notif-toast-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            </div>
            <div class="notif-toast-content">
                <div class="notif-toast-title">${title}</div>
                <div class="notif-toast-msg">${message}</div>
            </div>
            <button class="notif-toast-close" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("show"));
    });

    // Close button
    toast.querySelector(".notif-toast-close").addEventListener("click", () => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    });

    // Auto dismiss
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
      }
    }, 8000);
  }

  // Notification panel toggle
  const notifBackdrop = $("#notif-backdrop");

  function isNotifPanelOpen() {
    return notifPanel.classList.contains("open");
  }

  function openNotifPanel() {
    if (notifBackdrop) notifBackdrop.classList.add("visible");
    notifPanel.classList.add("open");
  }

  function closeNotifPanel() {
    if (!isNotifPanelOpen()) return;
    notifPanel.classList.remove("open");
    if (notifBackdrop) notifBackdrop.classList.remove("visible");
  }

  notifToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isNotifPanelOpen()) {
      closeNotifPanel();
    } else {
      openNotifPanel();
    }
  });

  // Close notif panel on backdrop tap
  if (notifBackdrop) {
    notifBackdrop.addEventListener("click", (e) => {
      e.stopPropagation();
      closeNotifPanel();
    });
  }

  // Prevent clicks inside the panel from closing it
  notifPanel.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("click", (e) => {
    if (isNotifPanelOpen() && !notifToggleBtn.contains(e.target)) {
      closeNotifPanel();
    }
  });

  // Enable/disable notifications
  notifEnabled.addEventListener("change", async () => {
    if (notifEnabled.checked) {
      const granted = await requestNotifPermission();
      if (!granted) {
        notifEnabled.checked = false;
        return;
      }
      notifSettings.enabled = true;
      saveNotifSettings();
      startNotifScheduler();
      showNotifToast(
        "Notifications enabled",
        `You'll get reminders at ${formatTime12h(getNotifSettings().time)}`,
      );
    } else {
      notifSettings.enabled = false;
      saveNotifSettings();
      stopNotifScheduler();
    }
    updateNotifUI();
  });

  // Change notification time
  notifTimeInput.addEventListener("change", () => {
    notifSettings.time = notifTimeInput.value;
    notifSettings.lastNotifDate = ""; // Reset so it can fire today at new time
    saveNotifSettings();
    updateNotifUI();

    if (notifSettings.enabled) {
      showNotifToast(
        "Reminder updated",
        `Notifications set for ${formatTime12h(notifTimeInput.value)}`,
      );
    }
  });

  // ── Service Worker ─────────────────────────────────
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./sw.js", { scope: "./" })
        .then((registration) => {
          console.log("Flowdo SW registered:", registration.scope);

          // Listen for messages from SW
          navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data && event.data.type === "CHECK_NOTIFICATION") {
              checkAndNotify();
            }
          });

          // Try to register periodic sync for background notifications
          if ("periodicSync" in registration) {
            registration.periodicSync
              .register("flowdo-nightly-check", {
                minInterval: 60 * 60 * 1000, // 1 hour
              })
              .catch(() => {
                // Periodic sync not available — fallback to setInterval
              });
          }
        })
        .catch((err) => {
          console.log("Flowdo SW registration failed:", err);
        });
    }
  }

  // ── iOS Standalone Detection ──────────────────────
  function isIOSStandalone() {
    return "standalone" in navigator && navigator.standalone;
  }

  function isiOS() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  // ── Init ───────────────────────────────────────────
  function init() {
    initTheme();
    greetingEl.textContent = getGreeting();
    updateDateLabel();
    renderTasks();
    initNotifications();
    registerServiceWorker();

    // iOS safe area padding
    if (isiOS()) {
      document.documentElement.classList.add("ios");
    }
    if (isIOSStandalone()) {
      document.documentElement.classList.add("ios-standalone");
    }

    // Keyboard shortcut: Ctrl/Cmd + K → focus search
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInput.focus();
      }
    });

    // Close notification panel on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && notifPanel.classList.contains("open")) {
        closeNotifPanel();
      }
    });
  }

  init();
})();
