import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { accountCodeToAlias, applyProvisioningPlan, buildProvisioningPlan, classTotals, credentialsCsv, credentialsHtml, EXISTING_PASSWORD_STATUS, generateTemporaryPassword, normalizeAccountCode, parseRosterCsv, validateAccountCode, validateRoster } from "../lib/provisioning-core.mjs";

const rosterCsv = `accountCode,displayName,className,existing\nsnew01,Example One,9A,false\nsexist2,"Existing, Example",9B,true\nsrepair3,Repair Example,9C,false\n`;
function mockAdapter(options = {}) {
    const writes = { auth: [], profiles: [] };
    const authUsers = new Map(Object.entries(options.authUsers || { "sexist2@accounts.invalid": { uid: "existing-uid", email: "sexist2@accounts.invalid" }, "srepair3@accounts.invalid": { uid: "repair-uid", email: "srepair3@accounts.invalid" } }));
    const profiles = new Map(Object.entries(options.profiles || { "existing-uid": { accountCode: "SEXIST2", displayName: "Old Name", role: "student", active: true, classId: "old", teacherUid: "teacher-uid" } }));
    const profileCodeIndex = () => [...profiles].map(([uid, data]) => ({ uid, data }));
    return {
        writes, authUsers, profiles,
        async findProfilesByAccountCode(code) {
            if (code === "TEXAMPLE1") return options.teachers || [{ uid: "teacher-uid", data: { accountCode: "TEXAMPLE1", role: "teacher", active: true } }];
            return profileCodeIndex().filter(item => item.data.accountCode === code);
        },
        async findActiveClasses(teacherUid, className) {
            if (options.missingClass === className) return [];
            if (options.duplicateClass === className) return [{ id: `${className}-one` }, { id: `${className}-two` }];
            return [{ id: `class-${className}`, data: { teacherUid, className, active: true } }];
        },
        async findAuthUserByEmail(email) { return authUsers.get(email) || null; },
        async getProfile(uid) { return profiles.get(uid) || null; },
        async createAuthUser(data) {
            writes.auth.push({ ...data });
            const user = { uid: `created-${writes.auth.length}`, email: data.email };
            authUsers.set(data.email, user);
            return user;
        },
        async setProfile(uid, data) { writes.profiles.push({ uid, data: { ...data } }); profiles.set(uid, { ...data }); }
    };
}

test("normalises and validates Deborah student account codes and aliases", () => {
    assert.equal(normalizeAccountCode(" sAb-12345 "), "SAB12345");
    assert(validateAccountCode("sAb12345"));
    assert(!validateAccountCode("TEXAMPLE1"));
    assert(!validateAccountCode("S1234"));
    assert.equal(accountCodeToAlias("sAb12345"), "sab12345@accounts.invalid");
});

test("parses quoted CSV and reports duplicates and unsupported classes", () => {
    const rows = parseRosterCsv(rosterCsv);
    assert.equal(rows[1].displayName, "Existing, Example");
    assert.equal(rows[0].issuedAccountCode, "snew01");
    assert.deepEqual(classTotals(rows), { "9A": 1, "9B": 1, "9C": 1 });
    const duplicateRows = parseRosterCsv(`accountCode,displayName,className,existing\nSABCDE,Same,9A,false\nsabcde,Other,9A,false\nSFGHIJ,Same,9A,false\nSKLMNO,Third,10Z,false\n`);
    const errors = validateRoster(duplicateRows);
    assert(errors.some(error => error.includes("duplicate account code")));
    assert(errors.some(error => error.includes("duplicate display name")));
    assert(errors.some(error => error.includes("unsupported class")));
    assert.throws(() => parseRosterCsv('accountCode,displayName,className,existing\n"SABCDE,Bad,9A,false'), /opening quote/);
});

test("generates unique, manually typeable passwords of at least 12 characters", () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateTemporaryPassword()));
    assert.equal(passwords.size, 200);
    assert([...passwords].every(password => password.length >= 12));
    assert([...passwords].every(password => !/[0O1Il]/.test(password)));
    assert.throws(() => generateTemporaryPassword(11), /at least 12/);
});

test("builds class-linked idempotent plan and dry run performs no writes", async () => {
    const adapter = mockAdapter();
    const plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.counts.create, 1);
    assert.equal(plan.counts.existing, 2);
    assert.deepEqual(plan.counts.byClass, { "9A": 1, "9B": 1, "9C": 1 });
    assert.equal(plan.rows.find(item => item.row.accountCode === "SREPAIR3").action, "REPAIR");
    const result = await applyProvisioningPlan(plan, adapter, { apply: false });
    assert.equal(result.dryRun, true);
    assert.equal(adapter.writes.auth.length, 0);
    assert.equal(adapter.writes.profiles.length, 0);
});

test("apply creates new auth once, repairs existing profile, and writes direct class links", async () => {
    const adapter = mockAdapter();
    let plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    const first = await applyProvisioningPlan(plan, adapter, { apply: true });
    assert.equal(adapter.writes.auth.length, 1, "existing and repair users are not recreated");
    assert.equal(adapter.writes.profiles.length, 3);
    for (const write of adapter.writes.profiles) {
        assert.equal(write.data.accountCode, write.data.accountCode.toUpperCase());
        assert.equal(write.data.role, "student");
        assert.equal(write.data.active, true);
        assert.equal(write.data.teacherUid, "teacher-uid");
        assert.match(write.data.classId, /^class-9[ABC]$/);
        assert(!Object.hasOwn(write.data, "classJoinCode"));
    }
    assert.equal(first.credentials.find(item => item.username === "sexist2").temporaryPassword, "");
    assert.equal(first.credentials.find(item => item.username === "sexist2").status, EXISTING_PASSWORD_STATUS);
    assert(first.credentials.find(item => item.username === "snew01").temporaryPassword.length >= 12);

    adapter.writes.auth.length = 0; adapter.writes.profiles.length = 0;
    plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    assert(plan.rows.every(item => item.action === "UNCHANGED"), "all accounts must resolve UNCHANGED on rerun");
    const second = await applyProvisioningPlan(plan, adapter, { apply: true });
    assert.equal(adapter.writes.auth.length, 0, "rerun never duplicates Authentication users");
    assert.equal(adapter.writes.profiles.length, 0, "rerun must not write any Firestore profiles");
    assert.equal(second.writes, 0, "outcome.writes must be 0 on idempotent rerun");
});

test("preflight class or identity errors prevent every write", async () => {
    const adapter = mockAdapter({ missingClass: "9C" });
    const plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    assert(plan.errors.some(error => error.includes("9C")));
    await assert.rejects(() => applyProvisioningPlan(plan, adapter, { apply: true }), /zero writes/);
    assert.equal(adapter.writes.auth.length, 0);
    assert.equal(adapter.writes.profiles.length, 0);
});

test("credential formats escape data and never invent existing passwords", () => {
    const credentials = [{ className: "9A", displayName: "Example <Student>", username: "sexist2", temporaryPassword: "", status: EXISTING_PASSWORD_STATUS }];
    const csv = credentialsCsv(credentials), html = credentialsHtml(credentials);
    assert(csv.includes("Class,Display Name,Username,Temporary Password,Status"));
    assert(csv.includes(`sexist2,,${EXISTING_PASSWORD_STATUS}`));
    assert(html.includes("Example &lt;Student&gt;"));
    assert(!html.includes("Example <Student>"));
});

test("private and credential paths are ignored", async () => {
    const ignore = await readFile(new URL("../../.gitignore", import.meta.url), "utf8");
    for (const pattern of ["admin/private/", "admin/output/", "*.service-account.json", "serviceAccount*.json", "student-credentials*.csv", "student-credentials*.html"]) assert(ignore.includes(pattern));
});

test("duplicate teacher or class aborts before writes", async () => {
    const duplicateTeacher = mockAdapter({ teachers: [{ uid: "one", data: { role: "teacher", active: true } }, { uid: "two", data: { role: "teacher", active: true } }] });
    let plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter: duplicateTeacher, teacherCode: "TEXAMPLE1" });
    assert(plan.errors.some(error => error.includes("exactly one teacher")));
    assert.equal(duplicateTeacher.writes.auth.length, 0);
    const duplicateClass = mockAdapter({ duplicateClass: "9A" });
    plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter: duplicateClass, teacherCode: "TEXAMPLE1" });
    assert(plan.errors.some(error => error.includes("exactly one active 9A")));
    assert.equal(duplicateClass.writes.profiles.length, 0);
});

test("partial profile failure preserves auth user for resumable repair", async () => {
    const adapter = mockAdapter();
    const originalSetProfile = adapter.setProfile;
    let failedUid = null;
    adapter.setProfile = async (uid, data) => {
        if (data.accountCode === "SNEW01") { failedUid = uid; throw new Error("synthetic profile failure"); }
        return originalSetProfile(uid, data);
    };
    let plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    const result = await applyProvisioningPlan(plan, adapter, { apply: true });
    assert(failedUid);
    assert.equal(adapter.writes.auth.length, 1);
    const recoveryCredential = result.credentials.find(item => item.username === "snew01");
    assert.equal(recoveryCredential.status, "PROFILE REPAIR REQUIRED");
    assert(recoveryCredential.temporaryPassword.length >= 12);
    adapter.setProfile = originalSetProfile;
    adapter.writes.auth.length = 0;
    plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    assert.equal(plan.rows.find(item => item.row.accountCode === "SNEW01").action, "REPAIR");
    await applyProvisioningPlan(plan, adapter, { apply: true });
    assert.equal(adapter.writes.auth.length, 0, "repair does not recreate the Authentication user");
});

test("missing teacherCode returns a structural error before Firebase access", async () => {
    const adapter = mockAdapter();
    const plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter });
    assert(plan.errors.some(error => error.includes("A teacher account code is required")));
    assert.equal(adapter.writes.auth.length, 0);
    assert.equal(adapter.writes.profiles.length, 0);
});

test("Authentication/Profile UID mismatch is a blocking identity error", async () => {
    const adapter = mockAdapter({
        authUsers: { "sexist2@accounts.invalid": { uid: "auth-uid", email: "sexist2@accounts.invalid" }, "srepair3@accounts.invalid": { uid: "repair-uid", email: "srepair3@accounts.invalid" } },
        profiles: { "different-uid": { accountCode: "SEXIST2", displayName: "Existing, Example", role: "student", active: true } }
    });
    const plan = await buildProvisioningPlan({ rows: parseRosterCsv(rosterCsv), adapter, teacherCode: "TEXAMPLE1" });
    assert(plan.errors.some(error => error.includes("does not match Authentication UID")));
    assert.equal(adapter.writes.auth.length, 0);
});
