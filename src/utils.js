import * as cheerio from 'cheerio';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function cleanText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function htmlToText(html = '') {
  const $ = cheerio.load(`<main>${html}</main>`);
  $('br').replaceWith('\n');
  $('li').each((_, el) => $(el).prepend('• ').append('\n'));
  $('p, h1, h2, h3, h4, div').each((_, el) => $(el).append('\n'));
  return cleanText($('main').text());
}

export function absoluteUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'click_source', 'lab_feature', 'track_action'].forEach((key) => url.searchParams.delete(key));
    return url.toString().replace(/\?$/, '');
  } catch {
    return null;
  }
}

export function slugify(value) {
  return cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseExperience(text = '') {
  const normalized = cleanText(text).toLowerCase();
  const patterns = [
    /(?:từ|tối thiểu|ít nhất|at least|minimum|min\.?|>=)\s*(\d+(?:[.,]\d+)?)\s*(?:năm|years?)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:\+|năm trở lên|years? or more)/i,
    /(?:kinh nghiệm[^\n.]{0,50}?|experience[^\n.]{0,50}?)(\d+(?:[.,]\d+)?)\s*(?:năm|years?)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:-|–|đến|to)\s*(\d+(?:[.,]\d+)?)\s*(?:năm|years?)/i,
    /^(\d+(?:[.,]\d+)?)\s*(?:năm|years?)$/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const first = Number(match[1].replace(',', '.'));
    const second = match[2] ? Number(match[2].replace(',', '.')) : null;
    return { raw: cleanText(match[0]), minYears: first, maxYears: second };
  }
  if (/không yêu cầu kinh nghiệm|no experience required|fresher/i.test(normalized)) {
    return { raw: 'Không yêu cầu kinh nghiệm', minYears: 0, maxYears: 0 };
  }
  return { raw: null, minYears: null, maxYears: null };
}

export function parseJsonLd($, wantedType = 'JobPosting') {
  const values = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {}
  });
  const flattened = values.flatMap((item) => item?.['@graph'] || item);
  return flattened.find((item) => {
    const type = item?.['@type'];
    return type === wantedType || (Array.isArray(type) && type.includes(wantedType));
  }) || null;
}

export function locationFromJsonLd(value) {
  const locations = Array.isArray(value) ? value : value ? [value] : [];
  return locations.map((entry) => {
    const address = entry?.address || entry;
    return [address?.streetAddress, address?.addressLocality, address?.addressRegion, address?.addressCountry?.name || address?.addressCountry]
      .filter(Boolean).join(', ');
  }).filter(Boolean).join(' | ');
}

export function salaryFromJsonLd(value) {
  if (!value) return null;
  const amount = value.value || value;
  const range = [amount.minValue, amount.maxValue].filter((item) => item !== undefined).join(' - ');
  const number = range || amount.value || value.value || null;
  return number ? `${number}${value.currency ? ` ${value.currency}` : ''}${amount.unitText ? `/${amount.unitText}` : ''}` : null;
}
