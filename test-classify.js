import { classifyEmail } from "./classify.js";

const cases = [
  {
    name: "applied / confirmation",
    expect: { job_related: true, company: "Northwind Robotics", status: "applied" },
    email: {
      from: "Northwind Robotics Careers <no-reply@northwindrobotics.com>",
      subject: "We received your application",
      body: "Hi Rutvij, thanks for applying to the Backend Software Engineering Intern position at Northwind Robotics. We've received your application and our recruiting team will review it. If your background is a match, we'll reach out to schedule next steps. Best, The Northwind Robotics Talent Team",
    },
  },
  {
    name: "interview invite",
    expect: { job_related: true, company: "Northwind Robotics", status: "interview" },
    email: {
      from: "Dana Lee <dana.lee@northwindrobotics.com>",
      subject: "Next steps: interview for Backend Software Engineer, Intern",
      body: "Hi Rutvij, thank you for your interest in the Backend Software Engineer, Intern role at Northwind Robotics. We'd like to invite you to a 45-minute technical interview next week. Please reply with your availability for Tuesday through Thursday. Looking forward to speaking with you. Dana Lee, Technical Recruiter",
    },
  },
  {
    name: "rejection",
    expect: { job_related: true, company: "Cascade Analytics", status: "rejected" },
    email: {
      from: "Cascade Analytics <careers@cascadeanalytics.io>",
      subject: "Update on your application",
      body: "Dear Rutvij, thank you for applying for the Software Engineering Intern role at Cascade Analytics and for the time you invested in the process. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our needs. We encourage you to apply for future openings.",
    },
  },
  {
    name: "offer / accepted",
    expect: { job_related: true, company: "Helix Payments", status: "accepted" },
    email: {
      from: "Priya Nair <priya.nair@helixpayments.com>",
      subject: "Offer: Backend Engineering Intern at Helix Payments",
      body: "Hi Rutvij, we're thrilled to offer you the Backend Engineering Intern position at Helix Payments for the summer. Your offer letter is attached. Please review it and reply by Friday to confirm your acceptance. Congratulations and welcome to the team!",
    },
  },
  {
    name: "ATS-style sender (Greenhouse), still one application",
    expect: { job_related: true, company: "Orbit Labs", status: "applied" },
    email: {
      from: "Orbit Labs <no-reply@us.greenhouse-mail.io>",
      subject: "Thank you for applying to Orbit Labs",
      body: "Thank you for applying to the Platform Engineering Intern role at Orbit Labs. Your application has been submitted successfully and is now under review.",
    },
  },
  {
    name: "job digest (multiple roles) -> false",
    expect: { job_related: false },
    email: {
      from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
      subject: "5 new jobs for 'backend intern' in San Diego",
      body: "Backend Intern at Acme Corp. Software Engineer Intern at Globex. Platform Intern at Initech. Data Engineering Intern at Umbrella Co. Backend Developer Intern at Hooli. Apply now to jobs you may like.",
    },
  },
  {
    name: "cold recruiter outreach (no application) -> false",
    expect: { job_related: false },
    email: {
      from: "Sam Ortiz <sam@talentbridge.com>",
      subject: "Exciting backend opportunity",
      body: "Hi Rutvij, I came across your profile and think you'd be a great fit for a role at one of our clients. Do you have time for a quick call this week? Best, Sam",
    },
  },
  {
    name: "application-adjacent marketing -> false",
    expect: { job_related: false },
    email: {
      from: "Handshake <noreply@joinhandshake.com>",
      subject: "Employers are viewing profiles like yours",
      body: "Boost your chances of getting hired. Complete your profile, explore internships, and see which employers viewed your profile this week.",
    },
  },
  {
    name: "unrelated (shipping) -> false",
    expect: { job_related: false },
    email: {
      from: "UPS <pkginfo@ups.com>",
      subject: "Your package has shipped",
      body: "Your order shipped today. Track your package with the number below. Estimated delivery: Thursday.",
    },
  },
];

let passed = 0;
for (const { name, expect, email } of cases) {
  const t = Date.now();
  const r = await classifyEmail(email);
  const ms = Date.now() - t;

  const ok =
    r.job_related === expect.job_related &&
    (expect.status === undefined || r.status === expect.status) &&
    (expect.company === undefined ||
      r.company?.toLowerCase() === expect.company.toLowerCase());

  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${ms}ms)`);
  if (!ok) console.log("  expected:", expect, "\n  got:     ", r);
  else if (r.job_related) console.log("  ", r);
}
console.log(`\n${passed}/${cases.length} passed`);
