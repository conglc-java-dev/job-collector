import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJob } from '../src/collector.js';
import { mapTopdevJob } from '../src/sources/topdev.js';
import { extractFlightField, mapVietnamworksJob } from '../src/sources/vietnamworks.js';

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
