/* =========================================
   TASKMATE - JAVASCRIPT
   ========================================= */

(() => {
  "use strict";

  // ⚠️ IMPORTANT: PASTE YOUR ACTUAL VAPID PUBLIC KEY HERE ⚠️
  const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8Y';

  const $  = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const SUPABASE_URL      = "https://trtwccsqgyshmsyqrckc.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_R84cqJxjacVxNWvleDRe3g_J7IhfE4B";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const KEYS = { settings: "taskmate_settings_v1" };
  const STATUSES   = ["pending", "ongoing", "processing", "completed"];
  const CATEGORIES = ["school", "work", "personal", "others"];
  const PRIORITIES = ["high", "medium", "low"];

  const cap = value => value.charAt(0).toUpperCase() + value.slice(1);

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn("TaskMate could not save data:", error); }
  }

  let tasks = [];
  let currentUser = null;
  let reminderInterval = null;
  let calendarDate = new Date();
  let selectedDate = null;

  // =========================================
  // SUPABASE DATA HELPERS
  // =========================================
  function mapTask(row) {
    return {
      id: row.id, title: row.title, description: row.description || "",
      dueDate: row.due_date || "", dueTime: row.due_time || "",
      reminderAt: row.reminder_at || "", category: row.category || "others",
      priority: row.priority || "medium", status: row.status || "pending",
      reminderDismissed: !!row.reminder_dismissed, notifiedAt: row.notified_at || null,
      userEmail: currentUser?.email
    };
  }

  function toRow(data) {
    return {
      user_id: currentUser.id, title: data.title, description: data.description || "",
      due_date: data.dueDate || null, due_time: data.dueTime || null,
      reminder_at: data.reminderAt || null, category: data.category,
      priority: data.priority, status: data.status
    };
  }

  async function loadTasks() {
    if (!currentUser) { tasks = []; return; }
    const { data, error } = await sb.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false });
    if (error) { console.error("loadTasks:", error); return; }
    tasks = data.map(mapTask);
  }

  async function patchTask(id, patch) {
    const { error } = await sb.from("tasks").update(patch).eq("id", id);
    if (error) { console.error(error); alert(error.message); return false; }
    await loadTasks();
    return true;
  }

  async function deleteTask(id) {
    const { error } = await sb.from("tasks").delete().eq("id", id);
    if (error) { console.error(error); alert(error.message); return false; }
    await loadTasks();
    return true;
  }

  async function loadProfile(session) {
    const { data, error } = await sb.from("profiles")
      .select("first_name, last_name, birthdate, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) console.warn("profile:", error);

    currentUser = {
      id: session.user.id,
      email: session.user.email,
      firstName: data?.first_name || session.user.email.split("@")[0],
      lastName: data?.last_name || "",
      avatarUrl: data?.avatar_url || null,
      birthdate: data?.birthdate || "",
      createdAt: session.user.created_at || null
    };
  }

  // =========================================
  // FORMATTING
  // =========================================
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function setText(selector, value) { $$(selector).forEach(el => { el.textContent = value; }); }
  const pad = n => String(n).padStart(2, "0");
  function toISODate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function todayISO() { return toISODate(new Date()); }
  function toLocalInput(value) { if (!value) return ""; const date = new Date(value); if (isNaN(date)) return ""; return `${toISODate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
  function formatDate(value) { if (!value) return "No deadline"; return new Date(value + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  function formatTime(value) { if (!value) return "No time"; const [h, m] = value.split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function formatDateTime(value) { if (!value) return "No reminder set"; return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  function myTasks() { return tasks.filter(task => task.userEmail === currentUser?.email); }
  function getSettings() { return read(KEYS.settings, {}); }

  // =========================================
  // NAVIGATION
  // =========================================
  const AUTH_PAGES = ["login", "register"];
  const ALL_PAGES  = ["login", "register", "dashboard", "tasks", "calendar", "completed", "reminders", "settings", "profile"];

  function showPage(id) {
    $$(".auth-page, .system-page").forEach(section => section.classList.toggle("page-active", section.id === id));
    const footer = $("footer"); if (footer) footer.classList.toggle("page-active", !AUTH_PAGES.includes(id));
    $$(".sidebar-navigation a").forEach(link => link.classList.toggle("active", link.getAttribute("href") === "#" + id));
    window.scrollTo(0, 0);
    if (currentUser) {
      if (id === "dashboard") renderDashboard();
      if (id === "tasks")     renderTasks();
      if (id === "calendar")  renderCalendar();
      if (id === "completed") renderCompleted();
      if (id === "reminders") renderReminders();
      if (id === "settings")  updateProfile();
      if (id === "profile")   { updateProfile(); renderProfile(); }
    }
  }

  function navigate(id) { if (location.hash !== "#" + id) location.hash = id; else route(); }

  function route() {
    let id = (location.hash || "").slice(1);
    if (!ALL_PAGES.includes(id))       id = currentUser ? "dashboard" : "login";
    if (!currentUser && !AUTH_PAGES.includes(id)) id = "login";
    if (currentUser && AUTH_PAGES.includes(id))   id = "dashboard";
    if (location.hash !== "#" + id) {
      try { history.replaceState(null, "", "#" + id); }
      catch { location.hash = id; return; }
    }
    showPage(id);
  }
  window.addEventListener("hashchange", route);

  // =========================================
  // PROFILE & DASHBOARD UI
  // =========================================
  function updateProfile() {
    if (!currentUser) return;
    const first = currentUser.firstName || "Student";
    const fullName = `${first} ${currentUser.lastName || ""}`.trim();

    setText("#userName", first);
    setText("#sidebarUserName, #sidebarUserNameTasks, #sidebarUserNameCalendar, #sidebarUserNameCompleted, #sidebarUserNameReminders, #sidebarUserNameSettings, #sidebarUserNameProfile, #profileName", fullName);
    setText("#profileEmail, #profilePageEmail", currentUser.email);

    const initial = first.charAt(0).toUpperCase();
    $$("#userInitial, #topUserInitial, #profileInitial, #userInitialTasks, #userInitialCalendar, #userInitialCompleted, #userInitialReminders, #userInitialSettings, #userInitialProfile, #profilePageInitial").forEach(el => el.textContent = initial);

    const avatars = $$(".profile-circle, .user-avatar, .large-profile");
    if (currentUser.avatarUrl) {
      avatars.forEach(el => {
        el.style.backgroundImage = `url(${currentUser.avatarUrl})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        const span = el.querySelector('span');
        if (span) span.style.display = 'none';
      });
    } else {
      avatars.forEach(el => {
        el.style.backgroundImage = 'none';
        const span = el.querySelector('span');
        if (span) span.style.display = 'inline';
      });
    }

    const date = $("#currentDate");
    if (date) date.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  function renderProfile() {
    if (!currentUser) return;
    const first = currentUser.firstName || "";
    const fullName = `${first} ${currentUser.lastName || ""}`.trim() || "TaskMate User";
    setText("#profilePageName", fullName);
    setText("#profilePageEmail", currentUser.email);
    setText("#profileFirstName", first || "—");
    setText("#profileLastName", currentUser.lastName || "—");
    setText("#profileEmailFull", currentUser.email);
    setText("#profileBirthdate", currentUser.birthdate
      ? new Date(currentUser.birthdate + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : "Not set");
    setText("#profileJoined", currentUser.createdAt
      ? new Date(currentUser.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : "—");
    setText("#profileTaskCount", String(myTasks().length));
  }

  function renderStats() {
    const list = myTasks();
    const completed = list.filter(t => t.status === "completed").length;
    const ongoing   = list.filter(t => ["ongoing", "processing"].includes(t.status)).length;
    const pending   = list.filter(t => t.status === "pending").length;
    setText("#totalTasks", list.length); setText("#ongoingTasks", ongoing); setText("#pendingTasks", pending); setText("#completedTasks", completed);
    setText("#taskCount", `${list.length} task${list.length === 1 ? "" : "s"}`);
    setText("#completedCount", `${completed} completed task${completed === 1 ? "" : "s"}`);
    setText("#completedBadge", completed ? `${completed} done 🎉` : "No completed tasks yet.");
    const percentage = list.length ? Math.round(completed / list.length * 100) : 0;
    setText("#taskProgress", percentage + "%");
    setText("#progressMessage", list.length ? `${completed} of ${list.length} tasks completed. Keep going!` : "Your task progress will appear here.");
    setText("#progressInfoText", list.length ? `You have finished ${percentage}% of your tasks.` : "Your progress will be shown here once you start adding tasks.");
    const circle = $(".progress-circle"); if (circle) circle.style.setProperty("--progress", percentage + "%");
    const bar = $(".progress-bar span"); if (bar) bar.style.width = percentage + "%";
  }

  function statusDot(status) { return status === "completed" || status === "processing" ? "green" : status === "ongoing" ? "pink" : "yellow"; }

  function renderDashboard() {
    updateProfile(); renderStats();
    const list = myTasks().filter(task => task.status !== "completed");
    const todayTasks = list.filter(task => task.dueDate === todayISO());
    const activity = $(".activity-list");
    if (activity) {
      activity.innerHTML = todayTasks.length ? todayTasks.map(task => `
            <div class="activity-item">
              <span class="status-dot ${statusDot(task.status)}"></span>
              <div><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(formatTime(task.dueTime))} · ${escapeHTML(cap(task.status))}</small></div>
            </div>`).join("") : `<p class="empty-message" id="activitiesEmpty">No activities scheduled for today.</p>`;
    }
    const box = $(".left-off-box");
    if (box) {
      $$(".left-off-task", box).forEach(el => el.remove());
      const started = t => ["ongoing", "processing"].includes(t.status) ? 0 : 1;
      const leftOff = [...list].sort((a, b) => started(a) - started(b) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999")).slice(0, 3);
      box.insertAdjacentHTML("beforeend", leftOff.length ? leftOff.map(task => `
            <div class="left-off-task">
              <div class="task-character">🌸</div>
              <div class="left-off-information">
                <h3>${escapeHTML(task.title)}</h3>
                <p>${escapeHTML(task.description || "No description")}</p>
                <div class="task-meta">
                  <span>📅 ${escapeHTML(formatDate(task.dueDate))}</span>
                  <span>${escapeHTML(cap(task.status))}</span>
                  <span class="${task.priority === "high" ? "priority-high" : ""}">${escapeHTML(cap(task.priority))} priority</span>
                </div>
              </div>
              <button type="button" class="small-button" data-action="continue" data-id="${escapeHTML(task.id)}">Continue</button>
            </div>`).join("") : `<div class="left-off-task"><p class="empty-message" id="leftOffEmpty">No unfinished tasks yet.</p></div>`);
    }
  }

  // =========================================
  // TASKS
  // =========================================
  function taskRow(task) {
    const done = task.status === "completed";
    return `
      <article class="task-row">
        <button type="button" class="task-check" data-action="toggle" data-id="${escapeHTML(task.id)}" title="${done ? "Mark as pending" : "Mark as completed"}">${done ? "♥" : "♡"}</button>
        <div class="task-details">
          <h3>${escapeHTML(task.title)}</h3>
          <p>${escapeHTML(task.description || "No description")}</p>
          <div class="task-tags">
            <span class="category-tag">${escapeHTML(cap(task.category || "others"))}</span>
            <span class="priority-tag ${escapeHTML(task.priority)}">${escapeHTML(cap(task.priority || "medium"))}</span>
            ${task.reminderAt ? `<span class="category-tag">🔔 ${escapeHTML(formatDateTime(task.reminderAt))}</span>` : ""}
          </div>
        </div>
        <div class="task-date">
          <span>Due</span>
          <strong>${escapeHTML(formatDate(task.dueDate))}</strong>
          <small>${escapeHTML(formatTime(task.dueTime))}</small>
        </div>
        <button type="button" class="task-status ${escapeHTML(task.status)}" data-action="cycle" data-id="${escapeHTML(task.id)}" title="Click to change status">${escapeHTML(cap(task.status))}</button>
        <div class="task-actions">
          <button type="button" data-action="edit" data-id="${escapeHTML(task.id)}" title="Edit" aria-label="Edit task">✏️</button>
          <button type="button" class="danger" data-action="delete" data-id="${escapeHTML(task.id)}" title="Delete" aria-label="Delete task">🗑️</button>
        </div>
      </article>`;
  }

  function renderTasks() {
    const root = $("#tasks .task-list"); if (!root || !currentUser) return;
    const query = ($("#searchTask")?.value || "").trim().toLowerCase();
    const category = $("#filterCategory")?.value || ""; const priority = $("#filterPriority")?.value || ""; const status = $("#filterStatus")?.value || "";
    const list = myTasks()
      .filter(task => !query || `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(query))
      .filter(task => !category || task.category === category).filter(task => !priority || task.priority === priority).filter(task => !status || task.status === status)
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || (a.dueTime || "").localeCompare(b.dueTime || ""));
    root.innerHTML = list.length ? list.map(taskRow).join("") : `<p class="empty-message" id="taskListEmpty">${myTasks().length ? "No tasks match your search or filters." : "No tasks yet. Select Add New Task to create one."}</p>`;
    renderStats();
  }

  function renderCompleted() {
    const root = $("#completedList"); if (!root || !currentUser) return;
    const list = myTasks().filter(task => task.status === "completed");
    root.innerHTML = list.length ? list.map(task => `
          <div class="completed-task">
            <div class="completed-check">♥</div>
            <div><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(cap(task.category || "others"))} · ${task.dueDate ? "Due " : ""}${escapeHTML(formatDate(task.dueDate))}</p></div>
            <button type="button" class="complete-label undo" data-action="undo" data-id="${escapeHTML(task.id)}">↩ Undo</button>
          </div>`).join("") : `<p class="empty-message">No completed tasks yet.</p>`;
    renderStats();
  }

  // =========================================
  // ADD/EDIT TASK MODAL
  // =========================================
  function optionList(values, selected) { return values.map(v => `<option value="${v}" ${selected === v ? "selected" : ""}>${cap(v)}</option>`).join(""); }

  function openTaskForm(existingTask = null, presetDate = "") {
    if (!currentUser) return; $("#taskModal")?.remove();
    const task = existingTask || { title: "", description: "", dueDate: presetDate || todayISO(), dueTime: "", reminderAt: "", category: "school", priority: "medium", status: "pending" };
    const overlay = document.createElement("div"); overlay.id = "taskModal"; overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <form id="taskForm" class="modal-form">
        <h2>${existingTask ? "Edit Task" : "Add New Task"}</h2>
        <label for="tf-title">Task Name *</label>
        <input id="tf-title" name="title" required maxlength="120" value="${escapeHTML(task.title)}" placeholder="Enter task name">
        <label for="tf-desc">Description / Notes</label>
        <textarea id="tf-desc" name="description" rows="3" placeholder="Add details...">${escapeHTML(task.description)}</textarea>
        <div class="modal-row">
          <div><label for="tf-date">Due Date *</label><input id="tf-date" name="dueDate" type="date" required value="${escapeHTML(task.dueDate)}"></div>
          <div><label for="tf-time">Due Time</label><input id="tf-time" name="dueTime" type="time" value="${escapeHTML(task.dueTime)}"></div>
        </div>
        <label for="tf-reminder">Reminder Date and Time</label>
        <input id="tf-reminder" name="reminderAt" type="datetime-local" value="${escapeHTML(toLocalInput(task.reminderAt))}">
        <div class="modal-row">
          <div><label for="tf-category">Category</label><select id="tf-category" name="category">${optionList(CATEGORIES, task.category)}</select></div>
          <div><label for="tf-priority">Priority</label><select id="tf-priority" name="priority">${optionList(PRIORITIES, task.priority)}</select></div>
        </div>
        <label for="tf-status">Status</label>
        <select id="tf-status" name="status">${optionList(STATUSES, task.status)}</select>
        <div class="modal-actions">
          <button type="button" class="cancel" id="cancelTask">Cancel</button>
          <button type="submit" class="save">${existingTask ? "Save Changes" : "Save Task"}</button>
        </div>
      </form>`;
    document.body.appendChild(overlay); $("#tf-title", overlay).focus();
    $("#cancelTask", overlay).onclick = () => overlay.remove();
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });
    $("#taskForm", overlay).addEventListener("submit", async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      data.title = data.title.trim(); if (!data.title) { alert("Please enter a task name."); return; }
      if (data.reminderAt) {
        const reminder = new Date(data.reminderAt);
        const deadline = data.dueDate ? new Date(`${data.dueDate}T${data.dueTime || "23:59"}`) : null;
        if (deadline && reminder > deadline && !confirm("The reminder is after the deadline. Save anyway?")) return;
        data.reminderAt = reminder.toISOString();
      } else { data.reminderAt = null; }
      if (!data.dueDate) data.dueDate = null; if (!data.dueTime) data.dueTime = null;
      if (existingTask) {
        const row = toRow(data); delete row.user_id;
        row.reminder_dismissed = false; row.notified_at = null;
        const { error } = await sb.from("tasks").update(row).eq("id", existingTask.id);
        if (error) { alert(error.message); return; }
      } else {
        const { error } = await sb.from("tasks").insert(toRow(data));
        if (error) { alert(error.message); return; }
      }
      await loadTasks(); overlay.remove();
      if (data.dueDate) { selectedDate = data.dueDate; const d = new Date(data.dueDate + "T00:00:00"); calendarDate = new Date(d.getFullYear(), d.getMonth(), 1); }
      refreshAll();
    });
  }

  document.addEventListener("keydown", event => { if (event.key === "Escape") $("#taskModal")?.remove(); });
  function refreshAll() { updateProfile(); renderDashboard(); renderTasks(); renderCompleted(); renderCalendar(); renderReminders(); renderProfile(); }

  // =========================================
  // CALENDAR
  // =========================================
  function eventClass(task) { return task.status === "completed" ? "green-event" : task.priority === "high" ? "red-event" : ""; }
  function tasksByDate(list) {
    const map = {}; list.forEach(task => { if (!task.dueDate) return; (map[task.dueDate] = map[task.dueDate] || []).push(task); });
    Object.values(map).forEach(items => items.sort((x, y) => (x.dueTime || "").localeCompare(y.dueTime || ""))); return map;
  }

  function renderDayPanel(map, list) {
    const title = $("#dayPanelTitle"); const root = $("#dayTaskList"); if (!title || !root) return;
    const items = map[selectedDate] || [];
    title.textContent = new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    root.innerHTML = items.length ? items.map(taskRow).join("") : `<p class="empty-message">No tasks on this day. Select "+ Add Task" to create one.</p>`;
    const note = $("#unscheduledNote");
    if (note) { const loose = list.filter(task => !task.dueDate).length; note.hidden = !loose; note.textContent = loose ? `📌 ${loose} task${loose === 1 ? " has" : "s have"} no due date, so ${loose === 1 ? "it isn't" : "they aren't"} on the calendar.` : ""; }
  }

  function renderCalendar() {
    const grid = $(".calendar-grid"); if (!grid || !currentUser) return;
    if (!selectedDate) selectedDate = todayISO();
    const monthHeading = $("#calendarMonth"); if (monthHeading) monthHeading.textContent = calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const year = calendarDate.getFullYear(); const month = calendarDate.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list = myTasks(); const map = tasksByDate(list); const today = todayISO();
    let html = ""; for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${pad(month + 1)}-${pad(day)}`; const dayTasks = map[iso] || [];
      html += `
        <div class="calendar-day ${iso === today ? "today" : ""} ${iso === selectedDate ? "selected" : ""}" data-date="${iso}" tabindex="0" role="button" aria-label="${escapeHTML(formatDate(iso))}: ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}">
          <span>${day}</span>
          <button type="button" class="day-add" data-add-date="${iso}" title="Add a task on this day" aria-label="Add task on ${escapeHTML(formatDate(iso))}">+</button>
          ${dayTasks.length ? `<em class="day-count">${dayTasks.length}</em>` : ""}
          ${dayTasks.slice(0, 3).map(task => `<small class="${eventClass(task)}" title="${escapeHTML(task.title)}">${task.dueTime ? escapeHTML(formatTime(task.dueTime)) + " " : ""}${escapeHTML(task.title)}</small>`).join("")}
          ${dayTasks.length > 3 ? `<small>+${dayTasks.length - 3} more</small>` : ""}
        </div>`;
    }
    grid.innerHTML = html; renderDayPanel(map, list);
    const weekly = $(".weekly-grid");
    if (weekly) {
      const now = new Date(); const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      weekly.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday); date.setDate(monday.getDate() + index); const dayTasks = map[toISODate(date)] || [];
        return `<div class="day-card"><h3>${date.toLocaleDateString(undefined, { weekday: "long" })}</h3>${dayTasks.length ? dayTasks.map(task => `<div class="day-task ${task.status === "completed" ? "green" : ""}">${task.dueTime ? escapeHTML(formatTime(task.dueTime)) + " · " : ""}${escapeHTML(task.title)}</div>`).join("") : `<p class="empty-message">No tasks scheduled.</p>`}</div>`;
      }).join("");
    }
  }

  $(".calendar-grid")?.addEventListener("click", event => {
    const add = event.target.closest("[data-add-date]");
    if (add) { selectedDate = add.dataset.addDate; renderCalendar(); openTaskForm(null, selectedDate); return; }
    const cell = event.target.closest(".calendar-day[data-date]");
    if (cell) { selectedDate = cell.dataset.date; renderCalendar(); $("#dayPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  });

  $(".calendar-grid")?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const cell = event.target.closest(".calendar-day[data-date]"); if (!cell || event.target.closest("[data-add-date]")) return;
    event.preventDefault(); selectedDate = cell.dataset.date; renderCalendar(); $(`.calendar-day[data-date="${selectedDate}"]`)?.focus();
  });

  // =========================================
  // REMINDERS
  // =========================================
  function activeReminders() { return myTasks().filter(task => task.status !== "completed" && task.reminderAt).sort((a, b) => a.reminderAt.localeCompare(b.reminderAt)); }

  function renderReminders() {
    const root = $(".reminder-list"); if (!root || !currentUser) return;
    const list = activeReminders(); const now = Date.now();
    root.innerHTML = list.length ? list.map(task => {
          const due = new Date(task.reminderAt).getTime() <= now;
          return `<div class="reminder-item"><div class="reminder-clock">⏰</div><div><h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(formatDateTime(task.reminderAt))}</p></div><span class="reminder-status">${task.reminderDismissed ? "Dismissed" : due ? "Due" : "Scheduled"}</span>${task.reminderDismissed ? "" : `<button type="button" class="dismiss-small" data-action="dismiss" data-id="${escapeHTML(task.id)}">Dismiss</button>`}</div>`;
        }).join("") : `<p class="empty-message" id="reminderListEmpty">No reminders yet.</p>`;
    const next = list.find(task => !task.reminderDismissed);
    setText("#upcomingReminderTitle", next ? next.title : "No upcoming reminders yet.");
    setText("#upcomingReminderMessage", next ? (next.description || "Your task reminder is scheduled.") : "Your scheduled reminders will appear here.");
    setText("#upcomingReminderTime", next ? formatDateTime(next.reminderAt) : "—");
    const dismiss = $("#dismissReminder"); if (dismiss) { dismiss.dataset.id = next ? next.id : ""; dismiss.style.visibility = next ? "visible" : "hidden"; }
  }

  // =========================================
  // SOUNDS & ALARMS
  // =========================================
  const RINGTONE_KEY = "taskmate_ringtone_v1"; const MAX_RINGTONE_BYTES = 2 * 1024 * 1024;
  const TONES = { classic: "⏰ Classic Alarm", digital: "📟 Digital Beep", chime: "🎐 Soft Chime", melody: "🎵 Cute Melody", bell: "🔔 Bell", sunrise: "🌅 Sunrise", arcade: "🕹️ Arcade", harp: "🎼 Harp", sonar: "📡 Sonar Ping", siren: "🚨 Siren", birdsong: "🐦 Birdsong", doorbell: "🚪 Doorbell" };
  let audioCtx = null; let stopSound = null;
  function getCtx() { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; if (!audioCtx) audioCtx = new AC(); if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {}); return audioCtx; }
  document.addEventListener("click", () => getCtx(), { once: true });

  function tone(ctx, dest, freq, start, dur, type = "sine", vol = 0.4, endFreq = null) {
    const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = type;
    osc.frequency.setValueAtTime(freq, start); if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(vol, start + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain); gain.connect(dest); osc.start(start); osc.stop(start + dur + 0.05);
  }

  const PATTERNS = {
    classic(ctx, dest, t) { [0, 0.22, 0.44, 0.66].forEach(o => tone(ctx, dest, 880, t + o, 0.14, "square", 0.22)); return 1.6; },
    digital(ctx, dest, t) { [0, 0.15, 0.3].forEach(o => tone(ctx, dest, 1400, t + o, 0.09, "square", 0.2)); return 1.2; },
    chime(ctx, dest, t) { [784, 988, 1175].forEach((f, i) => tone(ctx, dest, f, t + i * 0.35, 1.1, "sine", 0.4)); return 2.6; },
    melody(ctx, dest, t) { [523, 659, 784, 659, 523, 784, 1047].forEach((f, i) => tone(ctx, dest, f, t + i * 0.28, 0.3, "triangle", 0.4)); return 2.5; },
    bell(ctx, dest, t) { tone(ctx, dest, 660, t, 1.8, "sine", 0.4); tone(ctx, dest, 1320, t, 1.2, "sine", 0.2); tone(ctx, dest, 660, t + 1.1, 1.6, "sine", 0.35); return 2.8; },
    sunrise(ctx, dest, t) { [523, 659, 784, 1047].forEach((f, i) => tone(ctx, dest, f, t + i * 0.3, 0.7, "triangle", 0.4)); tone(ctx, dest, 1319, t + 1.3, 1.2, "triangle", 0.35); return 3; },
    arcade(ctx, dest, t) { for (let i = 0; i < 8; i++) tone(ctx, dest, i % 2 ? 900 : 600, t + i * 0.1, 0.09, "square", 0.16); return 1.4; },
    harp(ctx, dest, t) { [392, 494, 587, 784, 988, 784, 587, 494].forEach((f, i) => tone(ctx, dest, f, t + i * 0.18, 1.1, "sine", 0.32)); return 2.8; },
    sonar(ctx, dest, t) { tone(ctx, dest, 1000, t, 1.3, "sine", 0.4); tone(ctx, dest, 1000, t + 0.55, 0.9, "sine", 0.12); return 2.4; },
    siren(ctx, dest, t) { tone(ctx, dest, 600, t, 0.6, "sawtooth", 0.18, 1000); tone(ctx, dest, 1000, t + 0.6, 0.6, "sawtooth", 0.18, 600); return 1.3; },
    birdsong(ctx, dest, t) { [0, 0.2].forEach(o => tone(ctx, dest, 2000, t + o, 0.13, "sine", 0.22, 3200)); [0.5, 0.65, 0.8].forEach(o => tone(ctx, dest, 2700, t + o, 0.1, "sine", 0.2, 3700)); return 2; },
    doorbell(ctx, dest, t) { tone(ctx, dest, 659, t, 1.1, "sine", 0.42); tone(ctx, dest, 523, t + 0.6, 1.5, "sine", 0.42); return 2.6; }
  };

  function getCustomRingtone() { try { return JSON.parse(localStorage.getItem(RINGTONE_KEY)); } catch { return null; } }

  function startSound() {
    stopRingtone(); const settings = getSettings(); const volume = (settings.volume ?? 70) / 100; const choice = settings.ringtone || "classic"; const custom = getCustomRingtone();
    if (choice === "custom" && custom?.data) {
      const audio = new Audio(custom.data); audio.loop = true; audio.volume = volume; audio.play().catch(() => {});
      stopSound = () => { audio.pause(); audio.removeAttribute("src"); audio.load(); }; return;
    }
    const ctx = getCtx(); if (!ctx) return; const master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    const pattern = PATTERNS[choice] || PATTERNS.classic; let timer;
    const run = () => { const length = pattern(ctx, master, ctx.currentTime + 0.05); timer = setTimeout(run, length * 1000); };
    run(); stopSound = () => { clearTimeout(timer); master.disconnect(); };
  }

  function stopRingtone() { if (stopSound) { stopSound(); stopSound = null; } const preview = $("#previewRingtone"); if (preview) preview.textContent = "▶ Preview"; }

  let alarmClockTimer = null;
  function closeAlarm() { $("#alarmOverlay")?.remove(); if (alarmClockTimer) clearInterval(alarmClockTimer); alarmClockTimer = null; stopRingtone(); }

  function showAlarm(task, isTest = false) {
    closeAlarm(); const snooze = Number(getSettings().snoozeMinutes) || 5;
    const overlay = document.createElement("div"); overlay.id = "alarmOverlay"; overlay.className = "alarm-overlay"; overlay.setAttribute("role", "alertdialog"); overlay.setAttribute("aria-live", "assertive");
    const clock = () => new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    overlay.innerHTML = `
      <div class="alarm-popup">
        <div class="alarm-ringing">⏰</div>
        <span class="alarm-badge">${isTest ? "Test Alarm" : "Reminder"}</span>
        <div class="alarm-clock" id="alarmClock">${escapeHTML(clock())}</div>
        <h2>${escapeHTML(task.title)}</h2>
        <p>${escapeHTML(task.description || "Time to take care of this task!")}</p>
        <small>Due: ${escapeHTML(formatDate(task.dueDate))}${task.dueTime ? " · " + escapeHTML(formatTime(task.dueTime)) : ""}</small>
        <div class="alarm-buttons">
          <button type="button" class="alarm-snooze" data-alarm="snooze">😴 Snooze ${snooze} min</button>
          <button type="button" class="alarm-done" data-alarm="complete">♥ Complete</button>
          <button type="button" class="alarm-stop" data-alarm="dismiss">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    alarmClockTimer = setInterval(() => { const el = $("#alarmClock"); if (el) el.textContent = clock(); }, 1000);
    overlay.addEventListener("click", async event => {
      const button = event.target.closest("[data-alarm]"); if (!button) return;
      const real = tasks.find(item => item.id === task.id);
      if (real && !isTest) {
        if (button.dataset.alarm === "snooze") await patchTask(real.id, { reminder_at: new Date(Date.now() + snooze * 60000).toISOString(), notified_at: null, reminder_dismissed: false });
        else if (button.dataset.alarm === "complete") await patchTask(real.id, { status: "completed", reminder_dismissed: true });
        else await patchTask(real.id, { reminder_dismissed: true });
      }
      closeAlarm(); if (currentUser) refreshAll(); setTimeout(checkReminders, 500);
    });
    startSound(); $(".alarm-snooze", overlay)?.focus();
  }

  async function checkReminders() {
    if (!currentUser || $("#alarmOverlay")) return; const settings = getSettings(); if (settings.taskReminders === false) return;
    const now = Date.now();
    const due = tasks.find(task => task.status !== "completed" && task.reminderAt && !task.reminderDismissed && !task.notifiedAt && new Date(task.reminderAt).getTime() <= now);
    if (!due) return;

    // If the tab is hidden, the server-side push (Edge Function) handles the alert.
    if (document.visibilityState === 'hidden') return;

    await patchTask(due.id, { notified_at: new Date().toISOString() });
    if ("Notification" in window && Notification.permission === "granted") { try { new Notification("TaskMate Reminder", { body: `${due.title} — due ${formatDate(due.dueDate)}` }); } catch { } }
    if (settings.alarmNotifications === false) alert(`TaskMate Reminder: ${due.title}\nDue: ${formatDate(due.dueDate)}`);
    else showAlarm(due);
    renderReminders();
  }

  function startReminderChecks() { if (reminderInterval) clearInterval(reminderInterval); reminderInterval = setInterval(checkReminders, 15000); setTimeout(checkReminders, 1500); }

  // =========================================
  // PUSH NOTIFICATIONS (client subscribe)
  // =========================================
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function initPushNotifications() {
    const toggle = $("#pushNotificationsToggle");
    if (!toggle) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toggle.disabled = true;
      return;
    }

    // Reflect current subscription state on load
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      toggle.checked = !!sub;
    } catch (e) { console.error(e); }

    toggle.addEventListener("change", async (e) => {
      if (e.target.checked) {
        // ---- ENABLE ----
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert("You need to allow notifications to use this feature.");
          toggle.checked = false;
          return;
        }
        try {
          const reg = await navigator.serviceWorker.ready;
          const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
          const { error } = await sb.from('push_subscriptions').upsert({
            user_id: currentUser.id,
            subscription: subscription
          }, { onConflict: 'user_id' });
          if (error) throw error;
          alert("Push notifications enabled! You'll get alerts even when TaskMate is closed.");
        } catch (err) {
          console.error('Enable push failed:', err);
          alert("Failed to enable: " + err.message);
          toggle.checked = false;
        }
      } else {
        // ---- DISABLE ----
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
          await sb.from('push_subscriptions').delete().eq('user_id', currentUser.id);
          alert("Push notifications turned off.");
        } catch (err) { console.error(err); }
      }
    });
  }

  // =========================================
  // AUTH
  // =========================================
  async function afterLogin() {
    await loadTasks();
    startReminderChecks();
    navigate("dashboard");
    setTimeout(initPushNotifications, 1000);
  }

  function initAuth() {
    const loginForm = $("#login form"); const registerForm = $("#register form");
    loginForm?.addEventListener("submit", async event => {
      event.preventDefault(); const email = $("#login-email").value.trim().toLowerCase(); const password = $("#login-password").value;
      const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) { alert(error.message); return; }
      await loadProfile(data.session); loginForm.reset(); await afterLogin();
    });
    registerForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const firstName = $("#firstname").value.trim(); const lastName = $("#lastname").value.trim(); const email = $("#register-email").value.trim().toLowerCase(); const birthdate = $("#birthdate").value; const password = $("#register-password").value; const confirmPassword = $("#confirm-password").value;
      if (!firstName || !lastName || !email || !birthdate || !password) { alert("Please fill in all fields."); return; }
      if (birthdate > todayISO()) { alert("Birthdate cannot be in the future."); return; }
      if (password.length < 6) { alert("Password must have at least 6 characters."); return; }
      if (password !== confirmPassword) { alert("Passwords do not match."); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, birthdate } } });
      if (error) { alert(error.message); return; }
      if (!data.session) { alert("Check your email to confirm your account, then sign in."); navigate("login"); return; }
      await loadProfile(data.session); registerForm.reset(); await afterLogin();
    });
    $("#login .form-options a")?.addEventListener("click", event => { event.preventDefault(); alert("Password reset is not configured yet."); });
  }

  // =========================================
  // SETTINGS & PROFILE MODAL
  // =========================================
  function initSettings() {
    let settings = getSettings();
    const darkModeCheckboxes = $$(".dark-mode-checkbox");

    function applyTheme(dark, save = true) {
      document.body.classList.toggle("dark-mode", dark);
      darkModeCheckboxes.forEach(checkbox => { checkbox.checked = !dark; });
      if (save) { settings = { ...getSettings(), darkMode: dark }; write(KEYS.settings, settings); }
    }

    applyTheme(!!settings.darkMode, false);

    darkModeCheckboxes.forEach(checkbox => {
      checkbox.addEventListener("change", (e) => { applyTheme(!e.target.checked); });
    });

    const toggles = $$(".setting-option input[type='checkbox']:not(.dark-mode-checkbox):not(#pushNotificationsToggle)");
    toggles.forEach((toggle, index) => {
      toggle.checked = index === 0 ? settings.taskReminders !== false : settings.alarmNotifications !== false;
      toggle.addEventListener("change", async () => {
        settings = getSettings();
        if (index === 0) settings.taskReminders = toggle.checked;
        else { settings.alarmNotifications = toggle.checked; if (toggle.checked && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); }
        write(KEYS.settings, settings);
      });
    });

    $("#settings .profile-settings .outline-button")?.addEventListener("click", () => { if (!currentUser) return; openProfileModal(); });
  }

  function openProfileModal() {
    $("#profileModal")?.remove();
    const overlay = document.createElement("div"); overlay.id = "profileModal"; overlay.className = "modal-overlay";

    const avatarStyle = currentUser.avatarUrl ? `background-image: url(${currentUser.avatarUrl}); background-size: cover; background-position: center; color: transparent;` : '';
    const initial = currentUser.firstName ? currentUser.firstName.charAt(0).toUpperCase() : '';

    overlay.innerHTML = `
      <form id="profileForm" class="modal-form" style="max-width: 600px;">
        <h2>Edit Profile</h2>

        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
            <div class="large-profile" id="modalAvatarPreview" style="${avatarStyle}">${initial}</div>
            <div>
                <label for="pf-avatar" class="outline-button" style="cursor: pointer; display: inline-block;">Change Picture</label>
                <input type="file" id="pf-avatar" accept="image/*" hidden>
                <p style="font-size: 11px; color: var(--text-light); margin-top: 5px;">JPG, PNG or GIF (Max 2MB)</p>
            </div>
        </div>

        <div class="modal-row">
            <div>
                <label for="pf-first">First Name</label>
                <input id="pf-first" name="firstName" required maxlength="50" value="${escapeHTML(currentUser.firstName || "")}">
            </div>
            <div>
                <label for="pf-last">Last Name</label>
                <input id="pf-last" name="lastName" maxlength="50" value="${escapeHTML(currentUser.lastName || "")}">
            </div>
        </div>

        <label for="pf-email">Email Address</label>
        <input id="pf-email" type="email" value="${escapeHTML(currentUser.email)}" disabled style="opacity: 0.6; cursor: not-allowed;">

        <hr style="border: none; border-top: 1px solid var(--border); margin: 20px 0;">

        <h3 style="font-size: 16px; margin-bottom: 10px;">Change Password</h3>
        <p style="font-size: 12px; color: var(--text-light); margin-bottom: 15px;">Leave blank if you do not want to change it.</p>

        <div class="modal-row">
            <div>
                <label for="pf-new-pass">New Password</label>
                <input id="pf-new-pass" type="password" placeholder="Min 6 characters" minlength="6">
            </div>
            <div>
                <label for="pf-confirm-pass">Confirm Password</label>
                <input id="pf-confirm-pass" type="password" placeholder="Confirm password">
            </div>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="cancel" id="cancelProfile">Cancel</button>
          <button type="submit" class="save">Save Changes</button>
        </div>
      </form>`;

    document.body.appendChild(overlay); $("#pf-first", overlay).focus();

    $("#cancelProfile", overlay).onclick = () => overlay.remove();
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) overlay.remove(); });

    let selectedFile = null;
    $("#pf-avatar", overlay).addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2MB."); return; }

        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const preview = $("#modalAvatarPreview", overlay);
            preview.style.backgroundImage = `url(${ev.target.result})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            preview.style.color = 'transparent';
            preview.textContent = '';
        };
        reader.readAsDataURL(file);
    });

    $("#profileForm", overlay).addEventListener("submit", async event => {
      event.preventDefault();
      const firstName = $("#pf-first", overlay).value.trim();
      const lastName = $("#pf-last", overlay).value.trim();
      const newPassword = $("#pf-new-pass", overlay).value;
      const confirmPassword = $("#pf-confirm-pass", overlay).value;

      if (!firstName) { alert("First name is required."); return; }
      if (newPassword && newPassword !== confirmPassword) { alert("Passwords do not match."); return; }
      if (newPassword && newPassword.length < 6) { alert("Password must be at least 6 characters."); return; }

      const submitBtn = $(".save", overlay);
      submitBtn.textContent = "Saving...";
      submitBtn.disabled = true;

      try {
          let newAvatarUrl = currentUser.avatarUrl;

          if (selectedFile) {
              const fileExt = selectedFile.name.split('.').pop();
              const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
              const { error: uploadError } = await sb.storage.from('avatars').upload(fileName, selectedFile);
              if (uploadError) throw new Error("Image Upload Failed: " + uploadError.message);

              const { data: { publicUrl } } = sb.storage.from('avatars').getPublicUrl(fileName);
              newAvatarUrl = publicUrl;
          }

          const { error: dbError } = await sb.from("profiles").update({
              first_name: firstName,
              last_name: lastName,
              avatar_url: newAvatarUrl
          }).eq("id", currentUser.id);
          if (dbError) throw new Error("Database Error: " + dbError.message);

          if (newPassword) {
              const { error: authError } = await sb.auth.updateUser({ password: newPassword });
              if (authError) throw new Error("Password Update Failed: " + authError.message);
          }

          currentUser.firstName = firstName;
          currentUser.lastName = lastName;
          currentUser.avatarUrl = newAvatarUrl;
          updateProfile();
          renderProfile();
          overlay.remove();

          if (newPassword) alert("Profile and password updated successfully!");

      } catch (err) {
          alert(err.message);
      } finally {
          submitBtn.textContent = "Save Changes";
          submitBtn.disabled = false;
      }
    });
  }

  // =========================================
  // RINGTONE SETTINGS
  // =========================================
  function initRingtone() {
    const select = $("#ringtoneSelect"); if (!select) return;
    const volume = $("#ringtoneVolume"); const volumeText = $("#volumeValue"); const info = $("#customRingtoneInfo"); const removeBtn = $("#removeRingtone"); const defaultInfo = info.textContent;
    function fillSelect() {
      const settings = getSettings(); const custom = getCustomRingtone();
      select.innerHTML = Object.entries(TONES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("") + (custom ? `<option value="custom">📁 ${escapeHTML(custom.name)}</option>` : "");
      select.value = settings.ringtone === "custom" && !custom ? "classic" : (settings.ringtone || "classic");
      info.textContent = custom ? `Your ringtone: ${custom.name}` : defaultInfo; removeBtn.hidden = !custom;
    }
    const settings = getSettings(); volume.value = settings.volume ?? 70; volumeText.textContent = volume.value + "%"; $("#snoozeMinutes").value = String(settings.snoozeMinutes || 5); fillSelect();
    select.addEventListener("change", () => { write(KEYS.settings, { ...getSettings(), ringtone: select.value }); if (stopSound) startSound(); });
    $("#snoozeMinutes").addEventListener("change", event => { write(KEYS.settings, { ...getSettings(), snoozeMinutes: Number(event.target.value) }); });
    volume.addEventListener("input", () => { volumeText.textContent = volume.value + "%"; write(KEYS.settings, { ...getSettings(), volume: Number(volume.value) }); });
    volume.addEventListener("change", () => { if (stopSound) startSound(); });
    $("#previewRingtone").addEventListener("click", event => { if (stopSound) { stopRingtone(); } else { startSound(); event.currentTarget.textContent = "■ Stop"; } });
    $("#testAlarm").addEventListener("click", () => { if ($("#alarmOverlay")) return; showAlarm({ id: "test", title: "Sample reminder", description: "This is how your alarm will look and sound.", dueDate: todayISO(), dueTime: "" }, true); });
    $("#ringtoneFile").addEventListener("change", event => {
      const file = event.target.files[0]; event.target.value = ""; if (!file) return;
      if (!file.type.startsWith("audio/")) { alert("Please choose an audio file (MP3, WAV or OGG)."); return; }
      if (file.size > MAX_RINGTONE_BYTES) { alert("That file is too large. Please choose a sound under 2 MB."); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try { localStorage.setItem(RINGTONE_KEY, JSON.stringify({ name: file.name.slice(0, 60), data: reader.result })); }
        catch { alert("Your browser couldn't store this ringtone. Try a smaller file."); return; }
        write(KEYS.settings, { ...getSettings(), ringtone: "custom" }); fillSelect(); stopRingtone(); startSound(); $("#previewRingtone").textContent = "■ Stop";
      };
      reader.onerror = () => alert("Could not read that file."); reader.readAsDataURL(file);
    });
    removeBtn.addEventListener("click", () => { try { localStorage.removeItem(RINGTONE_KEY); } catch { } stopRingtone(); write(KEYS.settings, { ...getSettings(), ringtone: "classic" }); fillSelect(); });
  }

  // =========================================
  // GLOBAL CLICK HANDLER
  // =========================================
  document.addEventListener("click", async event => {
    // Tap the profile avatar / mini-profile -> personal information page
    if (event.target.closest(".user-avatar, .mini-profile")) { event.preventDefault(); navigate("profile"); return; }
    // "Edit Profile" / "Change Password" buttons on the profile page
    if (event.target.closest("[data-edit-profile]")) { event.preventDefault(); openProfileModal(); return; }

    if (event.target.closest(".add-day-task")) { event.preventDefault(); openTaskForm(null, selectedDate || todayISO()); return; }
    if (event.target.closest(".add-task-button")) { event.preventDefault(); openTaskForm(); return; }
    if (event.target.closest("#dismissReminder")) { const id = $("#dismissReminder").dataset.id; if (id) { await patchTask(id, { reminder_dismissed: true }); renderReminders(); } return; }
    const action = event.target.closest("[data-action]");
    if (action) {
      const task = tasks.find(item => item.id === action.dataset.id); if (!task) return;
      switch (action.dataset.action) {
        case "edit": openTaskForm(task); break;
        case "delete": if (confirm(`Delete "${task.title}"?`)) { await deleteTask(task.id); refreshAll(); } break;
        case "toggle": await patchTask(task.id, { status: task.status === "completed" ? "pending" : "completed" }); refreshAll(); break;
        case "undo": await patchTask(task.id, { status: "pending" }); refreshAll(); break;
        case "cycle": { const next = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length]; await patchTask(task.id, { status: next }); refreshAll(); break; }
        case "continue": if (task.status === "pending") await patchTask(task.id, { status: "ongoing" }); refreshAll(); navigate("tasks"); break;
        case "dismiss": await patchTask(task.id, { reminder_dismissed: true }); renderReminders(); break;
      }
      return;
    }
    if (event.target.closest(".topbar-actions .icon-button:not(.dark-mode-checkbox)")) { navigate("reminders"); return; }

    // LOGOUT
    if (event.target.closest(".logout-button")) {
        event.preventDefault();
        closeAlarm();

        // Push subscriptions are preserved on logout so the user can 
        // still receive background notifications on the login screen!

        currentUser = null;
        tasks = [];
        if (reminderInterval) clearInterval(reminderInterval);
        await sb.auth.signOut();
        navigate("login");
    }
  });

  ["#searchTask", "#filterCategory", "#filterPriority", "#filterStatus"].forEach(selector => { $(selector)?.addEventListener("input", renderTasks); $(selector)?.addEventListener("change", renderTasks); });

  $$(".calendar-header button").forEach((button, index) => {
    button.addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + (index === 0 ? -1 : 1), 1); renderCalendar(); });
  });

  // =========================================
  // BOOT
  // =========================================
  (async function boot() {
    // Register the service worker once, on every page load.
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw.js');
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    }

    const { data: { session } } = await sb.auth.getSession();
    if (session) { await loadProfile(session); await loadTasks(); }
    initAuth(); initSettings(); initRingtone(); if (currentUser) { startReminderChecks(); setTimeout(initPushNotifications, 1000); }

    // Make the profile avatar + mini-profile tappable & keyboard accessible
    $$(".user-avatar, .mini-profile").forEach(el => {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", "Open my profile");
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!event.target.closest(".user-avatar, .mini-profile")) return;
      event.preventDefault();
      navigate("profile");
    });

    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { currentUser = null; tasks = []; if (reminderInterval) clearInterval(reminderInterval); navigate("login"); }
    });
    route();
  })();
})();