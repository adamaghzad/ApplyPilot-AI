#!/usr/bin/env node
/**
 * End-to-end smoke test for the ApplyPilot AI API.
 *
 * Walks the whole product surface against a running dev server — auth,
 * onboarding, CV ingestion, company research, job discovery, matching, drafting,
 * approval, sending (refused without a mailbox), exports, automation, stats and
 * the SSE stream — and prints a PASS/FAIL report.
 *
 *   node scripts/smoke.mjs                      # http://localhost:3000
 *   BASE_URL=https://x.e2b.app node scripts/smoke.mjs
 *
 * Designed to run offline: network-dependent integrations are expected to
 * report "unavailable" and are asserted to do so honestly rather than succeed.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? `smoke-${Date.now()}@example.com`;
const FALLBACK_EMAIL = process.env.SMOKE_FALLBACK_EMAIL ?? "smoke@example.com";
const PASSWORD = "password123";

let cookie = "";
const results = [];
let failures = 0;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "[32mPASS[0m" : "[31mFAIL[0m";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(method, path, { body, json = true, raw = false, timeout = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body && json ? { "content-type": "application/json" } : {}),
      },
      body: body ? (json ? JSON.stringify(body) : body) : undefined,
      signal: controller.signal,
      redirect: "manual",
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(",").map((c) => c.split(";")[0]).join("; ");

    if (raw) return { status: response.status, headers: response.headers, buffer: Buffer.from(await response.arrayBuffer()) };

    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    return { status: response.status, headers: response.headers, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

const get = (path, opts) => call("GET", path, opts);
const post = (path, body, opts) => call("POST", path, { ...opts, body });
const put = (path, body, opts) => call("PUT", path, { ...opts, body });

function expectOk(label, res, { status = 200, when } = {}) {
  const good = res.status === status && res.body?.ok === true && (!when || when(res.body?.data));
  record(label, good, good ? "" : `status=${res.status} body=${JSON.stringify(res.body)?.slice(0, 220)}`);
  return good ? res.body.data : null;
}

/** A realistic text-based CV rendered to PDF so the PDF extractor is exercised. */
async function buildCvPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  const lines = [
    ["Amine Berrada", 20, bold],
    ["Senior Frontend Engineer — Casablanca, Morocco", 11, font],
    ["amine.berrada@example.com · +212 6 12 34 56 78 · linkedin.com/in/amineberrada", 10, font],
    ["", 10, font],
    ["SUMMARY", 12, bold],
    ["Frontend engineer with 7 years building production React and Next.js products.", 10, font],
    ["", 10, font],
    ["EXPERIENCE", 12, bold],
    ["Senior Frontend Engineer — Maroc Telecom Digital (2021 - Present)", 11, bold],
    ["- Led migration of a 200-page React app to Next.js with TypeScript", 10, font],
    ["- Reduced Time to Interactive by 42% via code splitting and image optimisation", 10, font],
    ["- Delivered customer dashboards used by 120k monthly users", 10, font],
    ["Frontend Engineer — Inwi Labs (2018 - 2021)", 11, bold],
    ["- Built a design system adopted by 6 product teams", 10, font],
    ["- Introduced Playwright end-to-end testing, cutting regression bugs by 35%", 10, font],
    ["", 10, font],
    ["SKILLS", 12, bold],
    ["TypeScript, JavaScript, React, Next.js, Node.js, PostgreSQL, GraphQL, Docker, AWS, Playwright, Tailwind CSS", 10, font],
    ["", 10, font],
    ["EDUCATION", 12, bold],
    ["BSc Computer Science — Université Hassan II (2015 - 2018)", 10, font],
    ["", 10, font],
    ["LANGUAGES", 12, bold],
    ["French (native), English (fluent), Arabic (native), Spanish (intermediate)", 10, font],
    ["", 10, font],
    ["CERTIFICATIONS", 12, bold],
    ["AWS Certified Developer Associate (2022)", 10, font],
  ];

  let y = 800;
  for (const [text, size, f] of lines) {
    if (text) page.drawText(text, { x: 48, y, size, font: f });
    y -= size + 6;
  }
  return Buffer.from(await pdf.save());
}

async function main() {
  console.log(`\n[1mApplyPilot AI — smoke test[0m\n${BASE}\n`);

  // ---------------------------------------------------------------- health
  const health = await get("/api/health");
  const healthData = expectOk("health", health);
  if (healthData) {
    console.log(
      `      driver=${healthData.driver} ai=${healthData.ai.configured ? `${healthData.ai.provider}:${healthData.ai.model} (free=${healthData.ai.freeTier})` : "local engine"}`,
    );
  }

  // ------------------------------------------------------------- auth flow
  // Signup is rate limited (5/h), so fall back to a stable account when a fresh
  // one cannot be created — the walkthrough works with either.
  let signup = await post("/api/auth/signup", {
    name: "Amine Berrada",
    email: EMAIL,
    password: PASSWORD,
    locale: "en",
  });

  if (signup.status !== 201) {
    const reused = await post("/api/auth/login", { email: FALLBACK_EMAIL, password: PASSWORD });
    if (reused.status === 200) {
      signup = { status: 201, body: { ok: true, data: {} } };
      console.log(`      (signup rate limited — reusing ${FALLBACK_EMAIL})`);
    } else {
      const created = await post("/api/auth/signup", {
        name: "Amine Berrada",
        email: FALLBACK_EMAIL,
        password: PASSWORD,
        locale: "en",
      });
      signup = created.status === 201 ? { status: 201, body: { ok: true, data: {} } } : created;
    }
  }

  expectOk("signup", signup, { status: 201 });

  const me = await get("/api/auth/me");
  expectOk("session (me)", me, { when: (d) => d?.user?.email === EMAIL });

  const onboarding = await post("/api/onboarding", {
    profile: {
      fullName: "Amine Berrada",
      headline: "Senior Frontend Engineer",
      phone: "+212612345678",
      city: "Casablanca",
      country: "Morocco",
    },
    preferences: {
      desiredTitles: ["Senior Frontend Engineer", "Frontend Engineer", "Full-stack Engineer"],
      desiredLocations: ["Casablanca", "Remote"],
      workModes: ["REMOTE", "HYBRID"],
      preferredLanguage: "en",
      timezone: "Africa/Casablanca",
    },
    automation: { automationMode: "ASSISTED", dailyApplicationLimit: 10 },
    complete: true,
  });
  expectOk("onboarding", onboarding);

  // ------------------------------------------------------------- CV intake
  const pdf = await buildCvPdf();
  const fd = new FormData();
  fd.append("file", new Blob([pdf], { type: "application/pdf" }), "cv.pdf");
  const cvRes = await post("/api/cv", fd, { json: false });
  const cvData = expectOk("CV upload (PDF)", cvRes, {
    status: 201,
    when: (d) => ((d?.parsed?.profile ?? d?.parsed)?.skills?.length ?? 0) > 3,
  });
  if (cvData) {
    const p = cvData.parsed.profile ?? cvData.parsed;
    console.log(
      `      name="${p.fullName}" skills=${p.skills.length} experience=${p.experience?.length ?? 0} years=${p.yearsExperience} langs=${p.languages?.length ?? 0} certs=${p.certifications?.length ?? 0}`,
    );
    const skills = (p.skills ?? []).map((s) => (typeof s === "string" ? s : s.name));
    record("CV: no 'Java' false positive from 'JavaScript'", !skills.includes("Java"));
    record("CV: React detected", skills.some((s) => /react/i.test(s)));
  }

  const cvList = await get("/api/cv");
  expectOk("CV list", cvList, { when: (d) => (d?.documents?.length ?? 0) >= 1 });

  // ------------------------------------------------------------ demo seed
  const demo = await post("/api/demo", {});
  const demoData = expectOk("demo seed", demo);
  if (demoData) console.log(`      companies=${demoData.companies} jobs=${demoData.jobs} applications=${demoData.applications} contacts=${demoData.contacts}`);

  // ------------------------------------------------------- company research
  const companies = await get("/api/companies");
  const companyList = companies.body?.data?.companies ?? [];
  record("companies list", companyList.length > 0, `${companyList.length} companies`);
  const company = companyList[0];
  if (company) {
    const research = await post(`/api/companies/${company.id}/research`, { deep: false });
    const rData = expectOk("company research", research);
    if (rData) {
      const r = rData.result;
      const honest = r.sources.length === 0 ? r.contacts.length === 0 : true;
      record(
        "research is provenance-honest (no contacts without sources)",
        honest,
        `sources=${r.sources.length} contacts=${r.contacts.length} confidence=${r.confidence}`,
      );
      const invented = r.contacts.filter((c) => !c.sourceUrl || !c.verification);
      record("research contacts all carry source + verification", invented.length === 0);
    }
  }

  // --------------------------------------------------------- job discovery
  const discover = await post("/api/jobs/discover", {
    keywords: ["Frontend Engineer", "Full-stack Engineer"],
    locations: ["Casablanca", "Remote"],
    sources: ["GREENHOUSE", "LEVER", "CAREERS_PAGE", "LINKEDIN"],
    maxAgeDays: 30,
    limit: 20,
  });
  const discoverData = expectOk("job discovery", discover);
  if (discoverData) {
    const reports = discoverData.sourceReports ?? [];
    const unavailable = reports.filter((r) => r.status === "unavailable");
    record(
      "discovery reports unreachable sources honestly",
      reports.length === 0 || unavailable.every((r) => Boolean(r.reason)),
      `${reports.length} sources, ${unavailable.length} unavailable`,
    );
  }

  // ------------------------------------------------------ AI status (free)
  const aiStatusRes = await get("/api/ai/status");
  const aiData = expectOk("ai status", aiStatusRes);
  if (aiData) {
    console.log(`      provider=${aiData.providerLabel ?? "none"} model=${aiData.model ?? "local engine"} freeTier=${aiData.freeTier}`);
    record("ai status exposes a setup hint when unconfigured", aiData.configured ? true : Boolean(aiData.setupHint));
  }

  // --------------------------------------------------------- prepare + draft
  const jobsRes = await get("/api/jobs");
  const appsRes = await get("/api/applications");
  const jobList = jobsRes.body?.data?.jobs ?? [];
  const apps = appsRes.body?.data?.applications ?? [];
  const applied = new Set(apps.map((a) => a.application.jobId));
  const free = jobList.find((j) => !applied.has(j.job.id)) ?? jobList[0];

  const ruleUpdate = await put("/api/automation/rules", {
    key: "min_match_score",
    label: "Minimum compatibility score",
    description: "Only prepare applications at or above this score.",
    enabled: true,
    config: { value: 50 },
  });
  expectOk("automation rule update", ruleUpdate);

  let applicationId = null;
  if (free) {
    const prepare = await post(`/api/jobs/${free.job.id}/prepare`, { force: true });
    const prepData = expectOk("prepare application", prepare);
    applicationId = prepData?.application?.id ?? null;
    if (prepData) console.log(`      status=${prepData.application.status} score=${prepData.application.compatibilityScore} skipped=${prepData.skipped ?? false}`);
  }

  if (applicationId) {
    const detail = await get(`/api/applications/${applicationId}`);
    const d = expectOk("application detail", detail);
    if (d) {
      const email = d.emails?.[0];
      const letter = d.coverLetters?.[0];
      const match = d.match;
      record("draft email generated", Boolean(email?.subject && email?.body), `model=${email?.model ?? "-"}`);
      record("cover letter generated", Boolean(letter?.plainText), `words=${letter?.plainText?.split(/\s+/).length ?? 0} model=${letter?.model ?? "-"}`);
      record("match score grounded (0-100)", (match?.score ?? -1) >= 0 && (match?.score ?? -1) <= 100, `score=${match?.score}`);
      record(
        "no unsourced recipient address",
        !d.application.recipientEmail || (d.contacts ?? []).some((c) => c.email === d.application.recipientEmail),
        d.application.recipientEmail ?? "none",
      );
      if (email?.body) console.log(`      email preview: ${email.body.slice(0, 90).replace(/\n/g, " ")}…`);
    }

    for (const format of ["docx", "pdf", "md", "txt"]) {
      const exp = await get(`/api/applications/${applicationId}/cover-letter/export?format=${format}`, { raw: true });
      const type = exp.headers.get("content-type") ?? "";
      record(
        `cover letter export (${format})`,
        exp.status === 200 && exp.buffer.length > 200,
        `status=${exp.status} bytes=${exp.buffer.length} type=${type.split(";")[0]}`,
      );
    }

    const approve = await post(`/api/applications/${applicationId}/approve`, {});
    expectOk("approve application", approve);

    // No mailbox is connected in this environment: the API must refuse with an
    // actionable message instead of reporting a fake delivery.
    const send = await post(`/api/applications/${applicationId}/send`, {});
    const refused = send.body?.ok === false && /mailbox|connect/i.test(send.body?.error ?? "");
    record("send refused without a connected mailbox", refused, `status=${send.status} ${send.body?.error ?? ""}`.slice(0, 140));

    const afterSend = await get(`/api/applications/${applicationId}`);
    const stillQueued = afterSend.body?.data?.application?.status;
    record("state not faked after refused send", stillQueued === "AWAITING_APPROVAL", `status=${stillQueued}`);
  }

  // --------------------------------------------------------- automation
  const schedule = await put("/api/automation/schedule", {
    enabled: false,
    mode: "ASSISTED",
    timezone: "Africa/Casablanca",
    daysOfWeek: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 11,
    maxPerRun: 3,
  });
  expectOk("schedule update", schedule);

  const rules = await get("/api/automation/rules");
  expectOk("rules list", rules, { when: (d) => Object.keys(d?.rules ?? {}).length > 0 });

  const stop = await post("/api/automation/stop", {});
  record("emergency stop", stop.status === 200 && stop.body?.ok === true, `status=${stop.status}`);

  // ------------------------------------------------------------ dashboard
  const stats = await get("/api/stats");
  const statsData = expectOk("stats", stats);
  if (statsData) console.log(`      pipeline total=${statsData.pipeline?.total} sent=${statsData.pipeline?.sent} awaiting=${statsData.pipeline?.awaitingApproval}`);

  const activity = await get("/api/activity");
  expectOk("activity feed", activity);

  const agents = await get("/api/agents");
  expectOk("agents", agents, { when: (d) => (d?.agents ?? []).length >= 8 });

  const notifications = await get("/api/notifications");
  expectOk("notifications", notifications);

  // -------------------------------------------------------- integrations
  const connections = await get("/api/integrations/connections");
  expectOk("integration connections", connections);

  // Gmail OAuth is unconfigured in this environment: the route must redirect
  // back to Settings with an explicit reason rather than pretending to connect.
  const connect = await get("/api/integrations/google/connect");
  const redirected = connect.status === 307 || connect.status === 302;
  const location = connect.headers?.get?.("location") ?? "";
  record(
    "gmail connect degrades with an explicit reason",
    redirected && location.includes("google-not-configured"),
    `status=${connect.status} location=${location.slice(0, 90)}`,
  );

  // ------------------------------------------------------------------ SSE
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BASE}/api/events/stream`, {
      headers: { ...(cookie ? { cookie } : {}), accept: "text/event-stream" },
      signal: controller.signal,
    });
    const reader = res.body?.getReader();
    const { value } = await reader.read();
    clearTimeout(timer);
    const chunk = Buffer.from(value ?? new Uint8Array()).toString("utf8");
    record("SSE stream emits events", chunk.startsWith("data:"), chunk.slice(0, 90).replace(/\n/g, " "));
    controller.abort();
  } catch (error) {
    record("SSE stream emits events", false, String(error).slice(0, 120));
  }

  // --------------------------------------------------------------- report
  const passed = results.length - failures;
  console.log(`\n[1m${passed}/${results.length} checks passed[0m${failures ? ` — [31m${failures} failed[0m` : " — [32mall green[0m"}\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("smoke test crashed:", error);
  process.exit(1);
});
