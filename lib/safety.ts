import { makeId } from "./ids";
import { MedicationOrder, Patient, SafetyAlert } from "./types";

const interactionPairs = [
  ["warfarin", "aspirin"],
  ["digoxin", "furosemide"],
  ["lisinopril", "spironolactone"]
];

const renalWatchList = ["metformin", "vancomycin", "gentamicin", "digoxin"];

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function containsMedication(source: string, target: string): boolean {
  return normalized(source).includes(normalized(target)) || normalized(target).includes(normalized(source));
}

export function runDemoSafetyChecks(params: {
  patient: Patient;
  draftOrder: Pick<MedicationOrder, "drugName" | "dose" | "route" | "scheduledTime">;
  activeOrders: MedicationOrder[];
  orderId: string;
  timestamp: string;
}): SafetyAlert[] {
  const { patient, draftOrder, activeOrders, orderId, timestamp } = params;
  const drug = normalized(draftOrder.drugName);
  const alerts: SafetyAlert[] = [];

  patient.allergies.forEach((allergy) => {
    if (containsMedication(drug, allergy)) {
      alerts.push({
        id: makeId("ALT"),
        patientId: patient.id,
        orderId,
        type: "Allergy",
        severity: "critical",
        message: `Demo alert: ${draftOrder.drugName} conflicts with recorded allergy ${allergy}.`,
        createdAt: timestamp
      });
    }
  });

  const medList = [...patient.currentMedications, ...activeOrders.map((order) => order.drugName)].map(normalized);
  interactionPairs.forEach(([left, right]) => {
    const newDrugIsLeft = drug.includes(left);
    const newDrugIsRight = drug.includes(right);
    const pairedMedicationPresent =
      (newDrugIsLeft && medList.some((med) => med.includes(right))) ||
      (newDrugIsRight && medList.some((med) => med.includes(left)));

    if (pairedMedicationPresent) {
      alerts.push({
        id: makeId("ALT"),
        patientId: patient.id,
        orderId,
        type: "Drug Interaction",
        severity: "warning",
        message: `Demo alert: ${draftOrder.drugName} matches a mock interaction rule.`,
        createdAt: timestamp
      });
    }
  });

  const potassium = patient.labs.find((lab) => normalized(lab.name) === "potassium");
  if (drug.includes("digoxin") && potassium && potassium.value < 3.5) {
    alerts.push({
      id: makeId("ALT"),
      patientId: patient.id,
      orderId,
      type: "Drug Lab",
      severity: "critical",
      message: `Demo alert: potassium is ${potassium.value} ${potassium.unit} for a digoxin order.`,
      createdAt: timestamp
    });
  }

  if (renalWatchList.some((watched) => drug.includes(watched)) && patient.renalFunction < 45) {
    alerts.push({
      id: makeId("ALT"),
      patientId: patient.id,
      orderId,
      type: "Renal Function",
      severity: "warning",
      message: `Demo alert: eGFR ${patient.renalFunction} is below the mock review threshold for ${draftOrder.drugName}.`,
      createdAt: timestamp
    });
  }

  const duplicateInChart =
    patient.currentMedications.some((med) => containsMedication(med, drug)) ||
    activeOrders.some((order) => containsMedication(order.drugName, drug));

  if (duplicateInChart) {
    alerts.push({
      id: makeId("ALT"),
      patientId: patient.id,
      orderId,
      type: "Duplicate Medication",
      severity: "warning",
      message: `Demo alert: ${draftOrder.drugName} appears to duplicate an active medication or order.`,
      createdAt: timestamp
    });
  }

  return alerts;
}
