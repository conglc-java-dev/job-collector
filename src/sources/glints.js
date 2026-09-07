import * as cheerio from 'cheerio';
import { fetchTextWithCurl } from '../http.js';
import {
  cleanText, htmlToText, locationFromJsonLd,
  parseExperience, parseJsonLd, salaryFromJsonLd, slugify
} from '../utils.js';

const BASE_URL = 'https://glints.com';
const SEARCH_URL = `${BASE_URL}/api/v2-alc/graphql`;
const SEARCH_QUERY = `
query searchJobsV3($data: JobSearchConditionInput!) {
  searchJobsV3(data: $data) {
    jobsInPage {
      id
      title
      company { name brandName }
      city { name }
      country { code name }
      salaries { salaryType salaryMode maxAmount minAmount CurrencyCode }
      createdAt
    }
    hasMore
  }
}`;

function headers(extra = {}) {
  return {
    origin: BASE_URL,
    referer: `${BASE_URL}/vn/opportunities/jobs/explore`,
    ...(process.env.GLINTS_COOKIE ? { cookie: process.env.GLINTS_COOKIE } : {}),
    ...extra
  };
}

function isRequestedLocation(city, location) {
  const wanted = slugify(location);
  const actual = slugify(city);
  return !wanted || actual === wanted || actual.includes(wanted) || wanted.includes(actual);
}

export function mapGlintsDetail(html, url, summary = {}) {
  const $ = cheerio.load(html);
  const data = parseJsonLd($);
  const description = htmlToText(data?.description || $('[class*="description"]').first().html() || '');
  const salaries = summary.salaries?.[0] || {};
  const min = Number(salaries.minAmount);
  const max = Number(salaries.maxAmount);
  return {
    id: `glints:${summary.id || new URL(url).pathname.split('/').filter(Boolean).at(-1)}`,
    source: 'glints',
    title: cleanText(data?.title || summary.title || $('h1').first().text()),
    company: cleanText(data?.hiringOrganization?.name || summary.company?.brandName || summary.company?.name),
    location: locationFromJsonLd(data?.jobLocation) || cleanText(summary.city?.name),
    salary: salaryFromJsonLd(data?.baseSalary),
    salaryMin: min > 0 ? min : null,
    salaryMax: max > 0 ? max : null,
    salaryCurrency: salaries.CurrencyCode || data?.baseSalary?.currency || null,
    employmentType: Array.isArray(data?.employmentType)
      ? data.employmentType.join(', ')
      : data?.employmentType || null,
    workModel: null,
    level: null,
    postedAt: data?.datePosted || summary.createdAt || null,
    expiresAt: data?.validThrough || null,
    skills: [...new Set(cleanText(data?.skills || '').split(/[,|]/).map(cleanText).filter(Boolean))],
    description,
    requirements: '',
    benefits: htmlToText(data?.jobBenefits || ''),
    experience: parseExperience(description),
    numberOfRecruits: Number(data?.totalJobOpenings) || null,
    url
  };
}

export async function listGlints({ keyword, location, pages }) {
  const jobs = [];
  for (let page = 1; page <= pages; page += 1) {
    const { body } = await fetchTextWithCurl(SEARCH_URL, {
      method: 'POST',
      headers: headers({ accept: 'application/json', 'content-type': 'application/json' }),
      body: JSON.stringify({
        operationName: 'searchJobsV3',
        query: SEARCH_QUERY,
        variables: {
          data: { SearchTerm: keyword, CountryCode: 'VN', includeExternalJobs: true, pageSize: 30, page }
        }
      })
    });
    let response;
    try {
      response = JSON.parse(body);
    } catch {
      throw new Error('Glints bị WAF chặn; hãy cập nhật GLINTS_COOKIE hoặc tạm bỏ source glints');
    }
    const pageJobs = response?.data?.searchJobsV3?.jobsInPage;
    if (!Array.isArray(pageJobs)) {
      throw new Error(`Glints API trả schema không hợp lệ: ${response?.errors?.[0]?.message || 'unknown'}`);
    }
    jobs.push(...pageJobs.filter((job) => isRequestedLocation(job.city?.name, location)));
    if (response.data.searchJobsV3.hasMore === false) break;
  }
  return jobs;
}

export async function detailGlints(job) {
  const url = `${BASE_URL}/vn/opportunities/jobs/${job.id}`;
  const { body, finalUrl } = await fetchTextWithCurl(url, { headers: headers() });
  return mapGlintsDetail(body, finalUrl || url, job);
}
