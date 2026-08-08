import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

export const AUTH_ALIAS_DOMAIN = "accounts.invalid";

export function normalizeAccountCode(value) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function accountCodeToAlias(accountCode) {
    return `${normalizeAccountCode(accountCode).toLowerCase()}@${AUTH_ALIAS_DOMAIN}`;
}

export async function getUserProfile(user, options = {}) {
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists()) {
        if (options.throwOnInvalid) throw Object.assign(new Error("Profile missing."), { code: "profile-missing" });
        return null;
    }

    const profile = snapshot.data();
    if (profile.active !== true) {
        if (options.throwOnInvalid) throw Object.assign(new Error("Profile inactive."), { code: "profile-inactive" });
        return null;
    }
    if (!["student", "teacher"].includes(profile.role)) {
        if (options.throwOnInvalid) throw Object.assign(new Error("Profile role invalid."), { code: "profile-role-invalid" });
        return null;
    }

    const accountCode = normalizeAccountCode(profile.accountCode || "");
    const expectedPrefix = profile.role === "teacher" ? "T" : "S";
    if (!new RegExp(`^${expectedPrefix}[A-Z0-9]{5,19}$`).test(accountCode)) {
        if (options.throwOnInvalid) throw Object.assign(new Error("Profile code invalid."), { code: "profile-code-mismatch" });
        return null;
    }
    if (options.expectedAccountCode && normalizeAccountCode(options.expectedAccountCode) !== accountCode) {
        throw Object.assign(new Error("Profile code mismatch."), { code: "profile-code-mismatch" });
    }
    if (!user.email || user.email.toLowerCase() !== accountCodeToAlias(accountCode)) {
        if (options.throwOnInvalid) throw Object.assign(new Error("Authentication alias mismatch."), { code: "profile-alias-mismatch" });
        return null;
    }

    return {
        uid: user.uid,
        accountCode,
        role: profile.role,
        active: profile.active,
        classId: profile.classId || null,
        teacherUid: profile.teacherUid || null,
        displayName: String(profile.displayName || "").trim() || accountCode
    };
}

export function waitForAuthenticatedProfile(requiredRole = null) {
    return new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        unsubscribe = onAuthStateChanged(auth, async user => {
            unsubscribe();

            if (!user) {
                window.location.replace("index.html");
                resolve(null);
                return;
            }

            try {
                const profile = await getUserProfile(user);

                if (!profile || (requiredRole && profile.role !== requiredRole)) {
                    await signOut(auth);
                    window.location.replace("index.html");
                    resolve(null);
                    return;
                }

                resolve({ user, profile });
            } catch (error) {
                reject(error);
            }
        }, reject);
    });
}
