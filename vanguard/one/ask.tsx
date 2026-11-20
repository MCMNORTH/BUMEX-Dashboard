import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useStore } from '../store';
import { useModal } from './modal';

// The questions the browser used to ask (window.confirm, window.prompt), asked in Fluent's dialog instead (2026-11-20):
//   confirmAsk({ title, message?, confirm?, danger? })        → true or false
//   textAsk({ title, label, value?, required?, … })           → the text, or null when cancelled
//   fieldsAsk({ title, fields: [{ label, value? }, …], … })   → the texts in order, or null
// One question at a time (a new one answers the open one "no"); AskHost (App.tsx) draws it. A destructive answer is
// red (danger) and the safe one has the focus; Enter answers, Escape or a click beside the dialog cancels, Tab stays in
// it and, answered, the focus goes back where it was (modal.ts).

export interface AskField {
  label: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
}

export interface AskOptions {
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}

interface Question extends AskOptions {
  id: number;
  fields: AskField[];
  resolve: (values: string[] | null) => void;
}

// French typography: « ? », « ! », « : » keep to the word before them (a no-break space), never alone on a line
const tie = (text?: string) => text?.replace(/ ([?!:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

let open: Question | null = null;
let asked = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function answer(values: string[] | null) {
  const question = open;
  open = null;
  notify();
  question?.resolve(values);
}

export function fieldsAsk(options: AskOptions & { fields: AskField[] }): Promise<string[] | null> {
  return new Promise((resolve) => {
    open?.resolve(null);
    asked += 1;
    open = { ...options, id: asked, resolve };
    notify();
  });
}

export async function confirmAsk(options: AskOptions): Promise<boolean> {
  return (await fieldsAsk({ ...options, fields: [] })) !== null;
}

export async function textAsk(options: AskOptions & AskField): Promise<string | null> {
  const { label, value, placeholder, required, ...rest } = options;
  const values = await fieldsAsk({ ...rest, fields: [{ label, value, placeholder, required }] });
  return values ? values[0] : null;
}

export function AskHost() {
  const question = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => null,
  );
  return question ? <AskDialog key={question.id} question={question} /> : null;
}

function AskDialog({ question }: { question: Question }) {
  const fr = useStore((s) => s.ui.lang !== 'en');
  const [values, setValues] = useState(() => question.fields.map((field) => field.value ?? ''));
  const id = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);
  useModal(box, () => answer(null));

  useEffect(() => {
    if (firstField.current) {
      firstField.current.focus();
      firstField.current.select();
    } else (question.danger ? cancelRef : confirmRef).current?.focus();
  }, [question]);

  const missing = question.fields.some((field, i) => field.required && !values[i].trim());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!missing) answer(values);
  };

  return (
    <div className="modal-back ask-back" onMouseDown={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); answer(null); } }}>
      <form ref={box} className="modal ask" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={question.message ? `${id}-m` : undefined} onSubmit={submit}>
        <h2 id={`${id}-t`}>{tie(question.title)}</h2>
        {question.message && <p id={`${id}-m`} className="ask-text">{tie(question.message)}</p>}
        {question.fields.map((field, i) => (
          <div className="field ask-field" key={i}>
            <label htmlFor={`${id}-${i}`}>{field.label}</label>
            <input
              id={`${id}-${i}`}
              ref={i === 0 ? firstField : undefined}
              className="in"
              value={values[i]}
              placeholder={field.placeholder}
              required={field.required}
              onChange={(event) => setValues((all) => all.map((v, j) => (j === i ? event.target.value : v)))}
            />
          </div>
        ))}
        <div className="actions ask-actions">
          <button type="button" ref={cancelRef} className="btn" onClick={() => answer(null)}>{question.cancel ?? (fr ? 'Annuler' : 'Cancel')}</button>
          <button type="submit" ref={confirmRef} className={`btn primary ${question.danger ? 'danger' : ''}`} disabled={missing}>{question.confirm ?? (fr ? 'Confirmer' : 'Confirm')}</button>
        </div>
      </form>
    </div>
  );
}
