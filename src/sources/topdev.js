import { fetchText } from '../http.js';
import { cleanText, htmlToText, parseExperience, slugify } from '../utils.js';

const SEARCH_URL = 'https://api.topdev.vn/td/v2/jobs/search/v2';
const REGION_IDS = { 'ha-noi': '01', 'ho-chi-minh': '79', 'da-nang': '48' };
const JOB_FIELDS = [
  'id', 'title', 'salary', 'slug', 'company', 'expires', 'extra_skills', 'skills_str', 'skills_arr',
  'job_types_str', 'job_levels_str', 'job_levels_arr', 'addresses', 'status_display', 'detail_url',
  'job_url', 'published', 'refreshed', 'features', 'contract_types_str', 'experiences_str', 'benefits_v2',
  'responsibilities_original', 'requirements_original'
].join(',');
const COMPANY_FIELDS = ['tagline', 'addresses', 'skills_arr', 'industries_arr', 'company_size', 'num_employees'].join(',');

function isoDate(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{2})-(\d{2})-(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

export function mapTopdevJob(job) {
  const description = htmlToText(job.responsibilities_original || '');
  const requirements = htmlToText(job.requirements_original || '');
  const benefits = htmlToText((job.benefits_v2 || []).map((item) => item.description || item.value || '').join('\n'));
  const salaryMin = Number(job.salary?.min_filter || job.salary?.min_estimate || job.salary?.min);
  const salaryMax = Number(job.salary?.max_filter || job.salary?.max_estimate || job.salary?.max);
  const addresses = job.addresses?.full_addresses || job.addresses?.address_region_array || [];
  return {
    id: `topdev:${job.id}`,
    source: 'topdev',
    title: cleanText(job.title),
    company: cleanText(job.company?.display_name),
    location: [...new Set(addresses.map(cleanText).filter(Boolean))].join(' | '),
    salary: cleanText(job.salary?.value) || null,
    salaryMin: salaryMin > 0 ? salaryMin : null,
    salaryMax: salaryMax > 0 ? salaryMax : null,
    salaryCurrency: job.salary?.currency || job.salary?.currency_estimate || null,
    employmentType: cleanText(job.contract_types_str) || null,
    workModel: cleanText(job.job_types_str) || null,
    level: cleanText(job.job_levels_str) || null,
    postedAt: isoDate(job.published?.date || job.published?.datetime),
    expiresAt: isoDate(job.expires?.date || job.expires?.datetime),
    skills: [...new Set([...(job.skills_arr || []), ...(job.extra_skills || [])].map((item) => cleanText(item.name || item)).filter(Boolean))],
    description,
    requirements,
    benefits,
    experience: parseExperience(requirements || job.experiences_str || description),
    numberOfRecruits: null,
    url: job.detail_url || job.job_url || null
  };
}

export async function listTopdev({ keyword, location, pages }) {
  const jobs = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('page', String(page));
    url.searchParams.set('region_ids', REGION_IDS[slugify(location)] || REGION_IDS['ha-noi']);
    url.searchParams.set('fields[job]', JOB_FIELDS);
    url.searchParams.set('fields[company]', COMPANY_FIELDS);
    url.searchParams.set('locale', 'vi_VN');
    const { body } = await fetchText(url, { headers: { accept: 'application/json', origin: 'https://topdev.vn' } });
    const response = JSON.parse(body);
    jobs.push(...(Array.isArray(response.data) ? response.data : []));
  }
  return jobs;
}

export const detailTopdev = async (job) => mapTopdevJob(job);
