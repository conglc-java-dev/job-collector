import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const filterCode = readFileSync(new URL('../filter.js', import.meta.url), 'utf8');
const runFilter = (jobs) => new Function('$input', filterCode)({
  all: () => jobs.map((json) => ({ json }))
}).map((item) => item.json);

function job(overrides = {}) {
  return {
    id: 'test:1', source: 'test', title: 'Java Developer', company: 'Example',
    location: 'Hà Nội', salary: null, salaryMin: null, salaryMax: null,
    salaryCurrency: null, employmentType: 'Full-time', workModel: null,
    level: null, postedAt: new Date().toISOString(), expiresAt: null,
    skills: ['Java'], description: 'Java Spring Boot SQL', requirements: '',
    benefits: '', experience: { raw: null, minYears: null, maxYears: null },
    numberOfRecruits: null, url: 'https://example.com/1', ...overrides
  };
}

// ——— Existing tests (updated thresholds) ———

test('keeps and highly ranks a Hanoi Junior Java job with 1 year experience', () => {
  const result = runFilter([job({
    title: 'Junior Java Backend Developer',
    level: 'Junior',
    experience: { raw: '1 năm', minYears: 1, maxYears: null }
  })]);
  assert.equal(result.length, 1);
  assert.ok(result[0].jobScore >= 40, `Score ${result[0].jobScore} should be >= 40`);
  assert.equal(result[0].filterInfo.locationStatus, 'HANOI');
});

test('soft-penalizes OTHER location but still retains Remote jobs', () => {
  const hcm = runFilter([job({ location: 'Hồ Chí Minh' })]);
  assert.equal(hcm.length, 1, 'OTHER location should be kept (soft penalty)');
  assert.ok(hcm[0].jobScore < 20, 'OTHER location should have low score');
  assert.equal(hcm[0].filterInfo.locationStatus, 'OTHER');

  const remote = runFilter([job({ location: 'Remote', workModel: 'Remote' })]);
  assert.equal(remote.length, 1);
  assert.equal(remote[0].filterInfo.locationStatus, 'REMOTE');
});

test('retains but lowers the score of Senior and over-2-year jobs', () => {
  const preferred = runFilter([job({ title: 'Junior Java Developer', level: 'Junior', experience: { raw: '1 năm', minYears: 1, maxYears: null } })])[0];
  const senior = runFilter([job({ title: 'Senior Java Developer', level: 'Senior', experience: { raw: '3 năm', minYears: 3, maxYears: null } })])[0];
  assert.ok(senior);
  assert.ok(preferred.jobScore > senior.jobScore, `Preferred ${preferred.jobScore} > Senior ${senior.jobScore}`);
});

test('rejects non-Java roles and sorts stronger matches first', () => {
  const result = runFilter([
    job({ id: 'test:unknown', url: 'https://example.com/unknown' }),
    job({ id: 'test:junior', url: 'https://example.com/junior', title: 'Fresher Java Backend', level: 'Fresher', experience: { raw: '0 năm', minYears: 0, maxYears: 0 } }),
    job({ id: 'test:node', url: 'https://example.com/node', title: 'Junior NodeJS Developer', skills: ['NodeJS'], description: 'NodeJS API' })
  ]);
  assert.deepEqual(result.map((item) => item.id), ['test:junior', 'test:unknown']);
});

// ——— New tests ———

test('retains job with multi-location including Hanoi', () => {
  const result = runFilter([job({
    location: 'Hà Nội, Hồ Chí Minh',
    title: 'Java Developer'
  })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filterInfo.locationStatus, 'HANOI');
});

test('retains backend role without explicit Java mention', () => {
  const result = runFilter([job({
    title: 'Backend Developer',
    skills: [],
    description: 'Build REST APIs with microservices architecture'
  })]);
  assert.equal(result.length, 1);
  assert.ok(result[0].jobScore < 25, 'Backend role without Java should have low score');
});

test('parses Vietnamese experience text "0-1 năm"', () => {
  const result = runFilter([job({
    title: 'Java Developer',
    experience: { raw: null, minYears: null, maxYears: null },
    description: 'Yêu cầu 0-1 năm kinh nghiệm Java Spring Boot'
  })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filterInfo.experience.minYears, 0);
  assert.equal(result[0].filterInfo.experience.maxYears, 1);
});

test('parses "dưới 1 năm" experience', () => {
  const result = runFilter([job({
    title: 'Java Developer',
    experience: { raw: null, minYears: null, maxYears: null },
    description: 'Dưới 1 năm kinh nghiệm lập trình Java'
  })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filterInfo.experience.minYears, 0);
});

test('gives recency bonus to recently posted jobs', () => {
  const recent = runFilter([job({
    postedAt: new Date().toISOString()
  })])[0];
  const old = runFilter([job({
    postedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  })])[0];
  assert.ok(recent.jobScore > old.jobScore, `Recent ${recent.jobScore} > Old ${old.jobScore}`);
});

test('gives salary hint bonus to junior-level salary', () => {
  const junior = runFilter([job({ salaryMax: 15000000 })])[0];
  const senior = runFilter([job({ salaryMax: 50000000 })])[0];
  assert.ok(junior.jobScore > senior.jobScore, `Junior salary ${junior.jobScore} > Senior salary ${senior.jobScore}`);
});

test('deduplicates jobs by URL', () => {
  const result = runFilter([
    job({ id: 'test:1', url: 'https://example.com/same' }),
    job({ id: 'test:2', url: 'https://example.com/same' })
  ]);
  assert.equal(result.length, 1);
});

test('deduplicates jobs with similar titles (ignoring level prefix)', () => {
  const result = runFilter([
    job({ id: 'test:1', url: 'https://example.com/1', title: 'Junior Java Developer' }),
    job({ id: 'test:2', url: 'https://example.com/2', title: 'Senior Java Developer' })
  ]);
  assert.equal(result.length, 1);
});

test('hard rejects unrelated titles like QA, Frontend', () => {
  assert.equal(runFilter([job({ title: 'QA Engineer', skills: ['Java'], description: 'Test Java applications' })]).length, 0);
  assert.equal(runFilter([job({ title: 'Frontend Developer', skills: ['Java'], description: 'Java applets' })]).length, 0);
});

test('gives source quality bonus to reputable sources', () => {
  const itviec = runFilter([job({ source: 'itviec' })])[0];
  const fb = runFilter([job({ source: 'facebook' })])[0];
  assert.ok(itviec.jobScore > fb.jobScore, `itviec ${itviec.jobScore} > facebook ${fb.jobScore}`);
});

test('Fresher/Junior Hanoi Java Spring Boot gets top score', () => {
  const perfect = runFilter([job({
    title: 'Fresher Java Backend Developer',
    level: 'Fresher',
    location: 'Cầu Giấy, Hà Nội',
    experience: { raw: '0 năm', minYears: 0, maxYears: 0 },
    skills: ['Java', 'Spring Boot', 'SQL', 'Git'],
    description: 'Phát triển ứng dụng Java Spring Boot REST API JPA MySQL Docker',
    source: 'itviec',
    salaryMax: 12000000
  })])[0];
  assert.ok(perfect.jobScore >= 55, `Perfect job score ${perfect.jobScore} should be >= 55`);
});

test('detects fresher keyword in text as 0 experience', () => {
  const result = runFilter([job({
    title: 'Java Developer',
    experience: { raw: null, minYears: null, maxYears: null },
    description: 'Vị trí dành cho fresher, mới ra trường cũng có thể ứng tuyển'
  })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].filterInfo.experience.minYears, 0);
});
