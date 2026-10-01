"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  FiArrowDown,
  FiArrowUp,
  FiCheck,
  FiDownload,
  FiFile,
  FiMessageSquare,
  FiMic,
  FiPause,
  FiPlay,
  FiPlus,
  FiSave,
  FiSquare,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  EMPTY_OPERATION_DETAILS,
  makeOperationId,
  makeOperationPartId,
  type ChecklistItem,
  type MeetingTopic,
  type Operation,
  type OperationDetails,
} from "./operations-data";
import { logAudit, useReferenceData } from "./reference-data";

type DetailTab =
  | "details"
  | "meeting"
  | "comments"
  | "files"
  | "transcript"
  | "activity";

type CommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type FileRow = {
  id: string;
  item_id: string;
  object_key: string;
  name: string;
  mime: string;
  size: number;
  purpose: string;
  author_id: string;
  created_at: string;
};

type TranscriptRow = {
  item_id: string;
  text: string;
  segments: unknown[];
  source: string;
  generated_at: string | null;
  author_id: string;
  updated_at: string;
  version: number;
};

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

function bytes(size: number) {
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return Math.round(size / 1024) + " KB";
  return (size / (1024 * 1024)).toFixed(1) + " MB";
}

function profileLabel(
  profiles: ReturnType<typeof useReferenceData>["data"]["profiles"],
  id: string | null,
) {
  if (!id) return "Sem responsável";
  const profile = profiles.find((item) => item.id === id);
  return profile?.displayName || profile?.email || "Usuário";
}

export function OperationDetail({
  operation: initialOperation,
  operations,
  onClose,
  onSave,
  onRefresh,
}: {
  operation: Operation;
  operations: Operation[];
  onClose: () => void;
  onSave: (operation: Operation) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const reference = useReferenceData();
  const [operation, setOperation] = useState(initialOperation);
  const [tab, setTab] = useState<DetailTab>(
    initialOperation.kind === "meeting" ? "meeting" : "details",
  );
  const [details, setDetails] = useState<OperationDetails>(
    JSON.parse(JSON.stringify(initialOperation.details || EMPTY_OPERATION_DETAILS)),
  );
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [transcript, setTranscript] = useState<TranscriptRow | null>(null);
  const [comment, setComment] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [segmentsText, setSegmentsText] = useState("[]");
  const [linkedTaskTitle, setLinkedTaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "paused" | "ready"
  >("idle");
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sizeRef = useRef(0);

  const profiles = reference.data.profiles;

  const fetchRelated = async () => {
    const supabase = await getSupabase();
    const [commentResult, fileResult, transcriptResult] = await Promise.all([
      supabase
        .from("operational_comments")
        .select("id,author_id,body,created_at")
        .eq("item_id", operation.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("operational_files")
        .select(
          "id,item_id,object_key,name,mime,size,purpose,author_id,created_at",
        )
        .eq("item_id", operation.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("operational_transcripts")
        .select(
          "item_id,text,segments,source,generated_at,author_id,updated_at,version",
        )
        .eq("item_id", operation.id)
        .maybeSingle(),
    ]);

    if (commentResult.error) throw commentResult.error;
    if (fileResult.error) throw fileResult.error;
    if (transcriptResult.error) throw transcriptResult.error;

    setComments((commentResult.data || []) as CommentRow[]);
    setFiles((fileResult.data || []) as FileRow[]);
    const current = transcriptResult.data as TranscriptRow | null;
    setTranscript(current);
    setTranscriptText(current?.text || "");
    setSegmentsText(JSON.stringify(current?.segments || [], null, 2));
  };

  useEffect(() => {
    void fetchRelated().catch((cause) => {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o detalhe operacional.",
      );
    });

    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // The operation id is the identity of the detail screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation.id]);

  const meetingsInContext = useMemo(
    () =>
      operations.filter(
        (item) =>
          item.kind === "meeting" &&
          item.id !== operation.id &&
          item.organizationId === operation.organizationId &&
          item.workspaceId === operation.workspaceId,
      ),
    [operation.id, operation.organizationId, operation.workspaceId, operations],
  );

  const linkedTasks = operations.filter(
    (item) => item.kind === "task" && item.meetingId === operation.id,
  );

  const patchDetails = (patch: Partial<OperationDetails>) =>
    setDetails((current) => ({ ...current, ...patch }));

  const saveMain = async () => {
    setSaving(true);
    setMessage("");

    try {
      const next: Operation = {
        ...operation,
        details,
        updatedAt: new Date().toISOString(),
      };
      await onSave(next);
      setOperation({ ...next, version: next.version + 1 });
      setMessage("Alterações salvas.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const addChecklist = () => {
    const item: ChecklistItem = {
      id: makeOperationPartId("check"),
      text: "",
      done: false,
      responsibleId: null,
      order: details.checklist.length,
    };
    patchDetails({ checklist: [...details.checklist, item] });
  };

  const patchChecklist = (id: string, patch: Partial<ChecklistItem>) =>
    patchDetails({
      checklist: details.checklist.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });

  const reorderChecklist = (index: number, direction: -1 | 1) =>
    patchDetails({
      checklist: move(details.checklist, index, direction).map((item, order) => ({
        ...item,
        order,
      })),
    });

  const addTopic = () => {
    const topic: MeetingTopic = {
      id: makeOperationPartId("topic"),
      title: "",
      notes: "",
      decision: "",
      linkedTaskIds: [],
      order: details.topics.length,
    };
    patchDetails({ topics: [...details.topics, topic] });
  };

  const patchTopic = (id: string, patch: Partial<MeetingTopic>) =>
    patchDetails({
      topics: details.topics.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });

  const reorderTopic = (index: number, direction: -1 | 1) =>
    patchDetails({
      topics: move(details.topics, index, direction).map((item, order) => ({
        ...item,
        order,
      })),
    });

  const createMeetingTask = async (topic?: MeetingTopic) => {
    const title =
      linkedTaskTitle.trim() ||
      (topic?.title ? "Acompanhar: " + topic.title : "Tarefa da reunião");

    setSaving(true);
    setMessage("");

    try {
      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const taskId = makeOperationId();
      const now = new Date().toISOString();
      const { error: taskError } = await supabase.from("operational_items").insert({
        id: taskId,
        kind: "task",
        organization_id: operation.organizationId,
        workspace_id: operation.workspaceId,
        title,
        description: "",
        status: "todo",
        priority: "normal",
        visibility: operation.visibility,
        date: null,
        time: null,
        timezone: operation.timezone,
        duration: 60,
        location: "",
        responsible_id: user.id,
        meeting_id: operation.id,
        origin: "meeting",
        creator_id: user.id,
        details: EMPTY_OPERATION_DETAILS,
        version: 0,
        created_at: now,
        updated_at: now,
      });
      if (taskError) throw taskError;

      if (topic) {
        patchTopic(topic.id, {
          linkedTaskIds: [...new Set([...topic.linkedTaskIds, taskId])],
        });
      }

      await logAudit(operation.creatorId, "meeting.task.created", operation.id, {
        task: taskId,
      });
      await onRefresh();
      setLinkedTaskTitle("");
      setMessage("Tarefa vinculada à reunião.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível criar a tarefa.",
      );
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    const body = comment.trim();
    if (!body) return;
    setSaving(true);

    try {
      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const { error: insertError } = await supabase
        .from("operational_comments")
        .insert({
          id: makeResourceId("comment"),
          item_id: operation.id,
          author_id: user.id,
          body,
        });
      if (insertError) throw insertError;

      await logAudit(operation.creatorId, "operation.comment", operation.id);
      setComment("");
      await fetchRelated();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível comentar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File | Blob, providedName?: string) => {
    if (file.size > 100 * 1024 * 1024) {
      throw new Error("O limite é 100 MB por arquivo.");
    }

    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sua sessão expirou.");

    const id = makeResourceId("file");
    const sourceName =
      providedName || (file instanceof File ? file.name : "gravacao.webm");
    const safeName = sourceName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100);
    const objectKey = user.id + "/" + operation.id + "/" + id + "-" + safeName;

    const { error: uploadError } = await supabase.storage
      .from("netzos-operational")
      .upload(objectKey, file, {
        contentType:
          file.type || (sourceName.endsWith(".webm") ? "audio/webm" : undefined),
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: metadataError } = await supabase
      .from("operational_files")
      .insert({
        id,
        item_id: operation.id,
        object_key: objectKey,
        name: sourceName,
        mime: file.type || "application/octet-stream",
        size: file.size,
        purpose: sourceName.startsWith("gravacao") ? "recording" : "attachment",
        author_id: user.id,
      });

    if (metadataError) {
      await supabase.storage.from("netzos-operational").remove([objectKey]);
      throw metadataError;
    }

    await logAudit(operation.creatorId, "operation.file", operation.id, {
      file: id,
      name: sourceName,
    });
    await fetchRelated();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSaving(true);
    setMessage("");
    try {
      await uploadFile(file);
      setMessage("Arquivo salvo.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível enviar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (file: FileRow) => {
    const supabase = await getSupabase();
    const { data, error: signedError } = await supabase.storage
      .from("netzos-operational")
      .createSignedUrl(file.object_key, 60);
    if (signedError) {
      setMessage(signedError.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const saveTranscript = async () => {
    setSaving(true);
    setMessage("");

    try {
      let segments: unknown[] = [];
      if (segmentsText.trim()) {
        const parsed = JSON.parse(segmentsText);
        if (!Array.isArray(parsed)) throw new Error("Segmentos precisam ser um array JSON.");
        segments = parsed;
      }

      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const { error: transcriptError } = await supabase
        .from("operational_transcripts")
        .upsert(
          {
            item_id: operation.id,
            text: transcriptText,
            segments,
            source: "manual",
            generated_at: new Date().toISOString(),
            author_id: user.id,
            updated_at: new Date().toISOString(),
            version: (transcript?.version || 0) + 1,
          },
          { onConflict: "item_id" },
        );
      if (transcriptError) throw transcriptError;

      await logAudit(operation.creatorId, "operation.transcript", operation.id);
      await fetchRelated();
      setMessage("Transcrição salva.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível salvar a transcrição.",
      );
    } finally {
      setSaving(false);
    }
  };

  const startRecording = async () => {
    setMessage("");
    if (!recordingConsent) {
      setMessage("Confirme a ciência dos participantes antes de gravar.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMessage("Este navegador não oferece gravação de microfone.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      sizeRef.current = 0;
      setRecordingBlob(null);
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      setRecordingUrl("");

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        sizeRef.current += event.data.size;
        chunksRef.current.push(event.data);
        if (sizeRef.current >= 95 * 1024 * 1024 && recorder.state !== "inactive") {
          recorder.stop();
          setMessage("Gravação encerrada preventivamente perto do limite de 100 MB.");
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setRecordingBlob(blob);
        setRecordingUrl(URL.createObjectURL(blob));
        setRecordingState("ready");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(1000);
      setRecordingState("recording");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível acessar o microfone.",
      );
    }
  };

  const pauseResume = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setRecordingState("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setRecordingState("recording");
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const saveRecording = async () => {
    if (!recordingBlob) return;
    setSaving(true);
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await uploadFile(recordingBlob, "gravacao-" + stamp + ".webm");
      setMessage("Gravação salva nos arquivos da reunião.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Falha ao salvar a gravação.",
      );
    } finally {
      setSaving(false);
    }
  };

  const downloadRecording = () => {
    if (!recordingUrl) return;
    const anchor = document.createElement("a");
    anchor.href = recordingUrl;
    anchor.download = "gravacao-netzos.webm";
    anchor.click();
  };

  const tabs: Array<[DetailTab, string]> = [
    ["details", "Detalhes"],
    ...(operation.kind === "meeting"
      ? ([["meeting", "Reunião"]] as Array<[DetailTab, string]>)
      : []),
    ["comments", "Comentários"],
    ["files", "Arquivos"],
    ["transcript", "Transcrição"],
    ["activity", "Histórico"],
  ];

  const context =
    [
      reference.data.organizations.find(
        (item) => item.id === operation.organizationId,
      )?.name,
      reference.data.workspaces.find((item) => item.id === operation.workspaceId)
        ?.name,
    ]
      .filter(Boolean)
      .join(" · ") || "Organização";

  return (
    <div className="ref-modal-backdrop operation-detail-backdrop">
      <section
        className="operation-detail"
        role="dialog"
        aria-modal="true"
        aria-label={"Detalhe de " + operation.title}
      >
        <header className="operation-detail-header">
          <div>
            <span className="ref-eyebrow">
              {operation.kind === "task"
                ? "Tarefa"
                : operation.kind === "meeting"
                  ? "Reunião"
                  : "Compromisso"}{" "}
              · {context}
            </span>
            <h2>{operation.title}</h2>
            <p>
              {operation.date || "Sem data"}
              {operation.time ? " · " + operation.time : ""} ·{" "}
              {operation.visibility === "private" ? "Privado" : "Contexto"} · origem{" "}
              {operation.origin}
            </p>
          </div>
          <div className="ref-heading-actions">
            <button
              className="ref-button primary"
              type="button"
              disabled={saving}
              onClick={() => void saveMain()}
            >
              <FiSave />
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button className="ref-icon-button" type="button" onClick={onClose}>
              <FiX />
            </button>
          </div>
        </header>

        <nav className="ref-tabs operation-detail-tabs">
          {tabs.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
              {value === "comments" && comments.length > 0 && (
                <span>{comments.length}</span>
              )}
              {value === "files" && files.length > 0 && <span>{files.length}</span>}
            </button>
          ))}
        </nav>

        {message && <p className="ref-note">{message}</p>}

        <div className="operation-detail-body">
          {tab === "details" && (
            <div className="operation-detail-section">
              <div className="ref-two">
                <label className="ref-field">
                  <span>Título</span>
                  <input
                    value={operation.title}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="ref-field">
                  <span>Visibilidade</span>
                  <select
                    value={operation.visibility}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        visibility: event.target.value as "context" | "private",
                      }))
                    }
                  >
                    <option value="context">Contexto</option>
                    <option value="private">Privado</option>
                  </select>
                </label>
              </div>

              <label className="ref-field">
                <span>Descrição</span>
                <textarea
                  rows={4}
                  value={operation.description}
                  onChange={(event) =>
                    setOperation((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="ref-three">
                <label className="ref-field">
                  <span>{operation.kind === "task" ? "Prazo" : "Data"}</span>
                  <input
                    type="date"
                    value={operation.date || ""}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        date: event.target.value || null,
                      }))
                    }
                  />
                </label>
                <label className="ref-field">
                  <span>Hora</span>
                  <input
                    type="time"
                    value={operation.time || ""}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        time: event.target.value || null,
                      }))
                    }
                  />
                </label>
                <label className="ref-field">
                  <span>Duração (min)</span>
                  <input
                    type="number"
                    min={1}
                    max={10080}
                    value={operation.duration}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        duration: Math.max(1, Number(event.target.value) || 60),
                      }))
                    }
                  />
                </label>
              </div>

              <div className="ref-two">
                <label className="ref-field">
                  <span>Responsável</span>
                  <select
                    value={operation.responsibleId || ""}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        responsibleId: event.target.value || null,
                        responsible:
                          event.target.value === reference.userId ? "me" : null,
                      }))
                    }
                  >
                    <option value="">Sem responsável</option>
                    {profiles.map((profile) => (
                      <option value={profile.id} key={profile.id}>
                        {profile.displayName || profile.email || profile.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="ref-field">
                  <span>Local</span>
                  <input
                    value={operation.location}
                    onChange={(event) =>
                      setOperation((current) => ({
                        ...current,
                        location: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <fieldset className="operation-people">
                <legend>Pessoas vinculadas</legend>
                {profiles.map((profile) => (
                  <label key={profile.id}>
                    <input
                      type="checkbox"
                      checked={operation.participantIds.includes(profile.id)}
                      onChange={(event) =>
                        setOperation((current) => ({
                          ...current,
                          participantIds: event.target.checked
                            ? [...new Set([...current.participantIds, profile.id])]
                            : current.participantIds.filter((id) => id !== profile.id),
                          people:
                            profile.id === reference.userId
                              ? event.target.checked
                                ? ["me"]
                                : []
                              : current.people,
                        }))
                      }
                    />
                    <span>
                      {profile.displayName || profile.email || profile.id}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="ref-section-heading">
                <div>
                  <span className="ref-eyebrow">Checklist</span>
                  <h3>Itens de acompanhamento</h3>
                </div>
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={addChecklist}
                >
                  <FiPlus />
                  Item
                </button>
              </div>

              <div className="operation-checklist">
                {details.checklist.map((item, index) => (
                  <article key={item.id}>
                    <button
                      className={"task-check " + (item.done ? "done" : "")}
                      type="button"
                      onClick={() => patchChecklist(item.id, { done: !item.done })}
                    >
                      {item.done && <FiCheck />}
                    </button>
                    <input
                      value={item.text}
                      placeholder="Item do checklist"
                      onChange={(event) =>
                        patchChecklist(item.id, { text: event.target.value })
                      }
                    />
                    <select
                      value={item.responsibleId || ""}
                      onChange={(event) =>
                        patchChecklist(item.id, {
                          responsibleId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Sem responsável</option>
                      {profiles.map((profile) => (
                        <option value={profile.id} key={profile.id}>
                          {profile.displayName || profile.email || profile.id}
                        </option>
                      ))}
                    </select>
                    <button
                      className="ref-icon-button"
                      type="button"
                      disabled={index === 0}
                      onClick={() => reorderChecklist(index, -1)}
                    >
                      <FiArrowUp />
                    </button>
                    <button
                      className="ref-icon-button"
                      type="button"
                      disabled={index === details.checklist.length - 1}
                      onClick={() => reorderChecklist(index, 1)}
                    >
                      <FiArrowDown />
                    </button>
                    <button
                      className="ref-icon-button"
                      type="button"
                      onClick={() =>
                        patchDetails({
                          checklist: details.checklist.filter(
                            (value) => value.id !== item.id,
                          ),
                        })
                      }
                    >
                      <FiTrash2 />
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === "meeting" && operation.kind === "meeting" && (
            <div className="operation-detail-section meeting-studio">
              <div className="ref-two">
                <label className="ref-field">
                  <span>Reunião anterior</span>
                  <select
                    value={details.previousMeetingId || ""}
                    onChange={(event) =>
                      patchDetails({
                        previousMeetingId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Nenhuma</option>
                    {meetingsInContext.map((meeting) => (
                      <option value={meeting.id} key={meeting.id}>
                        {meeting.title} · {meeting.date || "sem data"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="meeting-open-tasks">
                  <span>Tarefas vinculadas</span>
                  <strong>
                    {
                      linkedTasks.filter(
                        (task) => !["done", "cancelled"].includes(task.status),
                      ).length
                    }
                  </strong>
                </div>
              </div>

              <div className="ref-section-heading">
                <div>
                  <span className="ref-eyebrow">Pauta</span>
                  <h3>Assuntos, notas e decisões</h3>
                </div>
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={addTopic}
                >
                  <FiPlus />
                  Assunto
                </button>
              </div>

              <div className="meeting-topic-list">
                {details.topics.map((topic, index) => (
                  <article key={topic.id}>
                    <header>
                      <input
                        value={topic.title}
                        placeholder="Assunto da pauta"
                        onChange={(event) =>
                          patchTopic(topic.id, { title: event.target.value })
                        }
                      />
                      <div className="ref-heading-actions">
                        <button
                          className="ref-icon-button"
                          type="button"
                          disabled={index === 0}
                          onClick={() => reorderTopic(index, -1)}
                        >
                          <FiArrowUp />
                        </button>
                        <button
                          className="ref-icon-button"
                          type="button"
                          disabled={index === details.topics.length - 1}
                          onClick={() => reorderTopic(index, 1)}
                        >
                          <FiArrowDown />
                        </button>
                        <button
                          className="ref-icon-button"
                          type="button"
                          onClick={() =>
                            patchDetails({
                              topics: details.topics.filter(
                                (value) => value.id !== topic.id,
                              ),
                            })
                          }
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </header>
                    <div className="ref-two">
                      <label className="ref-field">
                        <span>Notas</span>
                        <textarea
                          rows={4}
                          value={topic.notes}
                          onChange={(event) =>
                            patchTopic(topic.id, { notes: event.target.value })
                          }
                        />
                      </label>
                      <label className="ref-field">
                        <span>Decisão</span>
                        <textarea
                          rows={4}
                          value={topic.decision}
                          onChange={(event) =>
                            patchTopic(topic.id, { decision: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="meeting-topic-tasks">
                      <span>
                        {topic.linkedTaskIds.length} tarefa
                        {topic.linkedTaskIds.length === 1 ? "" : "s"} vinculada
                        {topic.linkedTaskIds.length === 1 ? "" : "s"}
                      </span>
                      <button
                        className="ref-button secondary"
                        type="button"
                        onClick={() => void createMeetingTask(topic)}
                      >
                        <FiPlus />
                        Nova tarefa
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="ref-three">
                <label className="ref-field">
                  <span>Resumo</span>
                  <textarea
                    rows={6}
                    value={details.summary}
                    onChange={(event) =>
                      patchDetails({ summary: event.target.value })
                    }
                  />
                </label>
                <label className="ref-field">
                  <span>Decisões gerais</span>
                  <textarea
                    rows={6}
                    value={details.decisions}
                    onChange={(event) =>
                      patchDetails({ decisions: event.target.value })
                    }
                  />
                </label>
                <label className="ref-field">
                  <span>Observações</span>
                  <textarea
                    rows={6}
                    value={details.notes}
                    onChange={(event) => patchDetails({ notes: event.target.value })}
                  />
                </label>
              </div>

              <div className="meeting-linked-task-create">
                <input
                  value={linkedTaskTitle}
                  placeholder="Título de uma nova tarefa da reunião"
                  onChange={(event) => setLinkedTaskTitle(event.target.value)}
                />
                <button
                  className="ref-button primary"
                  type="button"
                  onClick={() => void createMeetingTask()}
                >
                  <FiPlus />
                  Criar tarefa vinculada
                </button>
              </div>

              <div className="ref-section-heading">
                <div>
                  <span className="ref-eyebrow">Gravação</span>
                  <h3>Microfone da reunião</h3>
                </div>
              </div>

              <div className="meeting-recorder">
                <label className="recording-consent">
                  <input
                    type="checkbox"
                    checked={recordingConsent}
                    onChange={(event) => setRecordingConsent(event.target.checked)}
                  />
                  Confirmo que os participantes estão cientes da gravação.
                </label>

                <div className="meeting-recorder-actions">
                  {recordingState === "idle" && (
                    <button
                      className="ref-button primary"
                      type="button"
                      onClick={() => void startRecording()}
                    >
                      <FiMic />
                      Começar a gravar
                    </button>
                  )}

                  {(recordingState === "recording" ||
                    recordingState === "paused") && (
                    <>
                      <button
                        className="ref-button secondary"
                        type="button"
                        onClick={pauseResume}
                      >
                        {recordingState === "paused" ? <FiPlay /> : <FiPause />}
                        {recordingState === "paused" ? "Continuar" : "Pausar"}
                      </button>
                      <button
                        className="ref-button primary"
                        type="button"
                        onClick={stopRecording}
                      >
                        <FiSquare />
                        Encerrar
                      </button>
                    </>
                  )}

                  {recordingState === "ready" && recordingBlob && (
                    <>
                      <audio controls src={recordingUrl} />
                      <span>{bytes(recordingBlob.size)}</span>
                      <button
                        className="ref-button secondary"
                        type="button"
                        onClick={downloadRecording}
                      >
                        <FiDownload />
                        Baixar
                      </button>
                      <button
                        className="ref-button primary"
                        type="button"
                        disabled={saving}
                        onClick={() => void saveRecording()}
                      >
                        <FiSave />
                        Salvar na reunião
                      </button>
                    </>
                  )}
                </div>

                <p className="ref-note">
                  A captura usa somente o microfone deste dispositivo. Não há
                  transcrição ou análise automática da gravação.
                </p>
              </div>
            </div>
          )}

          {tab === "comments" && (
            <div className="operation-detail-section">
              <div className="comment-composer">
                <textarea
                  rows={3}
                  value={comment}
                  placeholder="Adicionar comentário…"
                  onChange={(event) => setComment(event.target.value)}
                />
                <button
                  className="ref-button primary"
                  type="button"
                  disabled={saving || !comment.trim()}
                  onClick={() => void addComment()}
                >
                  <FiMessageSquare />
                  Comentar
                </button>
              </div>

              <div className="comment-list">
                {comments.map((item) => (
                  <article key={item.id}>
                    <div className="ref-list-icon">
                      <FiUsers />
                    </div>
                    <div>
                      <strong>{profileLabel(profiles, item.author_id)}</strong>
                      <p>{item.body}</p>
                      <small>{new Date(item.created_at).toLocaleString("pt-BR")}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === "files" && (
            <div className="operation-detail-section">
              <label className="ref-upload-zone operation-upload">
                <input
                  className="ref-hidden-file"
                  type="file"
                  onChange={(event) => void handleFile(event)}
                />
                <FiFile />
                <strong>Anexar arquivo</strong>
                <span>Até 100 MB · armazenamento privado</span>
              </label>

              <div className="ref-list">
                {files.map((file) => (
                  <article key={file.id}>
                    <div className="ref-list-icon">
                      <FiFile />
                    </div>
                    <div>
                      <strong>{file.name}</strong>
                      <span>
                        {file.mime} · {bytes(file.size)} ·{" "}
                        {new Date(file.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <button
                      className="ref-button secondary"
                      type="button"
                      onClick={() => void openFile(file)}
                    >
                      <FiDownload />
                      Abrir
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === "transcript" && (
            <div className="operation-detail-section">
              <p className="ref-note">
                Transcrição manual. Você também pode colar segmentos JSON no
                formato [{"{"}"start":0,"end":8,"speaker":"Pessoa","text":"…"{"}"}].
              </p>

              <label className="ref-field">
                <span>Texto</span>
                <textarea
                  rows={12}
                  value={transcriptText}
                  onChange={(event) => setTranscriptText(event.target.value)}
                />
              </label>

              <label className="ref-field">
                <span>Segmentos JSON</span>
                <textarea
                  rows={10}
                  className="ref-code-input"
                  value={segmentsText}
                  onChange={(event) => setSegmentsText(event.target.value)}
                />
              </label>

              <button
                className="ref-button primary"
                type="button"
                disabled={saving}
                onClick={() => void saveTranscript()}
              >
                <FiSave />
                Salvar transcrição
              </button>
            </div>
          )}

          {tab === "activity" && (
            <div className="operation-detail-section">
              <div className="activity-list">
                {reference.data.events
                  .filter((event) => event.resource === operation.id)
                  .slice(0, 300)
                  .map((event) => (
                    <div key={event.id}>
                      <span>{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
                      <strong>{event.action}</strong>
                      <span>{profileLabel(profiles, event.actorId)}</span>
                      <small>{JSON.stringify(event.detail)}</small>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
