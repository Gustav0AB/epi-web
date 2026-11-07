import type { CourseSubmissionDto } from "@epi/shared";
import { Table } from "../../shared/components";

type Submission = Pick<CourseSubmissionDto, "id" | "answers" | "reviewExcluded">;

export function CourseAnswerReview({ submissions, submissionId, onlyBlanks = false }: { submissions: Submission[]; submissionId?: string | null; onlyBlanks?: boolean }) {
  const rows = submissions.flatMap((submission, index) => {
    if (submissionId && submission.id !== submissionId || onlyBlanks && submission.reviewExcluded) return [];
    return submission.answers.filter(answer => !onlyBlanks || !answer.value.trim()).map(answer => ({
      id: JSON.stringify([submission.id, answer.questionId]),
      submission: `Envío ${index + 1}`,
      excluded: submission.reviewExcluded,
      question: answer.text,
      value: answer.value,
    }));
  });
  return <Table rows={rows} pageSize={10} keyExtractor={row => row.id} emptyText={onlyBlanks ? "No hay respuestas vacías en los campos guardados de esta selección." : "No hay respuestas guardadas para este envío."} columns={[
    { key: "submission", header: "Envío", render: row => <div>{row.submission}{row.excluded && <p className="text-xs">Excluido</p>}</div> },
    { key: "question", header: "Pregunta", render: row => <p className="max-w-md whitespace-normal">{row.question}</p> },
    { key: "value", header: "Respuesta", render: row => <p className={row.value.trim() ? "max-w-md whitespace-pre-wrap break-words" : "text-amber-700"}>{row.value.trim() ? row.value : "Sin contestar"}</p> },
  ]} />;
}
