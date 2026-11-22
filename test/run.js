const { chromium } = require('playwright');
const fx = require('./fixtures.json');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const [w, name] of [[1440,'desk'],[1000,'mid'],[390,'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
    p.on('dialog', d => { errors.push('DIALOG ' + d.message()); d.dismiss(); });
    await p.route('**/gviz/tq**', r => { const t = new URL(r.request().url()).searchParams.get('sheet'); r.fulfill({ status: 200, contentType: 'text/csv', body: fx[t] }); });
    for (const h of ['', 'people', 'library', 'nodes', 'people/asa-isacson', 'topic/urban', 'topic', 'country/sweden']) {
      await p.goto('http://localhost:8765/#/' + h); await p.waitForTimeout(h===''?1500:900);
      await p.screenshot({ path: `shot-${name}-${(h||'home').replace('/','_')}.png`, fullPage: name!=='desk' });
      if (name==='desk') console.log(h, '|', (await p.locator('main').innerText()).replace(/\s+/g,' ').slice(0, 260), '| svg nodes:', await p.locator('#graph-box .g-node').count());
    }
    console.log(name, 'hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    if (name==='desk') {
      await p.goto('http://localhost:8765/#/'); await p.waitForTimeout(1500);
      await p.click('#graph-expand'); await p.waitForTimeout(1500);
      await p.screenshot({ path: 'shot-dialog.png' });
      await p.locator('#graph-dialog .g-node circle').first().click({force:true}); await p.waitForTimeout(500);
      console.log('after click hash', await p.evaluate(()=>location.hash));
    }
  }
  console.log('errors', errors);
  await b.close();
})();
