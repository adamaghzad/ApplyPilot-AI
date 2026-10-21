"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Award,
  Briefcase,
  Download,
  FileText,
  GraduationCap,
  Languages,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api-client";
import { cn, bytesToSize, timeAgo } from "@/lib/utils";

type Experience = { company?: string; title?: string; start?: string; end?: string; description?: string; highlights?: string[] };
type Education = { school?: string; degree?: string; field?: string; start?: string; end?: string };
type Language = { name?: string; level?: string } | string;

type Parsed = {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  summary: string | null;
  skills: string[];
  experience: Experience[];
  education: Education[];
  certifications: (string | { name?: string; year?: string })[];
  languages: Language[];
  projects?: { name?: string; description?: string }[];
  achievements: string[];
  suggestedTitles: string[];
  missingSkills: string[];
  recommendations: string[];
  rawLength: number;
};

type Document = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isPrimary: boolean;
  parsedData: Parsed | null;
  createdAt: string;
};

const ACCEPTED = ".pdf,.docx,.txt,.md";

export function CvView() {
  const queryClient = useQueryClient();
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const documents = useQuery({
    queryKey: ["cv"],
    queryFn: () => api.get<{ documents: Document[] }>("/api/cv"),
  });

  const docs = documents.data?.documents ?? [];
  const primary = docs.find((doc) => doc.isPrimary) ?? docs[0] ?? null;
  const parsed = primary?.parsedData ?? null;

  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["cv"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  async function upload(file: File) {
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
      toast.error("Unsupported format — upload a PDF, DOCX or TXT file");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<{ document: Document; parsed: Parsed }>("/api/cv", formData);
      toast.success(
        `Parsed ${result.parsed.skills.length} skills · ${result.parsed.experience.length} role(s) · ${result.parsed.yearsExperience ?? "?"} years`,
      );
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not parse this file");
    } finally {
      setUploading(false);
    }
  }

  async function makePrimary(id: string) {
    try {
      await api.post(`/api/cv/${id}/primary`, {});
      toast.success("Primary CV updated");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set the primary CV");
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? Parsed data is removed too.`)) return;
    try {
      await api.delete(`/api/cv/${id}`);
      toast.success("CV deleted");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this CV");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileText className="h-5 w-5 text-primary" /> CV & profile intelligence
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Upload a text-based PDF, DOCX or TXT file. Everything below is extracted from your document — ApplyPilot never
          invents a skill, a job or a qualification, and gaps are shown as gaps.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/70 bg-card/30",
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <p className="text-sm font-medium">{uploading ? "Parsing your CV…" : "Drop your CV here"}</p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT or Markdown — up to 12 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Choose a file
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {!parsed ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
                <FileText className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Upload a CV to see the extracted profile.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{parsed.fullName ?? "Unnamed candidate"}</CardTitle>
                      <CardDescription>{parsed.headline ?? "No headline detected"}</CardDescription>
                    </div>
                    <div className="flex gap-1.5">
                      {parsed.seniority && <Badge variant="outline">{parsed.seniority.toLowerCase()}</Badge>}
                      {parsed.yearsExperience !== null && (
                        <Badge variant="outline">{parsed.yearsExperience} yrs</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {parsed.email && <span>{parsed.email}</span>}
                    {parsed.phone && <span>{parsed.phone}</span>}
                    {(parsed.city || parsed.country) && <span>{[parsed.city, parsed.country].filter(Boolean).join(", ")}</span>}
                    {parsed.linkedinUrl && (
                      <a href={parsed.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        LinkedIn
                      </a>
                    )}
                    {parsed.githubUrl && (
                      <a href={parsed.githubUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        GitHub
                      </a>
                    )}
                  </div>
                  {parsed.summary && <p className="text-xs leading-relaxed text-muted-foreground">{parsed.summary}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" /> Skills ({parsed.skills.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {parsed.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-[11px]">
                      {skill}
                    </Badge>
                  ))}
                  {parsed.skills.length === 0 && (
                    <p className="text-xs italic text-muted-foreground">No skills detected in this document.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-primary" /> Experience
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {parsed.experience.length === 0 && (
                    <p className="text-xs italic text-muted-foreground">No experience section detected.</p>
                  )}
                  {parsed.experience.map((role, index) => (
                    <div key={`${role.company ?? index}-${index}`} className="space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{role.title ?? "Role"}</p>
                        <span className="text-[11px] text-muted-foreground">
                          {[role.start, role.end ?? "Present"].filter(Boolean).join(" — ")}
                        </span>
                      </div>
                      {role.company && <p className="text-xs text-muted-foreground">{role.company}</p>}
                      {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                      {role.highlights && role.highlights.length > 0 && (
                        <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                          {role.highlights.map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <GraduationCap className="h-4 w-4 text-primary" /> Education
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {parsed.education.length === 0 && (
                      <p className="text-xs italic text-muted-foreground">Not detected.</p>
                    )}
                    {parsed.education.map((entry, index) => (
                      <div key={index}>
                        <p className="text-xs font-medium">{entry.degree ?? entry.field ?? "Degree"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {[entry.school, entry.start && entry.end ? `${entry.start} – ${entry.end}` : entry.end]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Award className="h-4 w-4 text-primary" /> Certifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {parsed.certifications.length === 0 && (
                      <p className="text-xs italic text-muted-foreground">Not detected.</p>
                    )}
                    {parsed.certifications.map((cert, index) => (
                      <p key={index} className="text-xs">
                        {typeof cert === "string" ? cert : [cert.name, cert.year].filter(Boolean).join(" — ")}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Languages className="h-4 w-4 text-primary" /> Languages
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {parsed.languages.length === 0 && (
                    <p className="text-xs italic text-muted-foreground">Not detected.</p>
                  )}
                  {parsed.languages.map((language, index) => (
                    <Badge key={index} variant="outline" className="text-[11px]">
                      {typeof language === "string" ? language : [language.name, language.level].filter(Boolean).join(" · ")}
                    </Badge>
                  ))}
                </CardContent>
              </Card>

              {parsed.achievements.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Achievements used in drafts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
                      {parsed.achievements.map((achievement) => (
                        <li key={achievement}>{achievement}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wand2 className="h-4 w-4 text-primary" /> Suggestions
              </CardTitle>
              <CardDescription>Based only on what your CV actually contains</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {parsed?.suggestedTitles && parsed.suggestedTitles.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Matching titles</p>
                  <div className="flex flex-wrap gap-1">
                    {parsed.suggestedTitles.map((title) => (
                      <Badge key={title} variant="secondary" className="text-[10px]">
                        {title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsed?.missingSkills && parsed.missingSkills.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Frequent gaps</p>
                  <div className="flex flex-wrap gap-1">
                    {parsed.missingSkills.map((skill) => (
                      <Badge key={skill} variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {parsed?.recommendations && parsed.recommendations.length > 0 && (
                <>
                  <Separator />
                  <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {parsed.recommendations.map((recommendation) => (
                      <li key={recommendation}>• {recommendation}</li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Uploaded documents</CardTitle>
              <CardDescription>The primary CV is used for every draft</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {docs.length === 0 && <p className="text-xs italic text-muted-foreground">No documents yet.</p>}
              {docs.map((doc) => (
                <motion.div
                  key={doc.id}
                  layout
                  className={cn(
                    "rounded-lg border p-3",
                    doc.isPrimary ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{doc.fileName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {bytesToSize(doc.fileSize)} · {timeAgo(doc.createdAt)}
                      </p>
                    </div>
                    {doc.isPrimary && (
                      <Badge variant="outline" className="shrink-0 text-[10px] text-primary">
                        <Star className="mr-1 h-3 w-3" /> Primary
                      </Badge>
                    )}
                  </div>

                  {doc.parsedData && (
                    <div className="mt-2 space-y-1">
                      <Progress value={Math.min(100, (doc.parsedData.skills.length / 25) * 100)} className="h-1" />
                      <p className="text-[10px] text-muted-foreground">
                        {doc.parsedData.skills.length} skills · {doc.parsedData.experience.length} role(s) ·{" "}
                        {doc.parsedData.rawLength} chars extracted
                      </p>
                    </div>
                  )}

                  <div className="mt-2 flex gap-1.5">
                    {!doc.isPrimary && (
                      <Button size="xs" variant="secondary" onClick={() => void makePrimary(doc.id)}>
                        <Star className="h-3 w-3" /> Set primary
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" asChild>
                      <a href={`/api/cv/${doc.id}/download`} target="_blank" rel="noreferrer">
                        <Download className="h-3 w-3" /> Download
                      </a>
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => void remove(doc.id, doc.fileName)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
