// n8n Code node
// Mode: Run Once for All Items
// Input: từng job item sau node Filter/Rank
// Output: 1 item duy nhất để gửi 1 email digest ngắn gọn

const jobs = $input.all().map(item => item.json);

function clean(value = '') {
  return String(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatValue(value, fallback = 'Không rõ') {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
  return clean(value) || fallback;
}

function formatDate(value) {
  if (!value) return 'Không rõ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatValue(value);
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatExperience(job) {
  const exp = job.experience || job.filterInfo?.experience;
  if (!exp) return 'Không rõ';
  if (exp.raw) return exp.raw;

  const min = exp.minYears;
  const max = exp.maxYears;
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${min}-${max} năm`;
  }
  if (min !== null && min !== undefined) return `Từ ${min} năm`;
  if (max !== null && max !== undefined) return `Tối đa ${max} năm`;
  return 'Không rõ';
}

function formatSalary(job) {
  if (job.salary) return clean(job.salary);

  const min = Number(job.salaryMin);
  const max = Number(job.salaryMax);
  const currency = job.salaryCurrency || 'VND';
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;

  const money = value => {
    if (currency === 'VND' && value >= 1000000) return `${value / 1000000} triệu VND`;
    return `${value.toLocaleString('vi-VN')} ${currency}`;
  };

  if (hasMin && hasMax) return `${money(min)} - ${money(max)}`;
  if (hasMin) return `Từ ${money(min)}`;
  if (hasMax) return `Lên tới ${money(max)}`;
  return 'Không rõ';
}

const sortedJobs = [...jobs].sort((a, b) => {
  const scoreA = Number(a.jobScore);
  const scoreB = Number(b.jobScore);
  if (Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreB !== scoreA) {
    return scoreB - scoreA;
  }

  const dateA = Date.parse(a.postedAt || a.time || '') || 0;
  const dateB = Date.parse(b.postedAt || b.time || '') || 0;
  return dateB - dateA;
});

function pickReasons(job) {
  if (!Array.isArray(job.matchReasons)) return '';
  return job.matchReasons
    .filter(reason => !reason.startsWith('-'))
    .slice(0, 4)
    .join('; ');
}

const content = sortedJobs.length === 0
  ? 'Không có job phù hợp trong lần quét này.'
  : sortedJobs.map((job, index) => {
      const title = formatValue(job.title, 'Không rõ title');
      const company = formatValue(job.company, 'Không rõ công ty');
      const source = formatValue(job.source, 'Không rõ nguồn');
      const location = formatValue(job.location, 'Không rõ địa điểm');
      const level = formatValue(job.level, 'Không rõ level');
      const skills = formatValue(job.skills, 'Không rõ skill');
      const score = Number.isFinite(Number(job.jobScore)) ? Number(job.jobScore) : null;
      const reasons = pickReasons(job);
      const url = formatValue(job.url, 'Không có link');

      return `
${index + 1}. ${title}${score !== null ? ` (${score} điểm)` : ''}
   Công ty: ${company}
   Địa điểm: ${location}
   KN: ${formatExperience(job)} | Level: ${level} | Lương: ${formatSalary(job)}
   Skills: ${skills}
   Nguồn: ${source} | Đăng: ${formatDate(job.postedAt || job.time)}
   Match: ${reasons || 'Không có'}
   Link: ${url}
`.trim();
    }).join('\n\n');

return [
  {
    json: {
      subject: `Job Java phù hợp: ${sortedJobs.length} job`,
      content,
      totalJobs: sortedJobs.length,
      generatedAt: new Date().toISOString()
    }
  }
];
