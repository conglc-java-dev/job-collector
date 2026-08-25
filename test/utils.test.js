import test from 'node:test';
import assert from 'node:assert/strict';
import { absoluteUrl, htmlToText, parseExperience, slugify } from '../src/utils.js';

test('slugify Vietnamese text', () => assert.equal(slugify('Hà Nội'), 'ha-noi'));

test('converts description HTML to readable text', () => {
  assert.match(htmlToText('<ul><li>Java</li><li>Spring</li></ul>'), /• Java\n• Spring/);
});

test('extracts minimum years of experience', () => {
  assert.deepEqual(parseExperience('Yêu cầu từ 3 năm kinh nghiệm Java'), { raw: 'từ 3 năm', minYears: 3, maxYears: null });
  assert.deepEqual(parseExperience('Tối thiểu 04 năm kinh nghiệm Spring Boot'), { raw: 'tối thiểu 04 năm', minYears: 4, maxYears: null });
  assert.deepEqual(parseExperience('Không yêu cầu kinh nghiệm'), { raw: 'Không yêu cầu kinh nghiệm', minYears: 0, maxYears: 0 });
});

test('removes tracking parameters from a job URL', () => {
  assert.equal(absoluteUrl('/it-jobs/java-company-1234?lab_feature=x&track_action=y', 'https://itviec.com'), 'https://itviec.com/it-jobs/java-company-1234');
});
