import "server-only";

import type { Surreal } from "surrealdb";

import { getSurrealClient } from "@/lib/surreal";
import {
  asArray,
  isSafeRecordKey,
  queryResult,
  stripTablePrefix,
  toRecordId,
  toRecordKey,
  toSafeInt,
} from "@/lib/surreal-utils";
import type {
  AttendanceMode,
  ExternalLink,
  ProcessNode,
  RequiredDocument,
  RequiredDocumentsMode,
  TaskNode,
  TipsByTask,
  TipView,
} from "@/lib/types";

const MAX_TASK_DEPTH = 8;
const PROCESS_CATALOG_CACHE_TTL_MS = 60_000;
const PROCESS_TREE_CACHE_TTL_MS = 60_000;
const PROCESS_DEPENDENCY_CACHE_TTL_MS = 120_000;

interface TimedCacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface ProcessTreePayload {
  process: ProcessNode | null;
  tasks: TaskNode[];
  taskKeys: string[];
  connectionError: string | null;
}

interface ProcessCatalogPayload {
  processes: ProcessNode[];
  connectionError: string | null;
}

export interface ProcessDependencyStats {
  requiredByProcessCount: number;
}

interface ProcessDataCacheStore {
  catalog?: TimedCacheEntry<ProcessCatalogPayload>;
  processTrees: Record<string, TimedCacheEntry<ProcessTreePayload>>;
  dependencyCounts?: TimedCacheEntry<Record<string, number>>;
}

declare global {
  var govquestProcessDataCache: ProcessDataCacheStore | undefined;
}

function getProcessDataCacheStore(): ProcessDataCacheStore {
  if (!global.govquestProcessDataCache) {
    global.govquestProcessDataCache = {
      processTrees: {},
    };
  }

  return global.govquestProcessDataCache;
}

function getFreshCacheValue<T>(entry?: TimedCacheEntry<T>): T | null {
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    return null;
  }

  return entry.value;
}

const INFERRED_DOCUMENT_RULES: Array<{
  pattern: RegExp;
  name: string;
  processKey: string;
}> = [
  { pattern: /\bbirth certificate\b/i, name: "Birth Certificate", processKey: "birth_certificate_issuance" },
  { pattern: /\bmarriage certificate\b/i, name: "Marriage Certificate", processKey: "marriage_certificate_registration" },
  { pattern: /\bdivorce certificate\b/i, name: "Divorce Certificate", processKey: "divorce_certificate_registration" },
  { pattern: /\bdeath certificate\b/i, name: "Death Certificate", processKey: "death_certificate_issuance" },
  { pattern: /\bmedical death notice\b|\bhospital death notice\b/i, name: "Hospital Death Notice", processKey: "medical_death_notice" },
  { pattern: /\bwitness statement\b|\baffidavit\b|\bnotary\b|\bnotarized\b|\bpower of attorney\b/i, name: "Witness Statement / Affidavit", processKey: "witness_affidavit_notarization" },
  { pattern: /\bkebele id\b|\bresidency id\b/i, name: "Kebele ID", processKey: "kebele_id_residency" },
  { pattern: /\bfayda\b|\bfin\b|\bnational id\b/i, name: "Fayda ID / FIN", processKey: "fayda_registration" },
  { pattern: /\bpassport\b/i, name: "Passport", processKey: "passport" },
  { pattern: /\bdriver'?s?\s*license\b|\bdriving license\b/i, name: "Driver License", processKey: "drivers_license_issue" },
  { pattern: /\bvoter id\b|\bvoter card\b|\bvoter registration card\b/i, name: "Voter ID Card", processKey: "voter_registration" },
  { pattern: /\bstudent id\b|\bstudent card\b/i, name: "Student ID Card", processKey: "student_id_card" },
  { pattern: /\btin\b|\btax identification number\b/i, name: "TIN", processKey: "tin_registration" },
  { pattern: /\bcommercial registration\b/i, name: "Commercial Registration", processKey: "commercial_registration" },
  { pattern: /\btrade license\b/i, name: "Trade License", processKey: "trade_license_new" },
  { pattern: /\bpolice clearance\b/i, name: "Police Clearance Certificate", processKey: "police_clearance_certificate" },
  { pattern: /\bland holding certificate\b/i, name: "Land Holding Certificate", processKey: "land_holding_certificate_issuance" },
  { pattern: /\bcadastral map\b|\bboundary certificate\b/i, name: "Cadastral Map and Boundary Certificate", processKey: "cadastral_map_and_boundary_certificate" },
  { pattern: /\bconstruction permit\b|\bbuilding permit\b/i, name: "Building Construction Permit", processKey: "building_construction_permit" },
  { pattern: /\bwork permit\b/i, name: "Work Permit", processKey: "work_permit_foreign_employee" },
  { pattern: /\bbusiness name reservation\b/i, name: "Business Name Reservation", processKey: "business_name_reservation" },
  { pattern: /\bvat\b/i, name: "VAT Registration", processKey: "vat_registration" },
  { pattern: /\bimporter\b|\bexporter code\b|\bimport export code\b/i, name: "Importer / Exporter Code", processKey: "import_export_code_registration" },
  { pattern: /\bmortgage\b/i, name: "Property Mortgage Registration", processKey: "property_mortgage_registration" },
];

export async function getProcessCatalog(): Promise<ProcessCatalogPayload> {
  const cacheStore = getProcessDataCacheStore();
  const cached = getFreshCacheValue(cacheStore.catalog);
  if (cached) {
    return cached;
  }

  try {
    const db = await getSurrealClient();

    const processRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query("SELECT * FROM process ORDER BY title ASC;"),
        0,
      ),
    );
    let startedRows: Record<string, unknown>[] = [];

    try {
      startedRows = asArray<Record<string, unknown>>(
        queryResult<unknown>(
          await db.query("SELECT out, count() AS starts FROM started GROUP BY out;"),
          0,
        ),
      );
    } catch {
      startedRows = [];
    }

    const startedByProcessId = new Map<string, number>();
    for (const startedRow of startedRows) {
      const processId = toRecordId(startedRow.out);
      if (!processId) {
        continue;
      }

      startedByProcessId.set(processId, toSafeInt(startedRow.starts));
    }

    const processes: ProcessNode[] = processRows.map((processRow) => {
      const processId = toRecordId(processRow.id);

      return {
        id: processId,
        key: toRecordKey(processId),
        title: String(processRow.title ?? "Untitled Process"),
        summary: String(processRow.summary ?? ""),
        explanation: toOptionalString(processRow.explanation),
        output: toOptionalString(processRow.output),
        location: toOptionalString(processRow.location),
        links: toExternalLinks(processRow.links),
        attendanceModes: toAttendanceModes(processRow.attendance_modes),
        questStarts: startedByProcessId.get(processId) ?? 0,
      };
    });

    processes.sort((left, right) => {
      if (left.questStarts !== right.questStarts) {
        return right.questStarts - left.questStarts;
      }

      return left.title.localeCompare(right.title);
    });

    const payload: ProcessCatalogPayload = {
      processes,
      connectionError: null,
    };
    cacheStore.catalog = {
      value: payload,
      expiresAt: Date.now() + PROCESS_CATALOG_CACHE_TTL_MS,
    };

    return payload;
  } catch (error) {
    return {
      processes: [],
      connectionError: getConnectionErrorMessage(error),
    };
  }
}

export async function getProcessTaskTree(processKey: string): Promise<ProcessTreePayload> {
  const cacheStore = getProcessDataCacheStore();
  const cacheKey = processKey.trim();
  const cached = getFreshCacheValue(cacheStore.processTrees[cacheKey]);
  if (cached) {
    return cached;
  }

  try {
    if (!isSafeRecordKey(processKey)) {
      return { process: null, tasks: [], taskKeys: [], connectionError: null };
    }

    const db = await getSurrealClient();

    const processRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(`SELECT * FROM process:${processKey};`),
        0,
      ),
    );

    const processRow = processRows[0];

    if (!processRow) {
      return { process: null, tasks: [], taskKeys: [], connectionError: null };
    }

    const process: ProcessNode = {
      id: toRecordId(processRow.id),
      key: toRecordKey(toRecordId(processRow.id)),
      title: String(processRow.title ?? "Untitled Process"),
      summary: String(processRow.summary ?? ""),
      explanation: toOptionalString(processRow.explanation),
      output: toOptionalString(processRow.output),
      location: toOptionalString(processRow.location),
      links: toExternalLinks(processRow.links),
      attendanceModes: toAttendanceModes(processRow.attendance_modes),
      questStarts: 0,
    };
    const topLevelTasks = await getLinkedTasks(db, `process:${process.key}`);
    const visited = new Set<string>();

    const tasks = await Promise.all(
      topLevelTasks.map((taskRow) => buildTaskNode(db, taskRow, 0, visited)),
    );

    const payload: ProcessTreePayload = {
      process,
      tasks,
      taskKeys: collectTaskKeys(tasks),
      connectionError: null,
    };
    cacheStore.processTrees[cacheKey] = {
      value: payload,
      expiresAt: Date.now() + PROCESS_TREE_CACHE_TTL_MS,
    };

    return payload;
  } catch (error) {
    return {
      process: null,
      tasks: [],
      taskKeys: [],
      connectionError: getConnectionErrorMessage(error),
    };
  }
}

async function buildTaskNode(
  db: Surreal,
  rawTask: unknown,
  depth: number,
  visited: Set<string>,
): Promise<TaskNode> {
  let taskId = "";
  let taskTitle = "Untitled Task";
  let taskDescription = "";
  let taskLocation: string | undefined;
  let taskLinks: ExternalLink[] = [];
  let requiredDocuments: RequiredDocument[] = [];
  let requiredDocumentsMode: RequiredDocumentsMode = "all_of";

  if (typeof rawTask === "string") {
    taskId = toRecordId(rawTask);
  } else if (rawTask && typeof rawTask === "object") {
    const record = rawTask as Record<string, unknown>;

    taskId = toRecordId(rawTask);
    if (!taskId) {
      taskId = toRecordId(record.id);
    }

    const tableFromRecord = typeof record.tb === "string"
      ? record.tb
      : typeof record.table === "string"
      ? record.table
      : null;
    if (tableFromRecord && taskId && !taskId.includes(":")) {
      taskId = `${tableFromRecord}:${taskId}`;
    }

    taskTitle = String(record.title ?? taskTitle);
    taskDescription = String(record.description ?? taskDescription);
    taskLocation = toOptionalString(record.location);
    taskLinks = toExternalLinks(record.links);
    requiredDocuments = toRequiredDocuments(record.required_documents);
    requiredDocumentsMode = toRequiredDocumentsMode(record.required_documents_mode);
  }

  taskId = normalizeTaskRecordId(taskId);
  const taskKey = toRecordKey(taskId);

  if (!taskId) {
    return {
      id: "",
      key: "",
      title: taskTitle,
      description: taskDescription,
      location: taskLocation,
      links: taskLinks,
      requiredDocuments,
      requiredDocumentsMode,
      children: [],
    };
  }

  if (taskTitle === "Untitled Task" && taskDescription === "") {
    const taskRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(await db.query(`SELECT * FROM ${taskId};`), 0),
    );
    const taskRow = taskRows[0];

    if (taskRow) {
      taskTitle = String(taskRow.title ?? taskTitle);
      taskDescription = String(taskRow.description ?? taskDescription);
      taskLocation = toOptionalString(taskRow.location);
      taskLinks = toExternalLinks(taskRow.links);
      requiredDocuments = toRequiredDocuments(taskRow.required_documents);
      requiredDocumentsMode = toRequiredDocumentsMode(taskRow.required_documents_mode);
    }
  }

  const ownerProcessKey = inferProcessKeyFromTaskKey(taskKey) ?? undefined;
  const inferredRequiredDocuments = inferRequiredDocuments(
    taskTitle,
    taskDescription,
    ownerProcessKey,
  );

  if (requiredDocuments.length === 0 && inferredRequiredDocuments.length > 0) {
    requiredDocuments = inferredRequiredDocuments;
    requiredDocumentsMode = inferRequiredDocumentsMode(
      taskTitle,
      taskDescription,
      inferredRequiredDocuments.length,
    );
  } else if (inferredRequiredDocuments.length > 0) {
    requiredDocuments = mergeRequiredDocuments(requiredDocuments, inferredRequiredDocuments);
  }

  if (!taskId || visited.has(taskId) || depth >= MAX_TASK_DEPTH) {
    return {
      id: taskId,
      key: taskKey,
      title: taskTitle,
      description: taskDescription,
      location: taskLocation,
      links: taskLinks,
      requiredDocuments,
      requiredDocumentsMode,
      children: [],
    };
  }

  visited.add(taskId);
  const childTaskRows = await getLinkedTasks(db, taskId);

  const children = await Promise.all(
    childTaskRows.map((childTaskRow) => buildTaskNode(db, childTaskRow, depth + 1, visited)),
  );

  return {
    id: taskId,
    key: taskKey,
    title: taskTitle,
    description: taskDescription,
    location: taskLocation,
    links: taskLinks,
    requiredDocuments,
    requiredDocumentsMode,
    children,
  };
}

export async function getTipsByTask(
  taskKeys: string[],
  viewerUserId?: string | null,
): Promise<TipsByTask> {
  try {
    if (taskKeys.length === 0) {
      return {};
    }

    const db = await getSurrealClient();
    const viewerUserKey = viewerUserId ? stripTablePrefix(viewerUserId, "user") : null;
    const hasSafeViewer =
      typeof viewerUserKey === "string" && viewerUserKey.length > 0 && isSafeRecordKey(viewerUserKey);

    const safeTaskKeys = taskKeys.filter((taskKey) => isSafeRecordKey(taskKey));
    const tipsByTask: TipsByTask = Object.fromEntries(taskKeys.map((taskKey) => [taskKey, []]));

    if (safeTaskKeys.length === 0) {
      return tipsByTask;
    }

    const taskRecordIds = safeTaskKeys.map((taskKey) => `task:${taskKey}`).join(", ");
    const postedRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(
          `
            SELECT out AS tip, task_id
            FROM posted
            WHERE task_id IN [${taskRecordIds}];
          `,
        ),
        0,
      ),
    );

    if (postedRows.length === 0) {
      return tipsByTask;
    }

    const tipIds = new Set<string>();
    const taskKeyByTipId = new Map<string, string>();

    for (const row of postedRows) {
      const tipId = toRecordId(row.tip);
      const taskId = toRecordId(row.task_id);
      const taskKey = toRecordKey(taskId);

      if (!tipId || !taskKey || !isSafeRecordKey(taskKey)) {
        continue;
      }

      tipIds.add(tipId);
      if (!taskKeyByTipId.has(tipId)) {
        taskKeyByTipId.set(tipId, taskKey);
      }
    }

    if (tipIds.size === 0) {
      return tipsByTask;
    }

    const tipIdList = Array.from(tipIds).join(", ");
    const tipsRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(
        await db.query(
          `
            SELECT *, (upvotes - downvotes) AS score
            FROM tip
            WHERE id IN [${tipIdList}]
            ORDER BY score DESC, created_at DESC;
          `,
        ),
        0,
      ),
    );

    const viewerVoteByTipKey = new Map<string, "upvote" | "downvote">();
    if (hasSafeViewer) {
      const voteRows = asArray<Record<string, unknown>>(
        queryResult<unknown>(
          await db.query(
            `
              SELECT out, direction
              FROM voted
              WHERE in = user:${viewerUserKey}
                AND out IN [${tipIdList}];
            `,
          ),
          0,
        ),
      );

      for (const voteRow of voteRows) {
        const votedTipId = toRecordId(voteRow.out);
        const votedTipKey = toRecordKey(votedTipId);
        const direction = String(voteRow.direction ?? "");

        if (votedTipKey && (direction === "upvote" || direction === "downvote")) {
          viewerVoteByTipKey.set(votedTipKey, direction);
        }
      }
    }

    for (const tipRow of tipsRows) {
      const id = toRecordId(tipRow.id);
      const tipKey = toRecordKey(id);
      const taskKey = taskKeyByTipId.get(id);

      if (!taskKey || !tipsByTask[taskKey]) {
        continue;
      }

      tipsByTask[taskKey].push({
        id,
        key: tipKey,
        content: String(tipRow.content ?? ""),
        upvotes: toSafeInt(tipRow.upvotes),
        downvotes: toSafeInt(tipRow.downvotes),
        score: toSafeInt(tipRow.score),
        createdAt: String(tipRow.created_at ?? ""),
        viewerVote: viewerVoteByTipKey.get(tipKey) ?? null,
      });
    }

    for (const taskKey of Object.keys(tipsByTask)) {
      tipsByTask[taskKey].sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return right.createdAt.localeCompare(left.createdAt);
      });
    }

    return tipsByTask;
  } catch {
    return {};
  }
}

export async function getProcessDependencyStats(
  targetProcessKey: string,
): Promise<ProcessDependencyStats> {
  try {
    if (!isSafeRecordKey(targetProcessKey)) {
      return { requiredByProcessCount: 0 };
    }

    const cacheStore = getProcessDataCacheStore();
    const cachedCounts = getFreshCacheValue(cacheStore.dependencyCounts);
    if (cachedCounts) {
      return {
        requiredByProcessCount: cachedCounts[targetProcessKey] ?? 0,
      };
    }

    const db = await getSurrealClient();
    const taskRows = asArray<Record<string, unknown>>(
      queryResult<unknown>(await db.query("SELECT id, title, description, required_documents FROM task;"), 0),
    );

    const requiringProcessKeysByTarget = new Map<string, Set<string>>();

    for (const taskRow of taskRows) {
      const taskId = toRecordId(taskRow.id);
      const taskKey = toRecordKey(taskId);
      const ownerProcessKey = inferProcessKeyFromTaskKey(taskKey);

      if (!ownerProcessKey) {
        continue;
      }

      const requiredDocuments = mergeRequiredDocuments(
        toRequiredDocuments(taskRow.required_documents),
        inferRequiredDocuments(
          String(taskRow.title ?? ""),
          String(taskRow.description ?? ""),
          ownerProcessKey,
        ),
      );
      for (const document of requiredDocuments) {
        if (!document.processKey || !isSafeRecordKey(document.processKey)) {
          continue;
        }

        if (!requiringProcessKeysByTarget.has(document.processKey)) {
          requiringProcessKeysByTarget.set(document.processKey, new Set<string>());
        }

        requiringProcessKeysByTarget.get(document.processKey)?.add(ownerProcessKey);
      }
    }

    const dependencyCounts: Record<string, number> = {};
    for (const [targetKey, requiringProcessKeys] of requiringProcessKeysByTarget.entries()) {
      dependencyCounts[targetKey] = requiringProcessKeys.size;
    }

    cacheStore.dependencyCounts = {
      value: dependencyCounts,
      expiresAt: Date.now() + PROCESS_DEPENDENCY_CACHE_TTL_MS,
    };

    return {
      requiredByProcessCount: dependencyCounts[targetProcessKey] ?? 0,
    };
  } catch {
    return {
      requiredByProcessCount: 0,
    };
  }
}

function collectTaskKeys(tasks: TaskNode[]): string[] {
  const keys: string[] = [];

  for (const task of tasks) {
    keys.push(task.key);
    keys.push(...collectTaskKeys(task.children));
  }

  return keys;
}

function getConnectionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to connect to SurrealDB.";
}

function normalizeTaskRecordId(value: string): string {
  if (!value) {
    return "";
  }

  return value.includes(":") ? value : `task:${value}`;
}

async function getLinkedTasks(db: Surreal, inRecordId: string): Promise<unknown[]> {
  const linkedRows = asArray<Record<string, unknown>>(
    queryResult<unknown>(
      await db.query(
        `
          SELECT out AS task, sort_order, id
          FROM requires
          WHERE in = ${inRecordId}
          ORDER BY sort_order ASC, id ASC;
        `,
      ),
      0,
    ),
  );

  return linkedRows.map((row) => row.task).filter((task) => task !== undefined);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toExternalLinks(value: unknown): ExternalLink[] {
  const rows = asArray<Record<string, unknown>>(value);

  return rows.flatMap((row) => {
    const label = toOptionalString(row.label);
    const url = toOptionalString(row.url);

    if (!label || !url) {
      return [];
    }

    return [{ label, url }];
  });
}

function toRequiredDocuments(value: unknown): RequiredDocument[] {
  const rows = asArray<Record<string, unknown>>(value);

  return rows.flatMap((row) => {
    const name = toOptionalString(row.name);
    const processKey = toOptionalString(row.process_key);

    if (!name) {
      return [];
    }

    return [{ name, processKey }];
  });
}

function inferRequiredDocuments(
  taskTitle: string,
  taskDescription: string,
  ownerProcessKey?: string,
): RequiredDocument[] {
  const text = `${taskTitle} ${taskDescription}`.trim().toLowerCase();

  if (text.length === 0 || !hasDocumentRequirementCue(text)) {
    return [];
  }

  const inferred: RequiredDocument[] = [];

  for (const rule of INFERRED_DOCUMENT_RULES) {
    if (ownerProcessKey && rule.processKey === ownerProcessKey) {
      continue;
    }

    if (
      rule.processKey === "passport" &&
      /\bphoto\b/.test(text) &&
      !/\bpassport copy\b|\bpassport validity\b|\bvalid passport\b/.test(text)
    ) {
      continue;
    }

    if (rule.pattern.test(text)) {
      inferred.push({
        name: rule.name,
        processKey: rule.processKey,
      });
    }
  }

  return uniqueRequiredDocuments(inferred);
}

function hasDocumentRequirementCue(text: string): boolean {
  return /\b(prepare|bring|provide|submit|obtain|required|valid|attach|upload|supporting|evidence|proof|copy|present)\b/.test(text);
}

function inferRequiredDocumentsMode(
  taskTitle: string,
  taskDescription: string,
  documentCount: number,
): RequiredDocumentsMode {
  if (documentCount <= 1) {
    return "all_of";
  }

  const text = `${taskTitle} ${taskDescription}`.toLowerCase();

  if (/\bone of\b|\beither\b|\bany of\b/.test(text)) {
    return "one_of";
  }

  if (/\bor\b|\/|\bif applicable\b/.test(text)) {
    return "one_of";
  }

  return "all_of";
}

function mergeRequiredDocuments(
  base: RequiredDocument[],
  inferred: RequiredDocument[],
): RequiredDocument[] {
  return uniqueRequiredDocuments([...base, ...inferred]);
}

function uniqueRequiredDocuments(documents: RequiredDocument[]): RequiredDocument[] {
  const seen = new Set<string>();
  const unique: RequiredDocument[] = [];

  for (const document of documents) {
    if (!document.name) {
      continue;
    }

    const id = `${document.name.toLowerCase()}::${document.processKey ?? ""}`;

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    unique.push(document);
  }

  return unique;
}

function toRequiredDocumentsMode(value: unknown): RequiredDocumentsMode {
  if (value === "one_of") {
    return "one_of";
  }

  return "all_of";
}

function toAttendanceModes(value: unknown): AttendanceMode[] {
  const rows = asArray<unknown>(value);
  const modes = new Set<AttendanceMode>();

  for (const row of rows) {
    if (row === "in_person" || row === "online") {
      modes.add(row);
    }
  }

  return Array.from(modes);
}

function inferProcessKeyFromTaskKey(taskKey: string): string | null {
  if (taskKey.startsWith("passport_")) {
    return "passport";
  }

  if (taskKey.startsWith("fayda_")) {
    return "fayda_registration";
  }

  if (taskKey.startsWith("cr_")) {
    return "commercial_registration";
  }

  if (taskKey.startsWith("tln_")) {
    return "trade_license_new";
  }

  if (taskKey.startsWith("tlr_")) {
    return "trade_license_renewal";
  }

  if (taskKey.startsWith("bv_")) {
    return "business_visa";
  }

  if (taskKey.startsWith("trm_")) {
    return "temporary_residence_marriage";
  }

  if (taskKey.startsWith("eoid_")) {
    return "ethiopian_origin_id";
  }

  if (taskKey.startsWith("kebele_")) {
    return "kebele_id_residency";
  }

  if (taskKey.startsWith("dl_")) {
    return "drivers_license_issue";
  }

  if (taskKey.startsWith("voter_")) {
    return "voter_registration";
  }

  if (taskKey.startsWith("student_")) {
    return "student_id_card";
  }

  if (taskKey.startsWith("tin_")) {
    return "tin_registration";
  }

  if (taskKey.startsWith("bci_")) {
    return "birth_certificate_issuance";
  }

  if (taskKey.startsWith("mcr_")) {
    return "marriage_certificate_registration";
  }

  if (taskKey.startsWith("pcc_")) {
    return "police_clearance_certificate";
  }

  if (taskKey.startsWith("wpf_")) {
    return "work_permit_foreign_employee";
  }

  if (taskKey.startsWith("enc_")) {
    return "electricity_new_connection";
  }

  if (taskKey.startsWith("dc_")) {
    return "death_certificate_issuance";
  }

  if (taskKey.startsWith("dcr_")) {
    return "divorce_certificate_registration";
  }

  if (taskKey.startsWith("bnr_")) {
    return "business_name_reservation";
  }

  if (taskKey.startsWith("vat_")) {
    return "vat_registration";
  }

  if (taskKey.startsWith("iec_")) {
    return "import_export_code_registration";
  }

  if (taskKey.startsWith("bcp_")) {
    return "building_construction_permit";
  }

  if (taskKey.startsWith("wnc_")) {
    return "water_new_connection";
  }

  if (taskKey.startsWith("vot_")) {
    return "vehicle_ownership_transfer";
  }

  if (taskKey.startsWith("lhc_")) {
    return "land_holding_certificate_issuance";
  }

  if (taskKey.startsWith("llt_")) {
    return "land_lease_transfer";
  }

  if (taskKey.startsWith("cmb_")) {
    return "cadastral_map_and_boundary_certificate";
  }

  if (taskKey.startsWith("pmr_")) {
    return "property_mortgage_registration";
  }

  if (taskKey.startsWith("mdn_")) {
    return "medical_death_notice";
  }

  if (taskKey.startsWith("wan_")) {
    return "witness_affidavit_notarization";
  }

  return null;
}
