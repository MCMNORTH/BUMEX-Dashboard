"use client";

import { useState } from "react";

import { useI18n } from "@/components/layout/i18n-provider";
import { ModernSelect } from "@/components/ui/modern-select";
import { Textarea } from "@/components/ui/textarea";
import {
  ARCHIVED_STAGE_VALUE,
  describeTransitionError,
  evaluateTransition,
  findStage,
  getActiveStages,
  getDefaultStage,
  getLegacyWorkflow,
  MOVE_REASON_MAX_LENGTH,
} from "@/lib/tickets/workflow";
import type { BoardWorkflow, TransitionOptions } from "@/types/workflow";

type TicketStageFieldProps = {
  mode: "create" | "edit";
  id: string;
  /** The project currently picked in the form; its board decides the stages. */
  projectId: string;
  workflows: Record<string, BoardWorkflow>;
  /** Edit mode: where the ticket is now. */
  originalProjectId?: string;
  originalStageId?: string;
  archived?: boolean;
  /** Edit mode: the ticket is done now, so moving it between boards does not complete it. */
  wasCompleted?: boolean;
  /** Edit mode: whether the viewer may move this ticket to a completed stage. */
  completionRule?: TransitionOptions;
};

/**
 * The ticket form's stage picker. It shows the board's stages and explains a move the
 * board refuses, but the server checks the same rules again on save.
 */
export function TicketStageField({
  mode,
  id,
  projectId,
  workflows,
  originalProjectId,
  originalStageId,
  archived = false,
  wasCompleted = false,
  completionRule = {},
}: TicketStageFieldProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const workflow = projectId ? workflows[projectId] ?? getLegacyWorkflow(projectId, locale) : null;
  const initialStageId = archived ? ARCHIVED_STAGE_VALUE : originalStageId ?? "";

  // The stage a ticket lands in when the form switches it to another board.
  const stageForBoard = (board: BoardWorkflow | null, boardProjectId: string) => {
    if (!board) return "";
    if (boardProjectId === originalProjectId) return initialStageId;
    const sameStage = getActiveStages(board).find((stage) => stage.id === originalStageId);
    return sameStage?.id ?? getDefaultStage(board).id;
  };

  const [selection, setSelection] = useState({ projectId, stageId: stageForBoard(workflow, projectId) });
  const [reason, setReason] = useState("");

  if (selection.projectId !== projectId) {
    setSelection({ projectId, stageId: stageForBoard(workflow, projectId) });
  }

  const label = (
    <label className="text-sm font-medium" htmlFor={id}>
      {isFr ? "Étape" : "Stage"}
    </label>
  );

  if (!workflow) {
    return null;
  }

  if (mode === "create") {
    return (
      <div className="space-y-2">
        {label}
        <p id={id} className="flex h-9 items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground">
          {isFr ? `Commence dans « ${getDefaultStage(workflow).name} »` : `Starts in ${getDefaultStage(workflow).name}`}
        </p>
      </div>
    );
  }

  const sameBoard = projectId === originalProjectId;
  const stageId = selection.stageId;
  const check = sameBoard && originalStageId && stageId && stageId !== ARCHIVED_STAGE_VALUE && stageId !== originalStageId
    ? evaluateTransition(workflow, originalStageId, stageId, reason, completionRule)
    : null;
  const pickedStage = findStage(workflow, stageId);
  // A move to another board skips the board's rules, but not the reporter's sign-off.
  const crossBoardRefusal = !sameBoard && pickedStage?.is_completed && !wasCompleted && completionRule.canComplete === false
    ? describeTransitionError({ code: "reporter_only", from: "", to: pickedStage.name, noReporter: completionRule.hasReporter === false }, locale)
    : null;
  const needsReason = Boolean(
    check
    && workflow.require_reason
    && (check.ok ? check.backward || check.reopen : check.error.code === "reason_required"),
  );
  const refusal = check && !check.ok && check.error.code !== "reason_required"
    ? describeTransitionError(check.error, locale)
    : crossBoardRefusal;
  const currentName = findStage(workflow, originalStageId)?.name;

  return (
    <>
      <div className="space-y-2">
        {label}
        <ModernSelect
          id={id}
          name="stage_id"
          value={stageId}
          onValueChange={(value) => setSelection({ projectId, stageId: value })}
          options={[
            ...getActiveStages(workflow).map((stage) => ({ value: stage.id, label: stage.name })),
            { value: ARCHIVED_STAGE_VALUE, label: isFr ? "Archivé (hors du tableau)" : "Archived (off the board)" },
          ]}
        />
        {refusal ? (
          <p className="text-xs text-danger" role="alert">{refusal}</p>
        ) : sameBoard && currentName && stageId !== originalStageId && stageId !== ARCHIVED_STAGE_VALUE ? (
          <p className="text-xs text-muted-foreground">
            {isFr ? `Actuellement : ${currentName}` : `Currently: ${currentName}`}
          </p>
        ) : null}
      </div>

      {needsReason ? (
        <div className="space-y-2 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor={`${id}-reason`}>
            {isFr ? "Raison du changement d’étape" : "Reason for the stage change"} <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <Textarea
            id={`${id}-reason`}
            name="stage_reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MOVE_REASON_MAX_LENGTH}
            rows={2}
            required
            placeholder={check && check.ok && check.reopen
              ? (isFr ? "Pourquoi rouvrir ce ticket ?" : "Why reopen this ticket?")
              : (isFr ? "Pourquoi revenir en arrière ?" : "Why move it back?")}
          />
        </div>
      ) : null}
    </>
  );
}
