"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  FiArchive,
  FiDatabase,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiPlus,
  FiSearch,
  FiTable,
  FiUpload,
  FiX,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  ACCESS_ROLE_LABELS,
  canDesign,
  canWrite,
  createField,
  logAudit,
  resourceRole,
  type DataField,
  type DataFieldType,
  type DataRecord,
  type DataTable,
  useReferenceData,
} from "./reference-data";

type TableMode = "data" | "form" | "structure";

const FIELD_TYPE_LABELS: Record<DataFieldType, string> = {
  text: "Texto",
  long: "Texto longo",
  number: "Número",
  date: "Data",
  single: "Escolha única",
  multi: "Múltipla escolha",
};

function valueText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function csvCell(value: unknown) {
  const text = valueText(value).replace(/"/g, '""');
  return '"' + text + '"';
}

function downloadCsv(table: DataTable, rows: DataRecord[]) {
  const fields = table.fields.filter((field) => !field.archived);
  const content = [
    fields.map((field) => csvCell(field.name)).join(","),
    ...rows.map((row) =>
      fields.map((field) => csvCell(row.values[field.id])).join(","),
    ),
  ].join("\n");

  const blob = new Blob(["\ufeff" + content], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    table.name.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) + ".csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="ref-modal-backdrop" onMouseDown={onClose}>
      <section
        className="ref-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ref-modal-header">
          <div>
            <span>Dados</span>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <FiX />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function RecordEditor({
  table,
  record,
  onClose,
  onSaved,
}: {
  table: DataTable;
  record?: DataRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<DataRecord["values"]>(
    record?.values || {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      for (const field of table.fields.filter((item) => !item.archived)) {
        const value = values[field.id];
        if (
          field.required &&
          (value === undefined ||
            value === "" ||
            (Array.isArray(value) && value.length === 0))
        ) {
          throw new Error("Preencha o campo obrigatório: " + field.name);
        }

        if (
          field.type === "number" &&
          typeof value === "number" &&
          ((field.min !== undefined && value < field.min) ||
            (field.max !== undefined && value > field.max))
        ) {
          throw new Error("Confira os limites do campo: " + field.name);
        }
      }

      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const row = {
        id: record?.id || makeResourceId("record"),
        table_id: table.id,
        author_id: record?.authorId || user.id,
        values,
        updated_at: new Date().toISOString(),
      };

      const { error: saveError } = await supabase
        .from("data_records")
        .upsert(row, { onConflict: "id" });
      if (saveError) throw saveError;

      await logAudit(
        table.ownerId,
        record ? "record.updated" : "record.created",
        table.id,
        { record: row.id },
      );

      await onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o registro.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={record ? "Editar registro" : "Novo registro"}
      description={table.name}
      onClose={onClose}
    >
      <form className="ref-form" onSubmit={save}>
        <div className="ref-form-grid">
          {table.fields
            .filter((field) => !field.archived)
            .map((field) => {
              const value = values[field.id];
              const setValue = (next: string | number | string[]) =>
                setValues((current) => ({ ...current, [field.id]: next }));

              return (
                <label
                  className={"ref-field span-" + field.width}
                  key={field.id}
                >
                  <span>
                    {field.name}
                    {field.required ? " *" : ""}
                  </span>

                  {field.type === "long" ? (
                    <textarea
                      rows={4}
                      value={String(value ?? "")}
                      onChange={(event) => setValue(event.target.value)}
                    />
                  ) : field.type === "single" ? (
                    <select
                      value={String(value ?? "")}
                      onChange={(event) => setValue(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {field.options.map((option) => (
                        <option value={option} key={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "multi" ? (
                    <div className="ref-options">
                      {field.options.map((option) => {
                        const current = Array.isArray(value) ? value : [];
                        return (
                          <label key={option}>
                            <input
                              type="checkbox"
                              checked={current.includes(option)}
                              onChange={(event) =>
                                setValue(
                                  event.target.checked
                                    ? [...current, option]
                                    : current.filter((item) => item !== option),
                                )
                              }
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type={
                        field.type === "number"
                          ? "number"
                          : field.type === "date"
                            ? "date"
                            : "text"
                      }
                      min={field.min}
                      max={field.max}
                      step={field.type === "number" ? "any" : undefined}
                      value={String(value ?? "")}
                      onChange={(event) =>
                        setValue(
                          field.type === "number" && event.target.value !== ""
                            ? Number(event.target.value)
                            : event.target.value,
                        )
                      }
                    />
                  )}
                </label>
              );
            })}
        </div>

        {error && <p className="auth-feedback error">{error}</p>}

        <div className="ref-modal-actions">
          <button
            className="ref-button secondary"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="ref-button primary" type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Salvar registro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TableStructure({
  table,
  onSaved,
}: {
  table: DataTable;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(table.name);
  const [description, setDescription] = useState(table.description);
  const [fields, setFields] = useState<DataField[]>(table.fields);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = (id: string, patch: Partial<DataField>) =>
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );

  const save = async () => {
    setSaving(true);
    setError("");

    try {
      if (!name.trim()) throw new Error("Informe o nome da tabela.");

      for (const field of fields.filter((item) => !item.archived)) {
        if (!field.name.trim()) throw new Error("Todos os campos precisam de nome.");
        if (
          ["single", "multi"].includes(field.type) &&
          field.options.filter(Boolean).length === 0
        ) {
          throw new Error(
            "Adicione pelo menos uma opção em " + field.name + ".",
          );
        }
      }

      const supabase = await getSupabase();
      const { error: saveError } = await supabase
        .from("data_tables")
        .update({
          name: name.trim(),
          description: description.trim(),
          fields,
          version: table.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", table.id);
      if (saveError) throw saveError;

      await logAudit(table.ownerId, "table.structure.updated", table.id, {
        fields: fields.length,
      });
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a estrutura.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ref-structure">
      <section className="ref-editor-card">
        <div className="ref-two">
          <label className="ref-field">
            <span>Nome da tabela</span>
            <input
              value={name}
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="ref-field">
            <span>Descrição</span>
            <input
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="ref-section-heading">
        <div>
          <span className="ref-eyebrow">Estrutura</span>
          <h3>Campos do formulário e da tabela</h3>
        </div>
        <button
          className="ref-button secondary"
          type="button"
          onClick={() => setFields((current) => [...current, createField()])}
        >
          <FiPlus />
          Novo campo
        </button>
      </div>

      <div className="ref-field-editor-list">
        {fields.map((field) => (
          <article
            className={"ref-field-editor " + (field.archived ? "archived" : "")}
            key={field.id}
          >
            <div className="ref-field-editor-main">
              <input
                aria-label="Nome do campo"
                disabled={field.archived}
                value={field.name}
                onChange={(event) =>
                  updateField(field.id, { name: event.target.value })
                }
              />
              <select
                aria-label="Tipo do campo"
                disabled={field.archived}
                value={field.type}
                onChange={(event) => {
                  const type = event.target.value as DataFieldType;
                  updateField(field.id, {
                    type,
                    options:
                      type === "single" || type === "multi"
                        ? field.options.length
                          ? field.options
                          : ["Opção 1"]
                        : [],
                  });
                }}
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Largura"
                disabled={field.archived}
                value={field.width}
                onChange={(event) =>
                  updateField(field.id, {
                    width: Number(event.target.value) as 4 | 6 | 12,
                  })
                }
              >
                <option value="4">1/3</option>
                <option value="6">1/2</option>
                <option value="12">Inteira</option>
              </select>
            </div>

            <div className="ref-field-editor-options">
              <label>
                <input
                  type="checkbox"
                  disabled={field.archived}
                  checked={field.required}
                  onChange={(event) =>
                    updateField(field.id, { required: event.target.checked })
                  }
                />
                Obrigatório
              </label>

              <input
                disabled={field.archived}
                value={field.section || ""}
                placeholder="Seção opcional"
                onChange={(event) =>
                  updateField(field.id, { section: event.target.value })
                }
              />

              {(field.type === "single" || field.type === "multi") && (
                <textarea
                  disabled={field.archived}
                  rows={2}
                  value={field.options.join("\n")}
                  placeholder="Uma opção por linha"
                  onChange={(event) =>
                    updateField(field.id, {
                      options: event.target.value
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              )}

              <button
                className="ref-icon-button"
                type="button"
                title={field.archived ? "Restaurar campo" : "Arquivar campo"}
                aria-label={field.archived ? "Restaurar campo" : "Arquivar campo"}
                onClick={() =>
                  updateField(field.id, { archived: !field.archived })
                }
              >
                <FiArchive />
              </button>
            </div>
          </article>
        ))}
      </div>

      {error && <p className="auth-feedback error">{error}</p>}

      <div className="ref-save-row">
        <button
          className="ref-button primary"
          type="button"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Salvando…" : "Salvar estrutura"}
        </button>
      </div>
    </div>
  );
}

function CreateTableModal({
  workspaces,
  onClose,
  onCreated,
}: {
  workspaces: Array<{ id: string; name: string; organizationName: string }>;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [starting, setStarting] = useState<"blank" | "contact" | "project">(
    "blank",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const templates: Record<string, DataField[]> = {
    blank: [createField("text")],
    contact: [
      { ...createField("text"), name: "Nome", required: true },
      { ...createField("text"), name: "E-mail" },
      { ...createField("text"), name: "Telefone" },
      { ...createField("long"), name: "Observações" },
    ],
    project: [
      { ...createField("text"), name: "Projeto", required: true },
      {
        ...createField("single"),
        name: "Status",
        options: ["Planejado", "Em andamento", "Concluído"],
      },
      { ...createField("date"), name: "Prazo" },
      { ...createField("long"), name: "Notas" },
    ],
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!workspaceId) throw new Error("Escolha um workspace.");
      if (!name.trim()) throw new Error("Informe o nome.");

      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const id = makeResourceId("table");
      const { error: insertError } = await supabase.from("data_tables").insert({
        id,
        owner_id: user.id,
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim(),
        fields: templates[starting],
        version: 0,
      });
      if (insertError) throw insertError;

      await logAudit(user.id, "table.created", id, {
        workspace: workspaceId,
        template: starting,
      });

      await onCreated(id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível criar.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Criar tabela e formulário"
      description="A mesma estrutura serve para entrada de dados e consulta."
      onClose={onClose}
    >
      <form className="ref-form" onSubmit={submit}>
        <label className="ref-field">
          <span>Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option value={workspace.id} key={workspace.id}>
                {workspace.organizationName} / {workspace.name}
              </option>
            ))}
          </select>
        </label>

        <label className="ref-field">
          <span>Nome</span>
          <input
            autoFocus
            maxLength={150}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Solicitações"
          />
        </label>

        <label className="ref-field">
          <span>Descrição</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <label className="ref-field">
          <span>Ponto de partida</span>
          <select
            value={starting}
            onChange={(event) => setStarting(event.target.value as typeof starting)}
          >
            <option value="blank">Em branco</option>
            <option value="contact">Contatos</option>
            <option value="project">Projetos</option>
          </select>
        </label>

        {error && <p className="auth-feedback error">{error}</p>}

        <div className="ref-modal-actions">
          <button className="ref-button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="ref-button primary" type="submit" disabled={saving}>
            {saving ? "Criando…" : "Criar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function inferType(values: unknown[]): DataFieldType {
  const present = values.filter(
    (value) => value !== null && value !== undefined && String(value).trim() !== "",
  );
  if (!present.length) return "text";
  if (
    present.every((value) => {
      if (typeof value === "number") return true;
      const text = String(value).replace(/\./g, "").replace(",", ".");
      return Number.isFinite(Number(text));
    })
  ) {
    return "number";
  }
  if (
    present.every((value) => {
      const text = String(value).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ||
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text);
    })
  ) {
    return "date";
  }
  return "text";
}

function normalizeImportValue(value: unknown, type: DataFieldType) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value).trim();
  if (type === "number") {
    const normalized = text.replace(/\./g, "").replace(",", ".");
    const number = Number(normalized);
    return Number.isFinite(number) ? number : text;
  }

  if (type === "date") {
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
      return (
        br[3] +
        "-" +
        br[2].padStart(2, "0") +
        "-" +
        br[1].padStart(2, "0")
      );
    }
  }

  return text;
}

function ImportModal({
  workspaces,
  onClose,
  onCreated,
}: {
  workspaces: Array<{ id: string; name: string; organizationName: string }>;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [name, setName] = useState("");
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<unknown[][]>([]);
  const [fields, setFields] = useState<DataField[]>([]);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const readFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setReading(true);

    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("O limite inicial é 2 MB por arquivo.");
      }

      let grid: unknown[][] = [];

      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        const first = text.split(/\r?\n/)[0] || "";
        const separator = first.includes(";")
          ? ";"
          : first.includes("\t")
            ? "\t"
            : ",";

        grid = text
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => {
            const result: string[] = [];
            let cell = "";
            let quoted = false;
            for (let index = 0; index < line.length; index += 1) {
              const char = line[index];
              if (char === '"') {
                if (quoted && line[index + 1] === '"') {
                  cell += '"';
                  index += 1;
                } else {
                  quoted = !quoted;
                }
              } else if (char === separator && !quoted) {
                result.push(cell);
                cell = "";
              } else {
                cell += char;
              }
            }
            result.push(cell);
            return result;
          });
      } else if (/\.xlsx$/i.test(file.name)) {
        const reader = await import("read-excel-file/browser");
        grid = (await reader.default(file)) as unknown as unknown[][];
      } else {
        throw new Error("Selecione um arquivo .csv ou .xlsx.");
      }

      if (grid.length < 2) throw new Error("O arquivo não possui registros.");
      if (grid.length - 1 > 5000) {
        throw new Error("O limite inicial é de 5.000 registros por importação.");
      }

      const header = grid[0].map((value, index) =>
        String(value || "Coluna " + (index + 1)).trim(),
      );
      const body = grid.slice(1);
      const inferred = header.map((column, index) => ({
        ...createField(inferType(body.map((row) => row[index]))),
        name: column.slice(0, 150),
      }));

      setRows(grid);
      setFields(inferred);
      setFilename(file.name);
      setName(file.name.replace(/\.[^.]+$/, "").slice(0, 150));
    } catch (cause) {
      setRows([]);
      setFields([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível ler o arquivo.",
      );
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError("");

    try {
      if (!workspaceId) throw new Error("Escolha um workspace.");
      if (!name.trim()) throw new Error("Informe o nome da tabela.");
      if (!rows.length || !fields.length) throw new Error("Selecione um arquivo.");

      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const tableId = makeResourceId("table");
      const { error: tableError } = await supabase.from("data_tables").insert({
        id: tableId,
        owner_id: user.id,
        workspace_id: workspaceId,
        name: name.trim(),
        description: "Importado de " + filename,
        fields,
        version: 0,
        source_kind: "import",
        filename,
      });
      if (tableError) throw tableError;

      const body = rows.slice(1).filter((row) =>
        row.some((value) => String(value ?? "").trim()),
      );

      const records = body.map((row) => ({
        id: makeResourceId("record"),
        table_id: tableId,
        author_id: user.id,
        values: Object.fromEntries(
          fields.map((field, index) => [
            field.id,
            normalizeImportValue(row[index], field.type),
          ]),
        ),
      }));

      for (let index = 0; index < records.length; index += 250) {
        const { error: recordError } = await supabase
          .from("data_records")
          .insert(records.slice(index, index + 250));
        if (recordError) throw recordError;
      }

      await logAudit(user.id, "table.imported", tableId, {
        filename,
        records: records.length,
      });

      await onCreated(tableId);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível importar.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Importar planilha"
      description="Crie uma nova tabela a partir de CSV ou Excel."
      onClose={onClose}
    >
      <div className="ref-form">
        <label className="ref-field">
          <span>Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option value={workspace.id} key={workspace.id}>
                {workspace.organizationName} / {workspace.name}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={fileRef}
          className="ref-hidden-file"
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => void readFile(event.target.files?.[0])}
        />

        <button
          className="ref-upload-zone"
          type="button"
          disabled={reading || saving}
          onClick={() => fileRef.current?.click()}
        >
          <FiUpload />
          <strong>{reading ? "Lendo arquivo…" : filename || "Selecionar planilha"}</strong>
          <span>CSV ou Excel (.xlsx) · até 2 MB · 5.000 registros</span>
        </button>

        {!!rows.length && (
          <>
            <label className="ref-field">
              <span>Nome da tabela</span>
              <input
                value={name}
                maxLength={150}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <div className="ref-import-preview">
              <table>
                <tbody>
                  {rows.slice(0, 6).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.slice(0, 8).map((value, columnIndex) => (
                        <td key={columnIndex}>{valueText(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ref-field-editor-list compact">
              {fields.map((field) => (
                <article className="ref-field-editor" key={field.id}>
                  <div className="ref-field-editor-main">
                    <input
                      value={field.name}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((item) =>
                            item.id === field.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <select
                      value={field.type}
                      onChange={(event) =>
                        setFields((current) =>
                          current.map((item) =>
                            item.id === field.id
                              ? {
                                  ...item,
                                  type: event.target.value as DataFieldType,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                      <option value="date">Data</option>
                    </select>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {error && <p className="auth-feedback error">{error}</p>}

        <div className="ref-modal-actions">
          <button className="ref-button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ref-button primary"
            type="button"
            disabled={saving || !rows.length}
            onClick={() => void submit()}
          >
            {saving ? "Importando…" : "Importar tabela"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function DataFeature({
  initialTableId = "",
}: {
  initialTableId?: string;
}) {
  const { data, userId, ready, error, refresh } = useReferenceData();
  const [selectedId, setSelectedId] = useState(initialTableId);
  const [mode, setMode] = useState<TableMode>("data");
  const [search, setSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [recordEditor, setRecordEditor] = useState<DataRecord | null | undefined>(
    undefined,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const table = data.tables.find((item) => item.id === selectedId) || null;
  const workspaceOptions = data.workspaces
    .filter((workspace) => canDesign(resourceRole(data, userId, "workspace", workspace.id)))
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      organizationName:
        data.organizations.find(
          (organization) => organization.id === workspace.organizationId,
        )?.name || "Organização",
    }));

  const visibleTables = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.tables.filter(
      (item) =>
        !query ||
        item.name.toLocaleLowerCase("pt-BR").includes(query) ||
        item.description.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [data.tables, search]);

  const rows = useMemo(() => {
    if (!table) return [];
    const query = recordSearch.trim().toLocaleLowerCase("pt-BR");
    return data.records
      .filter((record) => record.tableId === table.id)
      .filter(
        (record) =>
          !query ||
          Object.values(record.values).some((value) =>
            valueText(value).toLocaleLowerCase("pt-BR").includes(query),
          ),
      );
  }, [data.records, recordSearch, table]);

  if (!ready) {
    return <div className="ref-feature ref-loading"><div /></div>;
  }

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty">
          <FiDatabase />
          <h2>Não foi possível carregar os dados</h2>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (table) {
    const role = resourceRole(data, userId, "table", table.id);
    const editable = canDesign(role);
    const writable = canWrite(role);
    const workspace = data.workspaces.find(
      (item) => item.id === table.workspaceId,
    );
    const organization = data.organizations.find(
      (item) => item.id === workspace?.organizationId,
    );

    return (
      <section className="ref-feature data-feature">
        <header className="ref-detail-header">
          <div>
            <button
              className="ref-back"
              type="button"
              onClick={() => setSelectedId("")}
            >
              ← Dados
            </button>
            <span className="ref-eyebrow">
              {organization?.name} / {workspace?.name}
            </span>
            <h1>{table.name}</h1>
            <p>{table.description || "Tabela e formulário do workspace."}</p>
          </div>

          <span className="ref-role">
            {role ? ACCESS_ROLE_LABELS[role] : "Acesso"}
          </span>
        </header>

        <nav className="ref-tabs">
          <button
            className={mode === "data" ? "active" : ""}
            type="button"
            onClick={() => setMode("data")}
          >
            Dados <span>{data.records.filter((item) => item.tableId === table.id).length}</span>
          </button>
          <button
            className={mode === "form" ? "active" : ""}
            type="button"
            onClick={() => setMode("form")}
          >
            Formulário
          </button>
          {editable && (
            <button
              className={mode === "structure" ? "active" : ""}
              type="button"
              onClick={() => setMode("structure")}
            >
              Estrutura
            </button>
          )}
        </nav>

        {mode === "structure" && editable ? (
          <TableStructure table={table} onSaved={refresh} />
        ) : mode === "form" ? (
          <div className="ref-form-preview">
            <header>
              <span className="ref-eyebrow">Formulário</span>
              <h2>{table.name}</h2>
              <p>{table.description}</p>
            </header>

            {writable ? (
              <button
                className="ref-button primary"
                type="button"
                onClick={() => setRecordEditor(null)}
              >
                <FiPlus />
                Preencher formulário
              </button>
            ) : (
              <p className="ref-note">Seu acesso é somente para consulta.</p>
            )}

            <div className="ref-form-grid preview">
              {table.fields
                .filter((field) => !field.archived)
                .map((field) => (
                  <div className={"ref-field span-" + field.width} key={field.id}>
                    <span>{field.name}</span>
                    <div className="ref-input-preview">
                      {FIELD_TYPE_LABELS[field.type]}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="ref-data-surface">
            <div className="ref-toolbar">
              <label className="ref-search">
                <FiSearch />
                <input
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="Buscar nos registros…"
                />
              </label>

              <div className="ref-toolbar-actions">
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      table,
                      data.records.filter((item) => item.tableId === table.id),
                    )
                  }
                >
                  <FiDownload />
                  CSV
                </button>

                {writable && (
                  <button
                    className="ref-button primary"
                    type="button"
                    onClick={() => setRecordEditor(null)}
                  >
                    <FiPlus />
                    Novo registro
                  </button>
                )}
              </div>
            </div>

            <div className="ref-table-wrap">
              <table className="ref-table">
                <thead>
                  <tr>
                    <th>#</th>
                    {table.fields
                      .filter((field) => !field.archived)
                      .map((field) => (
                        <th key={field.id}>{field.name}</th>
                      ))}
                    <th>Enviado em</th>
                    {writable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record, index) => (
                    <tr key={record.id}>
                      <td>{index + 1}</td>
                      {table.fields
                        .filter((field) => !field.archived)
                        .map((field) => (
                          <td key={field.id}>
                            {valueText(record.values[field.id])}
                          </td>
                        ))}
                      <td>{new Date(record.createdAt).toLocaleString("pt-BR")}</td>
                      {writable && (
                        <td>
                          <button
                            className="ref-icon-button"
                            type="button"
                            aria-label="Editar registro"
                            onClick={() => setRecordEditor(record)}
                          >
                            <FiEdit2 />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!rows.length && (
              <div className="ref-empty compact">
                <FiTable />
                <h3>Nenhum registro disponível</h3>
                <p>
                  {recordSearch
                    ? "Tente outro termo de busca."
                    : "Preencha o formulário para criar o primeiro registro."}
                </p>
              </div>
            )}
          </div>
        )}

        {recordEditor !== undefined && (
          <RecordEditor
            table={table}
            record={recordEditor}
            onClose={() => setRecordEditor(undefined)}
            onSaved={refresh}
          />
        )}
      </section>
    );
  }

  return (
    <section className="ref-feature data-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Workspace database</span>
          <h1>Dados</h1>
          <p>
            Tabelas armazenam registros. Formulários preenchem esses mesmos
            dados; sistemas e dashboards usam as mesmas fontes.
          </p>
        </div>

        <div className="ref-heading-actions">
          <button
            className="ref-button secondary"
            type="button"
            disabled={!workspaceOptions.length}
            onClick={() => setImportOpen(true)}
          >
            <FiUpload />
            Importar planilha
          </button>
          <button
            className="ref-button primary"
            type="button"
            disabled={!workspaceOptions.length}
            onClick={() => setCreateOpen(true)}
          >
            <FiPlus />
            Criar tabela
          </button>
        </div>
      </header>

      {!workspaceOptions.length && (
        <div className="ref-note">
          Crie ou receba acesso de construção a um workspace antes de criar dados.
        </div>
      )}

      <div className="ref-toolbar">
        <label className="ref-search">
          <FiSearch />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar tabelas…"
          />
        </label>
      </div>

      {visibleTables.length ? (
        <div className="ref-card-grid">
          {visibleTables.map((item) => {
            const workspace = data.workspaces.find(
              (workspaceItem) => workspaceItem.id === item.workspaceId,
            );
            const organization = data.organizations.find(
              (organizationItem) =>
                organizationItem.id === workspace?.organizationId,
            );
            const role = resourceRole(data, userId, "table", item.id);
            const count = data.records.filter(
              (record) => record.tableId === item.id,
            ).length;

            return (
              <article className="ref-resource-card" key={item.id}>
                <div className="ref-resource-top">
                  <span className="ref-resource-icon">
                    {item.sourceKind ? <FiUpload /> : <FiFileText />}
                  </span>
                  <span className="ref-role small">
                    {role ? ACCESS_ROLE_LABELS[role] : "Acesso"}
                  </span>
                </div>
                <h2>{item.name}</h2>
                <p>
                  {organization?.name || "Organização"} /{" "}
                  {workspace?.name || "Workspace"}
                </p>
                <small>
                  {item.fields.filter((field) => !field.archived).length} campos ·{" "}
                  {count} registros
                  {item.sourceKind ? " · " + (item.filename || "Importada") : ""}
                </small>
                <div className="ref-resource-actions">
                  <button
                    className="ref-button primary"
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setMode("data");
                    }}
                  >
                    Abrir tabela
                  </button>
                  <button
                    className="ref-button secondary"
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setMode(canDesign(role) ? "structure" : "form");
                    }}
                  >
                    {canDesign(role) ? "Configurar" : "Formulário"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ref-empty">
          <FiDatabase />
          <h2>{search ? "Nenhuma tabela encontrada" : "Comece pelos seus dados"}</h2>
          <p>
            {search
              ? "Tente outro termo."
              : "Crie uma tabela/formulário ou importe uma planilha."}
          </p>
        </div>
      )}

      {createOpen && (
        <CreateTableModal
          workspaces={workspaceOptions}
          onClose={() => setCreateOpen(false)}
          onCreated={async (id) => {
            await refresh();
            setSelectedId(id);
            setMode("structure");
          }}
        />
      )}

      {importOpen && (
        <ImportModal
          workspaces={workspaceOptions}
          onClose={() => setImportOpen(false)}
          onCreated={async (id) => {
            await refresh();
            setSelectedId(id);
            setMode("data");
          }}
        />
      )}
    </section>
  );
}
