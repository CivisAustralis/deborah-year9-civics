import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

export function createFirebaseAdminAdapter({ projectId }) {
    const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    return {
        projectId,
        async findProfilesByAccountCode(accountCode) {
            const snapshot = await firestore.collection("users").where("accountCode", "==", accountCode).get();
            return snapshot.docs.map(document => ({ uid: document.id, data: document.data() }));
        },
        async findActiveClasses(teacherUid, className) {
            const snapshot = await firestore.collection("classes").where("teacherUid", "==", teacherUid).get();
            return snapshot.docs.map(document => ({ id: document.id, data: document.data() })).filter(item => item.data.className === className && item.data.active === true);
        },
        async findAuthUserByEmail(email) {
            try { return await auth.getUserByEmail(email); }
            catch (error) { if (error && error.code === "auth/user-not-found") return null; throw error; }
        },
        async getProfile(uid) {
            const snapshot = await firestore.collection("users").doc(uid).get();
            return snapshot.exists ? snapshot.data() : null;
        },
        async createAuthUser({ email, password, displayName }) {
            return auth.createUser({ email, password, displayName, disabled: false, emailVerified: false });
        },
        async setProfile(uid, profile) {
            await firestore.collection("users").doc(uid).set({ ...profile, provisionedAt: FieldValue.serverTimestamp(), provisionedBy: "deborah-admin-tool" }, { merge: true });
        }
    };
}
