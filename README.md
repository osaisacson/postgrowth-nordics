# Sheet-powered network site

A tiny, free website for a network or community, where **all the content lives in a Google Sheet**.
People add themselves, readings or organisations by typing into the sheet, and the site shows the
new rows the next time someone opens it. There is no server, no database, no build step and no account to manage.

Built for [Post-growth Nordics](https://postgrowthnordics.org), and made to be copied by any other network.

## How it works

- Each **tab** in the Google Sheet is one **page** on the site (People, Library, Nodes…).
- **Relationship columns** link entries together, Obsidian style: shared topics and countries,
  people's affiliations to Nodes, and readings to the members connected to them. Every entry has its
  own page with its links and backlinks, and every topic and country gets a page too.
- A **graph** in the right-hand column starts from the network itself (the About page) with the countries
  around it. Clicking a dot opens it and drills down one level: country → nodes → people → topics → people.
  The drill-down order is set in `graph` in `config.js`. **Full map** shows everything at once.
- When someone visits, their browser downloads each tab as CSV straight from Google and draws it.
  Edits in the sheet appear on the site within about a minute.
- Optionally, set `approvedColumn` to a checkbox column to hide rows until someone has ticked them.
- Columns that aren't listed in the config (helper columns, emails, notes) are never shown.
- Anything typed into the sheet is shown as plain text, so nobody can inject scripts or odd links through it.
- If someone messes up the sheet, use **File → Version history** in Google Sheets to go back.
- The last good copy of each tab is kept in the visitor's browser, so the site still shows something if Google is briefly unreachable.

The whole site is four files: `index.html`, `style.css`, `app.js` and `config.js`.
`sheet-setup.gs` is an optional helper for the Google Sheet (see below).

## Make your own copy (about 5 minutes)

1. **Copy the sheet.** Open the [Post-growth Nordics sheet](https://docs.google.com/spreadsheets/d/1EwwjCkRdt2_nlANZE8w-XMKT0FVkQz_VPKJEVKkPELI/edit)
   and choose **File → Make a copy**. Delete the example rows and keep the header row.
2. **Share the sheet.** Click **Share**, and under *General access* pick **Anyone with the link**.
   Choose *Viewer* if only your team should edit, or *Editor* if anyone may add themselves.
3. **Fork this repository** on GitHub (the *Fork* button, top right).
4. **Edit `config.js`** in your fork (click the file, then the pencil icon):
   - `title`, `tagline` and `intro`: your network's name and front-page text.
   - `sheetId`: the long code in your sheet's address, between `/d/` and `/edit`.
   - For each section, `gid`: open that tab in the sheet and copy the number after `#gid=` in the address.
     It's only used for the "Add yourself" buttons.
   - Rename, add or remove sections to match your tabs. The comments in the file explain each setting.
5. **Turn on GitHub Pages.** In your fork go to **Settings → Pages**, set *Source* to **Deploy from a branch**,
   pick `main` and `/ (root)`, and save. Your site is live at `https://<your-name>.github.io/<repo-name>/` after a minute.
6. **(Optional) Use your own domain.** In **Settings → Pages → Custom domain**, type your domain, then add the DNS records
   GitHub shows you at your domain registrar.

## Setting up a tab

The site expects:

- An optional instruction line in row 1 (for example "Add your name below"). Set `headerRow` to `2` if you have one, or `1` if not.
- The column names in the header row. They must match the names in `config.js` (upper/lower case doesn't matter).
- One entry per row. Rows with an empty title column are skipped.

Each section in `config.js` says what the site shows. Headers on the site are set there, never read
from the sheet, so editing a header in the sheet can't change the site. Only the cell contents come live.

- `title`: the column that names each item (its page title and graph label).
- `table`: the columns of the list page, each `{ label, column }`. Add `chips: true` for topic pills and
  `width` to keep columns aligned between groups. Set `list: true` instead for a plain list.
- `groups`: the "Group" buttons above the table, e.g. `{ label: "Country", column: "Country" }`, or
  `{ label: "Alphabetically" }` for one ungrouped table. The first one is the default.
- `properties`: the rows of the box on an item's own page. Add `url: true` or `email: true` for links.
- `description`: the column shown as text under that box.

### Relationships

Each section can list `relations`, columns whose values (comma-separated) connect entries:

```js
relations: [
  { column: "Topics", hub: "topic" },          // entries sharing a topic are linked through it
  { column: "Country", hub: "country" },
  { column: "Affiliations", section: "nodes", label: "Affiliations" }, // links to the Nodes entry with that name
],
```

- `hub` values become shared dots in the graph and pages like `#/topic/energy`. Hubs are declared in `hubs` at the top of `config.js`.
- `section` values link to the entry in that tab whose title matches exactly (upper/lower case doesn't matter).
  Values that don't match anything are shown as plain text.

## Helping people enter data in the right format

`sheet-setup.gs` adds dropdowns that pick from earlier entries (topics, countries, people, nodes),
format checks for web and email addresses, and a hint on every column. It also creates a **Lists**
tab that holds the shared topics and countries. New values typed into a Topics or Country column
are added to that tab automatically (and new affiliations to the Nodes tab), so every dropdown
offers them from then on. It never changes or deletes entries. To use it:

1. In the sheet, open **Extensions → Apps Script**, paste in the file, and press Save.
2. Choose `setUpSheet` in the menu at the top and press **Run**. Allow it to edit the sheet when Google asks.
3. For the columns where people pick several values, open **Data → Data validation**, click the rule,
   open **Advanced options**, set the display style to **Chip**, then tick **Allow multiple selections**
   (Google doesn't let scripts set this one, and it only appears for chips).

## Run it on your computer

Any static file server works, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Updating the code

Browsers keep the site's files for a few minutes. After changing `app.js`, `style.css` or `config.js`, bump the `?v=` number on them in `index.html` so everyone gets the new version at once.

## Changing the look

All colours are at the top of `style.css`; the graph colours for each section and hub are in `config.js`.

## License

MIT. See [LICENSE](LICENSE). Use it, change it, share it.
