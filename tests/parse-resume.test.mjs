import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseResume, plain, ResumeParseError } from '../scripts/parse-resume.mjs';

// A copy of resume.tex with the real phone number replaced by a fake +91 one.
const tex = readFileSync(new URL('./fixtures/resume.tex', import.meta.url), 'utf8');
const resume = parseResume(tex);
const byCompany = Object.fromEntries(resume.experience.map((c) => [c.company, c]));

describe('parse-resume on the fixture', () => {
  it('finds every company with the right number of roles', () => {
    expect(resume.experience.map((c) => [c.company, c.roles.length])).toEqual([
      ['Elucidata', 2],
      ['CareerBuilder', 1],
      ['SumTotal Systems', 3],
      ['Defence Laboratory', 1],
    ]);
    expect(byCompany.Elucidata.location).toBe('Delhi');
  });

  it('parses role and education dates', () => {
    const [director, srem] = byCompany.Elucidata.roles;
    expect(director).toMatchObject({ title: 'Director of Engineering', start: '2023-01', end: null });
    expect(srem).toMatchObject({ title: 'Sr. Engineering Manager', start: '2022-03', end: '2022-12' });
    expect(byCompany['SumTotal Systems'].roles.map((r) => [r.start, r.end])).toEqual([
      ['2018-05', '2018-12'],
      ['2015-04', '2018-05'],
      ['2013-08', '2015-03'],
    ]);
    expect(resume.education[0]).toMatchObject({ institution: 'Indian Institute of Technology, Delhi', start: '2009', end: '2013' });
  });

  it('never emits the phone number', () => {
    expect(tex).toContain('+91'); // the fixture does have one to leak
    const json = JSON.stringify(resume);
    expect(json).not.toContain('+91');
    expect(json).not.toMatch(/tel:/i);
    expect(Object.keys(resume.basics).sort()).toEqual(['city', 'email', 'linkedin', 'name', 'website']);
  });

  it('keeps links as rich text', () => {
    const links = JSON.stringify(byCompany.Elucidata.roles[0].highlights);
    expect(links).toContain('"href":"https://www.elucidata.io/webinars/scaling-compute-for-building-foundation-models-in-biology"');
    expect(resume.basics.linkedin).toBe('https://www.linkedin.com/in/sharshveer/');
    expect(resume.basics.website).toBe('https://harshveer.me/');
  });

  it('reads summaries, highlights and plain lines inside highlights', () => {
    const director = byCompany.Elucidata.roles[0];
    expect(director.summary).toHaveLength(2);
    expect(director.highlights).toHaveLength(10);
    // CareerBuilder's highlights block holds only plain lines: each becomes a summary paragraph.
    const lead = byCompany.CareerBuilder.roles[0];
    expect(lead.highlights).toHaveLength(0);
    expect(lead.summary).toHaveLength(5);
    expect(lead.summary[2][0]).toEqual({ text: 'Communication System', bold: true });
    // A wrapped \item continues on the next line.
    expect(plain(byCompany.Elucidata.roles[1].highlights[1])).toMatch(/AWS cloud Using Terraform to manage infra\.$/);
  });

  it('converts LaTeX escapes to text', () => {
    expect(resume.skills.map((s) => s.label)).toEqual(['Languages', 'Databases', 'Cloud', 'Frameworks & Technologies']);
    expect(resume.skills[0].items).toContain('C#');
    expect(resume.skills[2].items[0]).toMatch(/^AWS\(EC2, ECS,/);
    expect(resume.introduction).toHaveLength(3);
    expect(plain(resume.introduction[1])).toContain('.NET, C#, .NET Core');
  });
});

describe('parse-resume fails loudly', () => {
  const lines = tex.split('\n');
  const lineOf = (needle) => lines.findIndex((l) => l.includes(needle)) + 1;
  const breakAt = (needle, replacement) => tex.replace(needle, replacement);

  it('on an unknown command, with its line number', () => {
    const at = lineOf('I have around 13+ years');
    const broken = breakAt('I have around 13+ years', '\\unknowncmd{x} I have around 13+ years');
    expect(() => parseResume(broken)).toThrow(ResumeParseError);
    expect(() => parseResume(broken)).toThrow(`resume.tex line ${at}: unrecognised command "\\unknowncmd"`);
  });

  it('on an unknown environment inside an entry', () => {
    const broken = breakAt('\\begin{highlights}\n                \\item Engineering', '\\begin{enumerate}\n                \\item Engineering');
    expect(() => parseResume(broken)).toThrow(/line \d+: unexpected environment/);
  });

  it('on an unreadable date', () => {
    const broken = breakAt('January 2023 - Present', 'Janvier 2023 - Present');
    expect(() => parseResume(broken)).toThrow(/line \d+: unrecognised month "Janvier"/);
  });

  it('on stray text at section level', () => {
    const broken = breakAt('\\section{Education}', '\\section{Education}\n\\textbf{loose text}');
    expect(() => parseResume(broken)).toThrow(/line \d+: unrecognised line in education/);
  });

  it('when a phone number would leak through the body', () => {
    const broken = breakAt('I have around 13+ years', 'Call +91-9000000000. I have around 13+ years');
    expect(() => parseResume(broken)).toThrow(/phone number/);
  });
});
