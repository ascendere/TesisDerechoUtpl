const puppeteer = require('puppeteer');
const urlBase = 'http://localhost:51992';
const email = 'kevin@gmail.com';
const password = 'contraseña';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await page.goto(urlBase, { waitUntil: 'networkidle2' });

    // go to login page if not there
    if (page.url().includes('/login') === false) {
      // try clicking login link if present
      // otherwise navigate directly
      await page.goto(urlBase + '/login', { waitUntil: 'networkidle2' });
    }

    await page.waitForSelector('#email');
    await page.type('#email', email);
    await page.type('#password', password);
    await Promise.all([
      page.click('button.login-button'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    console.log('Login submitted, current URL:', page.url());

    // Go directly to ciclo with the provided tesisId
    const tesisId = 'R7Ltji1bcchjvqRW6qOl';
    await page.goto(`${urlBase}/ciclo?tesisId=${tesisId}`, { waitUntil: 'networkidle2' });
    console.log('Abriendo /ciclo?tesisId=', tesisId);

    // Wait for either table rows or empty message
    const materiaRows = await page.$$('.record-table tbody tr');
    
    // Check what studentId and user info is being used in the component
    const debugInfo = await page.evaluate(() => {
      const app = document.querySelector('app-ciclo');
      return {
        currentUrl: window.location.href,
        userAgent: navigator.userAgent.substring(0, 50)
      };
    });
    console.log('Debug info:', debugInfo);
    
    // Also check browser console logs
    const logs = await page.evaluate(() => {
      return (window as any).testLogs || 'No logs captured';
    });
    
    if (materiaRows.length > 0) {
      console.log(`Se visualizaron ${materiaRows.length} materia(s) en /ciclo para la tesis ${tesisId}.`);
      // print first 5 materia names and estados
      const materias = await page.$$eval('.record-table tbody tr', rows => rows.slice(0,5).map(r => {
        const tds = r.querySelectorAll('td');
        return {
          nombre: tds[0]?.innerText?.trim() || '',
          estado: tds[1]?.innerText?.trim() || ''
        };
      }));
      console.log('Muestras:', materias);
    } else {
      const empty = await page.$('.empty-msg');
      if (empty) {
        console.log('No hay materias registradas aún (mensaje vacío mostrado).');
        console.log('NOTA: Las materias podrían estar en Firestore bajo un studentId diferente. Verifica en Firebase Console:');
        console.log('  - Tesis ID:', tesisId);
        console.log('  - Documento: tesis/' + tesisId);
        console.log('  - Campo: academicRecord (map con keys siendo studentIds)');
      } else {
        console.log('No se detectaron filas de materia ni mensaje vacío; la vista puede no haberse cargado correctamente.');
      }
    }

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Error durante la prueba:', err);
    await browser.close();
    process.exit(1);
  }
})();
