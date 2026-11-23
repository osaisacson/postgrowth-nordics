/**
 * Sheet setup for the sheet-powered network site.
 *
 * What it does (it never deletes or changes any entries):
 *  - Adds a "Lists" tab with the shared Topics and Countries, filled from what's already in the sheet.
 *  - Adds dropdowns that pick from earlier entries:
 *      People  → Topics (from Lists), Country (from Lists), Affiliations (from the Nodes tab)
 *      Library → Topics (from Lists), Connections to PGN (from the People tab)
 *      Nodes   → Country (from Lists)
 *    New values are still allowed: type them straight into the cell.
 *  - Keeps the shared lists growing by themselves: a new topic typed into any Topics column, or a
 *    new country into any Country column, is added to the Lists tab, so it shows up in every
 *    Topics/Country dropdown from then on. A new organisation typed into a person's Affiliations
 *    is added to the Nodes tab (with the person's country), so it gets its own page and link.
 *  - Checks that Url columns hold a web address and Email holds an email address.
 *  - Adds a hint to every column header (hover the header to see it) and to the cells below it.
 *  - Freezes the instruction and header rows so they stay visible.
 *  - Fills in the "Sheet modified" column with the date and time whenever a row changes, and
 *    protects that column so only the sheet owner (and this script) can change it.
 *
 * How to run it:
 *  1. In the Google Sheet: Extensions → Apps Script.
 *  2. Delete what's in the editor, paste this whole file, and press Save.
 *  3. Pick "setUpSheet" in the function menu at the top and press Run.
 *     Google asks you to allow the script to edit this spreadsheet the first time.
 *  You can run it again whenever you add a column or change a hint; it replaces its own rules
 *  and never adds the automatic list-growing twice.
 *
 *  The list-growing runs as an "installable trigger", so it works for everyone who edits the
 *  sheet, including people who aren't signed in. You can see or remove it under Triggers (the
 *  clock icon) in the Apps Script editor.
 */

const HEADER_ROW = 2;      // row with the column names
const FIRST_DATA_ROW = 3;  // first row with entries
const LISTS_TAB = "Lists";
const STAMP_COLUMN = "Sheet modified"; // set by the script on every edit; protected
const STAMP_FORMAT = "yyyy-mm-dd hh:mm";
const STAMP_HINT = "Filled in automatically when the row changes. Only the script can edit it.";

const DEFAULT_COUNTRIES = ["Denmark", "Faroe Islands", "Finland", "Greenland", "Iceland", "Norway", "Sweden", "Åland", "Other"];

const MULTI = "Pick one or more. To add several, pick again or separate with commas.";

// Column rules per tab. Column names must match the header row.
//   list:  [tab, column]  dropdown that picks from that column's values
//   url / email: format check (entries in the wrong format are rejected)
//   hint:  text shown when hovering the header and when selecting a cell
// Columns that feed a shared list. When someone types a new value into one of these,
// it is added to the list so every dropdown that uses the list offers it from then on.
//   to: [tab, column] the list it is added to
//   copy: other columns copied onto the new row, as { fromColumn: toColumn }
const GROW = [
  { tab: "People", column: "Topics", to: [LISTS_TAB, "Topics"] },
  { tab: "Library", column: "Topics", to: [LISTS_TAB, "Topics"] },
  { tab: "People", column: "Country", to: [LISTS_TAB, "Countries"] },
  { tab: "Nodes", column: "Country", to: [LISTS_TAB, "Countries"] },
  { tab: "People", column: "Affiliations", to: ["Nodes", "Name"], copy: { "Country": "Country" } },
];

const RULES = {
  People: {
    "Name": { hint: "Full name, as you want it shown. Readings in the Library link to people by this name." },
    "Affiliations": { list: ["Nodes", "Name"], hint: "Your organisation. Pick it from the list, or type a new one and it is added to the Nodes tab. " + MULTI },
    "Description": { hint: "One or two sentences about your work." },
    "Topics": { list: [LISTS_TAB, "Topics"], hint: "What you work on. " + MULTI + " Missing a topic? Just type it; it is added to the shared list for everyone." },
    "Email": { email: true, hint: "Your email address. It is shown on the website so people can contact you." },
    "Links": { hint: "Full web addresses starting with https:// (website, LinkedIn, ORCID…). Separate several with commas." },
    "Country": { list: [LISTS_TAB, "Countries"], hint: "The country you're based in. Pick one, or type a new one." },
  },
  Library: {
    "Reference": { hint: "Short reference: Author et al., Year. For example: Kallis et al., 2025" },
    "Title": { hint: "Full title of the publication." },
    "Citation": { hint: "Full citation, APA style, ideally with the DOI." },
    "Url": { url: true, hint: "Link to the publication, starting with https://" },
    "Topics": { list: [LISTS_TAB, "Topics"], hint: "What the reading is about. " + MULTI + " Missing a topic? Just type it; it is added to the shared list for everyone." },
    "Connections to PGN (eg member authors)": { list: ["People", "Name"], hint: "Network members connected to this reading, e.g. authors. Pick names from the People tab so they get linked. " + MULTI },
    "Comments": { hint: "Anything else worth knowing about this reading." },
  },
  Nodes: {
    "Name": { hint: "Name of the organisation, group or institution. People link to it by this name in their Affiliations." },
    "Url": { url: true, hint: "Website, starting with https://" },
    "Country": { list: [LISTS_TAB, "Countries"], hint: "Where it's based." },
    "Description": { hint: "A short description. Shown on the node's own page." },
  },
};

function setUpSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setUpLists_(ss);
  for (const tabName of Object.keys(RULES)) {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) { Logger.log("Skipped missing tab: " + tabName); continue; }
    sheet.setFrozenRows(HEADER_ROW);
    sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).setFontWeight("bold");
    const headers = headerMap_(sheet);
    const rows = Math.max(1, sheet.getMaxRows() - FIRST_DATA_ROW + 1);
    for (const [col, rule] of Object.entries(RULES[tabName])) {
      const c = headers[norm_(col)];
      if (!c) { Logger.log(`Skipped missing column "${col}" in ${tabName}`); continue; }
      const cells = sheet.getRange(FIRST_DATA_ROW, c, rows, 1);
      sheet.getRange(HEADER_ROW, c).setNote(rule.hint || "");
      let v = null;
      if (rule.list) {
        const src = ss.getSheetByName(rule.list[0]);
        const srcCol = src && headerMap_(src)[norm_(rule.list[1])];
        if (!srcCol) { Logger.log(`No source column ${rule.list.join(" → ")}`); continue; }
        const srcRange = src.getRange(FIRST_DATA_ROW, srcCol, Math.max(1, src.getMaxRows() - FIRST_DATA_ROW + 1), 1);
        v = SpreadsheetApp.newDataValidation().requireValueInRange(srcRange, true).setAllowInvalid(true);
      } else if (rule.url) {
        v = SpreadsheetApp.newDataValidation().requireTextIsUrl().setAllowInvalid(false);
      } else if (rule.email) {
        v = SpreadsheetApp.newDataValidation().requireTextIsEmail().setAllowInvalid(false);
      }
      if (v) cells.setDataValidation(v.setHelpText(rule.hint || "").build());
    }
    setUpStampColumn_(sheet, headers[norm_(STAMP_COLUMN)]);
  }
  installGrowTrigger_(ss);
  const done = "Done. One last manual step for the columns where people pick several values " +
    "(People: Topics and Affiliations; Library: Topics and Connections to PGN): select the column, " +
    "open Data → Data validation, click the rule, set Advanced options → Display style to Chip, tick \"Allow multiple selections\", and press Done.";
  Logger.log(done);
  try { SpreadsheetApp.getUi().alert(done); } catch (err) { /* run from the editor: the log has it */ }
}

// Creates or tops up the Lists tab with every topic and country already used in the sheet.
function setUpLists_(ss) {
  let lists = ss.getSheetByName(LISTS_TAB);
  if (!lists) {
    lists = ss.insertSheet(LISTS_TAB);
    lists.getRange(1, 1).setValue("Shared values for the dropdowns. Add a new topic or country at the bottom of its column.");
    lists.getRange(HEADER_ROW, 1, 1, 2).setValues([["Topics", "Countries"]]).setFontWeight("bold");
    lists.setFrozenRows(HEADER_ROW);
  }
  const h = headerMap_(lists);
  const topics = new Set();
  for (const [tab, col] of [["People", "Topics"], ["Library", "Topics"]]) collect_(ss, tab, col, topics);
  const countries = new Set(DEFAULT_COUNTRIES);
  for (const [tab, col] of [["People", "Country"], ["Nodes", "Country"]]) collect_(ss, tab, col, countries);
  topUp_(lists, h["topics"], topics);
  topUp_(lists, h["countries"], countries);
}

function collect_(ss, tab, col, into) {
  const sheet = ss.getSheetByName(tab);
  if (!sheet || sheet.getLastRow() < FIRST_DATA_ROW) return;
  const c = headerMap_(sheet)[norm_(col)];
  if (!c) return;
  sheet.getRange(FIRST_DATA_ROW, c, sheet.getLastRow() - FIRST_DATA_ROW + 1, 1).getValues()
    .forEach(([v]) => String(v).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).forEach((s) => into.add(s)));
}

function topUp_(sheet, col, values) {
  if (!col) return;
  const last = sheet.getLastRow();
  const existing = last >= FIRST_DATA_ROW
    ? sheet.getRange(FIRST_DATA_ROW, col, last - FIRST_DATA_ROW + 1, 1).getValues().map(([v]) => String(v).trim()).filter(Boolean)
    : [];
  const have = new Set(existing.map(norm_));
  const add = [...values].filter((v) => !have.has(norm_(v))).sort((a, b) => a.localeCompare(b));
  if (!add.length) return;
  const start = FIRST_DATA_ROW + existing.length;
  sheet.getRange(start, col, add.length, 1).setValues(add.map((v) => [v]));
}

function headerMap_(sheet) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  const names = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const map = {};
  names.forEach((n, i) => { const k = norm_(n); if (k && !map[k]) map[k] = i + 1; });
  return map;
}

function norm_(s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); }

// ---------- the "Sheet modified" column ----------

const STAMP_PROTECTION = "Sheet modified: filled in by the sheet script";

// Hint, date format, and a protection that leaves only the owner (and so the script) as editor.
function setUpStampColumn_(sheet, c) {
  if (!c) { Logger.log(`No "${STAMP_COLUMN}" column in ${sheet.getName()}`); return; }
  sheet.getRange(HEADER_ROW, c).setNote(STAMP_HINT);
  sheet.getRange(FIRST_DATA_ROW, c, Math.max(1, sheet.getMaxRows() - FIRST_DATA_ROW + 1), 1)
    .clearDataValidations().setNumberFormat(STAMP_FORMAT).setFontColor("#8a8a8a");
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((p) => p.getDescription() === STAMP_PROTECTION).forEach((p) => p.remove());
  const p = sheet.getRange(1, c, sheet.getMaxRows(), 1).protect().setDescription(STAMP_PROTECTION);
  p.addEditor(Session.getEffectiveUser());
  p.removeEditors(p.getEditors());
  if (p.canDomainEdit()) p.setDomainEdit(false);
}

// Writes the current date and time into the edited rows (or clears it if the row is now empty).
function stampRows_(e) {
  const sheet = e.range.getSheet();
  if (!RULES[sheet.getName()]) return;
  const c = headerMap_(sheet)[norm_(STAMP_COLUMN)];
  if (!c) return;
  if (e.range.getColumn() === c && e.range.getLastColumn() === c) return; // only the stamp itself changed
  const top = Math.max(FIRST_DATA_ROW, e.range.getRow());
  const n = e.range.getLastRow() - top + 1;
  if (n < 1) return;
  const lastCol = sheet.getLastColumn();
  const now = new Date();
  const rows = sheet.getRange(top, 1, n, lastCol).getValues();
  const stamps = rows.map((r) => [r.some((v, i) => i + 1 !== c && String(v).trim() !== "") ? now : ""]);
  sheet.getRange(top, c, n, 1).setValues(stamps).setNumberFormat(STAMP_FORMAT);
}

// ---------- keeping the shared lists growing ----------

function installGrowTrigger_(ss) {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "growLists");
  if (!exists) ScriptApp.newTrigger("growLists").forSpreadsheet(ss).onEdit().create();
}

// Runs after every edit (as the sheet owner, so it can write the protected column).
// Stamps "Sheet modified" and adds new values from the GROW columns to their lists.
function growLists(e) {
  if (!e || !e.range) return;
  try { stampRows_(e); } catch (err) { Logger.log(err); }
  const sheet = e.range.getSheet();
  const rules = GROW.filter((g) => g.tab === sheet.getName());
  if (!rules.length || e.range.getLastRow() < FIRST_DATA_ROW) return;
  const headers = headerMap_(sheet);
  const ss = sheet.getParent();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;
  try {
    for (const g of rules) {
      const c = headers[norm_(g.column)];
      if (!c || c < e.range.getColumn() || c > e.range.getLastColumn()) continue;
      const top = Math.max(FIRST_DATA_ROW, e.range.getRow());
      const n = e.range.getLastRow() - top + 1;
      const target = ss.getSheetByName(g.to[0]);
      const tCol = target && headerMap_(target)[norm_(g.to[1])];
      if (!tCol || n < 1) continue;
      const values = sheet.getRange(top, c, n, 1).getValues();
      const copyCols = Object.entries(g.copy || {}).map(([from, to]) => [headers[norm_(from)], headerMap_(target)[norm_(to)]]).filter(([a, b]) => a && b);
      const copyVals = copyCols.map(([from]) => sheet.getRange(top, from, n, 1).getValues());
      values.forEach(([cell], i) => {
        const extras = copyCols.map(([, to], k) => [to, copyVals[k][i][0]]);
        String(cell).split(/[,;\n]/).map((v) => v.trim()).filter(Boolean)
          .forEach((v) => addToList_(target, tCol, v, extras));
      });
      if (target.getName() === LISTS_TAB) sortListColumn_(target, tCol);
    }
  } finally {
    lock.releaseLock();
  }
}

function addToList_(sheet, col, value, extras) {
  const last = sheet.getLastRow();
  const existing = last >= FIRST_DATA_ROW ? sheet.getRange(FIRST_DATA_ROW, col, last - FIRST_DATA_ROW + 1, 1).getValues() : [];
  if (existing.some(([v]) => norm_(v) === norm_(value))) return;
  let row = FIRST_DATA_ROW;
  while (row - FIRST_DATA_ROW < existing.length && String(existing[row - FIRST_DATA_ROW][0]).trim()) row++;
  sheet.getRange(row, col).setValue(value);
  for (const [c, v] of extras || []) if (v !== "" && !sheet.getRange(row, c).getValue()) sheet.getRange(row, c).setValue(v);
}

function sortListColumn_(sheet, col) {
  const last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;
  const range = sheet.getRange(FIRST_DATA_ROW, col, last - FIRST_DATA_ROW + 1, 1);
  const vals = range.getValues().map(([v]) => String(v).trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  range.clearContent();
  if (vals.length) sheet.getRange(FIRST_DATA_ROW, col, vals.length, 1).setValues(vals.map((v) => [v]));
}
