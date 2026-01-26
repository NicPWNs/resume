import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESUME_GIST_ID = '5489290125ff3707caf8d51cb6cdc8a0';

// Certification categorization
const SECURITY_CERT_KEYWORDS = ['comptia', 'itil', 'ceh', 'oscp', 'isc2', 'cissp', 'cc', 'giac', 'gsec', 'gcih', 'gstrt', 'gdsa', 'ssap', 'ethical', 'offensive', 'ec-council'];
const CLOUD_CERT_KEYWORDS = ['aws', 'azure', 'cloud', 'solutions architect', 'github', 'cmmi', 'isaca'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  return `${month} ${year}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  return `${month}. ${year}`;
}

function formatYear(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).getUTCFullYear().toString();
}

function formatCertDate(issueYear, expirationYear) {
  const expiry = expirationYear || 'NED';
  return `${issueYear} - ${expiry}`;
}

// Calculate expiration year (4 years from issue for most certs)
function getExpirationYear(cert) {
  const issueYear = new Date(cert.date).getFullYear();
  const name = cert.name.toLowerCase();

  // Non-expiring certs
  if (name.includes('itf') || name.includes('fundamentals') || name.includes('oscp') || name.includes('itil')) {
    return 'NED';
  }

  // GIAC certs expire in 4 years
  if (name.includes('giac') || name.includes('gsec') || name.includes('gcih') || name.includes('gstrt') || name.includes('gdsa') || name.includes('ssap')) {
    return (issueYear + 4).toString();
  }

  // ISC2 certs expire in 3 years
  if (name.includes('cissp') || name.includes('isc2') || name.includes('cc')) {
    return (issueYear + 3).toString();
  }

  // Most other certs expire in 3 years
  return (issueYear + 3).toString();
}

function categorizeCert(cert) {
  const nameLower = cert.name.toLowerCase();
  const issuerLower = cert.issuer.toLowerCase();

  for (const keyword of CLOUD_CERT_KEYWORDS) {
    if (nameLower.includes(keyword) || issuerLower.includes(keyword)) {
      return 'cloud';
    }
  }
  return 'security';
}

function generateCertRows(certs) {
  return certs.map(cert => {
    const issueYear = formatYear(cert.date);
    const expYear = getExpirationYear(cert);
    return `<div class="cert-row"><span class="cert-name">${cert.name}</span><span class="cert-date">${formatCertDate(issueYear, expYear)}</span></div>`;
  }).join('\n');
}

function generateEducation(education) {
  return education.map(edu => {
    const startDate = formatDate(edu.startDate);
    const endDate = edu.endDate ? formatDate(edu.endDate) : 'Present';
    const period = `${startDate} - ${endDate}`;

    const statusLine = edu.endDate ? 'Graduated' : 'In Progress';
    const gpaLine = edu.score ? `, ${edu.score} GPA` : '';
    const courses = edu.courses || [];
    const honors = courses.filter(c => !c.toLowerCase().includes('synopsis')).join(', ');

    let bullets = `<li>${statusLine}${gpaLine}${honors ? ', ' + honors : ''}</li>`;

    // Add synopsis if available
    const synopsis = courses.find(c => c.toLowerCase().includes('synopsis'));
    if (synopsis) {
      bullets += `<li>${synopsis}</li>`;
    }

    return `
      <div class="edu-item">
        <div class="edu-header">
          <span class="degree">${edu.studyType} in ${edu.area} – ${edu.institution}</span>
          <span class="date">${period}</span>
        </div>
        <ul class="edu-details">
          ${bullets}
        </ul>
      </div>
    `;
  }).join('\n');
}

function generateExperience(work) {
  // Group by company
  const grouped = new Map();
  for (const entry of work) {
    const existing = grouped.get(entry.name) || [];
    existing.push(entry);
    grouped.set(entry.name, existing);
  }

  return Array.from(grouped.entries()).map(([company, entries]) => {
    // Sort by start date descending
    entries.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    // Calculate company period
    const startDates = entries.map(e => new Date(e.startDate));
    const endDates = entries.map(e => e.endDate ? new Date(e.endDate) : new Date());
    const earliest = new Date(Math.min(...startDates));
    const latest = new Date(Math.max(...endDates));
    const hasCurrentRole = entries.some(e => !e.endDate);

    const companyPeriod = `${formatDate(earliest.toISOString())} - ${hasCurrentRole ? 'Present' : formatDate(latest.toISOString())}`;
    const location = entries.find(e => e.location)?.location || 'Remote';

    const positions = entries.map(entry => {
      const posStart = formatDateShort(entry.startDate);
      const posEnd = entry.endDate ? formatDateShort(entry.endDate) : 'Present';
      const responsibilities = entry.highlights || (entry.summary ? [entry.summary] : []);

      const respHtml = responsibilities.map(r => `<li>${r}</li>`).join('\n');

      return `
        <div class="exp-position">
          <span class="exp-position-title">○ ${entry.position} (${posStart} – ${posEnd})</span>
          <ul class="exp-responsibilities">
            ${respHtml}
          </ul>
        </div>
      `;
    }).join('\n');

    return `
      <div class="exp-company">
        <span><span class="exp-company-name">${company}</span> <span style="font-style: italic">(${location})</span></span>
        <span class="exp-company-date">${companyPeriod}</span>
      </div>
      ${positions}
    `;
  }).join('\n');
}

function generateSkills() {
  const skills = [
    'Information security engineering with cloud-native technologies and SIEMs, including Splunk and Sentinel',
    'Cloud architecture and engineering in AWS and Azure, including serverless technologies',
    'Python & TypeScript development in enterprise and personal project repositories',
    'CI/CD and DevSecOps using GitHub Workflows',
    'Offensive security operations and penetration testing',
    'Information security leadership and strategy'
  ];
  return skills.map(s => `<li>${s}</li>`).join('\n');
}

function generateAwards(awards) {
  // Group awards by title to combine years
  const grouped = new Map();

  for (const a of awards) {
    const key = `${a.title}|${a.summary || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, { ...a, years: [] });
    }
    grouped.get(key).years.push(formatYear(a.date));
  }

  return Array.from(grouped.values()).map(a => {
    const uniqueYears = [...new Set(a.years)].sort();
    const yearStr = uniqueYears.length > 1 ? uniqueYears.join(' & ') : uniqueYears[0];
    const place = a.summary || '';
    return `<li><span>${a.title}${place ? ' – ' + place : ''}</span><span>${yearStr}</span></li>`;
  }).join('\n');
}

async function generateResume() {
  console.log('Fetching resume data...');
  const response = await fetch(`https://api.github.com/gists/${RESUME_GIST_ID}`);
  const gist = await response.json();
  const resume = JSON.parse(gist.files['resume.json'].content);

  console.log('Processing data...');

  // Categorize certifications
  const securityCerts = resume.certificates.filter(c => categorizeCert(c) === 'security');
  const cloudCerts = resume.certificates.filter(c => categorizeCert(c) === 'cloud');

  // Load template
  const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

  // Replace placeholders
  let html = template
    .replaceAll('{{name}}', resume.basics.name)
    .replace('{{email}}', resume.basics.email)
    .replace('{{phone}}', resume.basics.phone || '')
    .replace('{{linkedin}}', resume.basics.profiles?.find(p => p.network === 'LinkedIn')?.url?.replace('https://', '') || '')
    .replace('{{location}}', `${resume.basics.location?.city || ''}, ${resume.basics.location?.region || ''}`)
    .replace('{{summary}}', resume.basics.summary || '')
    .replace('{{securityCerts}}', generateCertRows(securityCerts))
    .replace('{{cloudCerts}}', generateCertRows(cloudCerts))
    .replace('{{education}}', generateEducation(resume.education))
    .replace('{{experience}}', generateExperience(resume.work))
    .replace('{{skills}}', generateSkills())
    .replace('{{awards}}', generateAwards(resume.awards));

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  console.log('Generating PDF...');
  const outputPath = path.join(__dirname, 'NicholasJonesResume.pdf');
  await page.pdf({
    path: outputPath,
    format: 'Letter',
    printBackground: true,
    margin: {
      top: '0.5in',
      bottom: '0.4in',
      left: '0.5in',
      right: '0.5in'
    }
  });

  await browser.close();

  console.log(`Resume generated: ${outputPath}`);
}

generateResume().catch(console.error);
