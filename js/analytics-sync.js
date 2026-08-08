import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
}

function mergeKnowledge(localChecks = {}, remoteChecks = {}) {
    const merged = {};
    new Set([...Object.keys(remoteChecks), ...Object.keys(localChecks)]).forEach(activityId => {
        const local = localChecks[activityId] || { attempts: [] };
        const remote = remoteChecks[activityId] || { attempts: [] };
        const attempts = [];
        const tokens = new Set();
        [...(remote.attempts || []), ...(local.attempts || [])].forEach(attempt => {
            const token = attempt.dedupeKey || `${activityId}:${attempt.attemptNumber}:${attempt.score}:${attempt.maxScore}`;
            if (!tokens.has(token)) { tokens.add(token); attempts.push({ ...attempt, dedupeKey: token }); }
        });
        attempts.sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
        const latest = attempts[attempts.length - 1] || null;
        const highest = attempts.slice().sort((a, b) => (b.normalisedScore || 0) - (a.normalisedScore || 0))[0] || null;
        merged[activityId] = {
            attempts,
            latest,
            highest,
            improvement: attempts.length > 1 ? (latest.normalisedScore || 0) - (attempts[0].normalisedScore || 0) : 0
        };
    });
    return merged;
}

function mergeRecords(local, remote) {
    if (!remote) return local;
    const remoteIsNewer = String(remote.lastSavedAt || "") > String(local.lastSavedAt || "");
    const mergedChecks = mergeKnowledge(local.knowledgeChecks, remote.knowledgeChecks);
    const allAttempts = Object.values(mergedChecks).flatMap(check => check.attempts || []);
    const latest = allAttempts.slice().sort((a, b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")))[0] || null;
    const highest = allAttempts.slice().sort((a, b) => (b.normalisedScore || 0) - (a.normalisedScore || 0))[0] || null;
    const cumulativeFields = ["totalOpenTimeMs", "activeTimeMs", "idleTimeMs", "hiddenTimeMs", "focusLossCount", "returnAfterFocusLossCount", "longestFocusLossMs", "meaningfulInteractionCount", "revisionCount", "sessionCount"];
    const merged = { ...remote, ...local };
    cumulativeFields.forEach(field => { merged[field] = Math.max(Number(local[field]) || 0, Number(remote[field]) || 0); });
    merged.schemaVersion = Math.max(Number(local.schemaVersion) || 1, Number(remote.schemaVersion) || 1);
    merged.activitiesCompleted = unique([...(remote.activitiesCompleted || []), ...(local.activitiesCompleted || [])]);
    merged.activityResults = { ...(remote.activityResults || {}), ...(local.activityResults || {}) };
    merged.knowledgeChecks = mergedChecks;
    merged.knowledgeAttemptCount = allAttempts.length;
    merged.latestKnowledgeScore = latest ? { score: latest.score, maxScore: latest.maxScore, normalisedScore: latest.normalisedScore } : null;
    merged.highestKnowledgeScore = highest ? { score: highest.score, maxScore: highest.maxScore, normalisedScore: highest.normalisedScore } : null;
    merged.writtenResponses = remoteIsNewer ? { ...(local.writtenResponses || {}), ...(remote.writtenResponses || {}) } : { ...(remote.writtenResponses || {}), ...(local.writtenResponses || {}) };
    merged.focusLossIntervals = [...(remote.focusLossIntervals || []), ...(local.focusLossIntervals || [])]
        .filter((interval, index, list) => list.findIndex(item => item.startedAt === interval.startedAt && item.endedAt === interval.endedAt) === index)
        .slice(-50);
    merged.unitProgress = {
        lessonProgress: Math.max(Number(local.unitProgress && local.unitProgress.lessonProgress) || 0, Number(remote.unitProgress && remote.unitProgress.lessonProgress) || 0),
        completed: Boolean((local.unitProgress && local.unitProgress.completed) || (remote.unitProgress && remote.unitProgress.completed)),
        startedLessonCount: Math.max(Number(local.unitProgress && local.unitProgress.startedLessonCount) || 0, Number(remote.unitProgress && remote.unitProgress.startedLessonCount) || 0),
        completedLessonCount: Math.max(Number(local.unitProgress && local.unitProgress.completedLessonCount) || 0, Number(remote.unitProgress && remote.unitProgress.completedLessonCount) || 0),
        totalLessons: Math.max(Number(local.unitProgress && local.unitProgress.totalLessons) || 0, Number(remote.unitProgress && remote.unitProgress.totalLessons) || 0, 16)
    };
    merged.completedAt = remote.completedAt || local.completedAt || null;
    return merged;
}

export async function createAnalyticsSyncAdapter() {
    return async function syncAnalytics(localRecord) {
        const user = auth.currentUser;
        if (!user) return { synced: false, errorCode: "unauthenticated" };

        const profileSnapshot = await getDoc(doc(db, "users", user.uid));
        if (!profileSnapshot.exists()) return { synced: false, errorCode: "profile-missing" };
        const profile = profileSnapshot.data();
        if (profile.active !== true || profile.role !== "student") return { synced: false, errorCode: "student-profile-required" };

        const identity = {
            studentUid: user.uid,
            studentCode: profile.accountCode || null,
            teacherUid: profile.teacherUid || null,
            classId: profile.classId || null
        };
        const lessonRef = doc(db, "studentProgress", user.uid, "lessons", localRecord.lessonId);
        const remoteSnapshot = await getDoc(lessonRef);
        const merged = mergeRecords({ ...localRecord, ...identity }, remoteSnapshot.exists() ? remoteSnapshot.data() : null);
        await setDoc(lessonRef, {
            ...merged,
            ...identity,
            remoteUpdatedAt: serverTimestamp()
        }, { merge: true });
        return { synced: true, identity };
    };
}

export const __test = { mergeRecords, mergeKnowledge };
