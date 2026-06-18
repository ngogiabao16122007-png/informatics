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
  Pill,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserPlus
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatDate, formatDateTime, makeId } from "../lib/ids";
import { runDemoSafetyChecks } from "../lib/safety";
import { demoUsers, seedState } from "../lib/seed";
import {
  AdministrationStatus,
  AuditEvent,
  DemoState,
  FiveRightsResult,
  MedicationOrder,
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
    action: "Review patient context and alerts, then approve or reject the medication order.",
    result: "Approved orders receive a medication dose barcode for BCMA scanning."
  },
  {
    id: "dispense",
    role: "Pharmacist",
    moduleId: "pharmacy",
    title: "Dispense prepared medication",
    action: "Mark the approved medication as dispensed after barcode generation.",
    result: "The order status becomes Dispensed and is ready for nurse administration."
  },
  {
    id: "identify",
    role: "Nurse",
    moduleId: "patientScan",
    title: "Scan patient wristband",
    action: "Enter or scan the patient wristband barcode to identify the patient before medication administration.",
    result: "The matched patient profile opens with allergies, current medications, labs, barcode, and recent timeline."
  },
  {
    id: "administer",
    role: "Nurse",
    moduleId: "bcma",
    title: "Scan and verify Five Rights",
    action: "Scan the patient barcode and medication barcode, then review each Five Rights check.",
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
  name: "",
  dateOfBirth: "",
  allergies: "",
  adverseDrugReactions: "",
  pastMedicalHistory: "",
  currentMedications: "",
  homeMedications: "",
  weightKg: "70",
  renalFunction: "90",
  potassium: "4.0",
  creatinine: "0.9"
};

const emptyOrderForm = {
  patientId: "",
  drugName: "",
  dose: "",
  route: "Oral",
  frequency: "Once daily",
  scheduledTime: "2026-06-18T09:00",
  notes: ""
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function migrateDemoState(savedState: DemoState): DemoState {
  return {
    ...savedState,
    patients: savedState.patients.map((patient) => ({
      ...patient,
      createdBy: replaceLegacyText(patient.createdBy),
      timeline: patient.timeline.map((event) => ({
        ...event,
        userName: replaceLegacyText(event.userName),
        description: replaceLegacyText(event.description)
      }))
    })),
    orders: savedState.orders.map((order) => ({
      ...order,
      physicianName: replaceLegacyText(order.physicianName),
      route: normalizeRoute(order.route),
      frequency: normalizeFrequency(order.frequency)
    })),
    dispenses: savedState.dispenses.map((dispense) => ({
      ...dispense,
      preparedBy: replaceLegacyText(dispense.preparedBy)
    })),
    administrations: savedState.administrations.map((administration) => ({
      ...administration,
      nurseName: replaceLegacyText(administration.nurseName)
    })),
    auditEvents: savedState.auditEvents.map((event) => ({
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
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return Number.isFinite(age) ? age : 0;
}

function localDateTimeInput(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value: string): string {
  return new Date(value).toISOString();
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

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={statusClasses(status)}>{status}</Badge>;
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
  required
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-clinical-ink">
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <Badge className="border-clinical-line bg-clinical-panel text-clinical-muted">{role}</Badge>
          <h2 className="mt-3 text-lg font-semibold text-clinical-ink">{description.title}</h2>
          <p className="mt-2 text-sm leading-6 text-clinical-muted">{description.description}</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 lg:max-w-xl">
          {description.checkpoints.map((checkpoint) => (
            <span key={checkpoint} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-center text-xs font-semibold text-teal-800">
              {checkpoint}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
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
  const [patientScan, setPatientScan] = useState(seedState.patients[0]?.barcode ?? "");
  const [medicationScan, setMedicationScan] = useState("");
  const [administrationNote, setAdministrationNote] = useState("");
  const [handoverPatientId, setHandoverPatientId] = useState(seedState.patients[0]?.id ?? "");
  const [handoverNote, setHandoverNote] = useState("");
  const [pendingDeletePatientId, setPendingDeletePatientId] = useState<string | null>(null);

  const currentUser = demoUsers.find((user) => user.id === currentUserId) ?? demoUsers[0];
  const selectedPatient = state.patients.find((patient) => patient.id === selectedPatientId) ?? state.patients[0];
  const handoverPatient = state.patients.find((patient) => patient.id === handoverPatientId) ?? state.patients[0];
  const visibleModules = modules.filter((moduleItem) => canOpenModule(currentUser.role, moduleItem.id));
  const activeModuleAllowed = canOpenModule(currentUser.role, activeModule);
  const safeActiveModule = activeModuleAllowed ? activeModule : defaultWorkspace[currentUser.role];
  const scannedPatient = state.patients.find((patient) => patient.barcode.trim().toLowerCase() === patientScan.trim().toLowerCase());

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
        setState(parsed);
        setSelectedPatientId(parsed.patients[0]?.id ?? "");
        setOrderForm((form) => ({ ...form, patientId: parsed.patients[0]?.id ?? "" }));
        setPatientScan(parsed.patients[0]?.barcode ?? "");
        setHandoverPatientId(parsed.patients[0]?.id ?? "");
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

  const addPatientTimeline = (patients: Patient[], patientId: string, event: PatientTimelineEvent) =>
    patients.map((patient) =>
      patient.id === patientId
        ? { ...patient, updatedAt: event.timestamp, timeline: [event, ...patient.timeline].slice(0, 30) }
        : patient
    );

  function createPatient(event: FormEvent) {
    event.preventDefault();
    setAdmissionError("");
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const formValues = {
      name: formText(formData, "name"),
      dateOfBirth: formText(formData, "dateOfBirth"),
      allergies: formText(formData, "allergies"),
      adverseDrugReactions: formText(formData, "adverseDrugReactions"),
      pastMedicalHistory: formText(formData, "pastMedicalHistory"),
      currentMedications: formText(formData, "currentMedications"),
      homeMedications: formText(formData, "homeMedications"),
      weightKg: formText(formData, "weightKg"),
      renalFunction: formText(formData, "renalFunction"),
      potassium: formText(formData, "potassium"),
      creatinine: formText(formData, "creatinine")
    };

    if (!canUse(currentUser.role, "Ward Clerk")) {
      setAdmissionError("Switch to Ward Clerk or Admin to create an admission.");
      return;
    }

    if (!formValues.name.trim() || !formValues.dateOfBirth || !formValues.weightKg || !formValues.renalFunction) {
      setAdmissionError("Name, date of birth, weight, and renal function are required.");
      return;
    }

    const timestamp = new Date().toISOString();
    const patientId = makeId("PAT");
    const barcode = `WRIST-${patientId}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const timelineEvent = createTimelineEvent(currentUser, `Patient admitted and wristband barcode ${barcode} generated.`, timestamp);
    const patient: Patient = {
      id: patientId,
      barcode,
      name: formValues.name.trim(),
      dateOfBirth: formValues.dateOfBirth,
      age: calculateAge(formValues.dateOfBirth),
      allergies: splitList(formValues.allergies),
      adverseDrugReactions: splitList(formValues.adverseDrugReactions),
      pastMedicalHistory: splitList(formValues.pastMedicalHistory),
      currentMedications: splitList(formValues.currentMedications),
      homeMedications: splitList(formValues.homeMedications),
      weightKg: Number(formValues.weightKg),
      renalFunction: Number(formValues.renalFunction),
      labs: [
        { name: "Potassium", value: Number(formValues.potassium), unit: "mmol/L", flag: Number(formValues.potassium) < 3.5 ? "low" : "normal", collectedAt: timestamp },
        { name: "Creatinine", value: Number(formValues.creatinine), unit: "mg/dL", flag: Number(formValues.creatinine) > 1.3 ? "high" : "normal", collectedAt: timestamp }
      ],
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
    setHandoverPatientId(patient.id);
    setAdmissionForm(emptyAdmissionForm);
  }

  function submitOrder(event: FormEvent) {
    event.preventDefault();
    setOrderError("");
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const formValues = {
      patientId: formText(formData, "patientId"),
      drugName: formText(formData, "drugName"),
      dose: formText(formData, "dose"),
      route: formText(formData, "route"),
      frequency: formText(formData, "frequency"),
      scheduledTime: formText(formData, "scheduledTime"),
      notes: formText(formData, "notes")
    };

    if (!canUse(currentUser.role, "Physician")) {
      setOrderError("Switch to Physician or Admin to submit CPOE orders.");
      return;
    }

    if (!formValues.patientId || !formValues.drugName.trim() || !formValues.dose.trim() || !formValues.route.trim() || !formValues.scheduledTime) {
      setOrderError("Patient, drug, dose, route, and scheduled time are required.");
      return;
    }

    const patient = state.patients.find((item) => item.id === formValues.patientId);
    if (!patient) {
      setOrderError("Selected patient could not be found.");
      return;
    }

    const timestamp = new Date().toISOString();
    const orderId = makeId("ORD");
    const activeOrders = activeOrdersForPatient(patient.id);
    const alerts = runDemoSafetyChecks({
      patient,
      activeOrders,
      orderId,
      timestamp,
      draftOrder: {
        drugName: formValues.drugName.trim(),
        dose: formValues.dose.trim(),
        route: formValues.route.trim(),
        scheduledTime: toIsoFromLocalInput(formValues.scheduledTime)
      }
    });
    const order: MedicationOrder = {
      id: orderId,
      patientId: patient.id,
      physicianId: currentUser.id,
      physicianName: currentUser.name,
      drugName: formValues.drugName.trim(),
      dose: formValues.dose.trim(),
      route: formValues.route.trim(),
      frequency: formValues.frequency.trim(),
      scheduledTime: toIsoFromLocalInput(formValues.scheduledTime),
      notes: formValues.notes.trim(),
      status: "Pharmacy Review",
      alertIds: alerts.map((alert) => alert.id),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const timelineEvent = createTimelineEvent(currentUser, `Submitted ${order.drugName} ${order.dose} ${order.route} for pharmacy review.`, timestamp);
    const auditEvents = [
      createAuditEvent(currentUser, "Order submitted", `Submitted ${order.drugName} ${order.dose} ${order.route} for pharmacy review.`, patient.id, order.id, timestamp),
      ...alerts.map((alert) =>
        createAuditEvent(currentUser, "Alert generated", `${alert.type}: ${alert.message}`, patient.id, order.id, timestamp)
      )
    ];

    setState((previous) => ({
      ...previous,
      orders: [order, ...previous.orders],
      alerts: [...previous.alerts, ...alerts],
      auditEvents: [...previous.auditEvents, ...auditEvents],
      patients: addPatientTimeline(previous.patients, patient.id, timelineEvent)
    }));
    setOrderForm({ ...emptyOrderForm, patientId: patient.id, scheduledTime: localDateTimeInput() });
  }

  function approveOrder(order: MedicationOrder) {
    if (!canUse(currentUser.role, "Pharmacist")) return;
    const timestamp = new Date().toISOString();
    const doseBarcode = `DOSE-${order.id}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const notes = pharmacyNotes[order.id]?.trim();
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
          preparedBy: currentUser.name,
          preparedAt: timestamp,
          notes
        },
        ...previous.dispenses
      ],
      auditEvents: [...previous.auditEvents, audit],
      patients: addPatientTimeline(previous.patients, order.patientId, timeline)
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
    const audit = createAuditEvent(currentUser, "Medication dispensed", `Marked ${order.drugName} dose as prepared and dispensed.`, order.patientId, order.id, timestamp);
    const timeline = createTimelineEvent(currentUser, `Medication dose for ${order.drugName} dispensed to unit.`, timestamp);

    setState((previous) => ({
      ...previous,
      orders: previous.orders.map((item) => (item.id === order.id ? { ...item, status: "Dispensed", updatedAt: timestamp } : item)),
      dispenses: previous.dispenses.map((dispense) =>
        dispense.orderId === order.id ? { ...dispense, dispensedAt: timestamp } : dispense
      ),
      auditEvents: [...previous.auditEvents, audit],
      patients: addPatientTimeline(previous.patients, order.patientId, timeline)
    }));
    if (order.doseBarcode) {
      setMedicationScan(order.doseBarcode);
    }
  }

  const fiveRights = useMemo(() => evaluateFiveRights(state, patientScan, medicationScan), [state, patientScan, medicationScan]);
  const scannedOrder = state.orders.find((order) => order.doseBarcode?.trim().toLowerCase() === medicationScan.trim().toLowerCase());
  const fiveRightsPass = fiveRights.rightPatient && fiveRights.rightDrug && fiveRights.rightDose && fiveRights.rightRoute && fiveRights.rightTime;

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
            ? { ...patient, currentMedications: [...patient.currentMedications, scannedOrder.drugName] }
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
        ? `Viewed handover summary for ${handoverPatient.name}.`
        : `Handover note added for ${handoverPatient.name}: ${handoverNote.trim()}`;
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
    window.localStorage.removeItem(storageKey);
    setState(seedState);
    setSelectedPatientId(seedState.patients[0]?.id ?? "");
    setOrderForm({ ...emptyOrderForm, patientId: seedState.patients[0]?.id ?? "" });
    setPatientScan(seedState.patients[0]?.barcode ?? "");
    setMedicationScan("");
    setHandoverPatientId(seedState.patients[0]?.id ?? "");
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
    setHandoverPatientId(nextPatientId);
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

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Patient name" required>
                    <input name="name" className={inputClass} value={admissionForm.name} onChange={(event) => setAdmissionForm({ ...admissionForm, name: event.target.value })} />
                  </Field>
                  <Field label="Date of birth" required>
                    <input name="dateOfBirth" placeholder="YYYY-MM-DD" className={inputClass} value={admissionForm.dateOfBirth} onChange={(event) => setAdmissionForm({ ...admissionForm, dateOfBirth: event.target.value })} />
                  </Field>
                  <Field label="Weight (kg)" required>
                    <input name="weightKg" type="number" min="1" className={inputClass} value={admissionForm.weightKg} onChange={(event) => setAdmissionForm({ ...admissionForm, weightKg: event.target.value })} />
                  </Field>
                  <Field label="Renal function eGFR" required>
                    <input name="renalFunction" type="number" min="0" className={inputClass} value={admissionForm.renalFunction} onChange={(event) => setAdmissionForm({ ...admissionForm, renalFunction: event.target.value })} />
                  </Field>
                  <Field label="Potassium">
                    <input name="potassium" type="number" step="0.1" className={inputClass} value={admissionForm.potassium} onChange={(event) => setAdmissionForm({ ...admissionForm, potassium: event.target.value })} />
                  </Field>
                  <Field label="Creatinine">
                    <input name="creatinine" type="number" step="0.1" className={inputClass} value={admissionForm.creatinine} onChange={(event) => setAdmissionForm({ ...admissionForm, creatinine: event.target.value })} />
                  </Field>
                </div>
                <Field label="Allergies">
                  <input name="allergies" className={inputClass} placeholder="Penicillin, Sulfa" value={admissionForm.allergies} onChange={(event) => setAdmissionForm({ ...admissionForm, allergies: event.target.value })} />
                </Field>
                <Field label="Adverse drug reactions">
                  <input name="adverseDrugReactions" className={inputClass} value={admissionForm.adverseDrugReactions} onChange={(event) => setAdmissionForm({ ...admissionForm, adverseDrugReactions: event.target.value })} />
                </Field>
                <Field label="Past medical history">
                  <input name="pastMedicalHistory" className={inputClass} value={admissionForm.pastMedicalHistory} onChange={(event) => setAdmissionForm({ ...admissionForm, pastMedicalHistory: event.target.value })} />
                </Field>
                <Field label="Current medications">
                  <input name="currentMedications" className={inputClass} value={admissionForm.currentMedications} onChange={(event) => setAdmissionForm({ ...admissionForm, currentMedications: event.target.value })} />
                </Field>
                <Field label="Home medications">
                  <input name="homeMedications" className={inputClass} value={admissionForm.homeMedications} onChange={(event) => setAdmissionForm({ ...admissionForm, homeMedications: event.target.value })} />
                </Field>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Drug name" required>
                    <input name="drugName" className={inputClass} value={orderForm.drugName} onChange={(event) => setOrderForm({ ...orderForm, drugName: event.target.value })} placeholder="Digoxin" />
                  </Field>
                  <Field label="Dose" required>
                    <input name="dose" className={inputClass} value={orderForm.dose} onChange={(event) => setOrderForm({ ...orderForm, dose: event.target.value })} placeholder="0.125 mg" />
                  </Field>
                  <Field label="Route" required>
                    <select name="route" className={inputClass} value={orderForm.route} onChange={(event) => setOrderForm({ ...orderForm, route: event.target.value })}>
                      <option>Oral</option>
                      <option>Intravenous</option>
                      <option>Intramuscular</option>
                      <option>Subcutaneous</option>
                      <option>Topical</option>
                    </select>
                  </Field>
                  <Field label="Frequency">
                    <select name="frequency" className={inputClass} value={orderForm.frequency} onChange={(event) => setOrderForm({ ...orderForm, frequency: event.target.value })}>
                      <option>Once daily</option>
                      <option>Twice daily</option>
                      <option>Three times daily</option>
                      <option>Every 6 hours</option>
                      <option>Once</option>
                    </select>
                  </Field>
                  <Field label="Scheduled time" required>
                    <input name="scheduledTime" type="datetime-local" className={inputClass} value={orderForm.scheduledTime} onChange={(event) => setOrderForm({ ...orderForm, scheduledTime: event.target.value })} />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea name="notes" className={`${inputClass} min-h-24`} value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} />
                </Field>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-clinical-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <Stethoscope className="h-4 w-4" aria-hidden="true" />
                  Submit to Pharmacy
                </button>
              </form>
            </Section>
            <Section title="Orders and Demo Safety Alerts" icon={AlertTriangle}>
              <OrdersTable orders={state.orders} patients={state.patients} alerts={state.alerts} />
            </Section>
          </div>
        ) : null}

        {safeActiveModule === "pharmacy" ? (
          <Section title="Pharmacy Verification and Dispensing" icon={Pill}>
            <div className="grid gap-4">
              {state.orders.length === 0 ? <EmptyState>No medication orders yet.</EmptyState> : null}
              {state.orders.map((order) => {
                const patient = state.patients.find((item) => item.id === order.patientId);
                const alerts = state.alerts.filter((alert) => order.alertIds.includes(alert.id));
                return (
                  <div key={order.id} className="grid gap-4 rounded-lg border border-clinical-line bg-clinical-panel p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">{order.drugName} {order.dose}</h3>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="mt-1 text-sm text-clinical-muted">
                          {patient?.name} - {order.route} - {order.frequency} - due {formatDateTime(order.scheduledTime)}
                        </p>
                      </div>
                      {order.doseBarcode ? <Badge className="border-teal-300 bg-teal-50 text-teal-800">{order.doseBarcode}</Badge> : null}
                    </div>
                    {patient ? (
                      <div className="grid gap-3 text-sm md:grid-cols-3">
                        <InfoBlock title="Allergies" value={patient.allergies.join(", ") || "None recorded"} />
                        <InfoBlock title="Current meds" value={patient.currentMedications.join(", ") || "None recorded"} />
                        <InfoBlock title="Renal function" value={`eGFR ${patient.renalFunction}`} />
                      </div>
                    ) : null}
                    <AlertList alerts={alerts} orders={state.orders} patients={state.patients} compact />
                    <Field label="Pharmacist notes">
                      <textarea
                        className={`${inputClass} min-h-20`}
                        value={pharmacyNotes[order.id] ?? order.pharmacistNotes ?? ""}
                        onChange={(event) => setPharmacyNotes({ ...pharmacyNotes, [order.id]: event.target.value })}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canUse(currentUser.role, "Pharmacist") || order.status !== "Pharmacy Review"}
                        onClick={() => approveOrder(order)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-clinical-teal px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={!canUse(currentUser.role, "Pharmacist") || order.status !== "Pharmacy Review"}
                        onClick={() => rejectOrder(order)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={!canUse(currentUser.role, "Pharmacist") || order.status !== "Approved"}
                        onClick={() => dispenseOrder(order)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold text-clinical-ink disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                        Mark Dispensed
                      </button>
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
                <Field label="Patient wristband barcode">
                  <input
                    className={inputClass}
                    placeholder="WRIST-PAT-..."
                    value={patientScan}
                    onChange={(event) => setPatientScan(event.target.value)}
                  />
                </Field>
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Quick patient scan</p>
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
                <Field label="Patient barcode">
                  <input className={inputClass} value={patientScan} onChange={(event) => setPatientScan(event.target.value)} />
                </Field>
                <Field label="Medication dose barcode">
                  <input className={inputClass} value={medicationScan} onChange={(event) => setMedicationScan(event.target.value)} />
                </Field>
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Quick scan picks</p>
                  <div className="flex flex-wrap gap-2">
                    {state.patients.map((patient) => (
                      <button key={patient.id} type="button" onClick={() => setPatientScan(patient.barcode)} className="rounded-md border border-clinical-line bg-white px-3 py-2 text-xs font-semibold hover:bg-clinical-panel">
                        {patient.name}
                      </button>
                    ))}
                    {state.orders.filter((order) => order.doseBarcode).map((order) => (
                      <button key={order.id} type="button" onClick={() => setMedicationScan(order.doseBarcode ?? "")} className="rounded-md border border-clinical-line bg-white px-3 py-2 text-xs font-semibold hover:bg-clinical-panel">
                        {order.drugName}
                      </button>
                    ))}
                  </div>
                </div>
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
                  <InfoBlock title="Scanned medication" value={scannedOrder ? `${scannedOrder.drugName} ${scannedOrder.dose} (${scannedOrder.status})` : "Not matched"} />
                </div>
                <AdministrationTable administrations={state.administrations} orders={state.orders} patients={state.patients} />
              </div>
            </Section>
          </div>
        ) : null}

        {safeActiveModule === "handover" ? (
          <Section title="Handover Support" icon={Handshake}>
            {handoverPatient ? (
              <div className="grid gap-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <Field label="Patient">
                    <select className={inputClass} value={handoverPatient.id} onChange={(event) => setHandoverPatientId(event.target.value)}>
                      {state.patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                          {patient.name} - {patient.id}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="button" onClick={() => addHandoverEvent("view")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold hover:bg-clinical-panel">
                    <FileClock className="h-4 w-4" aria-hidden="true" />
                    Log View
                  </button>
                </div>
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
                  <HandoverPanel title="Important alerts">
                    <AlertList alerts={state.alerts.filter((alert) => alert.patientId === handoverPatient.id)} orders={state.orders} patients={state.patients} compact />
                  </HandoverPanel>
                  <HandoverPanel title="Recent timeline">
                    <Timeline events={handoverPatient.timeline.slice(0, 6)} />
                  </HandoverPanel>
                </div>
                <div className="grid gap-3">
                  <Field label="Handover note">
                    <textarea className={`${inputClass} min-h-24`} value={handoverNote} onChange={(event) => setHandoverNote(event.target.value)} />
                  </Field>
                  <button type="button" disabled={!handoverNote.trim()} onClick={() => addHandoverEvent("note")} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-clinical-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                    Add Note
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState>No patient selected for handover.</EmptyState>
            )}
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
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-clinical-line bg-clinical-panel text-clinical-muted">Step {index + 1}</Badge>
                    <Badge className="border-blue-200 bg-blue-50 text-blue-800">{step.role}</Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-clinical-ink">{step.title}</h2>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <InfoBlock title="Action" value={step.action} />
                    <InfoBlock title="Expected result" value={step.result} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenModule(step.moduleId)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-clinical-line bg-white px-3 py-2 text-sm font-semibold text-clinical-ink shadow-sm hover:bg-clinical-panel"
                >
                  Open {moduleLabel}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-clinical-line bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">{title}</p>
      <p className="mt-1 break-words text-sm font-medium text-clinical-ink">{value}</p>
    </div>
  );
}

function PatientSummary({ patient, compact = false }: { patient: Patient; compact?: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <InfoBlock title="Patient" value={`${patient.name} (${patient.id})`} />
        <InfoBlock title="DOB / Age" value={`${formatDate(patient.dateOfBirth)} / ${patient.age}`} />
        <InfoBlock title="Wristband barcode" value={patient.barcode} />
        <InfoBlock title="Weight" value={`${patient.weightKg} kg`} />
        <InfoBlock title="Renal function" value={`eGFR ${patient.renalFunction}`} />
        <InfoBlock title="Created by" value={`${patient.createdBy} at ${formatDateTime(patient.createdAt)}`} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <InfoBlock title="Allergies" value={patient.allergies.join(", ") || "None recorded"} />
        <InfoBlock title="Adverse drug reactions" value={patient.adverseDrugReactions.join(", ") || "None recorded"} />
        <InfoBlock title="Past medical history" value={patient.pastMedicalHistory.join(", ") || "None recorded"} />
        <InfoBlock title="Current medications" value={patient.currentMedications.join(", ") || "None recorded"} />
        <InfoBlock title="Home medications" value={patient.homeMedications.join(", ") || "None recorded"} />
        <div className="rounded-md border border-clinical-line bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-clinical-muted">Labs</p>
          <div className="mt-2 grid gap-2">
            {patient.labs.map((lab) => (
              <div key={`${lab.name}-${lab.collectedAt}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{lab.name}</span>
                <span>
                  {lab.value} {lab.unit} {lab.flag ? `(${lab.flag})` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
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

function Timeline({ events }: { events: PatientTimelineEvent[] }) {
  if (events.length === 0) return <EmptyState>No timeline events yet.</EmptyState>;
  return (
    <div className="grid gap-2">
      {events.map((event) => (
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-clinical-muted">
            <th className="border-b border-clinical-line p-3">Order</th>
            <th className="border-b border-clinical-line p-3">Patient</th>
            <th className="border-b border-clinical-line p-3">Schedule</th>
            <th className="border-b border-clinical-line p-3">Status</th>
            <th className="border-b border-clinical-line p-3">Alerts</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const patient = patients.find((item) => item.id === order.patientId);
            const orderAlerts = alerts.filter((alert) => order.alertIds.includes(alert.id));
            return (
              <tr key={order.id} className="align-top">
                <td className="border-b border-clinical-line p-3">
                  <div className="font-semibold">{order.drugName} {order.dose}</div>
                  <div className="text-clinical-muted">{order.route} - {order.frequency}</div>
                </td>
                <td className="border-b border-clinical-line p-3">{patient?.name ?? order.patientId}</td>
                <td className="border-b border-clinical-line p-3">{formatDateTime(order.scheduledTime)}</td>
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
  return (
    <div className="grid gap-2">
      {orders.map((order) => (
        <div key={order.id} className="rounded-md border border-clinical-line bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{order.drugName} {order.dose}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-clinical-muted">{order.route} - {order.frequency} - {formatDateTime(order.scheduledTime)}</p>
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
