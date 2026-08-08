import { createAnalyticsSyncAdapter } from "./analytics-sync.js";

const PREFIX = "deborah.analytics.v1.";
function parse(value) { try { return JSON.parse(value); } catch (error) { return null; } }
function keys() { return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(key => key && key.startsWith(PREFIX)); }

export function localUnitProgress() {
    const records = keys().map(key => parse(localStorage.getItem(key))).filter(Boolean);
    return { started: records.length, completed: records.filter(record => record.unitProgress && record.unitProgress.completed).length, pending: records.filter(record => !record.remoteSync || record.remoteSync.pending).length };
}

export async function syncPendingAnalytics(profile) {
    if (!profile || profile.role !== "student") return { attempted: 0, synced: 0, skipped: true };
    const adapter = await createAnalyticsSyncAdapter();
    let attempted = 0, synced = 0;
    for (const key of keys()) {
        const record = parse(localStorage.getItem(key));
        if (!record) continue;
        const identityIsCurrent = record.studentUid === profile.uid && record.studentCode === profile.accountCode && (record.teacherUid || null) === (profile.teacherUid || null) && (record.classId || null) === (profile.classId || null);
        if (record.remoteSync && record.remoteSync.pending === false && identityIsCurrent) continue;
        attempted += 1;
        try {
            const result = await adapter(record);
            if (result && result.synced) {
                record.studentUid = result.identity.studentUid;
                record.studentCode = result.identity.studentCode;
                record.teacherUid = result.identity.teacherUid;
                record.classId = result.identity.classId;
                record.remoteSync = { ...(record.remoteSync || {}), pending: false, lastSuccessAt: new Date().toISOString(), lastErrorCode: null };
                localStorage.setItem(key, JSON.stringify(record));
                synced += 1;
            }
        } catch (error) {
            record.remoteSync = { ...(record.remoteSync || {}), pending: true, lastAttemptAt: new Date().toISOString(), lastErrorCode: error && error.code ? String(error.code) : "sync-failed" };
            localStorage.setItem(key, JSON.stringify(record));
        }
    }
    return { attempted, synced, skipped: false };
}
