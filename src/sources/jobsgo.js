import * as cheerio from 'cheerio';
import { fetchText } from '../http.js';
import {
  absoluteUrl, cleanText, htmlToText, locationFromJsonLd,
  parseExperience, parseJsonLd, salaryFromJsonLd, slugify
} from '../utils.js';

const BASE_URL = 'https://jobsgo.vn';

function headers(extra = {}) {
  return {
    referer: BASE_URL,
    ...(process.env.JOBSGO_COOKIE ? { cookie: process.env.JOBSGO_COOKIE } : {}),
    ...extra
  };
}

function ensureNotBlocked(html) {
  if (/Just a moment|Attention Required|cf-chl|cdn-cgi\/challenge/i.test(html)) {
    throw new Error('JobsGO bị Cloudflare chặn; hãy cập nhật JOBSGO_COOKIE hoặc tạm bỏ source jobsgo');
  }
}

function salaryNumbers(baseSalary) {
  const amount = baseSalary?.value || baseSalary;
  const min = Number(amount?.minValue);
  const max = Number(amount?.maxValue);
  return {
    salaryMin: min > 0 ? min : null,
    salaryMax: max > 0 ? max : null,
    salaryCurrency: baseSalary?.currency || null
  };
}

export function mapJobsgoDetail(html, url) {
  ensureNotBlocked(html);
  const $ = cheerio.load(html);
  const data = parseJsonLd($);
  const description = htmlToText(
    data?.description || $('[class*="job-description"], .job-description').first().html() || ''
  );
  const pathId = new URL(url).pathname.match(/-(\d+)\.html$/)?.[1] || slugify(url);
  return {
    id: `jobsgo:${pathId}`,
    source: 'jobsgo',
    title: cleanText(data?.title || $('h1').first().text()),
    company: cleanText(data?.hiringOrganization?.name || $('[class*="company-name"]').first().text()),
    location: locationFromJsonLd(data?.jobLocation) || cleanText($('[class*="location"]').first().text()),
    salary: salaryFromJsonLd(data?.baseSalary) || cleanText($('[class*="salary"]').first().text()) || null,
    ...salaryNumbers(data?.baseSalary),
    employmentType: Array.isArray(data?.employmentType)
      ? data.employmentType.join(', ')
      : data?.employmentType || null,
    workModel: null,
    level: cleanText(data?.occupationalCategory) || null,
    postedAt: data?.datePosted || null,
    expiresAt: data?.validThrough || null,
    skills: [...new Set(cleanText(data?.skills || '').split(/[,|]/).map(cleanText).filter(Boolean))],
    description,
    requirements: '',
    benefits: htmlToText(data?.jobBenefits || ''),
    experience: parseExperience(
      data?.experienceRequirements?.monthsOfExperience
        ? `${Number(data.experienceRequirements.monthsOfExperience) / 12} năm`
        : description
    ),
    numberOfRecruits: Number(data?.totalJobOpenings) || null,
    url
  };
}

export async function listJobsgo({ keyword, location, pages }) {
  const urls = new Set();
  for (let page = 1; page <= pages; page += 1) {
    const suffix = page > 1 ? `?page=${page}` : '';
    const url = `${BASE_URL}/viec-lam-${slugify(keyword)}-tai-${slugify(location)}.html${suffix}`;
    const { body } = await fetchText(url, { headers: headers() });
    ensureNotBlocked(body);
    const $ = cheerio.load(body);
    $('a[href*="/viec-lam/"][href*=".html"]').each((_, element) => {
      const full = absoluteUrl($(element).attr('href'), BASE_URL);
      if (full && /\/viec-lam\/.+-\d+\.html$/i.test(new URL(full).pathname)) urls.add(full);
    });
  }
  return [...urls];
}

export async function detailJobsgo(url) {
  const { body } = await fetchText(url, { headers: headers() });
  return mapJobsgoDetail(body, url);
}
