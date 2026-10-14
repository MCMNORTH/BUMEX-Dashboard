"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ArrowUp, CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";

import { saveBoardWorkflowAction } from "@/app/(app)/projects/workflow-actions";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import {
  createStageId,
  describeTransitionError,
  draftToWorkflow,
  evaluateTransition,
  getStageCategoryLabel,
  STAGE_CATEGORIES,
  STAGE_NAME_MAX_LENGTH,
  toWorkflowDraft,
  type WorkflowDraft,
} from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import type { BoardWorkflow, StageCategory, WorkflowSettings as Settings, WorkflowStage } from "@/types/workflow";

type WorkflowSettingsProps = {
  projectId: string;
  workflow: BoardWorkflow;
  /** Non-archived tickets per stage id. */
  cardCounts: Record<string, number>;
  readOnly: boolean;
};

function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-4 rounded-full bg-card shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function WorkflowSettings({ projectId, workflow, cardCounts, readOnly }: WorkflowSettingsProps) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const router = useRouter();
  const [baseline, setBaseline] = useState<WorkflowDraft>(() => toWorkflowDraft(workflow));
  const [draft, setDraft] = useState<WorkflowDraft>(() => toWorkflowDraft(workflow));
  const [updatedAt, setUpdatedAt] = useState(workflow.updated_at);
  const [configured, setConfigured] = useState(workflow.is_configured);
  const [replacingDefaultFor, setReplacingDefaultFor] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [testFrom, setTestFrom] = useState("");
  const [testTo, setTestTo] = useState("");

  const savedIds = useMemo(() => new Set(workflow.stages.map((stage) => stage.id)), [workflow.stages]);
  const active = draft.stages.filter((stage) => !stage.archived_at);
  const archived = draft.stages.filter((stage) => stage.archived_at);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const preview = useMemo(
    () => draftToWorkflow({ ...draft, stages: draft.stages.map((stage, position) => ({ ...stage, position })) }, projectId),
    [draft, projectId],
  );

  const updateStage = (id: string, patch: Partial<WorkflowStage>) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)),
    }));

  const setDefault = (id: string) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage) => ({ ...stage, is_default: stage.id === id })),
    }));

  // Moves a stage one step among the active ones; archived stages keep their slot.
  const moveStage = (id: string, direction: -1 | 1) =>
    setDraft((current) => {
      const activeIds = current.stages.filter((stage) => !stage.archived_at).map((stage) => stage.id);
      const index = activeIds.indexOf(id);
      const swapWith = activeIds[index + direction];

      if (index < 0 || !swapWith) return current;

      const stages = [...current.stages];
      const from = stages.findIndex((stage) => stage.id === id);
      const to = stages.findIndex((stage) => stage.id === swapWith);
      [stages[from], stages[to]] = [stages[to], stages[from]];
      return { ...current, stages };
    });

  const addStage = () =>
    setDraft((current) => ({
      ...current,
      stages: [
        ...current.stages,
        {
          id: createStageId(),
          name: "",
          position: current.stages.length,
          is_default: false,
          is_completed: false,
          category: "in_progress",
          archived_at: null,
        },
      ],
    }));

  const removeUnsavedStage = (id: string) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.filter((stage) => stage.id !== id),
      transitions: Object.fromEntries(
        Object.entries(current.transitions)
          .filter(([from]) => from !== id)
          .map(([from, destinations]) => [from, destinations.filter((to) => to !== id)]),
      ),
    }));

  const archiveStage = (id: string, newDefaultId?: string) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage) => {
        if (stage.id === id) return { ...stage, archived_at: new Date().toISOString(), is_default: false };
        if (newDefaultId) return { ...stage, is_default: stage.id === newDefaultId };
        return stage;
      }),
    }));

  const toggleTransition = (from: string, to: string) =>
    setDraft((current) => {
      const destinations = current.transitions[from] ?? [];
      return {
        ...current,
        transitions: {
          ...current.transitions,
          [from]: destinations.includes(to) ? destinations.filter((id) => id !== to) : [...destinations, to],
        },
      };
    });

  // Lists every move the board settings allow, as a starting point for custom rules.
  const fillTransitionsFromSettings = () =>
    setDraft((current) => {
      const board = draftToWorkflow(
        { ...current, custom_transitions_enabled: false, require_reason: false, stages: current.stages.map((stage, position) => ({ ...stage, position })) },
        projectId,
      );
      const stages = current.stages.filter((stage) => !stage.archived_at);
      return {
        ...current,
        transitions: Object.fromEntries(
          stages.map((from) => [
            from.id,
            stages.filter((to) => to.id !== from.id && evaluateTransition(board, from.id, to.id).ok).map((to) => to.id),
          ]),
        ),
      };
    });

  const setSetting = (key: keyof Settings, value: boolean) => setDraft((current) => ({ ...current, [key]: value }));

  function save() {
    setMessage(null);
    startSaving(async () => {
      const result = await saveBoardWorkflowAction(projectId, draft, updatedAt);

      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }

      setUpdatedAt(result.updatedAt ?? null);
      setConfigured(true);
      setBaseline(draft);
      setMessage({ tone: "success", text: tr("Workflow enregistré. Aucune carte n’a été déplacée.", "Workflow saved. No card was moved.") });
      router.refresh();
    });
  }

  const settings: Array<{ key: keyof Settings; title: string; description: string }> = [
    {
      key: "allow_backward",
      title: tr("Autoriser le retour en arrière", "Allow backward movement"),
      description: tr("Les cartes peuvent revenir à une étape active précédente.", "Cards may move to an earlier active stage."),
    },
    {
      key: "allow_skip_forward",
      title: tr("Autoriser le saut d’étapes", "Allow skipping forward"),
      description: tr("Sinon, une carte n’avance que vers l’étape active suivante.", "Otherwise a card can only move forward to the next active stage."),
    },
    {
      key: "allow_reopen",
      title: tr("Autoriser la réouverture des cartes terminées", "Allow reopening completed cards"),
      description: tr("Une carte d’une étape terminée peut repartir vers une étape non terminée, si les autres règles le permettent.", "A card in a completed stage may move to a non-completed stage, subject to the other rules."),
    },
    {
      key: "require_reason",
      title: tr("Exiger une raison pour un retour ou une réouverture", "Require a reason for backward moves or reopening"),
      description: tr("Le déplacement n’est enregistré qu’avec une raison non vide, conservée dans l’historique.", "The move only goes through with a non-empty reason, kept in the ticket's history."),
    },
  ];

  const testResult = testFrom && testTo && testFrom !== testTo
    ? evaluateTransition(preview, testFrom, testTo)
    : null;
  const stageOptions = active.map((stage) => ({ value: stage.id, label: stage.name || tr("(sans nom)", "(unnamed)") }));

  return (
    <div className="space-y-4 pb-20">
      {!configured ? (
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {tr(
            "Ce tableau utilise encore les étapes intégrées, avec déplacement libre. Enregistrer ici crée sa propre configuration ; chaque ticket garde son étape actuelle.",
            "This board still uses the built-in stages with free movement. Saving here gives it its own configuration; every ticket keeps its current stage.",
          )}
        </div>
      ) : null}

      {readOnly ? (
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {tr("Seuls les responsables du projet peuvent modifier son workflow.", "Only the project's managers can change its workflow.")}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{tr("Étapes", "Stages")}</CardTitle>
          <CardDescription>
            {tr(
              "Les colonnes du tableau, de gauche à droite. « Avant » et « arrière » suivent cet ordre. Renommer ou réordonner ne déplace aucune carte.",
              "The board's columns, left to right. \"Forward\" and \"backward\" follow this order. Renaming or reordering never moves a card.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden gap-3 px-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[4.5rem_minmax(0,1fr)_11rem_7rem_6rem_5rem_7.5rem]">
            <span>{tr("Ordre", "Order")}</span>
            <span>{tr("Nom", "Name")}</span>
            <span>{tr("Compte comme", "Counts as")}</span>
            <span>{tr("Terminée", "Completed")}</span>
            <span>{tr("Par défaut", "Default")}</span>
            <span>{tr("Cartes", "Cards")}</span>
            <span />
          </div>

          <ol className="space-y-2">
            {active.map((stage, index) => {
              const cards = cardCounts[stage.id] ?? 0;
              const saved = savedIds.has(stage.id);
              const nameId = `stage-name-${stage.id}`;

              return (
                <li key={stage.id} className="rounded-lg border border-border bg-card p-2">
                  <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-[4.5rem_minmax(0,1fr)_11rem_7rem_6rem_5rem_7.5rem]">
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={readOnly || index === 0} onClick={() => moveStage(stage.id, -1)} aria-label={tr(`Monter ${stage.name}`, `Move ${stage.name} up`)}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8" disabled={readOnly || index === active.length - 1} onClick={() => moveStage(stage.id, 1)} aria-label={tr(`Descendre ${stage.name}`, `Move ${stage.name} down`)}>
                        <ArrowDown />
                      </Button>
                    </div>

                    <Input
                      id={nameId}
                      value={stage.name}
                      onChange={(event) => updateStage(stage.id, { name: event.target.value })}
                      maxLength={STAGE_NAME_MAX_LENGTH}
                      placeholder={tr("Nom de l’étape", "Stage name")}
                      aria-label={tr("Nom de l’étape", "Stage name")}
                      disabled={readOnly}
                      required
                    />

                    <ModernSelect
                      name={`category-${stage.id}`}
                      value={stage.is_completed ? "done" : stage.category}
                      disabled={readOnly || stage.is_completed}
                      onValueChange={(value) => updateStage(stage.id, { category: value as StageCategory })}
                      options={stage.is_completed
                        ? [{ value: "done", label: getStageCategoryLabel("done", locale) }]
                        : STAGE_CATEGORIES.map((category) => ({ value: category, label: getStageCategoryLabel(category, locale) }))}
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={stage.is_completed}
                        disabled={readOnly}
                        onChange={(event) => updateStage(stage.id, { is_completed: event.target.checked })}
                      />
                      <span className="lg:sr-only">{tr("Terminée", "Completed")}</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="default-stage"
                        className="size-4 accent-[var(--primary)]"
                        checked={stage.is_default}
                        disabled={readOnly}
                        onChange={() => setDefault(stage.id)}
                      />
                      <span className="lg:sr-only">{tr("Par défaut", "Default")}</span>
                    </label>

                    <span className="text-sm tabular-nums text-muted-foreground">
                      {cards} <span className="lg:sr-only">{tr("carte(s)", cards === 1 ? "card" : "cards")}</span>
                    </span>

                    <div className="flex justify-end">
                      {!saved ? (
                        <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => removeUnsavedStage(stage.id)}>
                          <Trash2 />
                          {tr("Retirer", "Remove")}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={readOnly || cards > 0 || active.length <= 1}
                          title={cards > 0
                            ? tr("Déplacez d’abord ses cartes vers une autre étape active.", "Move its cards to another active stage first.")
                            : active.length <= 1
                              ? tr("Un tableau garde au moins une étape active.", "A board keeps at least one active stage.")
                              : undefined}
                          onClick={() => {
                            if (stage.is_default) {
                              setReplacingDefaultFor(stage.id);
                              setReplacementId(active.find((other) => other.id !== stage.id)?.id ?? "");
                            } else {
                              archiveStage(stage.id);
                            }
                          }}
                        >
                          <Archive />
                          {tr("Archiver", "Archive")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {replacingDefaultFor === stage.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-sm">
                      <span>{tr("C’est l’étape par défaut. Nouvelle étape par défaut :", "This is the default stage. New default stage:")}</span>
                      <div className="w-48">
                        <ModernSelect
                          name="replacement-default"
                          value={replacementId}
                          onValueChange={setReplacementId}
                          options={stageOptions.filter((option) => option.value !== stage.id)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!replacementId}
                        onClick={() => {
                          archiveStage(stage.id, replacementId);
                          setReplacingDefaultFor(null);
                        }}
                      >
                        {tr("Archiver", "Archive")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setReplacingDefaultFor(null)}>
                        {tr("Annuler", "Cancel")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {!readOnly ? (
            <Button type="button" variant="secondary" onClick={addStage}>
              <Plus />
              {tr("Ajouter une étape", "Add stage")}
            </Button>
          ) : null}

          {archived.length ? (
            <details className="group pt-2">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                {tr(`Étapes archivées (${archived.length})`, `Archived stages (${archived.length})`)}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {archived.map((stage) => (
                  <li key={stage.id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {stage.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {tr("conservée pour l’historique", "kept for history")}
                      </span>
                    </span>
                    <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => updateStage(stage.id, { archived_at: null })}>
                      <RotateCcw />
                      {tr("Restaurer", "Restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Règles de déplacement", "Movement rules")}</CardTitle>
          <CardDescription>
            {tr(
              "Appliquées à chaque changement d’étape : glisser-déposer, formulaire du ticket et appels au serveur. Réordonner les cartes dans une même étape n’est pas concerné.",
              "Applied to every stage change: drag and drop, the ticket form, and server requests. Reordering cards within a stage is not affected.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {settings.map((setting) => (
            <div key={setting.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p id={`setting-${setting.key}`} className="text-sm font-medium">{setting.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{setting.description}</p>
              </div>
              <Switch
                labelledBy={`setting-${setting.key}`}
                checked={draft[setting.key]}
                disabled={readOnly}
                onChange={(value) => setSetting(setting.key, value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle id="setting-custom_transitions_enabled">{tr("Transitions personnalisées", "Custom transitions")}</CardTitle>
              <CardDescription className="mt-1.5">
                {tr(
                  "Une fois activées, seules les transitions cochées sont permises, et elles doivent aussi respecter les règles ci-dessus.",
                  "When enabled, only the checked transitions are allowed, and they must still satisfy the rules above.",
                )}
              </CardDescription>
            </div>
            <Switch
              labelledBy="setting-custom_transitions_enabled"
              checked={draft.custom_transitions_enabled}
              disabled={readOnly}
              onChange={(value) => setSetting("custom_transitions_enabled", value)}
            />
          </div>
        </CardHeader>
        {draft.custom_transitions_enabled ? (
          <CardContent className="space-y-3">
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 bg-card px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                      {tr("De ↓ / Vers →", "From ↓ / To →")}
                    </th>
                    {active.map((to) => (
                      <th key={to.id} scope="col" className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                        {to.name || "—"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((from) => (
                    <tr key={from.id} className="border-t border-border">
                      <th scope="row" className="sticky left-0 border-t border-border bg-card px-2 py-2 text-left font-medium">
                        {from.name || "—"}
                      </th>
                      {active.map((to) => {
                        if (from.id === to.id) {
                          return <td key={to.id} className="border-t border-border bg-muted/40" aria-hidden="true" />;
                        }

                        const listed = (draft.transitions[from.id] ?? []).includes(to.id);
                        // Precedence: a listed transition still has to pass the board settings.
                        const boardCheck = evaluateTransition({ ...preview, custom_transitions_enabled: false, require_reason: false }, from.id, to.id);
                        const blockedBySettings = !boardCheck.ok;

                        return (
                          <td key={to.id} className="border-t border-border px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--primary)]"
                              checked={listed}
                              disabled={readOnly}
                              onChange={() => toggleTransition(from.id, to.id)}
                              aria-label={`${from.name} → ${to.name}`}
                              title={listed && blockedBySettings ? describeTransitionError(boardCheck.error, locale) : undefined}
                            />
                            {listed && blockedBySettings ? (
                              <span className="sr-only">{describeTransitionError(boardCheck.error, locale)}</span>
                            ) : null}
                            {listed && blockedBySettings ? (
                              <span aria-hidden="true" className="ml-1 text-xs text-warning">!</span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {tr(
                  "« ! » : transition cochée mais encore bloquée par les règles de déplacement.",
                  "\"!\": the transition is checked but still blocked by the movement rules.",
                )}
              </p>
              {!readOnly ? (
                <Button type="button" variant="secondary" size="sm" onClick={fillTransitionsFromSettings}>
                  {tr("Cocher ce que les règles autorisent", "Check what the rules allow")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Tester un déplacement", "Try a move")}</CardTitle>
          <CardDescription>
            {tr("Vérifie la configuration ci-dessus, avant même de l’enregistrer.", "Checks the configuration above, even before it is saved.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr] sm:items-center">
          <ModernSelect name="test-from" value={testFrom} onValueChange={setTestFrom} placeholder={tr("De…", "From…")} options={stageOptions} />
          <ModernSelect name="test-to" value={testTo} onValueChange={setTestTo} placeholder={tr("Vers…", "To…")} options={stageOptions} />
          <p
            className={cn(
              "text-sm",
              !testResult ? "text-muted-foreground" : testResult.ok ? "text-success" : "text-danger",
            )}
            aria-live="polite"
          >
            {!testResult
              ? tr("Choisissez deux étapes différentes.", "Pick two different stages.")
              : testResult.ok
                ? draft.require_reason && (testResult.backward || testResult.reopen)
                  ? tr("Autorisé, avec une raison obligatoire.", "Allowed, with a required reason.")
                  : tr("Autorisé.", "Allowed.")
                : testResult.error.code === "reason_required"
                  ? tr("Autorisé, avec une raison obligatoire.", "Allowed, with a required reason.")
                  : describeTransitionError(testResult.error, locale)}
          </p>
        </CardContent>
      </Card>

      {!readOnly ? (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-[var(--shadow-elevated)] backdrop-blur">
          {message ? (
            <p role={message.tone === "error" ? "alert" : "status"} className={cn("mr-auto flex items-center gap-1.5 text-sm", message.tone === "error" ? "text-danger" : "text-success")}>
              {message.tone === "success" ? <CheckCircle2 className="size-4" /> : null}
              {message.text}
            </p>
          ) : dirty ? (
            <p className="mr-auto text-sm text-muted-foreground">{tr("Modifications non enregistrées", "Unsaved changes")}</p>
          ) : null}
          <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(baseline); setMessage(null); }}>
            {tr("Annuler les modifications", "Discard changes")}
          </Button>
          <Button type="button" disabled={(!dirty && configured) || saving} onClick={save}>
            {saving ? tr("Enregistrement…", "Saving…") : tr("Enregistrer le workflow", "Save workflow")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
