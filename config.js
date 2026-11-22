/*
 * Site configuration. This is the only file you need to edit to run your own copy.
 *
 * The Google Sheet must be shared as "Anyone with the link can view".
 * Each entry in `sections` is one page on the site and reads one tab of the sheet.
 * Column names below must match the header row of that tab exactly (case-insensitive).
 * Columns you don't list are ignored, so helper columns in the sheet never show up.
 */
window.SITE_CONFIG = {
  title: "Post-growth Nordics",
  tagline: "A network for post-growth research and practice in the Nordic countries",

  // The long ID in the sheet's URL: docs.google.com/spreadsheets/d/<THIS PART>/edit
  sheetId: "1EwwjCkRdt2_nlANZE8w-XMKT0FVkQz_VPKJEVKkPELI",

  // Text on the front page. Plain HTML is allowed here (this file is not editable by the public).
  intro: `
    <p>Post-growth Nordics connects researchers, practitioners and organisations across the
    Nordic countries who work on economies that put wellbeing within planetary boundaries
    ahead of growth.</p>
    <p>Everything on this site comes from an open, shared spreadsheet. Anyone can add
    themselves, a reading or an organisation, and new entries appear here once they are approved.</p>
  `,

  // Footer text (HTML allowed).
  footer: `Content is community-maintained in an <a href="{sheetUrl}">open Google Sheet</a>.`,

  sections: [
    {
      id: "people",
      label: "People",
      tab: "People",           // tab name in the sheet
      gid: "1031118613",       // the number after #gid= when that tab is open (used for the "Add" link)
      headerRow: 2,            // the row that holds the column names
      approvedColumn: "Approved", // only rows with this box ticked are shown; remove the line to show all rows
      description: "People in the network and what they work on.",
      addLabel: "Add yourself",
      layout: "cards",
      fields: {
        title: "Name",
        subtitle: "Affiliations",
        body: "Description",
        tags: "Topics",
        meta: ["Country"],
        links: "Links",
      },
      filterBy: "Topics",
    },
    {
      id: "library",
      label: "Library",
      tab: "Library",
      gid: "486577674",
      headerRow: 2,
      approvedColumn: "Approved",
      description: "Readings the network recommends.",
      addLabel: "Suggest a reading",
      layout: "list",
      fields: {
        title: "Title",
        url: "Url",
        subtitle: "Reference",
        body: "Citation",
        note: "Connections to PGS (eg member authors)",
        tags: "Concerned topics",
      },
      filterBy: "Concerned topics",
    },
    {
      id: "nodes",
      label: "Nodes",
      tab: "Nodes",
      gid: "1999306781",
      headerRow: 2,
      approvedColumn: "Approved",
      description: "Organisations, groups and institutions that are part of the network.",
      addLabel: "Suggest a node",
      layout: "cards",
      fields: {
        title: "Name",
        url: "Url",
        body: "Comments",
      },
    },
    {
      id: "questions",
      label: "Questions",
      tab: "Questions/Suggestions",
      gid: "931020946",
      headerRow: 2,
      description: "Open questions and suggestions for the network.",
      addLabel: "Ask or suggest something",
      emptyText: "No questions yet. Be the first to ask one.",
      layout: "list",
      fields: {
        title: "Question/Suggestion",
        meta: ["By", "Added on"],
        answer: "Answer",
        answerBy: "Answered by",
      },
    },
  ],
};
