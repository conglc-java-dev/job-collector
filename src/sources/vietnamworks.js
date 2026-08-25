import * as cheerio from 'cheerio';
import { fetchText } from '../http.js';
import { cleanText, htmlToText, parseExperience, slugify } from '../utils.js';

const SEARCH_URL = 'https://ms.vietnamworks.com/job-search/v1.0/search';
const CITY_IDS = { 'ha-noi': 24, 'ho-chi-minh': 29, 'da-nang': 15 };
const EMPLOYMENT_TYPES = { 1: 'Full-time', 2: 'Part-time', 3: 'Contract', 4: 'Internship' };

function locationText(locations = []) {
  return [...new Set(locations.map((item) => cleanText(item.address || item.cityNameVI || item.cityName)).filter(Boolean))].join(' | ');
}

export function mapVietnamworksJob(job) {
  const description = htmlToText(job.jobDescription || '');
  const requirements = htmlToText(job.jobRequirement || '');
  const min = Number(job.salaryMin);
  const max = Number(job.salaryMax);
  return {
    id: `vietnamworks:${job.jobId}`,
    source: 'vietnamworks',
    title: cleanText(job.jobTitle),
    company: cleanText(job.companyName),
    location: locationText(job.workingLocations),
    salary: cleanText(job.prettySalary) || null,
    salaryMin: min > 0 ? min : null,
    salaryMax: max > 0 ? max : null,
    salaryCurrency: job.salaryCurrency || null,
    employmentType: EMPLOYMENT_TYPES[job.typeWorkingId] || (job.typeWorkingId ? String(job.typeWorkingId) : null),
    workModel: null,
    level: cleanText(job.jobLevelVI || job.jobLevel) || null,
    postedAt: job.approvedOn || null,
    expiresAt: job.expiredOn || null,
    skills: [...new Set((job.skills || []).map((item) => cleanText(item.skillName || item)).filter(Boolean))],
    description,
    requirements,
    benefits: '',
    experience: parseExperience(requirements || description),
    numberOfRecruits: Number(job.numberOfRecruits) || null,
    url: job.jobId ? `https://www.vietnamworks.com/${job.alias || slugify(job.jobTitle)}-${job.jobId}-jv` : job.jobUrl || null
  };
}

export function extractFlightField(html, fieldName) {
  const $ = cheerio.load(html);
  let stream = '';
  $('script').each((_, element) => {
    const script = $(element).html() || '';
    const match = script.match(/^self\.__next_f\.push\(\[1,([\s\S]+)\]\)$/);
    if (!match) return;
    try {
      stream += JSON.parse(match[1]);
    } catch {}
  });
  const reference = stream.match(new RegExp(`"${fieldName}":"\\$([0-9a-z]+)"`, 'i'))?.[1];
  if (!reference) return '';
  const marker = stream.match(new RegExp(`${reference}:T([0-9a-f]+),`, 'i'));
  if (!marker) return '';
  const start = marker.index + marker[0].length;
  return stream.slice(start, start + Number.parseInt(marker[1], 16));
}

export async function listVietnamworks({ keyword, location, pages }) {
  const cityId = CITY_IDS[slugify(location)] || CITY_IDS['ha-noi'];
  const jobs = [];
  for (let page = 0; page < pages; page += 1) {
    const payload = {
      userId: 0,
      query: keyword,
      filter: [
        { field: 'workingLocations.cityId', value: String(cityId) },
        { field: 'workingLocations.districtId', value: JSON.stringify([{ cityId, districtId: [-1] }]) }
      ],
      ranges: [],
      order: [{ field: 'approvedOn', value: 'desc' }],
      hitsPerPage: 20,
      page,
      retrieveFields: [
        'jobId', 'jobTitle', 'jobUrl', 'canonical', 'alias', 'companyName', 'approvedOn', 'expiredOn',
        'jobDescription', 'jobRequirement', 'skills', 'workingLocations', 'jobLevel', 'jobLevelVI',
        'jobLevelId', 'salary', 'salaryMin', 'salaryMax', 'salaryCurrency', 'prettySalary',
        'typeWorkingId', 'numberOfRecruits'
      ]
    };
    const { body } = await fetchText(SEARCH_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', origin: 'https://www.vietnamworks.com' },
      body: JSON.stringify(payload)
    });
    const response = JSON.parse(body);
    jobs.push(...(Array.isArray(response.data) ? response.data : []));
  }
  return jobs;
}

export async function detailVietnamworks(job) {
  const url = `https://www.vietnamworks.com/${job.alias || slugify(job.jobTitle)}-${job.jobId}-jv`;
  try {
    const { body } = await fetchText(url, { headers: { referer: 'https://www.vietnamworks.com/' } });
    const jobDescription = extractFlightField(body, 'jobDescription');
    const jobRequirement = extractFlightField(body, 'jobRequirement');
    return mapVietnamworksJob({
      ...job,
      jobUrl: url,
      jobDescription: jobDescription || job.jobDescription,
      jobRequirement: jobRequirement || job.jobRequirement
    });
  } catch {
    return mapVietnamworksJob(job);
  }
}
