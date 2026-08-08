const assert = require("node:assert/strict");
const fs = require("node:fs");
const lessons = [...Array(4)].flatMap((_, i) => [`week1-lesson${i + 1}.html`, `week2-lesson${i + 1}.html`, `week3-lesson${i + 1}.html`]).concat(["week4-lesson1.html", "week4-lesson2.html", "week5-lesson1.html", "week5-lesson2.html"]);
const index = fs.readFileSync("index.html", "utf8");
const login = fs.readFileSync("js/login.js", "utf8");
const auth = fs.readFileSync("js/auth-common.js", "utf8");
const dashboard = fs.readFileSync("dashboard.html", "utf8");
const dashboardAuth = fs.readFileSync("js/dashboard-auth.js", "utf8");
const roster = fs.readFileSync("js/class-roster.js", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");
const report = fs.readFileSync("js/teacher-report.js", "utf8");
assert(index.includes('id="accountCode"') && index.includes('id="password"') && index.includes('id="togglePassword"') && index.includes('aria-live="polite"'));
assert(!index.includes("dashboard.html?code=") && !dashboard.includes("URLSearchParams"), "account code is absent from navigation URLs");
assert(login.includes("signInWithEmailAndPassword") && login.includes("accountCodeToAlias") && login.includes("browserSessionPersistence"));
assert(login.includes("passwordInput.value = \"\"") && !login.includes("localStorage") && !login.includes("console."), "password is cleared, never persisted or logged");
for (const code of ["profile-missing", "profile-inactive", "profile-role-invalid", "profile-code-mismatch", "profile-alias-mismatch"]) assert(auth.includes(code));
assert(auth.includes("user.email.toLowerCase() !== accountCodeToAlias(accountCode)"), "Auth alias must match the profile account code");
assert(dashboard.includes('class="auth-pending"') && dashboard.includes('id="teacherTools" hidden') && dashboard.includes('id="studentTools" hidden'));
for (const id of ["authGate", "authGateMessage", "authGateReturn", "userCode", "signOutButton", "teacherTools", "createClassForm", "className", "teacherRosterStatus", "teacherClassList", "studentTools", "studentProgress", "linkedClass", "linkedClassId", "joinClassForm", "joinCode", "studentClassStatus"]) {
    assert(dashboard.includes(`id="${id}"`), `dashboard.html missing #${id}`);
}
assert(dashboard.includes('<script type="module" src="js/dashboard-auth.js"></script>'), "dashboard authentication module is not loaded");
assert(!dashboard.includes("URLSearchParams") && !dashboard.includes("onAuthStateChanged"), "stale inline authentication must not return");
assert(dashboardAuth.includes("waitForAuthenticatedProfile()") && dashboardAuth.includes("signOut(auth)") && dashboardAuth.includes("window.location.replace(\"index.html\")"));
assert(dashboardAuth.indexOf('document.body.classList.remove("auth-pending")') < dashboardAuth.indexOf("await renderTeacherClasses()"), "authenticated dashboard is revealed before optional class loading");
assert(dashboardAuth.includes('byId("authGate").hidden = true') && dashboardAuth.includes('profile.role !== "teacher"') && dashboardAuth.includes('profile.role !== "student"'));
assert(dashboard.includes('id="authGateReturn"') && dashboardAuth.includes("We couldn’t verify your session"));
assert(dashboardAuth.includes("syncPendingAnalytics") && dashboardAuth.includes("localUnitProgress"));
assert(roster.includes('where("teacherUid", "==", user.uid)') && roster.includes('where("classId", "==", classId)'));
assert(roster.includes('code: "already-linked"') && dashboardAuth.includes("confirm("));
assert(rules.includes("allow list: if false") && rules.includes("resource.data.classId == null") && rules.includes("linkedTeacher(studentId)"));
assert(report.includes('waitForAuthenticatedProfile("teacher")') && !report.includes("URLSearchParams"));
assert(report.includes("signOut(auth)"));
assert.equal(lessons.length, 16);
for (const file of lessons) {
    const html = fs.readFileSync(file, "utf8");
    for (const script of ["js/reporting-config.js", "js/analytics-common.js", "js/lesson-common.js"]) assert(html.includes(script), `${file} missing ${script}`);
    assert(/setupLesson\(\{\s*lessonId:\s*"week\d+lesson\d+"/.test(html), `${file} lacks stable lessonId`);
}
for (const file of ["week5-lesson1.html", "week5-lesson2.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert(html.includes('recordKnowledgeCheck({activityId:"knowledge-check"'), `${file} knowledge check not instrumented`);
    assert(html.includes('completeActivity("exit-ticket")'), `${file} completion not instrumented`);
}
const setup = fs.readFileSync("FIREBASE-AUTH-SETUP.md", "utf8");
assert(setup.includes("Firebase Console") && setup.includes("Admin SDK") && !/password\s*[:=]\s*\S+/i.test(setup), "provisioning remains trusted and contains no password literal");
console.log("PASS focused Firebase Authentication integration audit");
