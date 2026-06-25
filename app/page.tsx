"use client";

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Barcode,
  ClipboardList,
  FileClock,
  Handshake,
  Hospital,
  Image as ImageIcon,
  Pill,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Upload,
  UserPlus
} from "lucide-react";
import NextImage from "next/image";
import JsBarcode from "jsbarcode";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { formatDate, formatDateTime, makeId } from "../lib/ids";
import { runDemoSafetyChecks } from "../lib/safety";
import { demoUsers, seedState } from "../lib/seed";
import {
  AdministrationStatus,
  AuditEvent,
  ContactInfo,
  DemoState,
  FiveRightsResult,
  MedicationOrder,
  MedicationHistoryItem,
  OrderStatus,
  Patient,
  PatientTimelineEvent,
  Role,
  SafetyAlert,
  User
} from "../lib/types";

const storageKey = "bcma-cpoe-ehr-demo-state";

const modules = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "workflow", label: "Demo Workflow", icon: ClipboardList },
  { id: "ehr", label: "EHR / Admission", icon: UserPlus },
  { id: "cpoe", label: "CPOE Orders", icon: Stethoscope },
  { id: "pharmacy", label: "Pharmacy", icon: Pill },
  { id: "patientScan", label: "Patient Scan", icon: Barcode },
  { id: "bcma", label: "BCMA", icon: Barcode },
  { id: "handover", label: "Handover", icon: Handshake },
  { id: "audit", label: "Audit", icon: FileClock }
] as const;

type ModuleId = (typeof modules)[number]["id"];

const roleWorkspaces: Record<Role, ModuleId[]> = {
  "Ward Clerk": ["ehr"],
  Physician: ["cpoe"],
  Pharmacist: ["pharmacy"],
  Nurse: ["patientScan", "bcma", "handover"],
  Admin: ["dashboard", "workflow", "ehr", "cpoe", "pharmacy", "patientScan", "bcma", "handover", "audit"]
};

const defaultWorkspace: Record<Role, ModuleId> = {
  "Ward Clerk": "ehr",
  Physician: "cpoe",
  Pharmacist: "pharmacy",
  Nurse: "patientScan",
  Admin: "dashboard"
};

type RolePageDescription = {
  title: string;
  description: string;
  checkpoints: string[];
};

const rolePageDescriptions: Record<Role, Partial<Record<ModuleId, RolePageDescription>>> = {
  "Ward Clerk": {
    ehr: {
      title: "Ward Clerk Admission Workspace",
      description: "Create the initial patient record, capture admission details, and generate the wristband barcode that starts the medication loop.",
      checkpoints: ["Patient profile", "Wristband barcode", "Admission timestamp"]
    }
  },
  Physician: {
    cpoe: {
      title: "Physician CPOE Workspace",
      description: "Select the correct patient, enter a complete medication order, review demo safety alerts, and send the order to pharmacy.",
      checkpoints: ["Medication order", "Required fields", "Demo safety alerts"]
    }
  },
  Pharmacist: {
    pharmacy: {
      title: "Pharmacist Verification Workspace",
      description: "Review pending physician orders with patient context, approve or reject orders, add notes, and generate dose barcodes for dispensed medications.",
      checkpoints: ["Order review", "Approval decision", "Dose barcode"]
    }
  },
  Nurse: {
    patientScan: {
      title: "Nurse Patient Identification Workspace",
      description: "Scan or enter the wristband barcode to confirm the patient identity and review key patient details before medication administration.",
      checkpoints: ["Patient barcode", "Matched profile", "Clinical summary"]
    },
    bcma: {
      title: "Nurse BCMA Administration Workspace",
      description: "Scan the patient and medication barcodes, verify the Five Rights, and document administered, held, or missed medications.",
      checkpoints: ["Patient scan", "Medication scan", "Five Rights"]
    },
    handover: {
      title: "Nurse Handover Workspace",
      description: "Review the active medication picture before shift transfer, including recent administrations, missed or held doses, pending pharmacy items, and alerts.",
      checkpoints: ["Recent events", "Missed or held meds", "Pending items"]
    }
  },
  Admin: {
    dashboard: {
      title: "Admin Operations Dashboard",
      description: "Monitor the whole demo workflow across admissions, medication orders, pharmacy queues, due medications, safety alerts, and audit events.",
      checkpoints: ["System counts", "Recent audit", "Safety alerts"]
    },
    workflow: {
      title: "Admin Demo Workflow Guide",
      description: "Use this guided sequence to present the complete medication loop from admission through ordering, pharmacy verification, BCMA administration, handover, and audit.",
      checkpoints: ["Presentation path", "Role sequence", "Live status"]
    },
    ehr: {
      title: "Admin EHR Oversight",
      description: "Review or demonstrate the admission record workflow while retaining full visibility into patient details and timeline activity.",
      checkpoints: ["Patient record", "Barcode identity", "Timeline"]
    },
    cpoe: {
      title: "Admin CPOE Oversight",
      description: "Inspect the order-entry flow and safety alert generation from an administrative demo perspective.",
      checkpoints: ["Order completeness", "Alert generation", "Pharmacy routing"]
    },
    pharmacy: {
      title: "Admin Pharmacy Oversight",
      description: "Observe pharmacy queue decisions, dispensing status, pharmacist notes, and medication barcode generation.",
      checkpoints: ["Verification queue", "Dispense status", "Barcode tracking"]
    },
    patientScan: {
      title: "Admin Patient Scan Oversight",
      description: "Review the nurse-facing patient identification step where wristband barcode scanning opens the matched patient profile.",
      checkpoints: ["Barcode lookup", "Patient match", "Profile review"]
    },
    bcma: {
      title: "Admin BCMA Oversight",
      description: "Review the nurse scanning workflow and confirm that medication administration remains tied to patient, order, and barcode checks.",
      checkpoints: ["Five Rights", "Administration record", "Status update"]
    },
    handover: {
      title: "Admin Handover Oversight",
      description: "View cross-shift medication continuity information, including active orders, recent events, and unresolved medication items.",
      checkpoints: ["Patient summary", "Continuity risks", "Recent timeline"]
    },
    audit: {
      title: "Admin Audit Workspace",
      description: "Trace accountability across the full medication loop with timestamps, roles, users, patients, orders, and action descriptions.",
      checkpoints: ["Timestamp", "Responsible user", "Action history"]
    }
  }
};

type DemoWorkflowStep = {
  id: string;
  role: Role;
  moduleId: ModuleId;
  title: string;
  action: string;
  result: string;
};

const demoWorkflowSteps: DemoWorkflowStep[] = [
  {
    id: "admission",
    role: "Ward Clerk",
    moduleId: "ehr",
    title: "Admit patient and create wristband",
    action: "Create a patient profile with allergies, current medications, renal function, and lab values.",
    result: "The patient appears in the EHR dashboard with a generated wristband barcode."
  },
  {
    id: "order",
    role: "Physician",
    moduleId: "cpoe",
    title: "Enter medication order",
    action: "Select the patient, enter drug, dose, route, frequency, scheduled time, and submit to pharmacy.",
    result: "The order moves to Pharmacy Review and mock demo safety alerts are generated when rules match."
  },
  {
    id: "verify",
    role: "Pharmacist",
    moduleId: "pharmacy",
    title: "Verify order and generate dose barcode",
    action: "Review patient context and safety alerts, then approve or reject the medication order.",
    result: "Approved orders receive a scannable medication barcode that can be uploaded or scanned in Pharmacy and BCMA."
  },
  {
    id: "dispense",
    role: "Pharmacist",
    moduleId: "pharmacy",
    title: "Dispense prepared medication",
    action: "Generate or recheck the medication barcode, then mark the medication as dispensed.",
    result: "The order status becomes Dispensed and the nurse can use the barcode for Five Rights verification."
  },
  {
    id: "identify",
    role: "Nurse",
    moduleId: "patientScan",
    title: "Scan patient wristband",
    action: "Enter the wristband barcode, scan it, or upload a barcode picture to identify the patient before medication administration.",
    result: "The matched patient profile opens with allergies, current medications, labs, a visual barcode, and recent timeline."
  },
  {
    id: "administer",
    role: "Nurse",
    moduleId: "bcma",
    title: "Scan and verify Five Rights",
    action: "Scan or upload both the patient barcode and the medication dose barcode, then review each Five Rights check.",
    result: "Administration is blocked until the demo checks pass for patient, drug, dose, route, and time."
  },
  {
    id: "document",
    role: "Nurse",
    moduleId: "bcma",
    title: "Document administration",
    action: "Mark the medication as administered, held, or missed after verification.",
    result: "The EHR timeline, order status, administration log, and audit trail update automatically."
  },
  {
    id: "handover",
    role: "Nurse",
    moduleId: "handover",
    title: "Review handover",
    action: "Open handover to review active meds, recently administered meds, pending pharmacy items, alerts, and recent timeline.",
    result: "The next shift gets a concise medication continuity picture."
  },
  {
    id: "audit",
    role: "Admin",
    moduleId: "audit",
    title: "Audit accountability",
    action: "Review timestamped events across admission, ordering, alerts, pharmacy actions, administration, and handover.",
    result: "Every meaningful action is traceable by role, user, patient, order, and description."
  }
];

const legacyNameMap: Record<string, string> = {
  "Maya Tran": "Bùi Nguyệt Tú",
  "Dr. Lena Ortiz": "Lee Chee",
  "Noah Chen, PharmD": "Minhh Ann",
  "Ari Patel, RN": "Linh Phạm",
  "Sam Rivera": "Ngô Gia Bảo"
};

const routeTextMap: Record<string, string> = {
  PO: "Oral",
  IV: "Intravenous",
  IM: "Intramuscular",
  SC: "Subcutaneous"
};

const frequencyTextMap: Record<string, string> = {
  Daily: "Once daily",
  BID: "Twice daily",
  TID: "Three times daily",
  Q6H: "Every 6 hours"
};

const emptyAdmissionForm = {
  admissionType: "New admission",
  readmissionBarcode: "",
  name: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  citizenId: "",
  ethnicity: "",
  bloodType: "",
  heightCm: "170",
  occupation: "",
  reasonForVisit: "",
  allergies: "",
  adverseDrugReactions: "",
  pastMedicalHistory: "",
  currentMedications: "",
  homeMedications: "",
  weightKg: "70",
  renalFunction: "",
  patientPhone: "",
  patientEmail: "",
  patientAddress: "",
  emergencyPhone: "",
  emergencyEmail: "",
  emergencyAddress: ""
};

type OrderDraft = {
  id: string;
  drugName: string;
  dose: string;
  priority: MedicationOrder["priority"];
  route: string;
  frequency: string;
  customFrequency: string;
  scheduledStartDate: string;
  scheduledEndDate: string;
  scheduledTimes: string;
  notes: string;
};

function todayInput(): string {
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function createOrderDraft(): OrderDraft {
  const today = todayInput();
  return {
    id: makeId("DRF"),
    drugName: "",
    dose: "",
    priority: "Routine",
    route: "Oral",
    frequency: "Once daily",
    customFrequency: "",
    scheduledStartDate: today,
    scheduledEndDate: today,
    scheduledTimes: "09:00",
    notes: ""
  };
}

const emptyOrderForm = {
  patientId: "",
  items: [createOrderDraft()]
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMedicationDetails(value: string): MedicationHistoryItem[] {
  return splitLines(value).map((line) => {
    const [name = "", dose = "", frequency = ""] = line.split("|").map((part) => part.trim());
    return { name, dose, frequency };
  });
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function replaceLegacyText(value: string): string {
  return Object.entries(legacyNameMap).reduce((text, [legacy, next]) => text.replaceAll(legacy, next), value);
}

function normalizeRoute(value: string): string {
  return routeTextMap[value] ?? value;
}

function normalizeFrequency(value: string): string {
  return frequencyTextMap[value] ?? value;
}

function priorityRank(priority: MedicationOrder["priority"]): number {
  const map: Record<MedicationOrder["priority"], number> = {
    STAT: 0,
    Urgent: 1,
    Routine: 2
  };
  return map[priority];
}

function sortOrdersByPriority(orders: MedicationOrder[]): MedicationOrder[] {
  return [...orders].sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority));
}

function fallbackContact(): ContactInfo {
  return { phone: "", email: "", address: "" };
}

function fallbackMedicationDetails(values: string[]): MedicationHistoryItem[] {
  return values.map((name) => ({ name, dose: "", frequency: "" }));
}

function normalizePatient(patient: Patient): Patient {
  const currentMedicationDetails = (patient.currentMedicationDetails ?? fallbackMedicationDetails(patient.currentMedications ?? [])).map((item) => ({
    ...item,
    frequency: item.frequency ?? item.duration ?? ""
  }));
  const homeMedicationDetails = (patient.homeMedicationDetails ?? fallbackMedicationDetails(patient.homeMedications ?? [])).map((item) => ({
    ...item,
    frequency: item.frequency ?? item.duration ?? ""
  }));

  return {
    ...patient,
    admissionType: patient.admissionType ?? "New admission",
    gender: patient.gender ?? "",
    nationality: patient.nationality ?? "",
    citizenId: patient.citizenId ?? "",
    ethnicity: patient.ethnicity ?? "",
    bloodType: patient.bloodType ?? "",
    heightCm: patient.heightCm ?? 0,
    occupation: patient.occupation ?? "",
    reasonForVisit: patient.reasonForVisit ?? "",
    priorDisorders: patient.priorDisorders ?? patient.pastMedicalHistory ?? [],
    recentHistory: patient.recentHistory ?? "",
    currentMedicationDetails,
    homeMedicationDetails,
    patientContact: patient.patientContact ?? fallbackContact(),
    emergencyContact: patient.emergencyContact ?? fallbackContact(),
    screeningImages: patient.screeningImages ?? []
  };
}

function includeSeededFiveRightsExamples(savedState: DemoState): DemoState {
  const examplePatientIds = new Set(["PAT-1001", "PAT-1002"]);
  const exampleOrderIds = new Set(["ORD-2002", "ORD-2003"]);
  const exampleDispenseIds = new Set(["DSP-5001"]);
  const missingPatients = seedState.patients.filter((patient) => examplePatientIds.has(patient.id) && !savedState.patients.some((item) => item.id === patient.id));
  const missingOrders = seedState.orders.filter((order) => exampleOrderIds.has(order.id) && !savedState.orders.some((item) => item.id === order.id));
  const missingDispenses = seedState.dispenses.filter((dispense) => exampleDispenseIds.has(dispense.id) && !savedState.dispenses.some((item) => item.id === dispense.id));

  if (missingPatients.length === 0 && missingOrders.length === 0 && missingDispenses.length === 0) return savedState;

  return {
    ...savedState,
    patients: [...savedState.patients, ...missingPatients],
    orders: [...savedState.orders, ...missingOrders],
    dispenses: [...savedState.dispenses, ...missingDispenses]
  };
}

function migrateDemoState(savedState: DemoState): DemoState {
  const stateWithExamples = includeSeededFiveRightsExamples(savedState);

  return {
    ...stateWithExamples,
    patients: stateWithExamples.patients.map((patient) => {
      const normalizedPatient = normalizePatient(patient);
      return {
      ...normalizedPatient,
      createdBy: replaceLegacyText(patient.createdBy),
      timeline: normalizedPatient.timeline.map((event) => ({
        ...event,
        userName: replaceLegacyText(event.userName),
        description: replaceLegacyText(event.description)
      }))
    };
    }),
    orders: stateWithExamples.orders.map((order) => ({
      ...order,
      physicianName: replaceLegacyText(order.physicianName),
      priority: order.priority ?? "Routine",
      route: normalizeRoute(order.route),
      frequency: normalizeFrequency(order.frequency),
      scheduledTimes: order.scheduledTimes ?? [order.scheduledTime],
      scheduleDisplay: order.scheduleDisplay ?? formatDateTime(order.scheduledTime)
    })),
    dispenses: stateWithExamples.dispenses.map((dispense) => ({
      ...dispense,
      preparedBy: replaceLegacyText(dispense.preparedBy)
    })),
    administrations: stateWithExamples.administrations.map((administration) => ({
      ...administration,
      nurseName: replaceLegacyText(administration.nurseName)
    })),
    auditEvents: stateWithExamples.auditEvents.map((event) => ({
      ...event,
      userName: replaceLegacyText(event.userName),
      description: replaceLegacyText(event.description)
        .replaceAll(" PO Daily", " oral once daily")
        .replaceAll(" PO ", " oral ")
        .replaceAll(" IV ", " intravenous ")
        .replaceAll(" IM ", " intramuscular ")
        .replaceAll(" SC ", " subcutaneous ")
    })),
    handoverNotes: savedState.handoverNotes.map((event) => ({
      ...event,
      userName: replaceLegacyText(event.userName),
      description: replaceLegacyText(event.description)
    }))
  };
}

function calculateAge(dateOfBirth: string): number {
  const birthDate = new Date(dateOfBirth.replaceAll("/", "-"));
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return Number.isFinite(age) ? age : 0;
}

function toIsoFromDateAndTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function datesBetween(startDate: string, endDate: string): string[] {
  if (!startDate) return [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate || startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const dates: string[] = [];
  const finalDate = end < start ? start : end;
  for (let current = start; current <= finalDate; current = addDays(current, 1)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

function parseScheduledTimes(value: string): string[] {
  return value
    .split(/,|;|\n|&/)
    .map((time) => time.trim())
    .filter(Boolean);
}

function buildScheduledTimes(draft: OrderDraft): string[] {
  const dates = datesBetween(draft.scheduledStartDate, draft.scheduledEndDate);
  const times = parseScheduledTimes(draft.scheduledTimes);
  return dates.flatMap((date) => times.map((time) => toIsoFromDateAndTime(date, time)));
}

function formatScheduleList(values: string[]): string {
  if (values.length === 0) return "No schedule";
  if (values.length <= 4) return values.map(formatDateTime).join(", ");
  return `${values.slice(0, 4).map(formatDateTime).join(", ")} and ${values.length - 4} more`;
}

function createTimelineEvent(user: User, description: string, timestamp = new Date().toISOString()): PatientTimelineEvent {
  return {
    id: makeId("TL"),
    timestamp,
    role: user.role,
    userName: user.name,
    description
  };
}

function createAuditEvent(
  user: User,
  actionType: AuditEvent["actionType"],
  description: string,
  patientId?: string,
  orderId?: string,
  timestamp = new Date().toISOString()
): AuditEvent {
  return {
    id: makeId("AUD"),
    timestamp,
    userId: user.id,
    userName: user.name,
    role: user.role,
    actionType,
    patientId,
    orderId,
    description
  };
}

function canUse(currentRole: Role, expected: Role): boolean {
  return currentRole === expected || currentRole === "Admin";
}

function canOpenModule(role: Role, moduleId: ModuleId): boolean {
  return roleWorkspaces[role].includes(moduleId);
}

function statusClasses(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    Ordered: "bg-slate-100 text-slate-700 border-slate-300",
    "Pharmacy Review": "bg-amber-50 text-amber-800 border-amber-300",
    Approved: "bg-blue-50 text-blue-700 border-blue-300",
    Rejected: "bg-red-50 text-red-700 border-red-300",
    Dispensed: "bg-teal-50 text-teal-700 border-teal-300",
    Administered: "bg-green-50 text-green-700 border-green-300",
    "Missed/Held": "bg-orange-50 text-orange-800 border-orange-300"
  };
  return map[status];
}

function alertClasses(severity: SafetyAlert["severity"]): string {
  const map: Record<SafetyAlert["severity"], string> = {
    info: "bg-blue-50 text-blue-800 border-blue-200",
    warning: "bg-amber-50 text-amber-900 border-amber-300",
    critical: "bg-red-50 text-red-800 border-red-300"
  };
  return map[severity];
}

function priorityClasses(priority: MedicationOrder["priority"]): string {
  const map: Record<MedicationOrder["priority"], string> = {
    Routine: "bg-slate-100 text-slate-700 border-slate-300",
    Urgent: "bg-yellow-50 text-yellow-900 border-yellow-300",
    STAT: "bg-red-50 text-red-800 border-red-300"
  };
  return map[priority];
}

function evaluateFiveRights(state: DemoState, patientBarcode: string, medBarcode: string): FiveRightsResult {
  const patient = state.patients.find((item) => item.barcode.trim().toLowerCase() === patientBarcode.trim().toLowerCase());
  const order = state.orders.find((item) => item.doseBarcode?.trim().toLowerCase() === medBarcode.trim().toLowerCase());
  const messages: string[] = [];

  const rightPatient = Boolean(patient && order && order.patientId === patient.id);
  const rightDrug = Boolean(order?.drugName);
  const rightDose = Boolean(order?.dose);
  const rightRoute = Boolean(order?.route);
  const rightTime = Boolean(order?.scheduledTime && order.status === "Dispensed");

  if (!patient) messages.push("Patient barcode was not found.");
  if (!order) messages.push("Medication barcode was not found.");
  if (patient && order && patient.id !== order.patientId) messages.push("Medication barcode belongs to a different patient.");
  if (order && order.status !== "Dispensed") messages.push(`Medication status is ${order.status}; it must be dispensed before administration.`);
  if (order && !order.scheduledTime) messages.push("Order has no scheduled time.");

  if (messages.length === 0) {
    messages.push("All five demo checks pass. This is a mock verification, not a clinical decision tool.");
  }

  return { rightPatient, rightDrug, rightDose, rightRoute, rightTime, messages };
}

function findFiveRightsExample(state: DemoState, mode: "pass" | "fail") {
  const order = state.orders.find((item) => {
    const hasPatient = state.patients.some((patient) => patient.id === item.patientId);
    if (!item.doseBarcode || !hasPatient) return false;
    return mode === "pass" ? item.status === "Dispensed" : item.status !== "Dispensed";
  });
  const patient = order ? state.patients.find((item) => item.id === order.patientId) : undefined;

  return order && patient ? { order, patient } : null;
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={statusClasses(status)}>{status}</Badge>;
}

function PriorityBadge({ priority }: { priority: MedicationOrder["priority"] }) {
  return <Badge className={priorityClasses(priority)}>{priority}</Badge>;
}

function Section({
  title,
  icon: Icon,
  children,
  action
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-clinical-line bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-clinical-line px-5 py-4">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-5 w-5 text-clinical-teal" aria-hidden="true" /> : null}
          <h2 className="text-lg font-semibold text-clinical-ink">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  required,
  className = ""
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-clinical-ink ${className}`}>
      <span>
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "min-h-10 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm transition focus:border-clinical-blue";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function decodeBarcodeFromDataUrl(dataUrl: string): Promise<string> {
  const reader = new BrowserMultiFormatReader();
  const result = await reader.decodeFromImageUrl(dataUrl);
  const value = result.getText();
  if (!value) throw new Error("No readable barcode found in this image.");
  return value;
}

async function decodeBarcodeUpload(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const value = await decodeBarcodeFromDataUrl(dataUrl);
  return { dataUrl, value };
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-clinical-line bg-clinical-panel p-6 text-sm text-clinical-muted">{children}</div>;
}

function RoleDescriptionPanel({
  role,
  moduleId
}: {
  role: Role;
  moduleId: ModuleId;
}) {
  const description = rolePageDescriptions[role][moduleId];

  if (!description) return null;

  return (
    <section className="rounded-lg border border-clinical-line bg-white p-5 shadow-soft">
      <div className="grid gap-4">
        <div className="min-w-0">
          <Badge className="border-clinical-line bg-clinical-panel text-clinical-muted">{role}</Badge>
          <h2 className="mt-3 text-lg font-semibold text-clinical-ink">{description.title}</h2>
          <p className="mt-2 max-w-none text-sm leading-6 text-clinical-muted">{description.description}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {description.checkpoints.map((checkpoint) => (
            <span key={checkpoint} className="flex min-h-9 items-center justify-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-center text-xs font-semibold text-teal-800">
              {checkpoint}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const initialFiveRightsPassExample = findFiveRightsExample(seedState, "pass");
  const [state, setState] = useState<DemoState>(seedState);
  const [hydrated, setHydrated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(demoUsers[0].id);
  const [activeModule, setActiveModule] = useState<ModuleId>(defaultWorkspace[demoUsers[0].role]);
  const [selectedPatientId, setSelectedPatientId] = useState(seedState.patients[0]?.id ?? "");
  const [admissionForm, setAdmissionForm] = useState(emptyAdmissionForm);
  const [orderForm, setOrderForm] = useState({ ...emptyOrderForm, patientId: seedState.patients[0]?.id ?? "" });
  const [orderError, setOrderError] = useState("");
  const [admissionError, setAdmissionError] = useState("");
  const [pharmacyNotes, setPharmacyNotes] = useState<Record<string, string>>({});
  const [dispensingForms, setDispensingForms] = useState<Record<string, { doseTaken: string; packageType: "Full box" | "Individual bag"; customDose: string; scanBarcode: string }>>({});
  const [patientScan, setPatientScan] = useState(initialFiveRightsPassExample?.patient.barcode ?? seedState.patients[0]?.barcode ?? "");
  const [patientScanImage, setPatientScanImage] = useState("");
  const [patientScanImageName, setPatientScanImageName] = useState("");
  const [patientScanMessage, setPatientScanMessage] = useState("");
  const [admissionScreeningImages, setAdmissionScreeningImages] = useState<string[]>([]);
  const [medicationScan, setMedicationScan] = useState(initialFiveRightsPassExample?.order.doseBarcode ?? "");
  const [medicationScanMessage, setMedicationScanMessage] = useState("");
  const [administrationNote, setAdministrationNote] = useState("");
  const [handoverBarcode, setHandoverBarcode] = useState(seedState.patients[0]?.barcode ?? "");
  const [handoverTo, setHandoverTo] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [pharmacyBarcodeMessages, setPharmacyBarcodeMessages] = useState<Record<string, string>>({});
  const [pharmacyDispenseMessages, setPharmacyDispenseMessages] = useState<Record<string, string>>({});
  const [pendingDeletePatientId, setPendingDeletePatientId] = useState<string | null>(null);

  const currentUser = demoUsers.find((user) => user.id === currentUserId) ?? demoUsers[0];
  const selectedPatient = state.patients.find((patient) => patient.id === selectedPatientId) ?? state.patients[0];
  const handoverPatient = state.patients.find((patient) => patient.barcode.trim().toLowerCase() === handoverBarcode.trim().toLowerCase());
  const visibleModules = modules.filter((moduleItem) => canOpenModule(currentUser.role, moduleItem.id));
  const activeModuleAllowed = canOpenModule(currentUser.role, activeModule);
  const safeActiveModule = activeModuleAllowed ? activeModule : defaultWorkspace[currentUser.role];
  const scannedPatient = state.patients.find((patient) => patient.barcode.trim().toLowerCase() === patientScan.trim().toLowerCase());
  const readmissionPatient = state.patients.find((patient) => patient.barcode.trim().toLowerCase() === admissionForm.readmissionBarcode.trim().toLowerCase());
  const selectedOrderPatient = state.patients.find((patient) => patient.id === orderForm.patientId);

  function switchRole(userId: string) {
    const nextUser = demoUsers.find((user) => user.id === userId) ?? demoUsers[0];
    setCurrentUserId(nextUser.id);
    setActiveModule(defaultWorkspace[nextUser.role]);
    setPendingDeletePatientId(null);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = migrateDemoState(JSON.parse(saved) as DemoState);
        const savedPassExample = findFiveRightsExample(parsed, "pass");
        setState(parsed);
        setSelectedPatientId(parsed.patients[0]?.id ?? "");
        setOrderForm((form) => ({ ...form, patientId: parsed.patients[0]?.id ?? "" }));
        setPatientScan(savedPassExample?.patient.barcode ?? parsed.patients[0]?.barcode ?? "");
        setMedicationScan(savedPassExample?.order.doseBarcode ?? "");
        setHandoverBarcode(parsed.patients[0]?.barcode ?? "");
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [hydrated, state]);

  useEffect(() => {
    if (!activeModuleAllowed) {
      setActiveModule(defaultWorkspace[currentUser.role]);
    }
  }, [activeModuleAllowed, currentUser.role]);

  const dashboard = useMemo(() => {
    const pendingOrders = state.orders.filter((order) => order.status === "Ordered" || order.status === "Pharmacy Review").length;
    const pharmacyQueue = state.orders.filter((order) => order.status === "Pharmacy Review" || order.status === "Approved").length;
    const medicationsDue = state.orders.filter((order) => order.status === "Dispensed").length;
    return {
      totalPatients: state.patients.length,
      pendingOrders,
      pharmacyQueue,
      medicationsDue,
      alerts: state.alerts.length,
      recentAuditEvents: state.auditEvents.slice(-5).reverse()
    };
  }, [state]);

  const demoWorkflowStatus = useMemo(
    () => ({
      admission: state.patients.length > 0,
      order: state.orders.length > 0,
      verify: state.orders.some((order) => ["Approved", "Dispensed", "Administered", "Missed/Held"].includes(order.status)),
      dispense: state.orders.some((order) => ["Dispensed", "Administered", "Missed/Held"].includes(order.status)),
      identify: Boolean(scannedPatient),
      administer: state.orders.some((order) => order.status === "Administered" || order.status === "Missed/Held"),
      document: state.administrations.length > 0,
      handover: state.auditEvents.some((event) => event.actionType === "Handover viewed" || event.actionType === "Handover note added"),
      audit: state.auditEvents.length > 0
    }),
    [scannedPatient, state]
  );

  const activeOrdersForPatient = (patientId: string) =>
    state.orders.filter((order) => order.patientId === patientId && !["Rejected", "Administered", "Missed/Held"].includes(order.status));

  const cpoePreviewAlerts = useMemo(() => {
    if (!selectedOrderPatient) return [];
    const timestamp = new Date().toISOString();
    return orderForm.items.flatMap((draft, index) => {
      const scheduledTimes = buildScheduledTimes(draft);
      if (!draft.drugName.trim() || !draft.dose.trim() || scheduledTimes.length === 0) return [];
      return runDemoSafetyChecks({
        patient: selectedOrderPatient,
        activeOrders: state.orders.filter((order) => order.patientId === selectedOrderPatient.id && !["Rejected", "Administered", "Missed/Held"].includes(order.status)),
        orderId: `DRAFT-${index + 1}`,
        timestamp,
        draftOrder: {
          drugName: draft.drugName.trim(),
          dose: draft.dose.trim(),
          route: draft.route.trim(),
          scheduledTime: scheduledTimes[0]
        }
      });
    });
  }, [orderForm.items, selectedOrderPatient, state.orders]);

  const addPatientTimeline = (patients: Patient[], patientId: string, event: PatientTimelineEvent) =>
    patients.map((patient) =>
      patient.id === patientId
        ? { ...patient, updatedAt: event.timestamp, timeline: [event, ...patient.timeline].slice(0, 30) }
        : patient
    );

  function updateOrderDraft(draftId: string, patch: Partial<OrderDraft>) {
    setOrderForm((form) => ({
      ...form,
      items: form.items.map((item) => (item.id === draftId ? { ...item, ...patch } : item))
    }));
  }

  function addOrderDraft() {
    setOrderForm((form) => ({ ...form, items: [...form.items, createOrderDraft()] }));
  }

  function removeOrderDraft(draftId: string) {
    setOrderForm((form) => ({
      ...form,
      items: form.items.length === 1 ? form.items : form.items.filter((item) => item.id !== draftId)
    }));
  }

  function handleAdmissionImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setAdmissionScreeningImages((images) => [...images, String(reader.result)].slice(0, 6));
      reader.readAsDataURL(file);
    });
    event.currentTarget.value = "";
  }

  async function handlePatientScanImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const result = await decodeBarcodeUpload(file);
      const matchedPatient = state.patients.find((patient) => patient.barcode.trim().toLowerCase() === result.value.trim().toLowerCase());
      setPatientScan(result.value);
      setPatientScanImage(result.dataUrl);
      setPatientScanImageName(file.name);
      setPatientScanMessage(
        matchedPatient
          ? `Barcode scanned: ${result.value}. Matched patient: ${matchedPatient.name} (${matchedPatient.id}).`
          : `Barcode scanned: ${result.value}. No matching patient profile was found.`
      );
    } catch (error) {
      const dataUrl = await readFileAsDataUrl(file);
      setPatientScanImage(dataUrl);
      setPatientScanImageName(file.name);
      setPatientScanMessage(error instanceof Error ? error.message : "No readable barcode found in this image.");
    } finally {
      event.currentTarget.value = "";
    }
  }

  async function handleMedicationScanBarcodeUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const result = await decodeBarcodeUpload(file);
      const matchedOrder = state.orders.find((order) => order.doseBarcode?.trim().toLowerCase() === result.value.trim().toLowerCase());
      const matchedPatient = matchedOrder ? state.patients.find((patient) => patient.id === matchedOrder.patientId) : undefined;
      setMedicationScan(result.value);
      setMedicationScanMessage(
        matchedOrder
          ? `Barcode scanned: ${result.value}. Matched medication: ${matchedOrder.drugName} ${matchedOrder.dose} for ${matchedPatient?.name ?? "the selected patient"}.`
          : `Barcode scanned: ${result.value}. No matching medication order was found.`
      );
    } catch (error) {
      setMedicationScanMessage(error instanceof Error ? error.message : "No readable barcode found in this image.");
    } finally {
      event.currentTarget.value = "";
    }
  }

  async function handlePharmacyBarcodeUpload(orderId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const result = await decodeBarcodeUpload(file);
      const matchedOrder = state.orders.find((order) => order.doseBarcode?.trim().toLowerCase() === result.value.trim().toLowerCase());
      updateDispensingForm(orderId, { scanBarcode: result.value });
      setPharmacyBarcodeMessages((messages) => ({
        ...messages,
        [orderId]: matchedOrder
          ? `Barcode scanned: ${result.value}. Matched medication: ${matchedOrder.drugName} ${matchedOrder.dose}.`
          : `Barcode scanned: ${result.value}. No matching medication order was found.`
      }));
    } catch (error) {
      setPharmacyBarcodeMessages((messages) => ({
        ...messages,
        [orderId]: error instanceof Error ? error.message : "No readable barcode found in this image."
      }));
    } finally {
      event.currentTarget.value = "";
    }
  }

  function updateDispensingForm(orderId: string, patch: Partial<{ doseTaken: string; packageType: "Full box" | "Individual bag"; customDose: string; scanBarcode: string }>) {
    setDispensingForms((forms) => ({
      ...forms,
      [orderId]: {
        doseTaken: forms[orderId]?.doseTaken ?? "",
        packageType: forms[orderId]?.packageType ?? "Full box",
        customDose: forms[orderId]?.customDose ?? "",
        scanBarcode: forms[orderId]?.scanBarcode ?? "",
        ...patch
      }
    }));
  }

  function generateMedicationBarcode(order: MedicationOrder) {
    if (!canUse(currentUser.role, "Pharmacist")) return;
    const timestamp = new Date().toISOString();
    const form = dispensingForms[order.id] ?? { doseTaken: order.dose, packageType: "Full box" as const, customDose: "", scanBarcode: "" };
    const medicationBarcode = `DOSE-${order.id}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const audit = createAuditEvent(currentUser, "Medication barcode generated", `Generated medication barcode ${medicationBarcode} for ${order.drugName}.`, order.patientId, order.id, timestamp);
    const timeline = createTimelineEvent(currentUser, `Medication barcode ${medicationBarcode} generated for ${order.drugName}.`, timestamp);

    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((item) => (item.id === order.id ? { ...item, doseBarcode: medicationBarcode, updatedAt: timestamp } : item)),
      dispenses: previous.dispenses.some((dispense) => dispense.orderId === order.id)
        ? previous.dispenses.map((dispense) =>
            dispense.orderId === order.id
              ? {
                  ...dispense,
                  medicationBarcode,
                  doseTaken: form.doseTaken || order.dose,
                  packageType: form.packageType,
                  customDose: form.customDose,
                  scannedBarcode: form.scanBarcode,
                  createdBy: currentUser.name,
                  preparedBy: currentUser.name,
                  preparedAt: timestamp
                }
              : dispense
          )
        : [
            {
              id: makeId("DSP"),
              patientId: order.patientId,
              orderId: order.id,
              medicationBarcode,
              doseTaken: form.doseTaken || order.dose,
              packageType: form.packageType,
              customDose: form.customDose,
              scannedBarcode: form.scanBarcode,
              createdBy: currentUser.name,
              preparedBy: currentUser.name,
              preparedAt: timestamp
            },
            ...previous.dispenses
          ],
      auditEvents: [...previous.auditEvents, audit],
      patients: addPatientTimeline(previous.patients, order.patientId, timeline)
    }));
    setDispensingForms((forms) => ({
      ...forms,
      [order.id]: { ...form, doseTaken: form.doseTaken || order.dose, scanBarcode: medicationBarcode }
    }));
    setMedicationScan(medicationBarcode);
  }

  function createPatient(event: FormEvent) {
    event.preventDefault();
    setAdmissionError("");
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const formValues = {
      admissionType: formText(formData, "admissionType") as Patient["admissionType"],
      readmissionBarcode: formText(formData, "readmissionBarcode"),
      name: formText(formData, "name"),
      dateOfBirth: formText(formData, "dateOfBirth"),
      gender: formText(formData, "gender"),
      nationality: formText(formData, "nationality"),
      citizenId: formText(formData, "citizenId"),
      ethnicity: formText(formData, "ethnicity"),
      bloodType: formText(formData, "bloodType"),
      heightCm: formText(formData, "heightCm"),
      occupation: formText(formData, "occupation"),
      reasonForVisit: formText(formData, "reasonForVisit"),
      allergies: formText(formData, "allergies"),
      adverseDrugReactions: formText(formData, "adverseDrugReactions"),
      pastMedicalHistory: formText(formData, "pastMedicalHistory"),
      currentMedications: formText(formData, "currentMedications"),
      homeMedications: formText(formData, "homeMedications"),
      weightKg: formText(formData, "weightKg"),
      renalFunction: formText(formData, "renalFunction"),
      patientPhone: formText(formData, "patientPhone"),
      patientEmail: formText(formData, "patientEmail"),
      patientAddress: formText(formData, "patientAddress"),
      emergencyPhone: formText(formData, "emergencyPhone"),
      emergencyEmail: formText(formData, "emergencyEmail"),
      emergencyAddress: formText(formData, "emergencyAddress")
    };

    if (!canUse(currentUser.role, "Ward Clerk")) {
      setAdmissionError("Switch to Ward Clerk or Admin to create an admission.");
      return;
    }

    if (!formValues.name.trim() || !formValues.dateOfBirth || !formValues.citizenId.trim() || !formValues.bloodType.trim() || !formValues.weightKg || !formValues.renalFunction) {
      setAdmissionError("Name, date of birth, Citizen Identification Card / Passport, blood type, weight, and renal function are required.");
      return;
    }

    const timestamp = new Date().toISOString();
    const patientId = makeId("PAT");
    const barcode = `WRIST-${patientId}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const currentMedicationDetails = parseMedicationDetails(formValues.currentMedications);
    const homeMedicationDetails = parseMedicationDetails(formValues.homeMedications);
    const timelineEvent = createTimelineEvent(currentUser, `${formValues.admissionType} recorded and wristband barcode ${barcode} generated.`, timestamp);
    const patient: Patient = {
      id: patientId,
      barcode,
      admissionType: formValues.admissionType || "New admission",
      name: formValues.name.trim(),
      dateOfBirth: formValues.dateOfBirth,
      age: calculateAge(formValues.dateOfBirth),
      gender: formValues.gender.trim(),
      nationality: formValues.nationality.trim(),
      citizenId: formValues.citizenId.trim(),
      ethnicity: formValues.ethnicity.trim(),
      bloodType: formValues.bloodType.trim(),
      heightCm: Number(formValues.heightCm),
      occupation: formValues.occupation.trim(),
      allergies: splitList(formValues.allergies),
      adverseDrugReactions: splitList(formValues.adverseDrugReactions),
      pastMedicalHistory: splitList(formValues.pastMedicalHistory),
      priorDisorders: splitList(formValues.pastMedicalHistory),
      recentHistory: "",
      reasonForVisit: formValues.reasonForVisit.trim(),
      currentMedications: currentMedicationDetails.map((item) => item.name).filter(Boolean),
      homeMedications: homeMedicationDetails.map((item) => item.name).filter(Boolean),
      currentMedicationDetails,
      homeMedicationDetails,
      weightKg: Number(formValues.weightKg),
      renalFunction: Number(formValues.renalFunction),
      labs: [],
      patientContact: {
        phone: formValues.patientPhone.trim(),
        email: formValues.patientEmail.trim(),
        address: formValues.patientAddress.trim()
      },
      emergencyContact: {
        phone: formValues.emergencyPhone.trim(),
        email: formValues.emergencyEmail.trim(),
        address: formValues.emergencyAddress.trim()
      },
      screeningImages: admissionScreeningImages,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: currentUser.name,
      timeline: [timelineEvent]
    };

    const audit = createAuditEvent(currentUser, "Patient created", `Created ${patient.name} and generated ${barcode}.`, patient.id, undefined, timestamp);
    setState((previous) => ({
      ...previous,
      patients: [patient, ...previous.patients],
      auditEvents: [...previous.auditEvents, audit]
    }));
    setSelectedPatientId(patient.id);
    setOrderForm((form) => ({ ...form, patientId: patient.id }));
    setPatientScan(barcode);
    setHandoverBarcode(barcode);
    setAdmissionScreeningImages([]);
    setAdmissionForm(emptyAdmissionForm);
  }

  function submitOrder(event: FormEvent) {
    event.preventDefault();
    setOrderError("");

    if (!canUse(currentUser.role, "Physician")) {
      setOrderError("Switch to Physician or Admin to submit CPOE orders.");
      return;
    }

    const drafts = orderForm.items.filter((item) => item.drugName.trim() || item.dose.trim());
    if (!orderForm.patientId || drafts.length === 0) {
      setOrderError("Patient and at least one medication order are required.");
      return;
    }

    if (drafts.some((item) => !item.drugName.trim() || !item.dose.trim() || !item.route.trim() || buildScheduledTimes(item).length === 0)) {
      setOrderError("Each medication needs drug name, dose, route, and at least one scheduled date/time.");
      return;
    }

    const patient = state.patients.find((item) => item.id === orderForm.patientId);
    if (!patient) {
      setOrderError("Selected patient could not be found.");
      return;
    }

    const timestamp = new Date().toISOString();
    const submittedOrders: MedicationOrder[] = [];
    const generatedAlerts: SafetyAlert[] = [];
    const auditEvents: AuditEvent[] = [];

    drafts.forEach((draft) => {
      const orderId = makeId("ORD");
      const scheduledTimes = buildScheduledTimes(draft);
      const frequency = draft.frequency === "Custom" ? draft.customFrequency.trim() : draft.frequency.trim();
      const activeOrders = [...activeOrdersForPatient(patient.id), ...submittedOrders];
      const alerts = runDemoSafetyChecks({
        patient,
        activeOrders,
        orderId,
        timestamp,
        draftOrder: {
          drugName: draft.drugName.trim(),
          dose: draft.dose.trim(),
          route: draft.route.trim(),
          scheduledTime: scheduledTimes[0]
        }
      });
      const order: MedicationOrder = {
        id: orderId,
        patientId: patient.id,
        physicianId: currentUser.id,
        physicianName: currentUser.name,
        drugName: draft.drugName.trim(),
        dose: draft.dose.trim(),
        priority: draft.priority,
        route: draft.route.trim(),
        frequency: frequency || "Custom",
        scheduledTime: scheduledTimes[0],
        scheduledTimes,
        scheduleDisplay: formatScheduleList(scheduledTimes),
        notes: draft.notes.trim(),
        status: "Pharmacy Review",
        alertIds: alerts.map((alert) => alert.id),
        createdAt: timestamp,
        updatedAt: timestamp
      };

      submittedOrders.push(order);
      generatedAlerts.push(...alerts);
      auditEvents.push(
        createAuditEvent(currentUser, "Order submitted", `Submitted ${order.priority} priority ${order.drugName} ${order.dose} ${order.route} for pharmacy review.`, patient.id, order.id, timestamp),
        ...alerts.map((alert) => createAuditEvent(currentUser, "Alert generated", `${alert.type}: ${alert.message}`, patient.id, order.id, timestamp))
      );
    });

    const timelineEvent = createTimelineEvent(currentUser, `Submitted ${submittedOrders.length} medication order(s) for pharmacy review.`, timestamp);

    setState((previous) => ({
      ...previous,
      orders: [...submittedOrders, ...previous.orders],
      alerts: [...previous.alerts, ...generatedAlerts],
      auditEvents: [...previous.auditEvents, ...auditEvents],
      patients: addPatientTimeline(previous.patients, patient.id, timelineEvent)
    }));
    setOrderForm({ patientId: patient.id, items: [createOrderDraft()] });
  }

  function approveOrder(order: MedicationOrder) {
    if (!canUse(currentUser.role, "Pharmacist")) return;
    const timestamp = new Date().toISOString();
    const doseBarcode = `DOSE-${order.id}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const notes = pharmacyNotes[order.id]?.trim();
    const form = dispensingForms[order.id] ?? { doseTaken: order.dose, packageType: "Full box" as const, customDose: "", scanBarcode: doseBarcode };
    const audit = createAuditEvent(currentUser, "Pharmacy approved", `Approved ${order.drugName}; generated dose barcode ${doseBarcode}.`, order.patientId, order.id, timestamp);
    const timeline = createTimelineEvent(currentUser, `Pharmacy approved ${order.drugName} and generated dose barcode ${doseBarcode}.`, timestamp);

    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((item) =>
        item.id === order.id
          ? { ...item, status: "Approved", doseBarcode, pharmacistNotes: notes, updatedAt: timestamp }
          : item
      ),
      dispenses: [
        {
          id: makeId("DSP"),
          patientId: order.patientId,
          orderId: order.id,
          medicationBarcode: doseBarcode,
          doseTaken: form.doseTaken || order.dose,
          packageType: form.packageType,
          customDose: form.customDose,
          scannedBarcode: form.scanBarcode || doseBarcode,
          createdBy: currentUser.name,
          preparedBy: currentUser.name,
          preparedAt: timestamp,
          notes
        },
        ...previous.dispenses
      ],
      auditEvents: [...previous.auditEvents, audit],
      patients: addPatientTimeline(previous.patients, order.patientId, timeline)
    }));
    setDispensingForms((forms) => ({
      ...forms,
      [order.id]: { ...form, doseTaken: form.doseTaken || order.dose, scanBarcode: doseBarcode }
    }));
  }

  function rejectOrder(order: MedicationOrder) {
    if (!canUse(currentUser.role, "Pharmacist")) return;
    const timestamp = new Date().toISOString();
    const notes = pharmacyNotes[order.id]?.trim();
    const audit = createAuditEvent(currentUser, "Pharmacy rejected", `Rejected ${order.drugName}.${notes ? ` Notes: ${notes}` : ""}`, order.patientId, order.id, timestamp);
    const timeline = createTimelineEvent(currentUser, `Pharmacy rejected ${order.drugName}.${notes ? ` Notes: ${notes}` : ""}`, timestamp);

    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((item) =>
        item.id === order.id ? { ...item, status: "Rejected", pharmacistNotes: notes, updatedAt: timestamp } : item
      ),
      auditEvents: [...previous.auditEvents, audit],
      patients: addPatientTimeline(previous.patients, order.patientId, timeline)
    }));
  }

  function dispenseOrder(order: MedicationOrder) {
    if (!canUse(currentUser.role, "Pharmacist") || order.status !== "Approved") return;
    const timestamp = new Date().toISOString();
    const form = dispensingForms[order.id] ?? { doseTaken: order.dose, packageType: "Full box" as const, customDose: "", scanBarcode: order.doseBarcode ?? "" };
    const audit = createAuditEvent(currentUser, "Medication dispensed", `Marked ${order.drugName} dose as prepared and dispensed.`, order.patientId, order.id, timestamp);
    const timeline = createTimelineEvent(currentUser, `Medication dose for ${order.drugName} dispensed to unit.`, timestamp);

    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((item) => (item.id === order.id ? { ...item, status: "Dispensed", updatedAt: timestamp } : item)),
      dispenses: previous.dispenses.map((dispense) =>
        dispense.orderId === order.id
          ? {
              ...dispense,
              doseTaken: form.doseTaken || order.dose,
              packageType: form.packageType,
              customDose: form.customDose,
              scannedBarcode: form.scanBarcode,
              createdBy: dispense.createdBy ?? currentUser.name,
              dispensedAt: timestamp
            }
          : dispense
      ),
      auditEvents: [...previous.auditEvents, audit],
      patients: addPatientTimeline(previous.patients, order.patientId, timeline)
    }));
    if (order.doseBarcode) {
      setMedicationScan(order.doseBarcode);
    }
    setPharmacyDispenseMessages((messages) => ({
      ...messages,
      [order.id]: `${order.drugName} is now marked Dispensed. The medication barcode is ready for nurse BCMA scanning, and the Right time check can pass.`
    }));
  }

  const fiveRights = useMemo(() => evaluateFiveRights(state, patientScan, medicationScan), [state, patientScan, medicationScan]);
  const scannedOrder = state.orders.find((order) => order.doseBarcode?.trim().toLowerCase() === medicationScan.trim().toLowerCase());
  const fiveRightsPass = fiveRights.rightPatient && fiveRights.rightDrug && fiveRights.rightDose && fiveRights.rightRoute && fiveRights.rightTime;
  const fiveRightsPassExample = findFiveRightsExample(state, "pass");
  const fiveRightsFailExample = findFiveRightsExample(state, "fail");

  function applyFiveRightsExample(mode: "pass" | "fail") {
    const example = findFiveRightsExample(state, mode);
    if (!example) return;
    setPatientScan(example.patient.barcode);
    setMedicationScan(example.order.doseBarcode ?? "");
  }

  function recordAdministration(status: AdministrationStatus) {
    if (!canUse(currentUser.role, "Nurse") || !fiveRightsPass || !scannedOrder || !scannedPatient || !scannedOrder.doseBarcode) return;

    const timestamp = new Date().toISOString();
    const medicationBarcode = scannedOrder.doseBarcode;
    const auditAction =
      status === "Administered" ? "Medication administered" : status === "Held" ? "Medication held" : "Medication missed";
    const nextOrderStatus: OrderStatus = status === "Administered" ? "Administered" : "Missed/Held";
    const timeline = createTimelineEvent(currentUser, `${scannedOrder.drugName} marked ${status.toLowerCase()} by nursing.`, timestamp);
    const audit = createAuditEvent(
      currentUser,
      auditAction,
      `${scannedOrder.drugName} ${scannedOrder.dose} ${scannedOrder.route} marked ${status.toLowerCase()}.`,
      scannedPatient.id,
      scannedOrder.id,
      timestamp
    );

    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((order) => (order.id === scannedOrder.id ? { ...order, status: nextOrderStatus, updatedAt: timestamp } : order)),
      administrations: [
        {
          id: makeId("ADM"),
          patientId: scannedPatient.id,
          orderId: scannedOrder.id,
          medicationBarcode,
          nurseId: currentUser.id,
          nurseName: currentUser.name,
          status,
          notes: administrationNote.trim(),
          performedAt: timestamp,
          fiveRights
        },
        ...previous.administrations
      ],
      patients: addPatientTimeline(
        previous.patients.map((patient) =>
          patient.id === scannedPatient.id && status === "Administered" && !patient.currentMedications.includes(scannedOrder.drugName)
            ? {
                ...patient,
                currentMedications: [...patient.currentMedications, scannedOrder.drugName],
                currentMedicationDetails: [
                  ...patient.currentMedicationDetails,
                  { name: scannedOrder.drugName, dose: scannedOrder.dose, frequency: scannedOrder.frequency }
                ]
              }
            : patient
        ),
        scannedPatient.id,
        timeline
      ),
      auditEvents: [...previous.auditEvents, audit]
    }));
    setAdministrationNote("");
  }

  function addHandoverEvent(action: "view" | "note") {
    if (!handoverPatient) return;
    const timestamp = new Date().toISOString();
    const description =
      action === "view"
        ? `Viewed handover summary for ${handoverPatient.name}${handoverTo.trim() ? ` for ${handoverTo.trim()}` : ""}.`
        : `Handover note added for ${handoverPatient.name}${handoverTo.trim() ? ` to ${handoverTo.trim()}` : ""}: ${handoverNote.trim()}`;
    const timeline = createTimelineEvent(currentUser, description, timestamp);
    const audit = createAuditEvent(
      currentUser,
      action === "view" ? "Handover viewed" : "Handover note added",
      description,
      handoverPatient.id,
      undefined,
      timestamp
    );

    setState((previous) => ({
      ...previous,
      handoverNotes: action === "note" ? [timeline, ...previous.handoverNotes] : previous.handoverNotes,
      patients: addPatientTimeline(previous.patients, handoverPatient.id, timeline),
      auditEvents: [...previous.auditEvents, audit]
    }));
    if (action === "note") setHandoverNote("");
  }

  function resetDemo() {
    const seedPassExample = findFiveRightsExample(seedState, "pass");
    window.localStorage.removeItem(storageKey);
    setState(seedState);
    setSelectedPatientId(seedState.patients[0]?.id ?? "");
    setOrderForm({ ...emptyOrderForm, patientId: seedState.patients[0]?.id ?? "" });
    setPatientScan(seedPassExample?.patient.barcode ?? seedState.patients[0]?.barcode ?? "");
    setPatientScanImage("");
    setPatientScanImageName("");
    setPatientScanMessage("");
    setAdmissionScreeningImages([]);
    setMedicationScan(seedPassExample?.order.doseBarcode ?? "");
    setMedicationScanMessage("");
    setPharmacyBarcodeMessages({});
    setPharmacyDispenseMessages({});
    setHandoverBarcode(seedState.patients[0]?.barcode ?? "");
    setHandoverTo("");
    setActiveModule(defaultWorkspace[currentUser.role]);
    setPendingDeletePatientId(null);
  }

  function requestDeleteSelectedPatient() {
    if (currentUser.role !== "Admin" || !selectedPatient) return;
    setPendingDeletePatientId(selectedPatient.id);
  }

  function confirmDeleteSelectedPatient() {
    if (currentUser.role !== "Admin" || !selectedPatient || pendingDeletePatientId !== selectedPatient.id) return;

    const relatedOrders = state.orders.filter((order) => order.patientId === selectedPatient.id);
    const relatedAdministrations = state.administrations.filter((administration) => administration.patientId === selectedPatient.id);
    const relatedDispenses = state.dispenses.filter((dispense) => dispense.patientId === selectedPatient.id);
    const relatedAlerts = state.alerts.filter((alert) => alert.patientId === selectedPatient.id);
    const timestamp = new Date().toISOString();
    const deletedPatientId = selectedPatient.id;
    const deletedPatientName = selectedPatient.name;
    const deletedOrderIds = new Set(relatedOrders.map((order) => order.id));
    const remainingPatients = state.patients.filter((patient) => patient.id !== deletedPatientId);
    const nextPatientId = remainingPatients[0]?.id ?? "";
    const audit = createAuditEvent(
      currentUser,
      "Patient deleted",
      `Deleted ${deletedPatientName}'s demo profile and removed ${relatedOrders.length} order(s), ${relatedAlerts.length} alert(s), ${relatedDispenses.length} dispense record(s), and ${relatedAdministrations.length} administration record(s).`,
      deletedPatientId,
      undefined,
      timestamp
    );

    setState((previous) => ({
      ...previous,
      patients: previous.patients.filter((patient) => patient.id !== deletedPatientId),
      orders: previous.orders.filter((order) => order.patientId !== deletedPatientId),
      dispenses: previous.dispenses.filter((dispense) => dispense.patientId !== deletedPatientId),
      administrations: previous.administrations.filter((administration) => administration.patientId !== deletedPatientId),
      alerts: previous.alerts.filter((alert) => alert.patientId !== deletedPatientId),
      auditEvents: [...previous.auditEvents, audit]
    }));
    setSelectedPatientId(nextPatientId);
    setHandoverBarcode((barcode) => (barcode === selectedPatient.barcode ? remainingPatients[0]?.barcode ?? "" : barcode));
    setOrderForm((form) => ({ ...form, patientId: form.patientId === deletedPatientId ? nextPatientId : form.patientId }));
    setPatientScan((scan) => (scan === selectedPatient.barcode ? "" : scan));
    setMedicationScan((scan) => {
      const scannedOrder = state.orders.find((order) => order.doseBarcode === scan);
      return scannedOrder && deletedOrderIds.has(scannedOrder.id) ? "" : scan;
    });
    setPharmacyNotes((notes) => {
      const nextNotes = { ...notes };
      deletedOrderIds.forEach((orderId) => {
        delete nextNotes[orderId];
      });
      return nextNotes;
    });
    setPendingDeletePatientId(null);
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-clinical-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-clinical-teal">
                <Hospital className="h-4 w-4" aria-hidden="true" />
                Integrated BCMA-CPOE-EHR
              </div>
              <h1 className="mt-1 text-2xl font-bold text-clinical-ink sm:text-3xl">Medication Workflow Demo</h1>
              <p className="mt-2 max-w-3xl text-sm text-clinical-muted">
                Fictional educational MVP with mock safety alerts only. It is not designed for clinical care, dosage guidance, or real patient data.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Demo role">
                <select className={inputClass} value={currentUserId} onChange={(event) => switchRole(event.target.value)}>
                  {demoUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.role} - {user.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={resetDemo}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold text-clinical-ink shadow-sm hover:bg-clinical-panel"
                title="Reset demo data"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reset
              </button>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Workflow modules">
            {visibleModules.map((item) => {
              const Icon = item.icon;
              const active = safeActiveModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-clinical-teal bg-clinical-teal text-white"
                      : "border-clinical-line bg-white text-clinical-ink hover:bg-clinical-panel"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[96rem] gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <RoleDescriptionPanel role={currentUser.role} moduleId={safeActiveModule} />

        {safeActiveModule === "dashboard" ? (
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <StatTile label="Total patients" value={dashboard.totalPatients} icon={Hospital} />
              <StatTile label="Pending orders" value={dashboard.pendingOrders} icon={ClipboardList} />
              <StatTile label="Pharmacy queue" value={dashboard.pharmacyQueue} icon={Pill} />
              <StatTile label="Meds due" value={dashboard.medicationsDue} icon={Barcode} />
              <StatTile label="Safety alerts" value={dashboard.alerts} icon={AlertTriangle} />
              <StatTile label="Audit events" value={state.auditEvents.length} icon={FileClock} />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Recent Audit Events" icon={FileClock}>
                <AuditList events={dashboard.recentAuditEvents} />
              </Section>
              <Section title="Current Safety Alerts" icon={AlertTriangle}>
                <AlertList alerts={state.alerts.slice(-6).reverse()} orders={state.orders} patients={state.patients} />
              </Section>
            </div>
          </div>
        ) : null}

        {safeActiveModule === "workflow" ? (
          <DemoWorkflowGuide steps={demoWorkflowSteps} statuses={demoWorkflowStatus} onOpenModule={setActiveModule} />
        ) : null}

        {safeActiveModule === "ehr" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Section title="Admission" icon={UserPlus}>
              <form onSubmit={createPatient} className="grid gap-4">
                {admissionError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{admissionError}</div> : null}
                <div className={`grid gap-4 ${admissionForm.admissionType === "Re-admitted patient" ? "sm:grid-cols-2" : ""}`}>
                  <Field label="Admission type">
                    <select name="admissionType" className={inputClass} value={admissionForm.admissionType} onChange={(event) => setAdmissionForm({ ...admissionForm, admissionType: event.target.value })}>
                      <option>New admission</option>
                      <option>Re-admitted patient</option>
                    </select>
                  </Field>
                  {admissionForm.admissionType === "Re-admitted patient" ? (
                    <Field label="Scan barcode">
                      <input
                        name="readmissionBarcode"
                        className={inputClass}
                        placeholder="Paste the patient wristband barcode"
                        value={admissionForm.readmissionBarcode}
                        onChange={(event) => setAdmissionForm({ ...admissionForm, readmissionBarcode: event.target.value })}
                      />
                    </Field>
                  ) : null}
                </div>
                <div className="rounded-md border border-clinical-line bg-clinical-panel p-3 text-sm">
                  <p className="font-semibold text-clinical-ink">
                    {admissionForm.admissionType === "Re-admitted patient" ? "Re-admitted Patient" : "New Admission"}
                  </p>
                  <p className="mt-1 text-clinical-muted">
                    {admissionForm.admissionType === "Re-admitted patient" && readmissionPatient
                      ? `Previous demo EHR found for ${readmissionPatient.name}. Review the existing patient record before creating a new admission.`
                      : admissionForm.admissionType === "Re-admitted patient"
                        ? "Scan an existing wristband barcode when this is a returning patient."
                        : "Create a new hospital admission and generate a new wristband barcode after the patient profile is saved."}
                  </p>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-clinical-muted">Basic info</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Patient name" required>
                      <input name="name" className={inputClass} placeholder="Enter patient name" value={admissionForm.name} onChange={(event) => setAdmissionForm({ ...admissionForm, name: event.target.value })} />
                    </Field>
                    <Field label="Date of birth" required>
                      <input name="dateOfBirth" placeholder="YYYY/MM/DD" className={inputClass} value={admissionForm.dateOfBirth} onChange={(event) => setAdmissionForm({ ...admissionForm, dateOfBirth: event.target.value })} />
                    </Field>
                    <Field label="Gender">
                      <input name="gender" className={inputClass} placeholder="Enter gender" value={admissionForm.gender} onChange={(event) => setAdmissionForm({ ...admissionForm, gender: event.target.value })} />
                    </Field>
                    <Field label="Nationality">
                      <input name="nationality" className={inputClass} placeholder="Enter nationality" value={admissionForm.nationality} onChange={(event) => setAdmissionForm({ ...admissionForm, nationality: event.target.value })} />
                    </Field>
                    <Field label="Citizen Identification Card / Passport" required>
                      <input name="citizenId" className={inputClass} placeholder="Enter ID card or passport number" value={admissionForm.citizenId} onChange={(event) => setAdmissionForm({ ...admissionForm, citizenId: event.target.value })} />
                    </Field>
                    <Field label="Ethnicity">
                      <input name="ethnicity" className={inputClass} placeholder="Enter ethnicity" value={admissionForm.ethnicity} onChange={(event) => setAdmissionForm({ ...admissionForm, ethnicity: event.target.value })} />
                    </Field>
                    <Field label="Blood type" required>
                      <input name="bloodType" className={inputClass} placeholder="A+, B+, O-, unknown" value={admissionForm.bloodType} onChange={(event) => setAdmissionForm({ ...admissionForm, bloodType: event.target.value })} />
                    </Field>
                    <Field label="Height (cm)">
                      <input name="heightCm" type="number" min="1" className={inputClass} placeholder="Enter height in cm" value={admissionForm.heightCm} onChange={(event) => setAdmissionForm({ ...admissionForm, heightCm: event.target.value })} />
                    </Field>
                    <Field label="Weight (kg)" required>
                      <input name="weightKg" type="number" min="1" className={inputClass} placeholder="Enter weight in kg" value={admissionForm.weightKg} onChange={(event) => setAdmissionForm({ ...admissionForm, weightKg: event.target.value })} />
                    </Field>
                    <Field label="Occupation">
                      <input name="occupation" className={inputClass} placeholder="Enter occupation" value={admissionForm.occupation} onChange={(event) => setAdmissionForm({ ...admissionForm, occupation: event.target.value })} />
                    </Field>
                    <Field label="Renal function eGFR" required className="sm:col-span-2">
                      <input name="renalFunction" type="number" min="0" className={inputClass} placeholder="Enter eGFR value, for example 90" value={admissionForm.renalFunction} onChange={(event) => setAdmissionForm({ ...admissionForm, renalFunction: event.target.value })} />
                    </Field>
                  </div>
                </div>
                <Field label="Reason for visit">
                  <textarea name="reasonForVisit" className={`${inputClass} min-h-20`} placeholder="Describe why the patient came to the hospital now" value={admissionForm.reasonForVisit} onChange={(event) => setAdmissionForm({ ...admissionForm, reasonForVisit: event.target.value })} />
                </Field>
                <Field label="Allergies">
                  <input name="allergies" className={inputClass} placeholder="Enter allergies, separated by commas" value={admissionForm.allergies} onChange={(event) => setAdmissionForm({ ...admissionForm, allergies: event.target.value })} />
                </Field>
                <Field label="Adverse drug reactions">
                  <input name="adverseDrugReactions" className={inputClass} placeholder="Enter adverse drug reactions" value={admissionForm.adverseDrugReactions} onChange={(event) => setAdmissionForm({ ...admissionForm, adverseDrugReactions: event.target.value })} />
                </Field>
                <Field label="Medical history">
                  <textarea name="pastMedicalHistory" className={`${inputClass} min-h-24`} placeholder="Enter relevant medical history, separated by commas" value={admissionForm.pastMedicalHistory} onChange={(event) => setAdmissionForm({ ...admissionForm, pastMedicalHistory: event.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Current medications">
                    <textarea name="currentMedications" className={`${inputClass} min-h-24`} placeholder="Medication | dose | frequency" value={admissionForm.currentMedications} onChange={(event) => setAdmissionForm({ ...admissionForm, currentMedications: event.target.value })} />
                  </Field>
                  <Field label="Home medications">
                    <textarea name="homeMedications" className={`${inputClass} min-h-24`} placeholder="Medication | dose | frequency" value={admissionForm.homeMedications} onChange={(event) => setAdmissionForm({ ...admissionForm, homeMedications: event.target.value })} />
                  </Field>
                </div>
                <div className="rounded-lg border border-clinical-line bg-clinical-panel p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-clinical-muted">Contact list</h3>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="grid gap-4 rounded-md border border-clinical-line bg-white p-4">
                      <h4 className="text-sm font-semibold text-clinical-ink">Patient personal contacts</h4>
                    <Field label="Patient phone number">
                      <input name="patientPhone" className={inputClass} placeholder="Enter phone number" value={admissionForm.patientPhone} onChange={(event) => setAdmissionForm({ ...admissionForm, patientPhone: event.target.value })} />
                    </Field>
                    <Field label="Patient email">
                      <input name="patientEmail" className={inputClass} placeholder="Enter email" value={admissionForm.patientEmail} onChange={(event) => setAdmissionForm({ ...admissionForm, patientEmail: event.target.value })} />
                    </Field>
                    <Field label="Patient address">
                      <input name="patientAddress" className={inputClass} placeholder="Enter address" value={admissionForm.patientAddress} onChange={(event) => setAdmissionForm({ ...admissionForm, patientAddress: event.target.value })} />
                    </Field>
                    </div>
                    <div className="grid gap-4 rounded-md border border-clinical-line bg-white p-4">
                      <h4 className="text-sm font-semibold text-clinical-ink">Emergency contact</h4>
                    <Field label="Emergency phone number">
                      <input name="emergencyPhone" className={inputClass} placeholder="Enter emergency phone" value={admissionForm.emergencyPhone} onChange={(event) => setAdmissionForm({ ...admissionForm, emergencyPhone: event.target.value })} />
                    </Field>
                    <Field label="Emergency email">
                      <input name="emergencyEmail" className={inputClass} placeholder="Enter emergency email" value={admissionForm.emergencyEmail} onChange={(event) => setAdmissionForm({ ...admissionForm, emergencyEmail: event.target.value })} />
                    </Field>
                    <Field label="Emergency address">
                      <input name="emergencyAddress" className={inputClass} placeholder="Enter emergency address" value={admissionForm.emergencyAddress} onChange={(event) => setAdmissionForm({ ...admissionForm, emergencyAddress: event.target.value })} />
                    </Field>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-clinical-line bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-clinical-ink">Screening images</p>
                      <p className="mt-1 text-xs text-clinical-muted">Upload admission screening images for this demo EHR.</p>
                    </div>
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold hover:bg-clinical-panel">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Upload Images
                      <input type="file" accept="image/*" multiple className="sr-only" onChange={handleAdmissionImageUpload} />
                    </label>
                  </div>
                  {admissionScreeningImages.length ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {admissionScreeningImages.map((image, index) => (
                        <NextImage key={`${image}-${index}`} src={image} alt={`Screening upload ${index + 1}`} width={320} height={112} unoptimized className="h-28 w-full rounded-md border border-clinical-line object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-clinical-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Create Patient
                </button>
              </form>
            </Section>
            <Section
              title="Patient Record"
              icon={Hospital}
              action={
                currentUser.role === "Admin" && selectedPatient ? (
                  pendingDeletePatientId === selectedPatient.id ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDeletePatientId(null)}
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold text-clinical-ink shadow-sm hover:bg-clinical-panel"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmDeleteSelectedPatient}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-800"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Confirm Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={requestDeleteSelectedPatient}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
                      title="Delete selected demo patient profile"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete Patient
                    </button>
                  )
                ) : null
              }
            >
              <div className="grid gap-4">
                <Field label="Select patient">
                  <select
                    className={inputClass}
                    value={selectedPatient?.id ?? ""}
                    onChange={(event) => {
                      setSelectedPatientId(event.target.value);
                      setPendingDeletePatientId(null);
                    }}
                  >
                    {state.patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} - {patient.id}
                      </option>
                    ))}
                  </select>
                </Field>
                {currentUser.role === "Admin" && selectedPatient && pendingDeletePatientId === selectedPatient.id ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    Confirming will remove this demo patient profile and its related orders, pharmacy dispense records, medication administrations, and safety alerts. A deletion audit entry will remain.
                  </div>
                ) : null}
                {selectedPatient ? <PatientSummary patient={selectedPatient} /> : <EmptyState>No patient selected.</EmptyState>}
              </div>
            </Section>
          </div>
        ) : null}

        {safeActiveModule === "cpoe" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <Section title="Physician Order Entry" icon={Stethoscope}>
              <form onSubmit={submitOrder} className="grid gap-4">
                {orderError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{orderError}</div> : null}
                <Field label="Patient" required>
                  <select name="patientId" className={inputClass} value={orderForm.patientId} onChange={(event) => setOrderForm({ ...orderForm, patientId: event.target.value })}>
                    {state.patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} - {patient.id}
                      </option>
                    ))}
                  </select>
                </Field>
                <PriorityGuide />
                <div className="grid gap-4">
                  {orderForm.items.map((item, index) => (
                    <div key={item.id} className="grid gap-4 rounded-lg border border-clinical-line bg-clinical-panel p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-clinical-muted">Medication order {index + 1}</h3>
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeOrderDraft(item.id)}
                          disabled={orderForm.items.length === 1}
                          className="rounded-md border border-clinical-line bg-white px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Drug name" required>
                          <input className={inputClass} value={item.drugName} onChange={(event) => updateOrderDraft(item.id, { drugName: event.target.value })} placeholder="Enter drug name" />
                        </Field>
                        <Field label="Dose" required>
                          <input className={inputClass} value={item.dose} onChange={(event) => updateOrderDraft(item.id, { dose: event.target.value })} placeholder="Enter dose, e.g. 0.125 mg" />
                        </Field>
                        <Field label="Priority">
                          <select className={inputClass} value={item.priority} onChange={(event) => updateOrderDraft(item.id, { priority: event.target.value as MedicationOrder["priority"] })}>
                            <option>Routine</option>
                            <option>Urgent</option>
                            <option>STAT</option>
                          </select>
                        </Field>
                        <Field label="Route" required>
                          <select className={inputClass} value={item.route} onChange={(event) => updateOrderDraft(item.id, { route: event.target.value })}>
                            <option>Oral</option>
                            <option>Intravenous</option>
                            <option>Intramuscular</option>
                            <option>Subcutaneous</option>
                            <option>Topical</option>
                          </select>
                        </Field>
                        <Field label="Frequency">
                          <select className={inputClass} value={item.frequency} onChange={(event) => updateOrderDraft(item.id, { frequency: event.target.value })}>
                            <option>Once daily</option>
                            <option>Twice daily</option>
                            <option>Three times daily</option>
                            <option>Every 6 hours</option>
                            <option>Once</option>
                            <option>Custom</option>
                          </select>
                        </Field>
                        {item.frequency === "Custom" ? (
                          <Field label="Custom frequency">
                            <input className={inputClass} placeholder="Write custom frequency" value={item.customFrequency} onChange={(event) => updateOrderDraft(item.id, { customFrequency: event.target.value })} />
                          </Field>
                        ) : null}
                        <Field label="Start date" required>
                          <input type="date" className={inputClass} value={item.scheduledStartDate} onChange={(event) => updateOrderDraft(item.id, { scheduledStartDate: event.target.value })} />
                        </Field>
                        <Field label="End date">
                          <input type="date" className={inputClass} value={item.scheduledEndDate} onChange={(event) => updateOrderDraft(item.id, { scheduledEndDate: event.target.value })} />
                        </Field>
                        <Field label="Scheduled hours" required>
                          <input className={inputClass} placeholder="09:00, 16:00" value={item.scheduledTimes} onChange={(event) => updateOrderDraft(item.id, { scheduledTimes: event.target.value })} />
                        </Field>
                      </div>
                      <Field label="Notes">
                        <textarea className={`${inputClass} min-h-20`} placeholder="Enter order notes" value={item.notes} onChange={(event) => updateOrderDraft(item.id, { notes: event.target.value })} />
                      </Field>
                      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        Schedule preview: {formatScheduleList(buildScheduledTimes(item))}
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addOrderDraft} className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-md border border-clinical-line bg-white px-4 py-2 text-sm font-semibold text-clinical-ink hover:bg-clinical-panel">
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                  Add Another Order
                </button>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-clinical-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <Stethoscope className="h-4 w-4" aria-hidden="true" />
                  Submit to Pharmacy
                </button>
              </form>
            </Section>
            <Section title="Orders and Demo Safety Alerts" icon={AlertTriangle}>
              <div className="grid gap-5">
                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-clinical-muted">Drug Interaction Preview</h3>
                  <AlertList alerts={cpoePreviewAlerts} orders={state.orders} patients={state.patients} compact />
                </div>
                <OrdersTable orders={state.orders} patients={state.patients} alerts={state.alerts} />
              </div>
            </Section>
          </div>
        ) : null}

        {safeActiveModule === "pharmacy" ? (
          <Section title="Pharmacy Verification and Dispensing" icon={Pill}>
            <div className="grid gap-4">
              {state.orders.length === 0 ? <EmptyState>No medication orders yet.</EmptyState> : null}
              {sortOrdersByPriority(state.orders).map((order) => {
                const patient = state.patients.find((item) => item.id === order.patientId);
                const alerts = state.alerts.filter((alert) => order.alertIds.includes(alert.id));
                const dispensingForm = dispensingForms[order.id] ?? {
                  doseTaken: order.dose,
                  packageType: "Full box" as const,
                  customDose: "",
                  scanBarcode: order.doseBarcode ?? ""
                };
                const barcodeMatches = Boolean(order.doseBarcode && dispensingForm.scanBarcode.trim() === order.doseBarcode);
                return (
                  <div
                    key={order.id}
                    className={`grid gap-4 rounded-lg border p-4 ${
                      order.priority === "STAT"
                        ? "border-red-300 bg-red-50"
                        : order.priority === "Urgent"
                          ? "border-yellow-300 bg-yellow-50"
                          : "border-clinical-line bg-clinical-panel"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{order.drugName} {order.dose}</h3>
                          <PriorityBadge priority={order.priority} />
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="mt-1 text-sm text-clinical-muted">
                          {patient?.name} - {order.route} - {order.frequency} - due {order.scheduleDisplay ?? formatDateTime(order.scheduledTime)}
                        </p>
                      </div>
                      {order.doseBarcode ? <Badge className="border-teal-300 bg-teal-50 text-teal-800">{order.doseBarcode}</Badge> : null}
                    </div>
                    {patient ? (
                      <div className="grid gap-3 text-sm">
                        <MedicationDetailsTable title="Current Medications" medications={patient.currentMedicationDetails} />
                        <div className="grid gap-3 md:grid-cols-3">
                          <InfoBlock title="Allergies" value={patient.allergies.join(", ") || "None recorded"} />
                          <InfoBlock title="Renal function" value={`eGFR ${patient.renalFunction}`} />
                          <InfoBlock title="Created by" value={patient.createdBy} />
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="grid gap-3 rounded-lg border border-clinical-line bg-white p-4">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-clinical-muted">Verification</h3>
                        <ControlBlock title="Verification status">
                          {alerts.length ? (
                            <AlertList alerts={alerts} orders={state.orders} patients={state.patients} compact />
                          ) : (
                            <p className="text-sm font-medium text-clinical-muted">No demo safety alerts.</p>
                          )}
                        </ControlBlock>
                        <ControlBlock title="Pharmacist notes" className="min-h-[152px]">
                          <textarea
                            className={`${inputClass} min-h-28 w-full`}
                            placeholder="Enter verification notes"
                            value={pharmacyNotes[order.id] ?? order.pharmacistNotes ?? ""}
                            onChange={(event) => setPharmacyNotes({ ...pharmacyNotes, [order.id]: event.target.value })}
                          />
                        </ControlBlock>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canUse(currentUser.role, "Pharmacist") || order.status !== "Pharmacy Review"}
                            onClick={() => approveOrder(order)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-clinical-teal px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={!canUse(currentUser.role, "Pharmacist") || order.status !== "Pharmacy Review"}
                            onClick={() => rejectOrder(order)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 rounded-lg border border-clinical-line bg-white p-4">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-clinical-muted">Dispensing</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <InfoBlock title="Medication barcode" value={order.doseBarcode ?? "Generate barcode before dispensing"} />
                          <InfoBlock title="Created by" value={currentUser.name} />
                          <BarcodePreview title="Medication barcode" value={order.doseBarcode} caption={`${order.drugName} ${order.dose}`} />
                          <ControlBlock title="Dose taken">
                            <input className={`${inputClass} w-full`} placeholder="Enter dose taken" value={dispensingForm.doseTaken} onChange={(event) => updateDispensingForm(order.id, { doseTaken: event.target.value })} />
                          </ControlBlock>
                          <ControlBlock title="Package">
                            <select className={`${inputClass} w-full`} value={dispensingForm.packageType} onChange={(event) => updateDispensingForm(order.id, { packageType: event.target.value as "Full box" | "Individual bag" })}>
                              <option>Full box</option>
                              <option>Individual bag</option>
                            </select>
                          </ControlBlock>
                          {dispensingForm.packageType === "Individual bag" ? (
                            <ControlBlock title="Custom dose">
                              <input className={`${inputClass} w-full`} placeholder="Enter custom dose for individual bag" value={dispensingForm.customDose} onChange={(event) => updateDispensingForm(order.id, { customDose: event.target.value })} />
                            </ControlBlock>
                          ) : null}
                          <ControlBlock title="Scan barcode" className="sm:col-span-2">
                            <input className={`${inputClass} w-full`} placeholder="Scan barcode to recheck" value={dispensingForm.scanBarcode} onChange={(event) => updateDispensingForm(order.id, { scanBarcode: event.target.value })} />
                            <div className="mt-2 grid gap-1.5">
                            <BarcodeUploadLabel label="Upload medication barcode" onChange={(event) => handlePharmacyBarcodeUpload(order.id, event)} />
                            {pharmacyBarcodeMessages[order.id] ? <p className="text-xs text-clinical-muted">{pharmacyBarcodeMessages[order.id]}</p> : null}
                            </div>
                          </ControlBlock>
                        </div>
                        <div className={`rounded-md border p-3 text-sm ${barcodeMatches ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                          {barcodeMatches ? "Scanned medication barcode matches." : "Scan the generated medication barcode to recheck before dispensing."}
                        </div>
                        {pharmacyDispenseMessages[order.id] ? (
                          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm leading-6 text-green-800">
                            {pharmacyDispenseMessages[order.id]}
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={!canUse(currentUser.role, "Pharmacist") || !["Approved", "Dispensed"].includes(order.status)}
                            onClick={() => generateMedicationBarcode(order)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-clinical-line bg-white px-4 py-2 text-sm font-semibold text-clinical-ink disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <Barcode className="h-4 w-4" aria-hidden="true" />
                            Generate Barcode
                          </button>
                          <button
                            type="button"
                            disabled={!canUse(currentUser.role, "Pharmacist") || order.status !== "Approved" || !barcodeMatches}
                            onClick={() => dispenseOrder(order)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-clinical-line bg-white px-4 py-2 text-sm font-semibold text-clinical-ink disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                            Mark Dispensed
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        ) : null}

        {safeActiveModule === "patientScan" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <Section title="Patient Barcode Scan" icon={Barcode}>
              <div className="grid gap-4">
                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm text-clinical-ink">
                    <span className="text-base font-bold">Patient wristband barcode</span>
                    <input
                      className={`${inputClass} min-h-12 text-base`}
                      placeholder="Paste the patient wristband barcode"
                      value={patientScan}
                      onChange={(event) => setPatientScan(event.target.value)}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-start">
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold hover:bg-clinical-panel">
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      Upload Barcode Picture
                      <input type="file" accept="image/*" className="sr-only" onChange={handlePatientScanImageUpload} />
                    </label>
                    {patientScanImage ? (
                      <NextImage src={patientScanImage} alt={patientScanImageName || "Patient wristband upload"} width={320} height={96} unoptimized className="h-24 w-full rounded-md border border-clinical-line object-cover" />
                    ) : (
                      <div className="grid h-24 place-items-center rounded-md border border-dashed border-clinical-line bg-clinical-panel px-3 text-center text-xs text-clinical-muted">
                        Wristband picture preview
                      </div>
                    )}
                  </div>
                  {patientScanMessage ? <p className="text-xs leading-5 text-clinical-muted">{patientScanMessage}</p> : null}
                </div>
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Quick patient scan</p>
                  <p className="text-xs font-semibold text-clinical-muted">Patient name:</p>
                  <div className="flex flex-wrap gap-2">
                    {state.patients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => setPatientScan(patient.barcode)}
                        className="rounded-md border border-clinical-line bg-white px-3 py-2 text-xs font-semibold hover:bg-clinical-panel"
                      >
                        {patient.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`rounded-md border p-4 text-sm ${scannedPatient ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  {scannedPatient
                    ? `Matched ${scannedPatient.name}. Review the patient details before moving to BCMA.`
                    : "No patient matched this barcode. Scan or enter a valid wristband barcode."}
                </div>
                {scannedPatient ? (
                  <button
                    type="button"
                    onClick={() => setActiveModule("bcma")}
                    className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-md bg-clinical-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Barcode className="h-4 w-4" aria-hidden="true" />
                    Continue to BCMA
                  </button>
                ) : null}
              </div>
            </Section>
            <Section title="Identified Patient Details" icon={Hospital}>
              {scannedPatient ? (
                <PatientSummary patient={scannedPatient} />
              ) : (
                <EmptyState>Scan a patient wristband barcode to view patient details.</EmptyState>
              )}
            </Section>
          </div>
        ) : null}

        {safeActiveModule === "bcma" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <Section title="Barcode Scanning" icon={Barcode}>
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <Field label="Patient barcode">
                    <input className={inputClass} value={patientScan} onChange={(event) => setPatientScan(event.target.value)} />
                  </Field>
                  <BarcodeUploadLabel label="Upload patient barcode" onChange={handlePatientScanImageUpload} />
                </div>
                {patientScanMessage ? <p className="text-xs leading-5 text-clinical-muted">{patientScanMessage}</p> : null}
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <Field label="Medication dose barcode">
                    <input className={inputClass} value={medicationScan} onChange={(event) => setMedicationScan(event.target.value)} />
                  </Field>
                  <BarcodeUploadLabel label="Upload medication barcode" onChange={handleMedicationScanBarcodeUpload} />
                </div>
                {medicationScanMessage ? <p className="text-xs leading-5 text-clinical-muted">{medicationScanMessage}</p> : null}
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Quick scan picks</p>
                  <div className="grid gap-2">
                    <p className="text-xs font-semibold text-clinical-muted">Patient name:</p>
                    <div className="flex flex-wrap gap-2">
                      {state.patients.map((patient) => (
                        <button key={patient.id} type="button" onClick={() => setPatientScan(patient.barcode)} className="rounded-md border border-clinical-line bg-white px-3 py-2 text-xs font-semibold hover:bg-clinical-panel">
                          {patient.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <p className="text-xs font-semibold text-clinical-muted">Pill name:</p>
                    <div className="flex flex-wrap gap-2">
                      {sortOrdersByPriority(state.orders.filter((order) => order.doseBarcode)).map((order) => (
                        <button key={order.id} type="button" onClick={() => setMedicationScan(order.doseBarcode ?? "")} className="rounded-md border border-clinical-line bg-white px-3 py-2 text-xs font-semibold hover:bg-clinical-panel">
                          {order.drugName} {order.dose}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {(fiveRightsPassExample || fiveRightsFailExample) ? (
                  <div className="grid gap-3 rounded-md border border-blue-200 bg-blue-50 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">Five Rights demo examples</p>
                      <p className="mt-1 text-sm leading-6 text-blue-900">
                        Pass means the wristband barcode matches the medication barcode, and the medication order has already been dispensed.
                      </p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {fiveRightsPassExample ? (
                        <button
                          type="button"
                          onClick={() => applyFiveRightsExample("pass")}
                          className="rounded-md border border-green-300 bg-white px-3 py-2 text-left text-xs font-semibold text-green-800 hover:bg-green-50"
                        >
                          Pass: {fiveRightsPassExample.patient.name} + {fiveRightsPassExample.order.doseBarcode}
                        </button>
                      ) : null}
                      {fiveRightsFailExample ? (
                        <button
                          type="button"
                          onClick={() => applyFiveRightsExample("fail")}
                          className="rounded-md border border-red-300 bg-white px-3 py-2 text-left text-xs font-semibold text-red-800 hover:bg-red-50"
                        >
                          Fail: {fiveRightsFailExample.patient.name} + {fiveRightsFailExample.order.doseBarcode}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <Field label="Administration note">
                  <textarea className={`${inputClass} min-h-20`} value={administrationNote} onChange={(event) => setAdministrationNote(event.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!canUse(currentUser.role, "Nurse") || !fiveRightsPass} onClick={() => recordAdministration("Administered")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-clinical-green px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Administer
                  </button>
                  <button type="button" disabled={!canUse(currentUser.role, "Nurse") || !fiveRightsPass} onClick={() => recordAdministration("Held")} className="inline-flex min-h-10 items-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 disabled:cursor-not-allowed disabled:text-slate-400">
                    Hold
                  </button>
                  <button type="button" disabled={!canUse(currentUser.role, "Nurse") || !fiveRightsPass} onClick={() => recordAdministration("Missed")} className="inline-flex min-h-10 items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:text-slate-400">
                    Mark Missed
                  </button>
                </div>
              </div>
            </Section>
            <Section title="Five Rights Verification" icon={ShieldCheck}>
              <div className="grid gap-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <RightCheck label="Right patient" pass={fiveRights.rightPatient} />
                  <RightCheck label="Right drug" pass={fiveRights.rightDrug} />
                  <RightCheck label="Right dose" pass={fiveRights.rightDose} />
                  <RightCheck label="Right route" pass={fiveRights.rightRoute} />
                  <RightCheck label="Right time" pass={fiveRights.rightTime} />
                </div>
                <div className={`rounded-md border p-4 text-sm ${fiveRightsPass ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  {fiveRights.messages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <InfoBlock title="Scanned patient" value={scannedPatient ? `${scannedPatient.name} (${scannedPatient.id})` : "Not matched"} />
                  <div className="rounded-md border border-clinical-line bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Scanned medication</p>
                    {scannedOrder ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-medium text-clinical-ink">{scannedOrder.drugName} {scannedOrder.dose} ({scannedOrder.status})</span>
                        <PriorityBadge priority={scannedOrder.priority} />
                      </div>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-clinical-ink">Not matched</p>
                    )}
                  </div>
                </div>
                <AdministrationTable administrations={state.administrations} orders={state.orders} patients={state.patients} />
              </div>
            </Section>
          </div>
        ) : null}

        {safeActiveModule === "handover" ? (
          <Section title="Handover Support" icon={Handshake}>
            <div className="grid gap-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <Field label="Patient wristband barcode">
                  <input className={inputClass} placeholder="Paste the patient wristband barcode" value={handoverBarcode} onChange={(event) => setHandoverBarcode(event.target.value)} />
                </Field>
                <Field label="Handover to">
                  <input className={inputClass} placeholder="Enter nurse name" value={handoverTo} onChange={(event) => setHandoverTo(event.target.value)} />
                </Field>
                <button type="button" disabled={!handoverPatient} onClick={() => addHandoverEvent("view")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold hover:bg-clinical-panel disabled:cursor-not-allowed disabled:text-slate-400">
                  <FileClock className="h-4 w-4" aria-hidden="true" />
                  Log View
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <InfoBlock title="Created by" value={currentUser.name} />
                <InfoBlock title="Matched patient" value={handoverPatient ? `${handoverPatient.name} (${handoverPatient.id})` : "No patient matched this barcode"} />
              </div>
              {handoverPatient ? (
                <>
                  <PatientSummary patient={handoverPatient} compact />
                  <div className="grid gap-5 lg:grid-cols-2">
                    <HandoverPanel title="Active medication orders">
                      <OrderList orders={activeOrdersForPatient(handoverPatient.id)} />
                    </HandoverPanel>
                    <HandoverPanel title="Recently administered">
                      <AdministrationList administrations={state.administrations.filter((item) => item.patientId === handoverPatient.id).slice(0, 5)} orders={state.orders} />
                    </HandoverPanel>
                    <HandoverPanel title="Missed or held">
                      <OrderList orders={state.orders.filter((order) => order.patientId === handoverPatient.id && order.status === "Missed/Held")} />
                    </HandoverPanel>
                    <HandoverPanel title="Pending pharmacy items">
                      <OrderList orders={state.orders.filter((order) => order.patientId === handoverPatient.id && ["Pharmacy Review", "Approved"].includes(order.status))} />
                    </HandoverPanel>
                    <HandoverPanel title="Recent timeline">
                      <Timeline events={handoverPatient.timeline.slice(0, 6)} />
                    </HandoverPanel>
                  </div>
                  <div className="grid gap-3">
                    <Field label="Handover note">
                      <textarea className={`${inputClass} min-h-24`} placeholder="Enter handover note" value={handoverNote} onChange={(event) => setHandoverNote(event.target.value)} />
                    </Field>
                    <button type="button" disabled={!handoverNote.trim()} onClick={() => addHandoverEvent("note")} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-clinical-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                      Add Note
                    </button>
                  </div>
                </>
              ) : (
                <EmptyState>Scan a patient wristband barcode to open handover details.</EmptyState>
              )}
            </div>
          </Section>
        ) : null}

        {safeActiveModule === "audit" ? (
          <Section title="Audit Trail" icon={FileClock}>
            <AuditTable events={state.auditEvents.slice().reverse()} patients={state.patients} orders={state.orders} />
          </Section>
        ) : null}
      </div>
    </main>
  );
}

function StatTile({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-clinical-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-clinical-muted">{label}</span>
        <Icon className="h-5 w-5 text-clinical-teal" aria-hidden="true" />
      </div>
      <div className="mt-3 text-3xl font-bold text-clinical-ink">{value}</div>
    </div>
  );
}

function DemoWorkflowGuide({
  steps,
  statuses,
  onOpenModule
}: {
  steps: DemoWorkflowStep[];
  statuses: Record<string, boolean>;
  onOpenModule: (moduleId: ModuleId) => void;
}) {
  const completedCount = steps.filter((step) => statuses[step.id]).length;

  return (
    <div className="grid gap-5">
      <Section title="Full Demo Script" icon={ClipboardList}>
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBlock title="Workflow progress" value={`${completedCount} of ${steps.length} steps completed`} />
            <InfoBlock title="Starting role" value="Ward Clerk" />
            <InfoBlock title="Final review" value="Admin audit trail" />
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Present this as a handoff between roles: admission creates the patient identity, CPOE creates the order, pharmacy creates the medication barcode, BCMA verifies the Five Rights, and audit shows accountability.
          </div>
        </div>
      </Section>

      <div className="grid gap-4">
        {steps.map((step, index) => {
          const moduleLabel = modules.find((moduleItem) => moduleItem.id === step.moduleId)?.label ?? step.moduleId;
          return (
            <section key={step.id} className="rounded-lg border border-clinical-line bg-white p-5 shadow-soft">
              <div className="grid gap-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-clinical-line bg-clinical-panel text-clinical-muted">Step {index + 1}</Badge>
                      <Badge className="border-blue-200 bg-blue-50 text-blue-800">{step.role}</Badge>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-clinical-ink">{step.title}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenModule(step.moduleId)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold text-clinical-ink shadow-sm hover:bg-clinical-panel"
                  >
                    Open {moduleLabel}
                  </button>
                </div>
                <div className="grid items-stretch gap-3 md:grid-cols-2">
                  <InfoBlock title="Action" value={step.action} />
                  <InfoBlock title="Expected result" value={step.result} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InfoBlock({ title, value, className = "" }: { title: string; value: string; className?: string }) {
  return (
    <div className={`h-full rounded-md border border-clinical-line bg-white p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">{title}</p>
      <p className="mt-1 break-words text-sm font-medium text-clinical-ink">{value}</p>
    </div>
  );
}

function ControlBlock({
  title,
  children,
  className = ""
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`h-full rounded-md border border-clinical-line bg-white p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function BarcodePreview({
  value,
  title,
  caption,
  className = ""
}: {
  value?: string;
  title: string;
  caption?: string;
  className?: string;
}) {
  const [barcodeDataUrl, setBarcodeDataUrl] = useState("");

  useEffect(() => {
    if (!value) {
      setBarcodeDataUrl("");
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 14,
        height: 56,
        margin: 8,
        width: 1.8
      });
      const svgText = new XMLSerializer().serializeToString(svg);
      setBarcodeDataUrl(`data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svgText)))}`);
    } catch {
      setBarcodeDataUrl("");
    }
  }, [value]);

  return (
    <div className={`h-full rounded-md border border-clinical-line bg-white p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">{title}</p>
      {value && barcodeDataUrl ? (
        <div className="mt-2 grid gap-2">
          <NextImage src={barcodeDataUrl} alt={`${title} for ${value}`} width={340} height={112} unoptimized className="h-28 w-full rounded-md border border-clinical-line bg-white object-contain p-2" />
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-clinical-ink">{value}</p>
            {caption ? <p className="mt-1 text-xs leading-5 text-clinical-muted">{caption}</p> : null}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm font-medium text-clinical-muted">Generate a barcode before scanning.</p>
      )}
    </div>
  );
}

function BarcodeUploadLabel({
  label,
  onChange
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold hover:bg-clinical-panel">
      <Upload className="h-4 w-4" aria-hidden="true" />
      {label}
      <input type="file" accept="image/*" className="sr-only" onChange={onChange} />
    </label>
  );
}

function PriorityGuide() {
  return (
    <div className="rounded-md border border-clinical-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Priority status guide</p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <PriorityBadge priority="Routine" />
          <p className="mt-2 text-xs leading-5 text-slate-700">Normal medication workflow. Pharmacy and nursing process it in standard queue order.</p>
        </div>
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3">
          <PriorityBadge priority="Urgent" />
          <p className="mt-2 text-xs leading-5 text-yellow-900">Needs faster attention. Pharmacy review and nursing administration should notice it before routine orders.</p>
        </div>
        <div className="rounded-md border border-red-300 bg-red-50 p-3">
          <PriorityBadge priority="STAT" />
          <p className="mt-2 text-xs leading-5 text-red-800">Emergency priority. It appears with the strongest warning style and should be handled first in the demo queue.</p>
        </div>
      </div>
    </div>
  );
}

function PatientSummary({ patient, compact = false }: { patient: Patient; compact?: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <InfoBlock title="Patient" value={`${patient.name} (${patient.id})`} />
        <InfoBlock title="Admission type" value={patient.admissionType} />
        <InfoBlock title="Date of birth" value={formatDate(patient.dateOfBirth)} />
        <InfoBlock title="Wristband barcode" value={patient.barcode} />
        <BarcodePreview title="Patient barcode" value={patient.barcode} caption="Scannable wristband barcode for patient identification." className="md:col-span-4" />
        <InfoBlock title="Nationality" value={patient.nationality || "Not recorded"} />
        <InfoBlock title="Citizen ID / Passport" value={patient.citizenId || "Not recorded"} />
        <InfoBlock title="Ethnicity" value={patient.ethnicity || "Not recorded"} />
        <InfoBlock title="Blood type" value={patient.bloodType || "Not recorded"} />
        <InfoBlock title="Height" value={patient.heightCm ? `${patient.heightCm} cm` : "Not recorded"} />
        <InfoBlock title="Weight" value={`${patient.weightKg} kg`} />
        <InfoBlock title="Occupation" value={patient.occupation || "Not recorded"} />
        <InfoBlock title="Renal function" value={`eGFR ${patient.renalFunction}`} />
        <InfoBlock title="Created by" value={`${patient.createdBy} at ${formatDateTime(patient.createdAt)}`} />
        <InfoBlock title="Gender" value={patient.gender || "Not recorded"} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <InfoBlock title="Reason for visit" value={patient.reasonForVisit || "Not recorded"} />
        <InfoBlock title="Allergies" value={patient.allergies.join(", ") || "None recorded"} />
        <InfoBlock title="Adverse drug reactions" value={patient.adverseDrugReactions.join(", ") || "None recorded"} />
        <InfoBlock title="Medical history" value={patient.pastMedicalHistory.join(", ") || patient.priorDisorders.join(", ") || patient.recentHistory || "None recorded"} />
        <MedicationDetailsTable title="Current Medications" medications={patient.currentMedicationDetails} />
        <MedicationDetailsTable title="Home Medications" medications={patient.homeMedicationDetails} />
        <ContactBlock title="Patient personal contacts" contact={patient.patientContact} />
        <ContactBlock title="Emergency contact" contact={patient.emergencyContact} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-clinical-line bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Lab results</p>
          <div className="mt-2 grid gap-2">
            {patient.labs.length ? patient.labs.map((lab) => (
              <div key={`${lab.name}-${lab.collectedAt}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{lab.name}</span>
                <span>
                  {lab.value} {lab.unit} {lab.flag ? `(${lab.flag})` : ""}
                </span>
              </div>
            )) : <p className="text-sm font-medium text-clinical-ink">No lab results recorded</p>}
          </div>
        </div>
        <ScreeningImagePanel images={patient.screeningImages} />
      </div>
      {!compact ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-clinical-muted">Timeline</h3>
          <Timeline events={patient.timeline} />
        </div>
      ) : null}
    </div>
  );
}

function ContactBlock({ title, contact }: { title: string; contact: ContactInfo }) {
  return (
    <div className="rounded-md border border-clinical-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">{title}</p>
      <div className="mt-2 grid gap-1 text-sm font-medium text-clinical-ink">
        <span>{contact.phone || "No phone recorded"}</span>
        <span>{contact.email || "No email recorded"}</span>
        <span>{contact.address || "No address recorded"}</span>
      </div>
    </div>
  );
}

function MedicationDetailsTable({ title, medications }: { title: string; medications: MedicationHistoryItem[] }) {
  if (medications.length === 0) return <InfoBlock title={title} value="None recorded" />;
  return (
    <div className="rounded-md border border-clinical-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">{title}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-clinical-muted">
            <tr>
              <th className="py-1 pr-3">Medication</th>
              <th className="py-1 pr-3">Dose</th>
              <th className="py-1">Frequency</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((medication, index) => (
              <tr key={`${medication.name}-${index}`} className="border-t border-clinical-line">
                <td className="py-2 pr-3 font-medium">{medication.name || "-"}</td>
                <td className="py-2 pr-3">{medication.dose || "-"}</td>
                <td className="py-2">{medication.frequency || medication.duration || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScreeningImagePanel({ images }: { images: string[] }) {
  return (
    <div className="rounded-md border border-clinical-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Screening images</p>
      {images.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {images.map((image, index) => (
            <NextImage key={`${image}-${index}`} src={image} alt={`Screening image ${index + 1}`} width={320} height={112} unoptimized className="h-28 w-full rounded-md border border-clinical-line object-cover" />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm font-medium text-clinical-ink">No screening images uploaded</p>
      )}
    </div>
  );
}

function Timeline({ events }: { events: PatientTimelineEvent[] }) {
  const pageSize = 5;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (events.length === 0) return <EmptyState>No timeline events yet.</EmptyState>;
  return (
    <div className="grid gap-2">
      {visibleEvents.map((event) => (
        <div key={event.id} className="rounded-md border border-clinical-line bg-white p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold">{event.description}</span>
            <span className="text-clinical-muted">{formatDateTime(event.timestamp)}</span>
          </div>
          <p className="mt-1 text-clinical-muted">
            {event.role} - {event.userName}
          </p>
        </div>
      ))}
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm">
          <span className="font-medium text-clinical-muted">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-md border border-clinical-line bg-white px-3 py-1.5 text-xs font-semibold text-clinical-ink disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="rounded-md border border-clinical-line bg-white px-3 py-1.5 text-xs font-semibold text-clinical-ink disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AlertList({
  alerts,
  orders,
  patients,
  compact = false
}: {
  alerts: SafetyAlert[];
  orders: MedicationOrder[];
  patients: Patient[];
  compact?: boolean;
}) {
  if (alerts.length === 0) return <EmptyState>No demo safety alerts.</EmptyState>;
  return (
    <div className="grid gap-2">
      {alerts.map((alert) => {
        const patient = patients.find((item) => item.id === alert.patientId);
        const order = orders.find((item) => item.id === alert.orderId);
        return (
          <div key={alert.id} className={`rounded-md border p-3 text-sm ${alertClasses(alert.severity)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={alertClasses(alert.severity)}>{alert.severity}</Badge>
              <span className="font-semibold">{alert.type}</span>
            </div>
            <p className="mt-1">{alert.message}</p>
            {!compact ? (
              <p className="mt-1 text-xs opacity-80">
                {patient?.name ?? alert.patientId} - {order?.drugName ?? alert.orderId} - {formatDateTime(alert.createdAt)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function OrdersTable({ orders, patients, alerts }: { orders: MedicationOrder[]; patients: Patient[]; alerts: SafetyAlert[] }) {
  if (orders.length === 0) return <EmptyState>No orders submitted.</EmptyState>;
  const sortedOrders = sortOrdersByPriority(orders);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-clinical-muted">
            <th className="border-b border-clinical-line p-3">Order</th>
            <th className="border-b border-clinical-line p-3">Priority</th>
            <th className="border-b border-clinical-line p-3">Patient</th>
            <th className="border-b border-clinical-line p-3">Schedule</th>
            <th className="border-b border-clinical-line p-3">Status</th>
            <th className="border-b border-clinical-line p-3">Alerts</th>
          </tr>
        </thead>
        <tbody>
          {sortedOrders.map((order) => {
            const patient = patients.find((item) => item.id === order.patientId);
            const orderAlerts = alerts.filter((alert) => order.alertIds.includes(alert.id));
            return (
              <tr key={order.id} className="align-top">
                <td className="border-b border-clinical-line p-3">
                  <div className="font-semibold">{order.drugName} {order.dose}</div>
                  <div className="text-clinical-muted">{order.route} - {order.frequency}</div>
                </td>
                <td className="border-b border-clinical-line p-3"><PriorityBadge priority={order.priority} /></td>
                <td className="border-b border-clinical-line p-3">{patient?.name ?? order.patientId}</td>
                <td className="border-b border-clinical-line p-3">{order.scheduleDisplay ?? formatDateTime(order.scheduledTime)}</td>
                <td className="border-b border-clinical-line p-3"><StatusBadge status={order.status} /></td>
                <td className="border-b border-clinical-line p-3">
                  {orderAlerts.length ? `${orderAlerts.length} demo alert${orderAlerts.length === 1 ? "" : "s"}` : "None"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RightCheck({ label, pass }: { label: string; pass: boolean }) {
  return (
    <div className={`rounded-md border p-3 text-sm font-semibold ${pass ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
      {label}: {pass ? "Pass" : "Fail"}
    </div>
  );
}

function AdministrationTable({ administrations, orders, patients }: { administrations: import("../lib/types").MedicationAdministration[]; orders: MedicationOrder[]; patients: Patient[] }) {
  if (administrations.length === 0) return <EmptyState>No administration events documented yet.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-clinical-muted">
            <th className="border-b border-clinical-line p-3">Time</th>
            <th className="border-b border-clinical-line p-3">Patient</th>
            <th className="border-b border-clinical-line p-3">Medication</th>
            <th className="border-b border-clinical-line p-3">Status</th>
            <th className="border-b border-clinical-line p-3">Nurse</th>
          </tr>
        </thead>
        <tbody>
          {administrations.map((admin) => {
            const patient = patients.find((item) => item.id === admin.patientId);
            const order = orders.find((item) => item.id === admin.orderId);
            return (
              <tr key={admin.id}>
                <td className="border-b border-clinical-line p-3">{formatDateTime(admin.performedAt)}</td>
                <td className="border-b border-clinical-line p-3">{patient?.name ?? admin.patientId}</td>
                <td className="border-b border-clinical-line p-3">{order ? `${order.drugName} ${order.dose}` : admin.orderId}</td>
                <td className="border-b border-clinical-line p-3">{admin.status}</td>
                <td className="border-b border-clinical-line p-3">{admin.nurseName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HandoverPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-clinical-line bg-clinical-panel p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-clinical-muted">{title}</h3>
      {children}
    </div>
  );
}

function OrderList({ orders }: { orders: MedicationOrder[] }) {
  if (orders.length === 0) return <EmptyState>None.</EmptyState>;
  const sortedOrders = sortOrdersByPriority(orders);
  return (
    <div className="grid gap-2">
      {sortedOrders.map((order) => (
        <div key={order.id} className="rounded-md border border-clinical-line bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{order.drugName} {order.dose}</span>
            <div className="flex flex-wrap gap-2">
              <PriorityBadge priority={order.priority} />
              <StatusBadge status={order.status} />
            </div>
          </div>
          <p className="mt-1 text-clinical-muted">{order.route} - {order.frequency} - {order.scheduleDisplay ?? formatDateTime(order.scheduledTime)}</p>
        </div>
      ))}
    </div>
  );
}

function AdministrationList({ administrations, orders }: { administrations: import("../lib/types").MedicationAdministration[]; orders: MedicationOrder[] }) {
  if (administrations.length === 0) return <EmptyState>None.</EmptyState>;
  return (
    <div className="grid gap-2">
      {administrations.map((admin) => {
        const order = orders.find((item) => item.id === admin.orderId);
        return (
          <div key={admin.id} className="rounded-md border border-clinical-line bg-white p-3 text-sm">
            <div className="font-semibold">{order ? `${order.drugName} ${order.dose}` : admin.orderId}</div>
            <p className="mt-1 text-clinical-muted">{admin.status} by {admin.nurseName} at {formatDateTime(admin.performedAt)}</p>
          </div>
        );
      })}
    </div>
  );
}

function AuditList({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <EmptyState>No audit events.</EmptyState>;
  return (
    <div className="grid gap-2">
      {events.map((event) => (
        <div key={event.id} className="rounded-md border border-clinical-line bg-clinical-panel p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold">{event.actionType}</span>
            <span className="text-clinical-muted">{formatDateTime(event.timestamp)}</span>
          </div>
          <p className="mt-1">{event.description}</p>
          <p className="mt-1 text-clinical-muted">{event.role} - {event.userName}</p>
        </div>
      ))}
    </div>
  );
}

function AuditTable({ events, patients, orders }: { events: AuditEvent[]; patients: Patient[]; orders: MedicationOrder[] }) {
  if (events.length === 0) return <EmptyState>No audit events.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-clinical-muted">
            <th className="border-b border-clinical-line p-3">Timestamp</th>
            <th className="border-b border-clinical-line p-3">User</th>
            <th className="border-b border-clinical-line p-3">Action</th>
            <th className="border-b border-clinical-line p-3">Patient</th>
            <th className="border-b border-clinical-line p-3">Order</th>
            <th className="border-b border-clinical-line p-3">Description</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const patient = patients.find((item) => item.id === event.patientId);
            const order = orders.find((item) => item.id === event.orderId);
            return (
              <tr key={event.id} className="align-top">
                <td className="border-b border-clinical-line p-3">{formatDateTime(event.timestamp)}</td>
                <td className="border-b border-clinical-line p-3">{event.role} - {event.userName}</td>
                <td className="border-b border-clinical-line p-3">{event.actionType}</td>
                <td className="border-b border-clinical-line p-3">{patient?.name ?? event.patientId ?? "-"}</td>
                <td className="border-b border-clinical-line p-3">{order?.drugName ?? event.orderId ?? "-"}</td>
                <td className="border-b border-clinical-line p-3">{event.description}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
