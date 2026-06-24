export type Role = "Ward Clerk" | "Physician" | "Pharmacist" | "Nurse" | "Admin";

export type User = {
  id: string;
  name: string;
  role: Role;
};

export type LabResult = {
  name: string;
  value: number;
  unit: string;
  flag?: "low" | "normal" | "high";
  collectedAt: string;
};

export type PatientTimelineEvent = {
  id: string;
  timestamp: string;
  role: Role;
  userName: string;
  description: string;
};

export type ContactInfo = {
  phone: string;
  email: string;
  address: string;
};

export type MedicationHistoryItem = {
  name: string;
  dose: string;
  duration: string;
};

export type Patient = {
  id: string;
  barcode: string;
  admissionType: "New admission" | "Re-admitted patient";
  name: string;
  dateOfBirth: string;
  age: number;
  gender: string;
  nationality: string;
  citizenId: string;
  ethnicity: string;
  bloodType: string;
  heightCm: number;
  occupation: string;
  allergies: string[];
  adverseDrugReactions: string[];
  pastMedicalHistory: string[];
  priorDisorders: string[];
  recentHistory: string;
  reasonForVisit: string;
  currentMedications: string[];
  homeMedications: string[];
  currentMedicationDetails: MedicationHistoryItem[];
  homeMedicationDetails: MedicationHistoryItem[];
  weightKg: number;
  renalFunction: number;
  labs: LabResult[];
  patientContact: ContactInfo;
  emergencyContact: ContactInfo;
  insuranceLink: string;
  screeningImages: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  timeline: PatientTimelineEvent[];
};

export type OrderStatus =
  | "Ordered"
  | "Pharmacy Review"
  | "Approved"
  | "Rejected"
  | "Dispensed"
  | "Administered"
  | "Missed/Held";

export type AlertSeverity = "info" | "warning" | "critical";

export type SafetyAlert = {
  id: string;
  patientId: string;
  orderId: string;
  type: "Allergy" | "Drug Interaction" | "Drug Lab" | "Renal Function" | "Duplicate Medication";
  severity: AlertSeverity;
  message: string;
  createdAt: string;
};

export type MedicationOrder = {
  id: string;
  patientId: string;
  physicianId: string;
  physicianName: string;
  drugName: string;
  dose: string;
  priority: "Routine" | "Urgent" | "STAT";
  route: string;
  frequency: string;
  scheduledTime: string;
  scheduledTimes?: string[];
  scheduleDisplay?: string;
  notes: string;
  status: OrderStatus;
  alertIds: string[];
  pharmacistNotes?: string;
  doseBarcode?: string;
  createdAt: string;
  updatedAt: string;
};

export type PharmacyDispense = {
  id: string;
  patientId: string;
  orderId: string;
  medicationBarcode: string;
  doseTaken?: string;
  packageType?: "Full box" | "Individual bag";
  customDose?: string;
  scannedBarcode?: string;
  createdBy?: string;
  preparedBy: string;
  preparedAt: string;
  dispensedAt?: string;
  notes?: string;
};

export type AdministrationStatus = "Administered" | "Held" | "Missed";

export type MedicationAdministration = {
  id: string;
  patientId: string;
  orderId: string;
  medicationBarcode: string;
  nurseId: string;
  nurseName: string;
  status: AdministrationStatus;
  notes: string;
  performedAt: string;
  fiveRights: FiveRightsResult;
};

export type FiveRightsResult = {
  rightPatient: boolean;
  rightDrug: boolean;
  rightDose: boolean;
  rightRoute: boolean;
  rightTime: boolean;
  messages: string[];
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: Role;
  actionType:
    | "Patient created"
    | "Patient deleted"
    | "Order submitted"
    | "Alert generated"
    | "Pharmacy approved"
    | "Pharmacy rejected"
    | "Medication barcode generated"
    | "Medication dispensed"
    | "Medication administered"
    | "Medication held"
    | "Medication missed"
    | "Handover viewed"
    | "Handover note added";
  patientId?: string;
  orderId?: string;
  description: string;
};

export type DemoState = {
  patients: Patient[];
  orders: MedicationOrder[];
  dispenses: PharmacyDispense[];
  administrations: MedicationAdministration[];
  alerts: SafetyAlert[];
  auditEvents: AuditEvent[];
  handoverNotes: PatientTimelineEvent[];
};
