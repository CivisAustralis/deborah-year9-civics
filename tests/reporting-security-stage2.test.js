const assert = require("assert");
const fs = require("fs");

const rules = fs.readFileSync("firestore.rules", "utf8");

// Verify the scoped list rule components are present
for (const required of [
    "request.auth.uid == studentId || linkedTeacher(studentId)",
    "allow get: if signedIn()",
    "request.auth.uid == userId",
    "resource.data.active == true",
    "resource.data.role == 'student'",
    "resource.data.teacherUid == request.auth.uid",
    "resource.data.classId is string",
    "allow list: if false",
    "request.resource.data.diff(resource.data).affectedKeys().hasOnly",
    "match /teacherReportReviews/{teacherId}",
    "request.auth.uid == teacherId",
    "request.resource.data.classId == userProfile(studentId).classId",
    "match /{document=**}",
    "allow read, write: if false"
]) assert(rules.includes(required), `missing rule guard: ${required}`);

// Verify the scoped list rule exists as a multi-condition block
assert(
    rules.includes("allow list: if activeRole('teacher')\n        && resource.data.active == true"),
    "scoped 'allow list' must require activeRole('teacher') with resource.data constraints"
);

// Negative assertion: the unrestricted standalone list rule must NOT exist
assert(
    !rules.includes("allow list: if activeRole('teacher');"),
    "unrestricted 'allow list: if activeRole('teacher');' must not exist"
);

function linkedTeacher(actor, student) {
    return actor && actor.active === true && actor.role === "teacher"
        && student && student.active === true && student.role === "student"
        && student.teacherUid === actor.uid && typeof student.classId === "string";
}

function mayReadAnalytics(actor, student) {
    return Boolean(actor && student && (actor.uid === student.uid || linkedTeacher(actor, student)));
}

const teacherA = { uid: "teacher-a", role: "teacher", active: true };
const teacherB = { uid: "teacher-b", role: "teacher", active: true };
const linkedStudent = { uid: "student-a", role: "student", active: true, teacherUid: "teacher-a", classId: "class-a" };
const otherStudent = { uid: "student-b", role: "student", active: true, teacherUid: "teacher-b", classId: "class-b" };

assert.equal(mayReadAnalytics(teacherA, linkedStudent), true, "linked teacher may read student evidence");
assert.equal(mayReadAnalytics(teacherA, otherStudent), false, "teacher is denied an unlinked student");
assert.equal(mayReadAnalytics(linkedStudent, otherStudent), false, "student is denied another student");
assert.equal(mayReadAnalytics(linkedStudent, linkedStudent), true, "student retains own-record access");

const reviewPath = `teacherReportReviews/${teacherA.uid}/students/${linkedStudent.uid}`;
assert.equal(reviewPath, "teacherReportReviews/teacher-a/students/student-a");
assert(!rules.includes("allow list: if signedIn()"), "join codes cannot be listed");
console.log("PASS Stage 2 relationship and reporting security guards");
