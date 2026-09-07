import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJob } from '../src/collector.js';
import { mapTopdevJob } from '../src/sources/topdev.js';
import { extractFlightField, mapVietnamworksJob } from '../src/sources/vietnamworks.js';
import { mapCareervietDetail } from '../src/sources/careerviet.js';
import { mapVieclam24hJob } from '../src/sources/vieclam24h.js';
import { mapGlintsDetail } from '../src/sources/glints.js';
import { mapJobsgoDetail } from '../src/sources/jobsgo.js';

test('maps VietnamWorks into the common job schema', () => {
  const job = normalizeJob(mapVietnamworksJob({
    jobId: 123,
    jobTitle: 'Java Developer',
    jobUrl: 'https://www.vietnamworks.com/java-123-jv',
    companyName: 'Example',
    jobRequirement: '<p>Minimum 4 years of Java experience</p>',
    jobDescription: '<p>Build backend services</p>',
    skills: [{ skillName: 'Java' }],
    workingLocations: [{ address: 'Hà Nội' }],
    prettySalary: 'Thương lượng'
  }));
  assert.equal(job.source, 'vietnamworks');
  assert.equal(job.experience.minYears, 4);
  assert.deepEqual(job.skills, ['Java']);
  assert.equal(job.requirements, 'Minimum 4 years of Java experience');
});

test('maps TopDev into the common job schema', () => {
  const job = normalizeJob(mapTopdevJob({
    id: 456,
    title: 'Java Backend',
    detail_url: 'https://topdev.vn/viec-lam/java-456',
    company: { display_name: 'Example' },
    responsibilities_original: '<p>Develop APIs</p>',
    requirements_original: '<p>Có từ 3 năm kinh nghiệm Java</p>',
    experiences_str: '3 năm',
    skills_arr: ['Java', 'Spring'],
    addresses: { full_addresses: ['Hà Nội'] },
    salary: { value: 'Thương lượng', currency: 'VND' }
  }));
  assert.equal(job.source, 'topdev');
  assert.equal(job.experience.minYears, 3);
  assert.equal(job.description, 'Develop APIs');
  assert.equal(job.requirements, 'Có từ 3 năm kinh nghiệm Java');
});

test('all normalized jobs have the same keys and stable defaults', () => {
  const first = normalizeJob({ source: 'a', title: 'A' });
  const second = normalizeJob({ source: 'b', title: 'B', requirements: 'R' });
  assert.deepEqual(Object.keys(first), Object.keys(second));
  assert.deepEqual(first.skills, []);
  assert.deepEqual(first.experience, { raw: null, minYears: null, maxYears: null });
});

test('extracts a length-prefixed field from the VietnamWorks Next.js stream', () => {
  const html = '<script>self.__next_f.push([1,"1:{\\"jobDescription\\":\\"$2a\\"}\\n2a:T1b,&lt;p&gt;Java"])</script>'
    + '<script>self.__next_f.push([1," API&lt;/p&gt;"])</script>';
  assert.equal(extractFlightField(html, 'jobDescription'), '&lt;p&gt;Java API&lt;/p&gt;');
});

test('maps CareerViet JSON-LD and separate detail sections', () => {
  const html = `
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting', title: 'Junior Java Developer', datePosted: '2026-09-01',
      identifier: { value: 'ABC123' }, hiringOrganization: { name: 'Example' },
      jobLocation: { address: { addressLocality: 'Hà Nội', addressCountry: 'VN' } },
      baseSalary: { currency: 'VND', value: { minValue: 12000000, maxValue: 18000000, unitText: 'MONTH' } },
      skills: 'Java, Spring Boot'
    })}</script>
    <div class="detail-row"><h2 class="detail-title">Mô tả Công việc</h2><p>Xây dựng API</p></div>
    <div class="detail-row"><h2 class="detail-title">Yêu Cầu Công Việc</h2><p>Từ 1 năm kinh nghiệm Java</p></div>
    <div class="detail-row"><h2 class="detail-title">Phúc lợi</h2><p>Thưởng tháng 13</p></div>`;
  const job = normalizeJob(mapCareervietDetail(html, 'https://careerviet.vn/vi/tim-viec-lam/java.ABC123.html'));
  assert.equal(job.source, 'careerviet');
  assert.equal(job.experience.minYears, 1);
  assert.equal(job.salaryMin, 12000000);
  assert.match(job.requirements, /1 năm/);
});

test('maps Vieclam24h structured detail into the common schema', () => {
  const job = normalizeJob(mapVieclam24hJob({
    id: 123, title: 'Java Fresher', vacancy_quantity: 2, salary_min: 10000000,
    salary_max: 15000000, other_requirement: '<p>Không yêu cầu kinh nghiệm</p>',
    description: '<p>Phát triển Java</p>', places: '[{"address":"Cầu Giấy, Hà Nội"}]',
    employer_info: { name: 'Example' }, smart_tags: [{ category: 'Skill', name: 'Spring Boot' }]
  }, { employmentType: 'FULL_TIME' }, 'https://vieclam24h.vn/java-id123.html'));
  assert.equal(job.source, 'vieclam24h');
  assert.equal(job.experience.minYears, 0);
  assert.equal(job.numberOfRecruits, 2);
  assert.deepEqual(job.skills, ['Spring Boot']);
});

test('maps Glints and JobsGO JSON-LD details', () => {
  const jsonLd = JSON.stringify({
    '@type': 'JobPosting', title: 'Java Developer', description: '<p>Minimum 2 years Java</p>',
    hiringOrganization: { name: 'Example' },
    jobLocation: { address: { addressLocality: 'Hà Nội', addressCountry: 'VN' } }
  });
  const html = `<script type="application/ld+json">${jsonLd}</script>`;
  assert.equal(mapGlintsDetail(html, 'https://glints.com/vn/opportunities/jobs/abc', { id: 'abc' }).source, 'glints');
  assert.equal(mapJobsgoDetail(html, 'https://jobsgo.vn/viec-lam/java-123.html').source, 'jobsgo');
});
