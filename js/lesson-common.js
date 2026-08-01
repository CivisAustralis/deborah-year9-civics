/* ==========================================================
DEBORAH CIVICS COURSE
COMMON LESSON ENGINE  v2.0
========================================================== */

let lessonConfig      = {};
let lessonProgress    = 0;
let completedActivities = new Set();
let lessonStart       = Date.now();
let tabSwitches       = 0;
let hiddenStart       = null;

/* ==========================================================
   SETUP
========================================================== */

function setupLesson(config) {

    lessonConfig = config;

 buildHeader();

 buildProgressBar();

 buildFooter();

 buildPopup();

 loadLesson();

 updateProgress();

 startAutoSave();

}

/* ==========================================================
PAGE BUILDER – header
========================================================== */

function buildHeader() {

 if (document.querySelector("header")) return;

 const cfg = (typeof SITE_CONFIG !== "undefined") ? SITE_CONFIG : {};
 const courseName = cfg.courseName || "Year 9 Civics & Citizenship";

 const header = document.createElement("header");

 header.innerHTML =
     "<h1>🐝 Deborah – " + courseName + "</h1>" +
     "<h2>Week " + (lessonConfig.week || "") +
     " &bull; Lesson " + (lessonConfig.lesson || "") + "</h2>" +
     "<h2>" + (lessonConfig.title || "") + "</h2>";

 const main = document.querySelector("main");

 if (main) {
     document.body.insertBefore(header, main);
 } else {
     document.body.prepend(header);
 }

}

/* ==========================================================
PAGE BUILDER – progress bar
========================================================== */

function buildProgressBar() {

 if (document.getElementById("progressBar")) return;

 const wrap = document.createElement("div");

 wrap.className = "progress-container";

 wrap.innerHTML = '<div class="progress-bar" id="progressBar">0%</div>';

 const main = document.querySelector("main");
 const header = document.querySelector("header");

 if (main) {
     document.body.insertBefore(wrap, main);
 } else if (header && header.nextSibling) {
     document.body.insertBefore(wrap, header.nextSibling);
 } else {
     document.body.appendChild(wrap);
 }

}

/* ==========================================================
PAGE BUILDER – footer navigation
========================================================== */

function buildFooter() {

 if (document.querySelector("footer")) return;

 const hasPrev = !!lessonConfig.previous;
 const hasNext = !!lessonConfig.next;

 const footer = document.createElement("footer");

 footer.innerHTML =
     '<button onclick="goPrevious()"' + (hasPrev ? "" : " disabled") + ">⬅ Previous Lesson</button>" +
     '<button onclick="goDashboard()">🏠 Dashboard</button>' +
     '<button onclick="goNext()"' + (hasNext ? "" : " disabled") + ">Next Lesson ➜</button>";

 document.body.appendChild(footer);

}

/* ==========================================================
PAGE BUILDER – achievement popup
========================================================== */

function buildPopup() {

 if (document.getElementById("achievementPopup")) return;

 const popup = document.createElement("div");

 popup.id        = "achievementPopup";
 popup.className = "popup";

 document.body.appendChild(popup);

}

/* ==========================================================
NAVIGATION
========================================================== */

function goPrevious() {

 if (lessonConfig.previous) {
     saveLesson();
     window.location.href = lessonConfig.previous;
 }

}

function goDashboard() {

 const cfg = (typeof SITE_CONFIG !== "undefined") ? SITE_CONFIG : {};
 saveLesson();
 window.location.href = cfg.dashboard || "dashboard.html";

}

function goNext() {

 if (lessonConfig.next) {
     saveLesson();
     window.location.href = lessonConfig.next;
 }

}

/* ==========================================================
PROGRESS
========================================================== */

function completeActivity(activityName) {

 if (completedActivities.has(activityName)) return;

 completedActivities.add(activityName);

 const cfg = (typeof SITE_CONFIG !== "undefined") ? SITE_CONFIG : {};
 const step = (cfg.defaults && cfg.defaults.progressPerActivity) || 20;

 lessonProgress = Math.min(lessonProgress + step, 100);

 updateProgress();

 saveLesson();

 achievement("Activity Complete!", "Great work on " + activityName + ".");

}

function updateProgress() {

 const bar = document.getElementById("progressBar");

 if (bar) {
     bar.style.width = lessonProgress + "%";
     bar.textContent = lessonProgress + "%";
 }

}

/* ==========================================================
STORAGE  – save
========================================================== */

function saveLesson() {

 if (!lessonConfig.lessonId) return;

 const reflection = document.getElementById("reflection");
 const exitTicket = document.getElementById("exitTicket");

 const data = {
     progress:    lessonProgress,
     completed:   lessonProgress >= 100,
     activities:  Array.from(completedActivities),
     reflection:  reflection ? reflection.value : "",
     exitTicket:  exitTicket ? exitTicket.value : "",
     started:     lessonStart,
     finished:    new Date().toLocaleString(),
     tabSwitches: tabSwitches,
     seconds:     Math.round((Date.now() - lessonStart) / 1000)
 };

 localStorage.setItem(lessonConfig.lessonId, JSON.stringify(data));

}

/* ==========================================================
STORAGE  – load
========================================================== */

function loadLesson() {

 if (!lessonConfig.lessonId) return;

 const saved = localStorage.getItem(lessonConfig.lessonId);

 if (!saved) return;

 const data = JSON.parse(saved);

 lessonProgress      = data.progress   || 0;
 completedActivities = new Set(data.activities || []);

 /* Restore typed text fields */
 const reflection = document.getElementById("reflection");
 const exitTicket = document.getElementById("exitTicket");

 if (reflection && data.reflection) reflection.value = data.reflection;
 if (exitTicket && data.exitTicket) exitTicket.value = data.exitTicket;

}

/* ==========================================================
AUTO-SAVE
========================================================== */

function startAutoSave() {

 const cfg = (typeof SITE_CONFIG !== "undefined") ? SITE_CONFIG : {};
 const interval = (cfg.defaults && cfg.defaults.autoSaveIntervalMs) || 30000;

 setInterval(saveLesson, interval);

}

/* ==========================================================
ACHIEVEMENTS
========================================================== */

function achievement(title, text) {

 const popup = document.getElementById("achievementPopup");

 if (!popup) return;

 popup.innerHTML = "<h3>🏆 " + title + "</h3><p>" + text + "</p>";
 popup.style.display = "block";

 setTimeout(function() {
     popup.style.display = "none";
 }, 3000);

}

/* ==========================================================
TAB / ENGAGEMENT TRACKING
========================================================== */

document.addEventListener("visibilitychange", function() {

 if (document.hidden) {
     tabSwitches++;
     hiddenStart = Date.now();
 } else {
     hiddenStart = null;
 }

});

/* ==========================================================
LEAVE – auto-save
========================================================== */

window.addEventListener("beforeunload", function() {

 saveLesson();

});
