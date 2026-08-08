import { randomInt } from "node:crypto";

export const ACCOUNT_CODE_PATTERN = /^S[A-Z0-9]{5,19}$/;
export const SUPPORTED_CLASSES = Object.freeze(["9A", "9B", "9C"]);
export const EXISTING_PASSWORD_STATUS = "EXISTING ACCOUNT — PASSWORD UNCHANGED";
const PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const PASSWORD_ALPHABET = `${PASSWORD_LETTERS}23456789!@#$%`;

export function normalizeAccountCode(value) {
    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validateAccountCode(value) {
    return ACCOUNT_CODE_PATTERN.test(normalizeAccountCode(value));
}

export function accountCodeToAlias(value) {
    return `${normalizeAccountCode(value).toLowerCase()}@accounts.invalid`;
}

function parseCsvRecords(input) {
    const records = [];
    let record = [], field = "", quoted = false;
    const source = String(input ?? "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
            else if (character === '"') quoted = false;
            else field += character;
        } else if (character === '"') quoted = true;
        else if (character === ",") { record.push(field); field = ""; }
        else if (character === "\n") { record.push(field); records.push(record); record = []; field = ""; }
        else if (character !== "\r") field += character;
    }
    if (quoted) throw new Error("Malformed CSV: an opening quote was not closed.");
    if (field || record.length) { record.push(field); records.push(record); }
    return records.filter(row => row.some(value => value.trim()));
}

export function parseRosterCsv(input) {
    const records = parseCsvRecords(input);
    if (!records.length) throw new Error("The roster CSV is empty.");
    const expected = ["accountCode", "displayName", "className", "existing"];
    const headers = records.shift().map(value => value.trim());
    if (headers.length !== expected.length || headers.some((value, index) => value !== expected[index])) throw new Error(`CSV headers must be exactly: ${expected.join(",")}`);
    return records.map((values, index) => {
        if (values.length !== expected.length) throw new Error(`Malformed CSV row ${index + 2}: expected ${expected.length} columns.`);
        const existingText = values[3].trim().toLowerCase();
        if (!['true', 'false'].includes(existingText)) throw new Error(`Malformed CSV row ${index + 2}: existing must be true or false.`);
        return {
            rowNumber: index + 2,
            issuedAccountCode: values[0].trim(),
            accountCode: normalizeAccountCode(values[0]),
            displayName: values[1].trim(),
            className: values[2].trim().toUpperCase(),
            existing: existingText === "true"
        };
    });
}

export function validateRoster(rows, supportedClasses = SUPPORTED_CLASSES) {
    const errors = [], codeRows = new Map(), displayRows = new Map();
    for (const row of rows) {
        if (!validateAccountCode(row.accountCode)) errors.push(`Row ${row.rowNumber}: invalid student account code.`);
        if (!row.displayName) errors.push(`Row ${row.rowNumber}: displayName is required.`);
        if (!row.className) errors.push(`Row ${row.rowNumber}: className is required.`);
        else if (!supportedClasses.includes(row.className)) errors.push(`Row ${row.rowNumber}: unsupported class ${row.className}.`);
        if (codeRows.has(row.accountCode)) errors.push(`Rows ${codeRows.get(row.accountCode)} and ${row.rowNumber}: duplicate account code ${row.accountCode}.`);
        else codeRows.set(row.accountCode, row.rowNumber);
        const displayKey = `${row.className}:${row.displayName.toLocaleLowerCase()}`;
        if (displayRows.has(displayKey)) errors.push(`Rows ${displayRows.get(displayKey)} and ${row.rowNumber}: duplicate display name within ${row.className}.`);
        else displayRows.set(displayKey, row.rowNumber);
    }
    return errors;
}

export function classTotals(rows) {
    return rows.reduce((totals, row) => ({ ...totals, [row.className]: (totals[row.className] || 0) + 1 }), {});
}

export function generateTemporaryPassword(length = 16) {
    if (!Number.isInteger(length) || length < 12) throw new Error("Temporary passwords must contain at least 12 characters.");
    return PASSWORD_LETTERS[randomInt(PASSWORD_LETTERS.length)] + Array.from({ length: length - 1 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

function expectedProfile(row, teacherUid, classId) {
    return { accountCode: row.accountCode, displayName: row.displayName, role: "student", active: true, classId, teacherUid };
}

function identityErrors(row, authUser, profiles, profile) {
    const errors = [];
    if (authUser && String(authUser.email || "").toLowerCase() !== accountCodeToAlias(row.accountCode)) errors.push(`${row.accountCode}: Authentication alias mismatch.`);
    if (profiles.length > 1) errors.push(`${row.accountCode}: multiple Firestore profiles use this account code.`);
    if (profiles.length === 1 && (!authUser || profiles[0].uid !== authUser.uid)) errors.push(`${row.accountCode}: Firestore profile UID does not match Authentication UID.`);
    if (profile && profile.role !== "student") errors.push(`${row.accountCode}: existing profile role is not student.`);
    if (profile && normalizeAccountCode(profile.accountCode) !== row.accountCode) errors.push(`${row.accountCode}: existing profile accountCode does not match.`);
    return errors;
}

export function filterRoster(rows, options = {}) {
    let filtered = rows;
    if (options.account) filtered = filtered.filter(row => row.accountCode === normalizeAccountCode(options.account));
    if (options.className) filtered = filtered.filter(row => row.className === String(options.className).trim().toUpperCase());
    if (!filtered.length) throw new Error("The selected account/class filter matched no roster rows.");
    return filtered;
}

export async function buildProvisioningPlan({ rows, adapter, teacherCode, supportedClasses = SUPPORTED_CLASSES, filters = {} }) {
    if (!teacherCode) return { errors: ["A teacher account code is required."], rows: [], classes: {}, counts: {} };
    const structuralErrors = validateRoster(rows, supportedClasses);
    if (structuralErrors.length) return { errors: structuralErrors, rows: [], classes: {}, counts: {} };

    const teachers = await adapter.findProfilesByAccountCode(normalizeAccountCode(teacherCode));
    const errors = [];
    if (teachers.length !== 1) errors.push(`Expected exactly one teacher profile for ${normalizeAccountCode(teacherCode)}; found ${teachers.length}.`);
    const teacher = teachers.length === 1 ? teachers[0] : null;
    if (teacher && (teacher.data.role !== "teacher" || teacher.data.active !== true)) errors.push(`${normalizeAccountCode(teacherCode)} is not an active teacher profile.`);

    const classes = {};
    if (teacher) {
        for (const className of supportedClasses) {
            const matches = await adapter.findActiveClasses(teacher.uid, className);
            if (matches.length !== 1) errors.push(`Expected exactly one active ${className} class owned by ${teacher.uid}; found ${matches.length}.`);
            else classes[className] = matches[0];
        }
    }
    if (errors.length) return { errors, rows: [], teacher, classes, counts: {} };

    const selectedRows = filterRoster(rows, filters);
    const planned = [];
    for (const row of selectedRows) {
        const alias = accountCodeToAlias(row.accountCode);
        const authUser = await adapter.findAuthUserByEmail(alias);
        const matchingProfiles = await adapter.findProfilesByAccountCode(row.accountCode);
        const profile = authUser ? await adapter.getProfile(authUser.uid) : null;
        const rowErrors = identityErrors(row, authUser, matchingProfiles, profile);
        if (row.existing && !authUser) rowErrors.push(`${row.accountCode}: CSV marks account existing, but no Authentication user was found.`);
        if (!authUser && matchingProfiles.length) rowErrors.push(`${row.accountCode}: Firestore profile exists without the expected Authentication user.`);
        let action = "CREATE";
        if (authUser && !profile) action = "REPAIR";
        else if (authUser && profile) {
            const expected = expectedProfile(row, teacher.uid, classes[row.className].id);
            action = Object.entries(expected).some(([key, value]) => profile[key] !== value) ? "UPDATE" : "UNCHANGED";
        }
        planned.push({ row, alias, authUser, profile, action, expectedProfile: expectedProfile(row, teacher.uid, classes[row.className].id), errors: rowErrors });
        errors.push(...rowErrors);
    }
    const counts = {
        total: planned.length,
        create: planned.filter(item => item.action === "CREATE").length,
        existing: planned.filter(item => item.action !== "CREATE").length,
        profileChecks: planned.length,
        byClass: classTotals(selectedRows)
    };
    return { errors, rows: planned, teacher, classes, counts };
}

export async function applyProvisioningPlan(plan, adapter, options = {}) {
    if (plan.errors.length) throw new Error("Provisioning plan contains errors; zero writes performed.");
    if (!options.apply) return { dryRun: true, writes: 0, credentials: [], results: [] };
    const generatedPasswords = new Set(), credentials = [], results = [];
    for (const item of plan.rows) {
        let authUser = item.authUser, password = "", profileWritten = false;
        try {
            if (!authUser) {
                do { password = generateTemporaryPassword(); } while (generatedPasswords.has(password));
                generatedPasswords.add(password);
                authUser = await adapter.createAuthUser({ email: item.alias, password, displayName: item.row.displayName });
            }
            await adapter.setProfile(authUser.uid, item.expectedProfile);
            profileWritten = true;
            const status = item.action === "CREATE" ? "NEW ACCOUNT" : EXISTING_PASSWORD_STATUS;
            credentials.push({ className: item.row.className, displayName: item.row.displayName, username: item.row.issuedAccountCode, temporaryPassword: item.action === "CREATE" ? password : "", status });
            results.push({ accountCode: item.row.accountCode, uid: authUser.uid, action: item.action, status: item.action === "UNCHANGED" ? "UNCHANGED" : item.action });
        } catch (error) {
            if (authUser && item.action === "CREATE" && !profileWritten) credentials.push({ className: item.row.className, displayName: item.row.displayName, username: item.row.issuedAccountCode, temporaryPassword: password, status: "PROFILE REPAIR REQUIRED" });
            results.push({ accountCode: item.row.accountCode, uid: authUser && authUser.uid, action: item.action, status: "ERROR", error: error.message });
        }
    }
    return { dryRun: false, writes: results.filter(item => item.status !== "ERROR").length, credentials, results };
}

function csvCell(value) {
    const raw = String(value ?? "");
    const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function credentialsCsv(credentials) {
    const rows = [["Class", "Display Name", "Username", "Temporary Password", "Status"], ...credentials.map(item => [item.className, item.displayName, item.username, item.temporaryPassword, item.status])];
    return rows.map(row => row.map(csvCell).join(",")).join("\n") + "\n";
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function credentialsHtml(credentials) {
    const classes = [...new Set(credentials.map(item => item.className))].sort();
    const sections = classes.map(className => `<section><h2>${escapeHtml(className)}</h2><table><thead><tr><th>Display Name</th><th>Username</th><th>Temporary Password</th><th>Status</th></tr></thead><tbody>${credentials.filter(item => item.className === className).map(item => `<tr><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.temporaryPassword)}</td><td>${escapeHtml(item.status)}</td></tr>`).join("")}</tbody></table></section>`).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Deborah student credentials</title><style>body{font:12pt system-ui;margin:24px;color:#172b3f}section{break-after:page}section:last-child{break-after:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #9aa7b0;padding:8px;text-align:left}h1,h2{color:#172b3f}</style></head><body><h1>Deborah student credentials</h1>${sections}</body></html>`;
}
