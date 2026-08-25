import { listItviec, detailItviec } from './sources/itviec.js';
import { listTopcv, detailTopcv } from './sources/topcv.js';
import { listVietnamworks, detailVietnamworks } from './sources/vietnamworks.js';
import { listTopdev, detailTopdev } from './sources/topdev.js';
import { sleep } from './utils.js';

const adapters = {
  itviec: { list: listItviec, detail: detailItviec },
  topcv: { list: listTopcv, detail: detailTopcv },
  vietnamworks: { list: listVietnamworks, detail: detailVietnamworks, throttleDetails: true },
  topdev: { list: listTopdev, detail: detailTopdev }
};

const EMPTY_EXPERIENCE = { raw: null, minYears: null, maxYears: null };

export function normalizeJob(job) {
  return {
    id: job.id || null,
    source: job.source || null,
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    salary: job.salary || null,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency || null,
    employmentType: job.employmentType || null,
    workModel: job.workModel || null,
    level: job.level || null,
    postedAt: job.postedAt || null,
    expiresAt: job.expiresAt || null,
    skills: Array.isArray(job.skills) ? job.skills : [],
    description: job.description || '',
    requirements: job.requirements || '',
    benefits: job.benefits || '',
    experience: { ...EMPTY_EXPERIENCE, ...(job.experience || {}) },
    numberOfRecruits: job.numberOfRecruits ?? null,
    url: job.url || null
  };
}

function positiveInt(value, fallback, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? Math.min(number, max) : fallback;
}

export async function collect(input = {}) {
  const startedAt = new Date().toISOString();
  const keyword = String(input.keyword || 'java').trim();
  const location = String(input.location || 'ha-noi').trim();
  const pages = positiveInt(input.pages, 1, Number(process.env.MAX_PAGES || 3));
  const limit = positiveInt(input.limit, 20, Number(process.env.MAX_JOBS || 50));
  const delay = Math.max(0, Number(process.env.REQUEST_DELAY_MS || 500));
  const requestedSources = Array.isArray(input.sources) ? input.sources : String(input.sources || 'itviec,topcv,vietnamworks,topdev').split(',');
  const sources = requestedSources.map((item) => item.trim().toLowerCase()).filter((item) => adapters[item]);
  const jobs = [];
  const errors = [];
  const urlsBySource = {};

  for (const source of sources) {
    try {
      urlsBySource[source] = await adapters[source].list({ keyword, location, pages });
    } catch (error) {
      errors.push({ source, stage: 'list', message: error.message, status: error.status || null });
      urlsBySource[source] = [];
    }
  }

  // Round-robin keeps results balanced when more than one source is requested.
  const queue = [];
  for (let index = 0; queue.length < limit; index += 1) {
    let added = false;
    for (const source of sources) {
      const reference = urlsBySource[source]?.[index];
      if (reference && queue.length < limit) {
        queue.push({ source, reference });
        added = true;
      }
    }
    if (!added) break;
  }
  for (const { source, reference } of queue) {
    try {
      if (delay && (typeof reference === 'string' || adapters[source].throttleDetails)) await sleep(delay);
      const job = normalizeJob(await adapters[source].detail(reference));
      if (job.title && (job.description || job.requirements)) jobs.push(job);
    } catch (error) {
      errors.push({ source, stage: 'detail', url: typeof reference === 'string' ? reference : reference?.jobUrl || reference?.detail_url || null, message: error.message, status: error.status || null });
    }
  }

  const unique = [...new Map(jobs.map((job) => [job.id || job.url, job])).values()];
  const candidateYears = input.candidateExperienceYears === undefined ? null : Number(input.candidateExperienceYears);
  const filtered = Number.isFinite(candidateYears)
    ? unique.filter((job) => job.experience.minYears === null || job.experience.minYears <= candidateYears)
    : unique;
  return {
    meta: {
      keyword, location, pages, sources,
      found: unique.length,
      returned: filtered.length,
      bySource: Object.fromEntries(sources.map((source) => [source, filtered.filter((job) => job.source === source).length])),
      startedAt,
      finishedAt: new Date().toISOString()
    },
    jobs: filtered,
    errors
  };
}
