import * as cheerio from 'cheerio';
import { fetchText } from '../http.js';
import {
  absoluteUrl, cleanText, htmlToText, locationFromJsonLd,
  parseExperience, parseJsonLd, salaryFromJsonLd, slugify
} from '../utils.js';

const BASE_URL = 'https://careerviet.vn';
const LOCATION_CODES = { 'ha-noi': 4, 'ho-chi-minh': 8, 'da-nang': 16 };

function searchUrl(keyword, location, page) {
  const locationSlug = slugify(location);
  const code = LOCATION_CODES[locationSlug] || LOCATION_CODES['ha-noi'];
  const suffix = page > 1 ? `-trang-${page}` : '';
  return new URL(`/viec-lam/${slugify(keyword)}-tai-${locationSlug}-kl${code}${suffix}-vi.html`, BASE_URL);
}

function sectionHtml($, headingPattern) {
  const row = $('.detail-row').filter((_, element) =>
    headingPattern.test(cleanText($(element).find('.detail-title').first().text()))
  ).first();
  if (!row.length) return '';
  const clone = row.clone();
  clone.find('.detail-title').first().remove();
  return clone.html() || '';
}

function salaryNumbers(baseSalary) {
  const amount = baseSalary?.value || baseSalary;
  const min = Number(amount?.minValue);
  const max = Number(amount?.maxValue);
  return {
    salaryMin: Number.isFinite(min) && min > 0 ? min : null,
    salaryMax: Number.isFinite(max) && max > 0 ? max : null,
    salaryCurrency: baseSalary?.currency || null
  };
}

export function mapCareervietDetail(html, url) {
  const $ = cheerio.load(html);
  const data = parseJsonLd($);
  const description = htmlToText(sectionHtml($, /mô tả công việc/i) || data?.description || '');
  const requirements = htmlToText(sectionHtml($, /yêu cầu công việc/i));
  const benefits = htmlToText(sectionHtml($, /phúc lợi/i) || data?.jobBenefits || '');
  const pathId = data?.identifier?.value
    || new URL(url).pathname.match(/\.([A-Z0-9]+)\.html$/i)?.[1]
    || slugify(url);
  const level = data?.description?.match(/Cấp bậc:\s*([^<\n]+)/i)?.[1] || null;

  return {
    id: `careerviet:${pathId}`,
    source: 'careerviet',
    title: cleanText(data?.title || $('h1').first().text()),
    company: cleanText(data?.hiringOrganization?.name || $('.company-name').first().text()),
    location: locationFromJsonLd(data?.jobLocation),
    salary: salaryFromJsonLd(data?.baseSalary),
    ...salaryNumbers(data?.baseSalary),
    employmentType: Array.isArray(data?.employmentType)
      ? data.employmentType.join(', ')
      : data?.employmentType || null,
    workModel: null,
    level: cleanText(level) || null,
    postedAt: data?.datePosted || null,
    expiresAt: data?.validThrough || null,
    skills: [...new Set(cleanText(data?.skills || '').split(/[,|]/).map(cleanText).filter(Boolean))],
    description,
    requirements,
    benefits,
    experience: parseExperience(requirements || description),
    numberOfRecruits: null,
    url: data?.url || url
  };
}

export async function listCareerviet({ keyword, location, pages }) {
  const urls = new Set();
  for (let page = 1; page <= pages; page += 1) {
    const url = searchUrl(keyword, location, page);
    const { body } = await fetchText(url, { headers: { referer: BASE_URL } });
    const $ = cheerio.load(body);
    $('a.job_link[href*="/tim-viec-lam/"], a[href*="/tim-viec-lam/"]').each((_, element) => {
      const full = absoluteUrl($(element).attr('href'), BASE_URL);
      if (full && /\.[A-Z0-9]+\.html$/i.test(new URL(full).pathname)) urls.add(full);
    });
  }
  return [...urls];
}

export async function detailCareerviet(url) {
  const { body } = await fetchText(url, { headers: { referer: BASE_URL } });
  return mapCareervietDetail(body, url);
}
