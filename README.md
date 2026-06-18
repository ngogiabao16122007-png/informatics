# Integrated BCMA-CPOE-EHR Medication Workflow Demo

Educational MVP demo of an integrated medication loop from admission to CPOE order entry, pharmacy verification and dispensing, BCMA administration, handover, and audit review.

This project uses fictional seed data and simple hardcoded demo safety checks only. It is not clinical software, does not provide dosage guidance, and must not be used with real patient data.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Browser local storage for demo persistence

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Demo Workflow

1. Use the role switcher as `Ward Clerk` and create a patient in `EHR / Admission`.
2. Switch to `Physician`, open `CPOE Orders`, select the patient, and submit a medication order.
3. Review demo safety alerts and switch to `Pharmacist`.
4. Open `Pharmacy`, approve the order, then mark it dispensed to generate a medication dose barcode.
5. Switch to `Nurse`, open `BCMA`, scan the patient and medication using the quick-pick buttons.
6. Confirm the Five Rights pass, then administer, hold, or mark the dose missed.
7. Review `Handover` and `Audit` to see the workflow documentation.

Use `Reset` to restore the seeded demo state.
