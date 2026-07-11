"use client";

import { useState } from "react";
import {
  upsertQuestionBankEntry,
  setQuestionBankEntryActive,
  deleteQuestionBankEntry,
} from "@/lib/actions/question-bank";
import type { QuestionBankEntry } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY_FORM = {
  id: "",
  subject: "",
  role_tags: "",
  company_tags: "",
  question_text: "",
  reference_answer: "",
  difficulty: "medium",
  question_type: "technical",
};

export function QuestionBankManager({
  questions,
}: {
  questions: QuestionBankEntry[];
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);

  function startEdit(q: QuestionBankEntry) {
    setForm({
      id: q.id,
      subject: q.subject,
      role_tags: q.role_tags.join(", "),
      company_tags: q.company_tags.join(", "),
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      difficulty: q.difficulty,
      question_type: q.question_type,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await upsertQuestionBankEntry(new FormData(e.currentTarget));
      setForm(EMPTY_FORM);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>
            {form.id ? "Edit question" : "Add a question to the bank"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            key={form.id || "new"}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="id" defaultValue={form.id} />
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="dsa, oops, dbms, hr, communication..."
                  defaultValue={form.subject}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="question_type">Question type</Label>
                <Select
                  name="question_type"
                  defaultValue={form.question_type}
                >
                  <SelectTrigger id="question_type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="behavioral">Behavioral</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="hr">HR</SelectItem>
                    <SelectItem value="resume_followup">
                      Resume follow-up
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="role_tags">Role tags (comma separated)</Label>
                <Input
                  id="role_tags"
                  name="role_tags"
                  placeholder="sde, software_engineer"
                  defaultValue={form.role_tags}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company_tags">
                  Company tags (comma separated)
                </Label>
                <Input
                  id="company_tags"
                  name="company_tags"
                  placeholder="tcs, infosys, amazon"
                  defaultValue={form.company_tags}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="question_text">Question</Label>
              <Textarea
                id="question_text"
                name="question_text"
                rows={2}
                defaultValue={form.question_text}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="reference_answer">
                Reference answer (used to ground AI scoring)
              </Label>
              <Textarea
                id="reference_answer"
                name="reference_answer"
                rows={4}
                defaultValue={form.reference_answer}
                required
              />
            </div>

            <div className="flex flex-col gap-2 max-w-xs">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select name="difficulty" defaultValue={form.difficulty}>
                <SelectTrigger id="difficulty" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={pending}>
                {form.id ? "Save changes" : "Add question"}
              </Button>
              {form.id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForm(EMPTY_FORM)}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Question bank ({questions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Badge variant="secondary">{q.subject}</Badge>
                  </TableCell>
                  <TableCell className="max-w-sm truncate">
                    {q.question_text}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {q.role_tags.join(", ")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {q.company_tags.join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={q.is_active ? "default" : "outline"}>
                      {q.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(q)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setQuestionBankEntryActive(q.id, !q.is_active)
                      }
                    >
                      {q.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteQuestionBankEntry(q.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
