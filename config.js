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
  tagline: "The Nordic Network for Postgrowth Research",

  // The long ID in the sheet's URL: docs.google.com/spreadsheets/d/<THIS PART>/edit
  sheetId: "1EwwjCkRdt2_nlANZE8w-XMKT0FVkQz_VPKJEVKkPELI",

  // The About page (the front page). Plain HTML is allowed here, because this file is
  // not editable by the public. Every <h2>, <h3> and <h4> appears in the "On this page" list.
  intro: `
    <h2>The Nordic Network for Postgrowth Research</h2>

    <h3>Mission Statement</h3>
    <p>The Nordic Network for Postgrowth Research is a collaboration platform for people interested in
    postgrowth- and degrowth-related research, with focus on the Nordic countries. Its members envision a
    future where economic research and practices serve well-being for all within environmental limits.
    Anyone interested can freely join the network by subscribing to its mailing list.</p>
    <p>The main purpose of the network is to facilitate research that addresses challenges and opportunities
    for postgrowth and degrowth futures in the Nordic countries. This includes Iceland, Finland, Sweden,
    Denmark, and Norway. These countries share important political, economic, and sociocultural similarities
    that makes regional collaboration especially relevant.</p>
    <p>In these countries, postgrowth and degrowth research has limited outreach outside of academia so far,
    although recent developments indicate increasing interest. Therefore, the second purpose of the network
    is to support dialogue between the academic and non-academic world on postgrowth and degrowth futures.
    It also supports stronger connections between academic theories and real-world practices.</p>
    <p>The network facilitates:</p>
    <ul>
      <li>exchange on relevant issues in science and policy</li>
      <li>the development of a coordinated research agenda and understanding of terminology</li>
      <li>research collaborations</li>
      <li>public advocacy for postgrowth and degrowth research</li>
    </ul>

    <h3>Structure of the network</h3>
    <p>The network is organised around principles of decentralised organisation. Any member can freely
    communicate with the rest of the network through a common mailing list. Activities are carried out in
    self-organised working groups. A coordination group maintains the functional run of the network. It exists
    mostly as a digital platform, but it also facilitates physical gatherings. Activities are carried out by
    members on a voluntary basis. Its bureaucratic structure is kept to a minimum to ensure that efforts are
    spent on content-related activities rather than administrative tasks.</p>

    <h4>Mailing list</h4>
    <p>Any person interested can join the network by subscribing, and leave the network by unsubscribing,
    to the network mailing list at the following link:</p>
    <p><a href="https://gaggle.email/join/postgrowth.nordics@gaggle.email" target="_blank" rel="noopener">https://gaggle.email/join/postgrowth.nordics@gaggle.email</a></p>
    <p>The mailing list can be used by anyone who has subscribed to it for sharing messages with the other
    members of the list. Contributions must conform to the mission statement of the network, including its
    code of conduct, and should be related to postgrowth and degrowth research in the context of the Nordic
    countries. Typical elements shared by members may include: events (academic and non-academic),
    publications, research collaborations, general discussions, job opportunities. To ensure that the email
    list stays an exclusive and edifying channel for our mission, members using the list should always
    consider whether their message is of (potential) relevance for all network members. To facilitate this,
    members make sure to use informative email subjects (including when forwarding messages), and to stay on
    topic when replying to a message.</p>

    <h4>Working groups</h4>
    <p>Working groups can be constituted by members who wish to collaborate on a specific topic and/or
    activity. Working groups are freely created and dissolved by notifying the coordination group. Each
    working group has a reference person.</p>

    <h4>Coordination group</h4>
    <p>The coordination group is composed of five to seven members who are elected every year. As much as
    possible, the composition of the coordination group should reflect the diversity among members (gender,
    country of origin, disciplinary background, etc.). It is responsible for:</p>
    <ul>
      <li>the functional management of the network</li>
      <li>managing the communication tools (email account, email list) and a contact directory</li>
      <li>keeping track of activities of the network</li>
      <li>supporting the evolution of the network and its activities.</li>
    </ul>
    <p>A first &ldquo;interim&rdquo; coordination group was appointed on the 23/02/2023 for 1 year. It is
    composed of: Elisabeth Veivåg Helseth (Norway), Lina Isacs (Sweden), Satu Helenius (Finland), Thomas
    Røkås (Norway), and Lukas Godé (Norway). The interim coordination group has a particular mandate focused
    on the functional establishment of the network. The coordination group can be reached at the following
    e-mail address: <a href="mailto:postgrowth.nordics@gmail.com">postgrowth.nordics@gmail.com</a>.</p>

    <h3>Code of conduct</h3>
    <p>Activities carried out and positions taken by individuals or groups of members remain under their own
    responsibility. All initiatives that have an explicit connection to the network must stay in line with
    the mission statement. Language and positions that are racist, homophobic, sexist, disablist,
    discriminating or offensive in any way are not tolerated. The coordination group can exclude any member
    who does not respect the code of conduct.</p>
  `,

  // Footer text (HTML allowed).
  footer: `Content is community-maintained in an <a href="{sheetUrl}">open Google Sheet</a>.`,

  // Shared "hub" values that link entries together, like tags in Obsidian.
  // Every distinct value becomes its own page (e.g. #/topic/energy) and a dot in the graph.
  hubs: {
    topic: { label: "Topics", color: "#8a8f98" },
    country: { label: "Countries", color: "#b07cc6" },
  },

  sections: [
    {
      id: "library",
      label: "Library",
      tab: "Library",
      gid: "486577674",
      headerRow: 2,
      color: "#4f7cc9",
      description: "Readings the network recommends.",
      addLabel: "Suggest a reading",
      layout: "list",
      fields: {
        title: "Title",
        url: "Url",
        subtitle: "Reference",
        body: "Citation",
        note: "Comments",
      },
      // Relationship columns. Values can be several, separated by commas.
      //   hub:     links entries that share a value (topics, countries)
      //   section: links to an entry in another tab whose title matches the value
      relations: [
        { column: "Topics", hub: "topic" },
        { column: "Connections to PGN (eg member authors)", section: "people", label: "Network members" },
      ],
      filterBy: "Topics",
    },
    {
      id: "nodes",
      label: "Nodes",
      tab: "Nodes",
      gid: "1999306781",
      headerRow: 2,
      color: "#d0873f",
      description: "Organisations, groups and institutions that are part of the network.",
      addLabel: "Suggest a node",
      layout: "cards",
      fields: {
        title: "Name",
        url: "Url",
        body: "Comments",
      },
      relations: [
        { column: "Country", hub: "country" },
      ],
      filterBy: "Country",
    },
    {
      id: "people",
      label: "People",
      tab: "People",           // tab name in the sheet
      gid: "1031118613",       // the number after #gid= when that tab is open (used for the "Add" links)
      headerRow: 2,            // the row that holds the column names
      // approvedColumn: "Approved", // optional: only show rows where this checkbox column is ticked
      color: "#3f8f6f",        // colour of these entries in the graph
      description: "People in the network and what they work on.",
      addLabel: "Add yourself",
      layout: "cards",
      fields: {
        title: "Name",
        body: "Description",
        links: "Links",
      },
      relations: [
        { column: "Affiliations", section: "nodes", label: "Affiliations" },
        { column: "Topics", hub: "topic" },
        { column: "Country", hub: "country" },
      ],
      filterBy: "Topics",
    },
  ],
};
