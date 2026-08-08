import { signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { waitForAuthenticatedProfile } from "./auth-common.js";
import { createClass, joinClass, loadTeacherClasses, loadTeacherRoster } from "./class-roster.js";
import { localUnitProgress, syncPendingAnalytics } from "./analytics-session.js";

const byId = id => document.getElementById(id);
let session = null;
function status(id, message) { byId(id).textContent = message; }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

async function renderTeacherClasses() {
    const classes = await loadTeacherClasses();
    const list = byId("teacherClassList"); clear(list);
    for (const item of classes) {
        const students = await loadTeacherRoster(item.id);
        const row = document.createElement("li");
        row.textContent = `${item.className}: ${students.length} linked student${students.length === 1 ? "" : "s"}`;
        list.appendChild(row);
    }
    status("teacherRosterStatus", classes.length ? `${classes.length} active class${classes.length === 1 ? "" : "es"}. Join codes are shown only when a class is created.` : "No active classes yet.");
}

async function initialise() {
    try {
        session = await waitForAuthenticatedProfile();
        if (!session) return;
        byId("userCode").textContent = session.profile.displayName || session.profile.accountCode;
        if (session.profile.role === "teacher") {
            byId("teacherTools").hidden = false;
            await renderTeacherClasses();
        } else {
            byId("studentTools").hidden = false;
            const progress = localUnitProgress();
            byId("studentProgress").textContent = `${progress.completed} of 16 lessons completed; ${progress.started} started on this browser.`;
            if (session.profile.classId) {
                byId("linkedClass").hidden = false;
                byId("linkedClassId").textContent = session.profile.classId;
                byId("joinClassForm").hidden = true;
                status("studentClassStatus", "Your account is already linked. Ask the teacher or administrator before any reassignment.");
            }
            const sync = await syncPendingAnalytics(session.profile);
            if (sync.attempted) status("studentClassStatus", `${sync.synced} of ${sync.attempted} pending lesson record${sync.attempted === 1 ? "" : "s"} synchronised. Local copies were retained.`);
        }
        document.body.classList.remove("auth-pending");
    } catch (error) {
        byId("authGate").textContent = "The secure dashboard could not be loaded. Return to login and try again.";
    }
}

byId("createClassForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
        const created = await createClass(byId("className").value);
        byId("className").value = "";
        status("teacherRosterStatus", `Class created. Give students this join code: ${created.joinCode}`);
        await renderTeacherClasses();
        status("teacherRosterStatus", `Class “${created.className}” created. Join code: ${created.joinCode}. Store it securely.`);
    } catch (error) { status("teacherRosterStatus", "The class could not be created. Check your connection and teacher access."); }
});

byId("joinClassForm").addEventListener("submit", async event => {
    event.preventDefault();
    const code = byId("joinCode").value.trim().toUpperCase();
    if (!confirm("Join the class linked to this code? A later reassignment requires administrator or teacher action.")) return;
    try {
        const link = await joinClass(code);
        session.profile.classId = link.classId; session.profile.teacherUid = link.teacherUid;
        byId("joinCode").value = ""; byId("joinClassForm").hidden = true; byId("linkedClass").hidden = false; byId("linkedClassId").textContent = link.classId;
        const sync = await syncPendingAnalytics(session.profile);
        status("studentClassStatus", `Class joined securely. ${sync.synced} pending lesson record${sync.synced === 1 ? "" : "s"} synchronised.`);
    } catch (error) { status("studentClassStatus", error.code === "already-linked" ? "This account is already linked to a class. Reassignment must be handled by the administrator or teacher." : "The class code is invalid, inactive, or unavailable."); }
});

byId("signOutButton").addEventListener("click", async () => {
    byId("signOutButton").disabled = true;
    if (session && session.profile.role === "student") await Promise.race([syncPendingAnalytics(session.profile), new Promise(resolve => setTimeout(resolve, 2500))]);
    await signOut(auth);
    session = null;
    window.location.replace("index.html");
});

initialise();
