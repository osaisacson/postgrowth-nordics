const { chromium } = require('playwright');
const fx = require('./fixtures.json');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const [w, name] of [[1440,'desk'],[390,'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
    p.on('dialog', d => { errors.push('DIALOG ' + d.message()); d.dismiss(); });
    await p.route('**/gviz/tq**', r => { const t = new URL(r.request().url()).searchParams.get('sheet'); r.fulfill({ status: 200, contentType: 'text/csv', body: fx[t] }); });
    for (const h of ['', 'country/sweden', 'nodes/chalmers-university-of-technology', 'people/asa-isacson', 'topic/urban', 'people', 'library/postgrowth-welfare-systems-a-view-from-the-nordic-context', 'map']) {
      await p.goto('http://localhost:8765/#/' + h); await p.waitForTimeout(h===''?1500:1200);
      await p.screenshot({ path: `shot-${name}-${(h||'home').replace(/\//g,'_').slice(0,30)}.png`, fullPage: name!=='desk' });
      if (name==='desk') console.log(h||'home', '|', (await p.locator('main').innerText()).replace(/\s+/g,' ').slice(0, 200), '| graph:', (await p.locator('.graph-box .g-node text').allTextContents()).join(', '));
    }
    console.log(name, 'hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    if (name==='desk') {
      await p.goto('http://localhost:8765/#/'); await p.waitForTimeout(1800);
      await p.locator('.g-node.k-country circle').first().click({force:true}); await p.waitForTimeout(500);
      console.log('click country ->', await p.evaluate(()=>location.hash));
      await p.fill('#search', 'chalm'); await p.waitForTimeout(200);
      console.log('search', await p.locator('#search-results').innerText());
    }
  }
  console.log('errors', errors);
  await b.close();
})();
