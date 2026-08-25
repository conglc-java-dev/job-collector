import * as cheerio from 'cheerio';
import { fetchText } from '../http.js';
import { absoluteUrl, cleanText, htmlToText, locationFromJsonLd, parseExperience, parseJsonLd, salaryFromJsonLd, slugify } from '../utils.js';

const BASE_URL = 'https://www.topcv.vn';

function headers(extra = {}) {
  return { referer: BASE_URL, ...(process.env.TOPCV_COOKIE ? { cookie: process.env.TOPCV_COOKIE } : {}), ...extra };
}

function extractLinks(html) {
  const $ = cheerio.load(html);
  const urls = new Set();
  $('a[href*="/viec-lam/"]').each((_, el) => {
    const url = absoluteUrl($(el).attr('href'), BASE_URL);
    if (url) urls.add(url);
  });
  return [...urls];
}

export async function listTopcv({ keyword, location, pages }) {
  const urls = new Set();
  for (let page = 1; page <= pages; page += 1) {
    const path = `/tim-viec-lam-${slugify(keyword)}-tai-${slugify(location)}-kl1`;
    const url = new URL(path, BASE_URL);
    url.searchParams.set('type_keyword', '1');
    url.searchParams.set('sba', '1');
    const locationCodes = { 'ha-noi': 'l1', 'ho-chi-minh': 'l2', 'da-nang': 'l8' };
    const locationCode = locationCodes[slugify(location)];
    if (locationCode) url.searchParams.set('locations', locationCode);
    if (page > 1) url.searchParams.set('page', String(page));
    let response;
    try {
      response = await fetchText(url, { headers: headers() });
    } catch (error) {
      if (error.status !== 403) throw error;
      response = await fetchText(url, {
        method: 'POST',
        headers: headers({ 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' })
      });
    }
    let html = response.body;
    try {
      const json = JSON.parse(response.body);
      html = json?.data?.html_job || json?.data?.html || '';
    } catch {}
    extractLinks(html).forEach((item) => urls.add(item));
  }
  return [...urls];
}

export async function detailTopcv(url) {
  const { body } = await fetchText(url, { headers: headers() });
  const $ = cheerio.load(body);
  const data = parseJsonLd($);
  const descriptionHtml = data?.description
    || $('.job-description, .job-detail__info--sections, [class*="job-description"]').first().html() || '';
  const description = htmlToText(descriptionHtml);
  const pathId = new URL(url).pathname.match(/-(\d+)\.html$/)?.[1] || slugify(url);
  return {
    id: `topcv:${pathId}`,
    source: 'topcv',
    title: cleanText(data?.title || $('h1').first().text()),
    company: cleanText(data?.hiringOrganization?.name || $('.company-name, [class*="company-name"]').first().text()),
    location: locationFromJsonLd(data?.jobLocation) || cleanText($('[class*="address"], [class*="location"]').first().text()),
    salary: salaryFromJsonLd(data?.baseSalary) || cleanText($('[class*="salary"]').first().text()) || null,
    employmentType: Array.isArray(data?.employmentType) ? data.employmentType.join(', ') : data?.employmentType || null,
    postedAt: data?.datePosted || null,
    expiresAt: data?.validThrough || null,
    skills: [...new Set(cleanText(data?.skills || '').split(/[,|]/).map(cleanText).filter(Boolean))],
    description,
    experience: parseExperience(description),
    url
  };
}
