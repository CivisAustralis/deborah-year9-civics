import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

function randomJoinCode() {
    const bytes = new Uint8Array(15);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(36).padStart(2, "0")).join("").toUpperCase();
}

async function currentProfile(requiredRole) {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error("Authentication required."), { code: "unauthenticated" });
    const snapshot = await getDoc(doc(db, "users", user.uid));
    const profile = snapshot.exists() ? snapshot.data() : null;
    if (!profile || profile.active !== true || profile.role !== requiredRole) throw Object.assign(new Error(`${requiredRole} profile required.`), { code: "forbidden" });
    return { user, profile };
}

export async function createClass(className) {
    const { user } = await currentProfile("teacher");
    const cleanedName = String(className || "").trim().slice(0, 120);
    if (cleanedName.length < 2) throw new Error("A class name is required.");
    const classRef = doc(collection(db, "classes"));
    const joinCode = randomJoinCode();
    const codeRef = doc(db, "classJoinCodes", joinCode);
    const batch = writeBatch(db);
    batch.set(classRef, { teacherUid: user.uid, className: cleanedName, joinCode, active: true, createdAt: serverTimestamp() });
    batch.set(codeRef, { classId: classRef.id, teacherUid: user.uid, active: true, createdAt: serverTimestamp() });
    await batch.commit();
    return { classId: classRef.id, className: cleanedName, joinCode };
}

export async function joinClass(joinCode) {
    const { user, profile } = await currentProfile("student");
    if (profile.classId || profile.teacherUid) throw Object.assign(new Error("This student is already linked to a class."), { code: "already-linked" });
    const normalised = String(joinCode || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{30}$/.test(normalised)) throw new Error("Enter the complete class join code.");
    const codeSnapshot = await getDoc(doc(db, "classJoinCodes", normalised));
    if (!codeSnapshot.exists() || codeSnapshot.data().active !== true) throw Object.assign(new Error("This class join code is not active."), { code: "join-code-invalid" });
    const link = codeSnapshot.data();
    await updateDoc(doc(db, "users", user.uid), { classId: link.classId, teacherUid: link.teacherUid, classJoinCode: normalised });
    return { classId: link.classId, teacherUid: link.teacherUid };
}

export async function loadTeacherClasses() {
    const { user } = await currentProfile("teacher");
    const snapshot = await getDocs(query(collection(db, "classes"), where("teacherUid", "==", user.uid), where("active", "==", true)));
    return snapshot.docs.map(item => ({ id: item.id, className: item.data().className }));
}

export async function loadTeacherRoster(classId = null) {
    const { user } = await currentProfile("teacher");
    if (!classId) throw new Error("A teacher-owned class is required.");
    const snapshot = await getDocs(query(collection(db, "users"), where("teacherUid", "==", user.uid), where("classId", "==", classId), where("role", "==", "student"), where("active", "==", true)));
    return snapshot.docs.map(item => ({ uid: item.id, accountCode: item.data().accountCode, displayName: item.data().displayName || item.data().accountCode, classId: item.data().classId }));
}
