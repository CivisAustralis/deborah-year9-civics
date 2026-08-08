#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyProvisioningPlan, buildProvisioningPlan, credentialsCsv, credentialsHtml, filterRoster, parseRosterCsv, SUPPORTED_CLASSES, validateRoster } from "./lib/provisioning-core.mjs";

const adminDirectory = path.dirname(fileURLToPath(import.meta.url));
function usage() {
    return `Usage: node provision-students.mjs --roster private/students-2026.csv [options]\n\nOptions:\n  --apply                 Make Firebase changes (default is dry run)\n  --account SCODE         Restrict to one account\n  --class 9A              Restrict to one class\n  --teacher TACCOUNT01      Teacher account code (required)\n  --project PROJECT_ID    Firebase project (default deborah-year9-civics)\n  --help                  Show this help\n`;
}
function parseArguments(args) {
    const options = { apply: false, project: "deborah-year9-civics" };
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === "--apply") options.apply = true;
        else if (argument === "--help") options.help = true;
        else if (["--roster", "--account", "--class", "--teacher", "--project"].includes(argument)) {
            if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${argument} requires a value.`);
            options[argument.slice(2)] = args[++index];
        } else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!options.help && !options.roster) throw new Error("--roster is required.");
    if (!options.help && !options.teacher) throw new Error("--teacher is required.");
    return options;
}
function printPlan(plan, apply) {
    console.log(`\nMode: ${apply ? "APPLY" : "DRY RUN — NO WRITES"}`);
    console.log(`Teacher resolved: ${plan.teacher.data.accountCode} (${plan.teacher.uid})`);
    console.log("Classes:");
    for (const className of SUPPORTED_CLASSES) console.log(`  ${className} -> ${plan.classes[className].id}`);
    console.log("Planned:");
    console.log(`  ${plan.counts.create} Authentication account(s) to create`);
    console.log(`  ${plan.counts.existing} existing Authentication account(s) to preserve/update`);
    console.log(`  ${plan.counts.profileChecks} Firestore profile(s) to verify/update`);
    for (const className of SUPPORTED_CLASSES) console.log(`  ${plan.counts.byClass[className] || 0} student(s) -> ${className}`);
    for (const item of plan.rows) console.log(`  ${item.action.padEnd(9)} ${item.row.accountCode} | ${item.row.displayName} | ${item.row.className}${item.authUser ? ` | ${item.authUser.uid}` : ""}`);
}
async function writeCredentialFiles(credentials) {
    const outputDirectory = path.join(adminDirectory, "output");
    await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    await chmod(outputDirectory, 0o700);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const csvPath = path.join(outputDirectory, `student-credentials-${stamp}.csv`);
    const htmlPath = path.join(outputDirectory, `student-credentials-${stamp}.html`);
    await writeFile(csvPath, credentialsCsv(credentials), { encoding: "utf8", mode: 0o600 });
    await writeFile(htmlPath, credentialsHtml(credentials), { encoding: "utf8", mode: 0o600 });
    console.log(`Private credential files written inside: ${outputDirectory}`);
    console.log(`  ${path.basename(csvPath)}`);
    console.log(`  ${path.basename(htmlPath)}`);
}
async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) { console.log(usage()); return; }
    if (options.project !== "deborah-year9-civics") throw new Error("Refusing to run: --project must be deborah-year9-civics for this repository.");
    const rosterPath = path.resolve(adminDirectory, options.roster);
    const rows = parseRosterCsv(await readFile(rosterPath, "utf8"));
    const structuralErrors = validateRoster(rows);
    if (structuralErrors.length) throw new Error(`Roster validation failed before Firebase access:\n- ${structuralErrors.join("\n- ")}`);
    filterRoster(rows, { account: options.account, className: options.class });

    const { createFirebaseAdminAdapter } = await import("./lib/firebase-admin-adapter.mjs");
    const adapter = createFirebaseAdminAdapter({ projectId: options.project });
    const plan = await buildProvisioningPlan({ rows, adapter, teacherCode: options.teacher, filters: { account: options.account, className: options.class } });
    if (plan.errors.length) throw new Error(`Preflight failed; zero writes performed:\n- ${plan.errors.join("\n- ")}`);
    printPlan(plan, options.apply);
    if (!options.apply) { console.log("\nDry run complete. Run again with --apply only after reviewing every line."); return; }

    const confirmation = process.env.DEBORAH_PROVISION_CONFIRM;
    if (confirmation !== "APPLY") throw new Error("Apply mode also requires DEBORAH_PROVISION_CONFIRM=APPLY to reduce accidental writes.");
    const outcome = await applyProvisioningPlan(plan, adapter, { apply: true });
    for (const result of outcome.results) console.log(`${result.status.padEnd(9)} ${result.accountCode}${result.uid ? ` | ${result.uid}` : ""}${result.error ? ` | ${result.error}` : ""}`);
    if (outcome.credentials.length) await writeCredentialFiles(outcome.credentials);
    const failures = outcome.results.filter(result => result.status === "ERROR");
    if (failures.length) throw new Error(`${failures.length} account(s) require recovery. Rerun after correcting the reported problem; created Authentication users were not deleted.`);
    console.log(`Provisioning complete: ${outcome.results.length} account(s) processed. Passwords were written only to private credential files.`);
}

main().catch(error => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
});
