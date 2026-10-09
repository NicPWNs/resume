import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESUME_GIST_ID = '5489290125ff3707caf8d51cb6cdc8a0';

// Certification categorization
const SECURITY_CERT_KEYWORDS = ['comptia', 'itil', 'ceh', 'oscp', 'isc2', 'cissp', 'cc', 'giac', 'gsec', 'gcih', 'gstrt', 'gdsa', 'ssap', 'ethical', 'offensive', 'ec-council'];
const CLOUD_CERT_KEYWORDS = ['aws', 'azure', 'cloud', 'solutions architect', 'github', 'cmmi', 'isaca'];

// The gist also feeds nicpjones.com, so it keeps the full history. These
// entries stay in the gist but are left off the PDF.
const PDF_HIDDEN_CERTS = ['ISC2 CC', 'Azure Fundamentals (AZ-900)', 'AWS Certified Cloud Practitioner', 'AWS Certified Solutions Architect Associate'];
const PDF_HIDDEN_AWARD_KEYWORDS = ['skillsusa'];
const PDF_HIDDEN_EDUCATION_KEYWORDS = ['high school'];

// Issuers whose certs are collapsed into a single row
const COLLAPSED_CERT_ISSUERS = ['CompTIA'];

// Companies whose roles all ended before this date are listed as one-liners
// under "Early Career"; projects that ended before it are omitted.
const EARLY_CAREER_CUTOFF = '2020-01-01';

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
  return month === 'May' ? `${month} ${year}` : `${month}. ${year}`;
}

function formatYear(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).getUTCFullYear().toString();
}

function formatCertDate(issueYear, expirationYear) {
  const expiry = expirationYear || 'Lifetime';
  return `${issueYear} – ${expiry}`;
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

function collapseCerts(certs) {
  let result = certs;
  for (const issuer of COLLAPSED_CERT_ISSUERS) {
    const group = result.filter(c => c.issuer === issuer);
    if (group.length < 2) continue;

    const expirations = group.map(c => c.expirationDate).filter(Boolean).sort();
    const merged = {
      name: `${issuer} ${group.map(c => c.name.replace(`${issuer} `, '')).join(', ')}`,
      issuer,
      date: group.map(c => c.date).sort()[0],
      expirationDate: expirations[expirations.length - 1]
    };

    const index = result.indexOf(group[0]);
    result = result.filter(c => c.issuer !== issuer);
    result.splice(index, 0, merged);
  }
  return result.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function generateCertRows(certs) {
  return certs.map(cert => {
    const issueYear = formatYear(cert.date);
    return `<div class="cert-row"><span class="cert-name">${cert.name}</span><span class="cert-date">${formatCertDate(issueYear, cert.expirationDate)}</span></div>`;
  }).join('\n');
}

function generateEducation(education) {
  return education
    .filter(edu => !PDF_HIDDEN_EDUCATION_KEYWORDS.some(k => edu.institution.toLowerCase().includes(k)))
    .map(edu => {
      const startDate = formatDate(edu.startDate);
      let endDate = 'Present';
      if (edu.endDate) {
        endDate = formatDate(edu.endDate);
      } else if (edu.expectedEndDate) {
        endDate = `${formatDate(edu.expectedEndDate)} (Expected)`;
      }
      const period = `${startDate} – ${endDate}`;

      // The expected date already signals the degree is in progress
      const status = edu.endDate ? 'Graduated' : edu.expectedEndDate ? '' : 'In Progress';
      const details = [status, edu.score ? `${edu.score} GPA` : '', ...(edu.courses || [])].filter(Boolean).join(', ');

      return `
        <div class="edu-item">
          <div class="edu-header">
            <span class="degree">${edu.studyType} in ${edu.area} – ${edu.institution}</span>
            <span class="date">${period}</span>
          </div>
          <ul class="edu-details">
            <li>${details}</li>
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

  const cutoff = new Date(EARLY_CAREER_CUTOFF);
  const isEarlyCareer = entries => entries.every(e => e.endDate && new Date(e.endDate) < cutoff);
  const companies = Array.from(grouped.entries());

  const recent = companies.filter(([, entries]) => !isEarlyCareer(entries)).map(([company, entries]) => {
    // Sort by start date descending
    entries.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    // Calculate company period
    const startDates = entries.map(e => new Date(e.startDate));
    const endDates = entries.map(e => e.endDate ? new Date(e.endDate) : new Date());
    const earliest = new Date(Math.min(...startDates));
    const latest = new Date(Math.max(...endDates));
    const hasCurrentRole = entries.some(e => !e.endDate);

    const companyPeriod = `${formatDate(earliest.toISOString())} – ${hasCurrentRole ? 'Present' : formatDate(latest.toISOString())}`;
    const location = entries.find(e => e.location)?.location || 'Remote';
    const via = entries.find(e => e.via)?.via;

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
        <span><span class="exp-company-name">${company}</span> <span style="font-style: italic">(${location}${via ? `, via ${via}` : ''})</span></span>
        <span class="exp-company-date">${companyPeriod}</span>
      </div>
      ${positions}
    `;
  }).join('\n');

  const early = companies.filter(([, entries]) => isEarlyCareer(entries)).flatMap(([company, entries]) => entries).map(entry => {
    const period = `${formatDateShort(entry.startDate)} – ${formatDateShort(entry.endDate)}`;
    return `<li><span><span class="exp-position-title">${entry.position}</span> – ${entry.name} <span style="font-style: italic">(${entry.location})</span></span><span>${period}</span></li>`;
  }).join('\n');

  if (!early) return recent;

  return `
    ${recent}
    <div class="exp-company">
      <span class="exp-company-name">Early Career</span>
    </div>
    <ul class="early-career-list">
      ${early}
    </ul>
  `;
}

function generatePublications(publications) {
  return publications.map(p => {
    return `<li><span><a href="${p.url}" class="pub-name">${p.name}</a> – ${p.summary}</span><span>${formatDateShort(p.releaseDate)}</span></li>`;
  }).join('\n');
}

function generateProjects(projects) {
  const cutoff = new Date(EARLY_CAREER_CUTOFF);
  const endOf = p => p.endDate ? new Date(p.endDate) : new Date();

  return projects
    .filter(p => endOf(p) >= cutoff)
    .sort((a, b) => endOf(b) - endOf(a))
    .map(p => {
      const period = `${formatDateShort(p.startDate)} – ${p.endDate ? formatDateShort(p.endDate) : 'Present'}`;
      const name = p.url ? `<a href="${p.url}">${p.name}</a>` : p.name;
      const description = (p.description || '').replace(/\.$/, '');
      const highlights = (p.highlights || []).join(' · ');

      return `
        <div class="project-item">
          <div class="project-header">
            <span><span class="project-name">${name}</span> – ${description}</span>
            <span>${period}</span>
          </div>
          ${highlights ? `<ul class="project-details"><li>${highlights}</li></ul>` : ''}
        </div>
      `;
    }).join('\n');
}

function generateSkills(skills) {
  return skills.map(s => `<li><span class="skill-name">${s.name}:</span> ${(s.keywords || []).join(', ')}</li>`).join('\n');
}

function generateAwards(awards) {
  // Group awards by title, then by placement, to combine years
  const grouped = new Map();

  for (const a of awards) {
    if (PDF_HIDDEN_AWARD_KEYWORDS.some(k => a.title.toLowerCase().includes(k))) continue;
    if (!grouped.has(a.title)) {
      grouped.set(a.title, new Map());
    }
    const placements = grouped.get(a.title);
    const place = a.summary || '';
    if (!placements.has(place)) {
      placements.set(place, new Set());
    }
    placements.get(place).add(formatYear(a.date));
  }

  const joinYears = years => [...new Set(years)].sort().join(' & ');

  return Array.from(grouped.entries()).map(([title, placements]) => {
    const entries = Array.from(placements.entries()).sort(([a], [b]) => a.localeCompare(b));
    let place;
    if (entries.length === 1) {
      place = entries[0][0];
    } else {
      place = entries.map(([p, years]) => `${p} (${joinYears(years)})`).join(', ');
    }
    const yearStr = joinYears(entries.flatMap(([, years]) => [...years]));
    return `<li><span>${title}${place ? ' – ' + place : ''}</span><span>${yearStr}</span></li>`;
  }).join('\n');
}

function profileLink(resume, network) {
  const url = resume.basics.profiles?.find(p => p.network === network)?.url;
  return url ? `<a href="${url}">${url.replace('https://', '')}</a>` : '';
}

async function generateResume() {
  console.log('Fetching resume data...');
  const response = await fetch(`https://api.github.com/gists/${RESUME_GIST_ID}`);
  const gist = await response.json();
  const resume = JSON.parse(gist.files['resume.json'].content);

  console.log('Processing data...');

  // Categorize certifications
  const pdfCerts = collapseCerts(resume.certificates.filter(c => !PDF_HIDDEN_CERTS.includes(c.name)));
  const securityCerts = pdfCerts.filter(c => categorizeCert(c) === 'security');
  const cloudCerts = pdfCerts.filter(c => categorizeCert(c) === 'cloud');

  // Load template
  const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

  // Replace placeholders
  let html = template
    .replaceAll('{{name}}', resume.basics.name)
    .replace('{{email}}', resume.basics.email)
    .replace('{{phone}}', resume.basics.phone || '')
    .replace('{{clearance}}', resume.basics.clearance ? ` · <strong>${resume.basics.clearance} Clearance</strong>` : '')
    .replace('{{linkedin}}', profileLink(resume, 'LinkedIn'))
    .replace('{{github}}', profileLink(resume, 'GitHub'))
    .replace('{{location}}', `${resume.basics.location?.city || ''}, ${resume.basics.location?.region || ''}`)
    .replace('{{summary}}', resume.basics.summary || '')
    .replace('{{securityCerts}}', generateCertRows(securityCerts))
    .replace('{{cloudCerts}}', generateCertRows(cloudCerts))
    .replace('{{education}}', generateEducation(resume.education))
    .replace('{{experience}}', generateExperience(resume.work))
    .replace('{{publications}}', generatePublications(resume.publications || []))
    .replace('{{projects}}', generateProjects(resume.projects || []))
    .replace('{{skills}}', generateSkills(resume.skills || []))
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
