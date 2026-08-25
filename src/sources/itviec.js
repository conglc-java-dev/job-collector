import * as cheerio from 'cheerio';
import { fetchText } from '../http.js';
import { absoluteUrl, cleanText, htmlToText, locationFromJsonLd, parseExperience, parseJsonLd, salaryFromJsonLd, slugify } from '../utils.js';

const BASE_URL = 'https://itviec.com';

export async function listItviec({ keyword, location, pages }) {
  const urls = new Set();
  for (let page = 1; page <= pages; page += 1) {
    const path = `/it-jobs/${slugify(keyword)}/${slugify(location)}`;
    const url = new URL(path, BASE_URL);
    if (page > 1) url.searchParams.set('page', String(page));
    const { body } = await fetchText(url);
    const $ = cheerio.load(body);
    $('h3[data-search--job-selection-target="jobTitle"] a[href*="/it-jobs/"]').each((_, el) => {
      const href = $(el).attr('href');
      const full = absoluteUrl(href, BASE_URL);
      if (!full) return;
      const parsed = new URL(full);
      const lastPart = parsed.pathname.split('/').filter(Boolean).at(-1) || '';
      if (/^.+-\d{4}$/.test(lastPart)) urls.add(full);
    });
  }
  return [...urls];
}

export async function detailItviec(url) {
  const { body } = await fetchText(url);
  const $ = cheerio.load(body);
  const data = parseJsonLd($);
  const descriptionHtml = data?.description || $('[class*="job-description"], #job-description').first().html() || '';
  const description = htmlToText(descriptionHtml);
  const title = cleanText(data?.title || $('h1').first().text());
  const company = cleanText(data?.hiringOrganization?.name || $('[class*="company-name"]').first().text());
  return {
    id: `itviec:${new URL(url).pathname.split('-').at(-1)}`,
    source: 'itviec', title, company,
    location: locationFromJsonLd(data?.jobLocation) || cleanText($('[class*="location"]').first().text()),
    salary: salaryFromJsonLd(data?.baseSalary),
    employmentType: Array.isArray(data?.employmentType) ? data.employmentType.join(', ') : data?.employmentType || null,
    postedAt: data?.datePosted || null,
    expiresAt: data?.validThrough || null,
    skills: [...new Set(cleanText(data?.skills || '').split(/[,|]/).map(cleanText).filter(Boolean))],
    description,
    experience: parseExperience(description),
    url
  };
}
