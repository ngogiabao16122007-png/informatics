import { DemoState, User } from "./types";
const now = "2026-06-18T02:00:00.000Z";
const firstDoseTime = "2026-06-18T11:00:00.000Z";

export const demoUsers: User[] = [
  { id: "user-clerk", name: "Bùi Nguyệt Tú", role: "Ward Clerk" },
  { id: "user-physician", name: "Lee Chee", role: "Physician" },
  { id: "user-pharmacist", name: "Minhh Ann", role: "Pharmacist" },
  { id: "user-nurse", name: "Linh Phạm", role: "Nurse" },
  { id: "user-admin", name: "Ngô Gia Bảo", role: "Admin" }
];

export const seedState: DemoState = {
  patients: [
    {
      id: "PAT-1001",
      barcode: "WRIST-PAT-1001-7KQ2",
      name: "Jordan Ellis",
      dateOfBirth: "1972-04-18",
      age: 54,
      allergies: ["Penicillin"],
      adverseDrugReactions: ["Rash with amoxicillin"],
      pastMedicalHistory: ["Heart failure", "Type 2 diabetes"],
      currentMedications: ["Furosemide", "Metformin"],
      homeMedications: ["Lisinopril", "Atorvastatin"],
      weightKg: 82,
      renalFunction: 38,
      labs: [
        { name: "Potassium", value: 3.2, unit: "mmol/L", flag: "low", collectedAt: now },
        { name: "Creatinine", value: 1.7, unit: "mg/dL", flag: "high", collectedAt: now },
        { name: "INR", value: 1.1, unit: "", flag: "normal", collectedAt: now }
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: "Bùi Nguyệt Tú",
      timeline: [
        {
          id: "TL-1001-A",
          timestamp: now,
          role: "Ward Clerk",
          userName: "Bùi Nguyệt Tú",
          description: "Patient admitted and wristband barcode generated."
        }
      ]
    },
    {
      id: "PAT-1002",
      barcode: "WRIST-PAT-1002-P4M8",
      name: "Casey Morgan",
      dateOfBirth: "1989-11-02",
      age: 36,
      allergies: ["Sulfa"],
      adverseDrugReactions: ["Nausea with codeine"],
      pastMedicalHistory: ["Asthma"],
      currentMedications: ["Albuterol"],
      homeMedications: ["Cetirizine"],
      weightKg: 68,
      renalFunction: 91,
      labs: [
        { name: "Potassium", value: 4.1, unit: "mmol/L", flag: "normal", collectedAt: now },
        { name: "Creatinine", value: 0.8, unit: "mg/dL", flag: "normal", collectedAt: now }
      ],
      createdAt: now,
      updatedAt: now,
      createdBy: "Bùi Nguyệt Tú",
      timeline: [
        {
          id: "TL-1002-A",
          timestamp: now,
          role: "Ward Clerk",
          userName: "Bùi Nguyệt Tú",
          description: "Patient admitted and profile created."
        }
      ]
    }
  ],
  orders: [
    {
      id: "ORD-2001",
      patientId: "PAT-1001",
      physicianId: "user-physician",
      physicianName: "Lee Chee",
      drugName: "Digoxin",
      dose: "0.125 mg",
      route: "Oral",
      frequency: "Once daily",
      scheduledTime: firstDoseTime,
      notes: "Demo order intentionally triggers potassium and interaction checks.",
      status: "Pharmacy Review",
      alertIds: ["ALT-3001", "ALT-3002"],
      createdAt: now,
      updatedAt: now
    }
  ],
  dispenses: [],
  administrations: [],
  alerts: [
    {
      id: "ALT-3001",
      patientId: "PAT-1001",
      orderId: "ORD-2001",
      type: "Drug Lab",
      severity: "critical",
      message: "Demo alert: low potassium is present for a digoxin order.",
      createdAt: now
    },
    {
      id: "ALT-3002",
      patientId: "PAT-1001",
      orderId: "ORD-2001",
      type: "Drug Interaction",
      severity: "warning",
      message: "Demo alert: digoxin may interact with furosemide in this mock rule set.",
      createdAt: now
    }
  ],
  auditEvents: [
    {
      id: "AUD-4001",
      timestamp: now,
      userId: "user-clerk",
      userName: "Bùi Nguyệt Tú",
      role: "Ward Clerk",
      actionType: "Patient created",
      patientId: "PAT-1001",
      description: "Created Jordan Ellis profile and generated WRIST-PAT-1001-7KQ2."
    },
    {
      id: "AUD-4002",
      timestamp: now,
      userId: "user-physician",
      userName: "Lee Chee",
      role: "Physician",
      actionType: "Order submitted",
      patientId: "PAT-1001",
      orderId: "ORD-2001",
      description: "Submitted Digoxin 0.125 mg oral once daily for pharmacy review."
    },
    {
      id: "AUD-4003",
      timestamp: now,
      userId: "user-physician",
      userName: "Lee Chee",
      role: "Physician",
      actionType: "Alert generated",
      patientId: "PAT-1001",
      orderId: "ORD-2001",
      description: "Generated demo drug-lab safety alert for Digoxin."
    }
  ],
  handoverNotes: []
};
