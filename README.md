# Sheet-powered network site

A tiny, free website for a network or community, where **all the content lives in a Google Sheet**.
People add themselves, readings or organisations by typing into the sheet, and the site shows the
new rows the next time someone opens it. There is no server, no database, no build step and no account to manage.

Built for [Post-growth Nordics](https://postgrowthnordics.org), and made to be copied by any other network.

## How it works

- Each **tab** in the Google Sheet is one **page** on the site (People, Library, Nodes…).
- When someone visits, their browser downloads each tab as CSV straight from Google and draws it.
  Edits in the sheet appear on the site within about a minute.
- Optionally, set `approvedColumn` to a checkbox column to hide rows until someone has ticked them.
- Columns that aren't listed in the config (helper columns, emails, notes) are never shown.
- Anything typed into the sheet is shown as plain text, so nobody can inject scripts or odd links through it.
- If someone messes up the sheet, use **File → Version history** in Google Sheets to go back.
- The last good copy of each tab is kept in the visitor's browser, so the site still shows something if Google is briefly unreachable.

The whole site is four files: `index.html`, `style.css`, `app.js` and `config.js`.

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

Each section in `config.js` maps columns to parts of an entry:

| Setting    | What it shows                                                  |
|------------|----------------------------------------------------------------|
| `title`    | Heading of the entry (required)                                |
| `url`      | Makes the heading a link                                       |
| `subtitle` | Line under the heading, e.g. affiliation                       |
| `meta`     | Small grey details, e.g. country or date (a list of columns)   |
| `body`     | Longer description                                             |
| `note`     | Side note, e.g. connections to members                         |
| `tags`     | Comma-separated topics, shown as clickable chips               |
| `links`    | One or more web addresses, shown as short links                |
| `answer`, `answerBy` | A reply box, used for questions                      |

Set `filterBy` to a column of comma-separated values to show topic filters at the top of the page,
and `layout` to `"cards"` (grid) or `"list"` (one per line).

## Run it on your computer

Any static file server works, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Changing the look

All colours are at the top of `style.css`, with a light and a dark set. Change those and the whole site follows.

## License

MIT. See [LICENSE](LICENSE). Use it, change it, share it.
