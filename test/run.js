const { chromium } = require('playwright');
const path = require('path');
const fx = require('./fixtures.json');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const [w, name] of [[1280,'desk'],[390,'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { errors.push('DIALOG ' + d.message()); d.dismiss(); });
    await p.route('**/gviz/tq**', r => { const t = new URL(r.request().url()).searchParams.get('sheet'); r.fulfill({ status: 200, contentType: 'text/csv', headers: {'access-control-allow-origin':'*'}, body: fx[t] }); });
    await p.goto('http://localhost:8765/');
    for (const h of ['', 'people', 'library', 'nodes', 'questions']) {
      await p.goto('http://localhost:8765/#/' + h); await p.waitForTimeout(400);
      await p.screenshot({ path: `shot-${name}-${h||'home'}.png`, fullPage: true });
      console.log(name, h, (await p.locator('main').innerText()).replace(/\s+/g,' ').slice(0, 300));
    }
    console.log('hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await p.goto('http://localhost:8765/#/people'); await p.waitForTimeout(300);
    await p.click('.filters button[data-tag="Energy"]'); await p.waitForTimeout(200);
    console.log('filtered', await p.locator('.entry h3').allInnerTexts());
    console.log('links', await p.locator('.entry a').evaluateAll(a => a.map(x => x.href)));
  }
  console.log('errors', errors);
  await b.close();
})();
