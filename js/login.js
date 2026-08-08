import { browserSessionPersistence, setPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { accountCodeToAlias, normalizeAccountCode, getUserProfile } from "./auth-common.js";

const form = document.getElementById("loginForm");
const codeInput = document.getElementById("accountCode");
const passwordInput = document.getElementById("password");
const toggle = document.getElementById("togglePassword");
const status = document.getElementById("loginStatus");
const submit = document.getElementById("loginButton");

function show(message, error = false) {
    status.textContent = message;
    status.className = `message ${error ? "error" : "success"}`;
}

function loginError(error) {
    if (["auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password", "auth/user-not-found"].includes(error.code)) return "The account code or password is incorrect.";
    if (["auth/network-request-failed", "unavailable"].includes(error.code)) return "The authentication service is unavailable. Check the connection and try again.";
    if (error.code === "profile-missing") return "Authentication succeeded, but the account profile is missing. Ask the course administrator for help.";
    if (error.code === "profile-inactive") return "This account is inactive. Ask the course administrator for help.";
    if (error.code === "profile-role-invalid") return "This account does not have a valid student or teacher role.";
    if (["profile-code-mismatch", "profile-alias-mismatch"].includes(error.code)) return "The authenticated account does not match its course profile. Ask the course administrator for help.";
    return "Login could not be completed. Check the details and try again.";
}

toggle.addEventListener("click", () => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    toggle.textContent = showing ? "Show password" : "Hide password";
    toggle.setAttribute("aria-pressed", String(!showing));
    passwordInput.focus();
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    const rawCode = codeInput.value;
    const accountCode = normalizeAccountCode(rawCode);
    if (!/^(?:S|T)[A-Z0-9]{5,19}$/.test(accountCode)) {
        show("Enter a valid student or teacher account code.", true);
        codeInput.focus();
        return;
    }
    if (!passwordInput.value) {
        show("Enter the password supplied with this account.", true);
        passwordInput.focus();
        return;
    }
    submit.disabled = true;
    show("Signing in securely…");
    try {
        await setPersistence(auth, browserSessionPersistence);
        const credential = await signInWithEmailAndPassword(auth, accountCodeToAlias(accountCode), passwordInput.value);
        const profile = await getUserProfile(credential.user, { expectedAccountCode: accountCode, throwOnInvalid: true });
        if (!profile) throw Object.assign(new Error("Profile validation failed."), { code: "profile-missing" });
        passwordInput.value = "";
        show("Login verified. Opening the dashboard…");
        window.location.replace("dashboard.html");
    } catch (error) {
        passwordInput.value = "";
        if (auth.currentUser) await signOut(auth).catch(() => {});
        show(loginError(error), true);
        submit.disabled = false;
        passwordInput.focus();
    }
});
