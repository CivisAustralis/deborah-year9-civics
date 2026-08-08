import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

async function requireProfile() {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error("Authentication required."), { code: "unauthenticated" });
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (!snapshot.exists()) throw Object.assign(new Error("Profile not found."), { code: "profile-missing" });
    const profile = snapshot.data();
    if (profile.active !== true || !["student", "teacher"].includes(profile.role)) throw Object.assign(new Error("Active student or teacher profile required."), { code: "profile-invalid" });
    return { user, profile };
}

async function requireStudentRelationship(studentUid) {
    const actor = await requireProfile();
    if (actor.profile.role === "student") {
        if (actor.user.uid !== studentUid) throw Object.assign(new Error("Students may read only their own evidence."), { code: "forbidden" });
        return actor;
    }
    const studentSnapshot = await getDoc(doc(db, "users", studentUid));
    if (!studentSnapshot.exists()) throw Object.assign(new Error("Linked student profile not found."), { code: "student-missing" });
    const student = studentSnapshot.data();
    if (student.teacherUid !== actor.user.uid || !student.classId) throw Object.assign(new Error("A current teacher–class relationship is required."), { code: "not-linked" });
    return { ...actor, student };
}

export async function loadStudentAnalytics(studentUid) {
    await requireStudentRelationship(studentUid);
    const snapshot = await getDocs(collection(db, "studentProgress", studentUid, "lessons"));
    return snapshot.docs.map(item => item.data());
}

export async function buildStudentFormativeProfile(studentUid) {
    const records = await loadStudentAnalytics(studentUid);
    if (!window.DeborahReportingModel) throw new Error("reporting-model.js must be loaded before reporting-data.js");
    return window.DeborahReportingModel.buildStudentFormativeProfile(records, { studentUid, lessonsAvailable: 16 });
}

export async function saveTeacherReportReview(studentUid, review) {
    const actor = await requireStudentRelationship(studentUid);
    if (actor.profile.role !== "teacher") throw Object.assign(new Error("Only the linked teacher may save a review."), { code: "teacher-required" });
    const allowedBands = new Set(["Sustained", "Generally consistent", "Variable", "Limited evidence of sustained engagement", "Emerging", "Developing", "Secure", "Sophisticated", "Insufficient evidence"]);
    const indicatorOverrides = {};
    Object.entries(review && review.indicatorOverrides || {}).forEach(([indicatorId, value]) => {
        indicatorOverrides[String(indicatorId).slice(0, 100)] = {
            generatedBand: allowedBands.has(value.generatedBand) ? value.generatedBand : null,
            selectedBand: allowedBands.has(value.selectedBand) ? value.selectedBand : null,
            evidenceStatement: String(value.evidenceStatement || "").slice(0, 2000),
            reason: String(value.reason || "").slice(0, 2000),
            notReported: Boolean(value.notReported)
        };
    });
    const safeReview = {
        schemaVersion: 1,
        teacherUid: actor.user.uid,
        studentUid,
        classId: actor.student.classId,
        indicatorOverrides,
        classroomContext: String(review && review.classroomContext || "").slice(0, 5000),
        includeFocus: review && review.includeFocus !== false,
        strengths: (review && review.strengths || []).map(value => String(value).slice(0, 500)).slice(0, 3),
        nextSteps: (review && review.nextSteps || []).map(value => String(value).slice(0, 500)).slice(0, 3),
        teacherComment: String(review && review.teacherComment || "").slice(0, 3000),
        teacherName: String(review && review.teacherName || "").slice(0, 150),
        reportingPeriod: String(review && review.reportingPeriod || "").slice(0, 100),
        extracts: (review && review.extracts || []).slice(0, 5).map(item => ({ lessonId: String(item.lessonId || "").slice(0, 80), fieldId: String(item.fieldId || "").slice(0, 100), excerpt: String(item.excerpt || "").slice(0, 1400), label: String(item.label || "").slice(0, 160), teacherNote: String(item.teacherNote || "").slice(0, 500) })),
        updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, "teacherReportReviews", actor.user.uid, "students", studentUid), safeReview, { merge: true });
    return safeReview;
}

export async function loadTeacherReportReview(studentUid) {
    const actor = await requireStudentRelationship(studentUid);
    if (actor.profile.role !== "teacher") throw Object.assign(new Error("Only the linked teacher may load a teacher review."), { code: "teacher-required" });
    const snapshot = await getDoc(doc(db, "teacherReportReviews", actor.user.uid, "students", studentUid));
    return snapshot.exists() ? snapshot.data() : null;
}
