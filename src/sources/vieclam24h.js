import * as cheerio from 'cheerio';
import { fetchTextWithCurl } from '../http.js';
import { absoluteUrl, cleanText, htmlToText, locationFromJsonLd, parseExperience, slugify } from '../utils.js';

const BASE_URL = 'https://vieclam24h.vn';
const PROVINCE_IDS = { 'ha-noi': 73, 'ho-chi-minh': 122, 'da-nang': 76 };
const WORKING_METHODS = { 1: 'Full-time', 2: 'Part-time', 3: 'Internship' };
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
};

function nextData(html) {
  const $ = cheerio.load(html);
  const raw = $('script#__NEXT_DATA__[type="application/json"]').text();
  if (!raw) throw new Error('Vieclam24h không trả về __NEXT_DATA__');
  return JSON.parse(raw);
}

function epochDate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000).toISOString() : null;
}

function placesText(value) {
  try {
    const places = Array.isArray(value) ? value : JSON.parse(value || '[]');
    return [...new Set(places.map((item) => cleanText(item.address)).filter(Boolean))].join(' | ');
  } catch {
    return '';
  }
}

export function mapVieclam24hJob(job, posting = {}, url = null) {
  const description = htmlToText(job.description_html || job.description || posting.description || '');
  const requirements = htmlToText(
    job.other_requirement_html || job.other_requirement || job.job_requirement_html || job.job_requirement || ''
  );
  const benefits = htmlToText(job.benefit_html || job.benefit || posting.jobBenefits || '');
  const salaryMin = Number(job.salary_min);
  const salaryMax = Number(job.salary_max);
  const skills = (job.smart_tags || [])
    .filter((item) => item.category === 'Skill')
    .map((item) => cleanText(item.name))
    .filter(Boolean);
  const parsedExperience = parseExperience(requirements || description);
  const structuredMonths = Number(posting?.experienceRequirements?.monthsOfExperience);
  const experience = parsedExperience.minYears !== null
    ? parsedExperience
    : Number.isFinite(structuredMonths) && structuredMonths >= 0
      ? { raw: `${structuredMonths} tháng`, minYears: structuredMonths / 12, maxYears: null }
      : parsedExperience;

  return {
    id: `vieclam24h:${job.id}`,
    source: 'vieclam24h',
    title: cleanText(job.title || posting.title),
    company: cleanText(job.employer_info?.name || posting.hiringOrganization?.name),
    location: locationFromJsonLd(posting.jobLocation) || placesText(job.places) || cleanText(job.contact_address),
    salary: cleanText(posting?.baseSalary?.value?.value) || null,
    salaryMin: salaryMin > 0 ? salaryMin : null,
    salaryMax: salaryMax > 0 ? salaryMax : null,
    salaryCurrency: posting?.baseSalary?.currency || (salaryMin > 0 || salaryMax > 0 ? 'VND' : null),
    employmentType: posting.employmentType || WORKING_METHODS[job.working_method] || null,
    workModel: null,
    level: cleanText(posting.occupationalCategory) || null,
    postedAt: posting.datePosted || epochDate(job.approved_at || job.created_at),
    expiresAt: posting.validThrough || epochDate(job.resume_apply_expired),
    skills: [...new Set(skills)],
    description,
    requirements,
    benefits,
    experience,
    numberOfRecruits: Number(job.vacancy_quantity || posting.totalJobOpenings) || null,
    url: url || (job.canonical ? absoluteUrl(job.canonical, BASE_URL) : null)
  };
}

export async function listVieclam24h({ keyword, location, pages }) {
  const references = [];
  const provinceId = PROVINCE_IDS[slugify(location)] || PROVINCE_IDS['ha-noi'];
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(`/viec-lam-${slugify(location)}-p${provinceId}.html`, BASE_URL);
    url.searchParams.set('q', keyword);
    if (page > 1) url.searchParams.set('page', String(page));
    const { body } = await fetchTextWithCurl(url, { headers: BROWSER_HEADERS });
    const jobs = nextData(body)?.props?.initialState?.api?.getJobList?.data?.items || [];
    const $ = cheerio.load(body);
    const links = new Map();
    $('a[href*="id"][href*=".html"]').each((_, element) => {
      const href = $(element).attr('href') || '';
      const id = href.match(/id(\d+)\.html/i)?.[1];
      if (id) links.set(id, absoluteUrl(href, BASE_URL));
    });
    for (const job of jobs) {
      const jobUrl = links.get(String(job.id)) || (job.canonical ? absoluteUrl(job.canonical, BASE_URL) : null);
      if (jobUrl) references.push({ ...job, jobUrl });
    }
  }
  return [...new Map(references.map((item) => [item.id, item])).values()];
}

export async function detailVieclam24h(reference) {
  const { body } = await fetchTextWithCurl(reference.jobUrl, { headers: BROWSER_HEADERS });
  const api = nextData(body)?.props?.initialState?.api || {};
  const detail = api.jobDetailHiddenContact?.data || reference;
  const posting = api.jobPosting?.data || {};
  return mapVieclam24hJob({ ...reference, ...detail }, posting, reference.jobUrl);
}
